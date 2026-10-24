#!/usr/bin/env node
/**
 * Headless rendering benchmark.
 *
 * Loads the production build in mobile-sized headless Chrome, throttles the
 * CPU to approximate a low-end phone, and records rAF cadence plus main-thread
 * metrics for four scenarios: idle/running with effects on/off.
 *
 * Usage: pnpm bench
 * Env:   BENCH_CHROME   path to Chrome/Edge
 *        BENCH_THROTTLE CPU throttle rate (default 4)
 *        BENCH_SECONDS  sample length per run (default 5)
 *        BENCH_REPEATS  runs per scenario (default 3)
 *        BENCH_SHOTS=1  also save .screenshots/bench-*.png
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, preview } from 'vite';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const THROTTLE = Number(process.env.BENCH_THROTTLE) || 4;
const SECONDS = Number(process.env.BENCH_SECONDS) || 5;
const REPEATS = Math.max(1, Number(process.env.BENCH_REPEATS) || 3);
const VIEWPORT = { width: 390, height: 844, deviceScaleFactor: 3, mobile: true };

function findChrome() {
  if (process.env.BENCH_CHROME) {
    if (!existsSync(process.env.BENCH_CHROME)) {
      throw new Error(`BENCH_CHROME does not exist: ${process.env.BENCH_CHROME}`);
    }
    return process.env.BENCH_CHROME;
  }

  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        ]
      : process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          ]
        : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error('No Chrome/Edge found. Point BENCH_CHROME at a Chromium binary.');
  }
  return found;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function launchChrome(chrome, url) {
  const profile = await mkdtemp(join(tmpdir(), 'dod3-bench-'));
  const args = [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    url,
  ];

  const proc = spawn(chrome, args, { stdio: 'ignore' });
  proc.on('error', (error) => {
    throw error;
  });

  const portFile = join(profile, 'DevToolsActivePort');
  let port = null;
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (existsSync(portFile)) {
      const [line] = (await readFile(portFile, 'utf8')).split('\n');
      port = Number(line);
      if (Number.isInteger(port) && port > 0) break;
    }
    await sleep(100);
  }
  if (!port) throw new Error('Chrome did not expose a DevTools port.');

  return {
    proc,
    profile,
    port,
    async close() {
      killTree(proc);
      await sleep(300);
      await rm(profile, { recursive: true, force: true }).catch(() => {});
    },
  };
}

function killTree(proc) {
  if (!proc.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    proc.kill('SIGKILL');
  }
}

async function waitForPage(port, baseUrl) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find(
        (target) => target.type === 'page' && target.url.startsWith(baseUrl),
      );
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome is still starting.
    }
    await sleep(100);
  }
  throw new Error('The benchmark page did not appear in Chrome.');
}

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      const resolve = this.pending.get(message.id);
      if (resolve) {
        this.pending.delete(message.id);
        resolve(message);
      }
    };
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });
    return new Cdp(socket);
  }

  send(method, params = {}) {
    return new Promise((resolve) => {
      const id = ++this.nextId;
      this.pending.set(id, resolve);
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.result?.exceptionDetails) {
      throw new Error(JSON.stringify(response.result.exceptionDetails));
    }
    return response.result?.result?.value;
  }

  async metrics() {
    const response = await this.send('Performance.getMetrics');
    return Object.fromEntries(
      (response.result?.metrics ?? []).map((metric) => [metric.name, metric.value]),
    );
  }

  close() {
    this.socket.close();
  }
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index];
}

async function sample(cdp, seconds) {
  await cdp.evaluate('window.__rafDurations = []');
  const before = await cdp.metrics();
  const deltas = await cdp.evaluate(`new Promise((resolve) => {
    const deltas = [];
    let last = performance.now();
    const start = last;
    function frame(now) {
      deltas.push(now - last);
      last = now;
      if (now - start < ${seconds * 1000}) window.__nativeRaf(frame);
      else resolve(deltas);
    }
    window.__nativeRaf(frame);
  })`);
  const after = await cdp.metrics();
  const callbackTimes = await cdp.evaluate('window.__rafDurations.slice()');

  const wall = Math.max((after.Timestamp ?? 0) - (before.Timestamp ?? 0), 0.001);
  const sorted = [...deltas].sort((a, b) => a - b);
  const callbacks = [...callbackTimes].sort((a, b) => a - b);
  const avg = deltas.reduce((sum, value) => sum + value, 0) / Math.max(deltas.length, 1);
  const callbackAvg =
    callbackTimes.reduce((sum, value) => sum + value, 0) / Math.max(callbackTimes.length, 1);
  const task = (after.TaskDuration ?? 0) - (before.TaskDuration ?? 0);
  const script = (after.ScriptDuration ?? 0) - (before.ScriptDuration ?? 0);
  const style = (after.RecalcStyleDuration ?? 0) - (before.RecalcStyleDuration ?? 0);
  const layout = (after.LayoutDuration ?? 0) - (before.LayoutDuration ?? 0);

  return {
    fps: deltas.length / wall,
    avg,
    p95: percentile(sorted, 0.95),
    max: Math.max(...deltas, 0),
    dropped: deltas.filter((value) => value > 20).length / Math.max(deltas.length, 1),
    callbackAvg,
    callbackP95: percentile(callbacks, 0.95),
    main: task / wall,
    script: script / wall,
    style: style / wall,
    layout: layout / wall,
  };
}

async function setEffects(cdp, target) {
  const current = await cdp.evaluate("document.documentElement.dataset.effects");
  if (current !== target) {
    await cdp.evaluate("document.querySelector('.masthead-actions button').click()");
    await sleep(200);
  }
  const applied = await cdp.evaluate("document.documentElement.dataset.effects");
  if (applied !== target) throw new Error(`Could not switch effects ${target}.`);
}

async function startRun(cdp) {
  const status = await cdp.evaluate(
    "document.querySelector('.mini-status')?.textContent?.trim() ?? ''",
  );
  if (status === 'Running') return;
  await cdp.evaluate("document.querySelector('.stage-card .btn-primary')?.click()");
  await sleep(300);
}

async function stageInfo(cdp) {
  return cdp.evaluate(`(() => {
    const canvas = document.querySelector('.stage-canvas');
    const rect = canvas.getBoundingClientRect();
    const stage = canvas.parentElement.getBoundingClientRect();
    return {
      backing: canvas.width + 'x' + canvas.height,
      stage: Math.round(stage.width) + 'x' + Math.round(stage.height),
      canvasCss: Math.round(rect.width) + 'x' + Math.round(rect.height),
      dpr: window.devicePixelRatio,
      viewport: window.innerWidth + 'x' + window.innerHeight,
    };
  })()`);
}

const SCENARIOS = [
  { label: 'idle, effects on', effects: 'on', running: false },
  { label: 'idle, effects off', effects: 'off', running: false },
  { label: 'running, effects off', effects: 'off', running: true },
  { label: 'running, effects on', effects: 'on', running: true },
];

async function main() {
  const chrome = findChrome();
  const port = await freePort();
  await build({ logLevel: 'warn' });
  const server = await preview({
    logLevel: 'warn',
    preview: { host: '127.0.0.1', port },
  });
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error('Vite preview did not report a local URL.');

  let chromeProcess = null;
  let cdp = null;
  try {
    chromeProcess = await launchChrome(chrome, baseUrl);
    cdp = await Cdp.connect(await waitForPage(chromeProcess.port, baseUrl));
    await cdp.send('Runtime.enable');
    await cdp.send('Performance.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', VIEWPORT);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.__rafDurations = [];
        {
          window.__nativeRaf = window.requestAnimationFrame.bind(window);
          window.requestAnimationFrame = (callback) => window.__nativeRaf((time) => {
            const start = performance.now();
            callback(time);
            window.__rafDurations.push(performance.now() - start);
          });
        }`,
    });
    await cdp.send('Page.reload');
    await sleep(1200);

    console.log(
      `\n${chrome}\n${THROTTLE}x CPU throttle · ${VIEWPORT.width}x${VIEWPORT.height} @${VIEWPORT.deviceScaleFactor}x · ${SECONDS}s x ${REPEATS} runs per scenario\n`,
    );

    const rows = [];
    for (const scenario of SCENARIOS) {
      await setEffects(cdp, scenario.effects);
      if (scenario.running) await startRun(cdp);
      const info = await stageInfo(cdp);
      await sleep(600);

      const results = [];
      for (let run = 0; run < REPEATS; run += 1) {
        if (run > 0) await sleep(300);
        results.push(await sample(cdp, SECONDS));
      }
      const median = (pick) => {
        const values = results.map(pick).sort((a, b) => a - b);
        return values[Math.floor(values.length / 2)] ?? 0;
      };

      if (process.env.BENCH_SHOTS) {
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        const slug = scenario.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        await mkdir('.screenshots', { recursive: true });
        await writeFile(
          join('.screenshots', `bench-${slug}.png`),
          Buffer.from(shot.result.data, 'base64'),
        );
      }

      rows.push({
        scenario: scenario.label,
        backing: info.backing,
        stage: info.stage,
        fps: Math.round(median((result) => result.fps)),
        'raf p50': median((result) => result.callbackAvg).toFixed(2),
        'raf p95': median((result) => result.callbackP95).toFixed(2),
        'main %': Math.round(median((result) => result.main) * 100),
        'script %': Math.round(median((result) => result.script) * 100),
        'style %': Math.round(median((result) => result.style) * 100),
        'layout %': Math.round(median((result) => result.layout) * 100),
      });
    }

    console.table(rows);
    console.log(
      '\nraf p50/p95 = ms inside the app frame callback (canvas draw + publish); main/script/style/layout = share of wall time on the main thread.\n',
    );
  } finally {
    cdp?.close();
    if (chromeProcess) await chromeProcess.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
