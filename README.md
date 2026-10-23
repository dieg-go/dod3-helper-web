# Destroy the Flower — Drakengard 3 helper

A static web port of [Drakengard3-helper](https://github.com/UnknownAr/Drakengard3-helper), rebuilt with Vite, React, and TypeScript. It shows expanding-ring note cues for the final boss of *Drakengard 3* and lets you calibrate note and clock timing while you play.

The app is fully static: no backend, no accounts, no telemetry. It is ready to deploy to GitHub Pages.

## What it does

- Ships the original 235-note final-boss sequence, from `0` to `394060.727…` ms (`6:34.06`).
- Reproduces the source's 800×700 ring geometry, note colors, press window, and removal threshold.
- Starts the clock on the first note; supports pause, resume, restart, and hold-to-slow/fast playback.
- Lets you adjust the last note, the next note, every note, or the playback clock by 50 ms.
- Supports removing upcoming notes with one-level undo.
- Imports and exports the original one-value-per-line timing format.
- Switches between dark and light themes; the choice is remembered between visits.
- Stays session-only for timings: edits are never written to browser storage; export before closing.

## Run locally

Requires Node 22.12+ and pnpm 11.

```bash
pnpm install
pnpm dev
```

Open the URL Vite prints (normally `http://localhost:5173/`).

Production preview:

```bash
pnpm build
pnpm preview --host 127.0.0.1 --port 4173
```

Then open `http://127.0.0.1:4173/`.

## Checks

```bash
pnpm test        # Vitest timing, clock, and shortcut tests
pnpm typecheck   # strict TypeScript
pnpm build       # typecheck + production build in dist/
```

## Controls

Start the helper the moment you destroy the first note in the game. The first note is the helper's zero.

| Input | Action |
| --- | --- |
| `Space` | Start, pause, resume; from complete, return to ready |
| `R` | Stop and return to ready |
| `←` / `→` | Last note +50 / −50 ms |
| `Ctrl+←` / `Ctrl+→` | Next note +50 / −50 ms |
| `Shift+←` / `Shift+→` | All notes +50 / −50 ms |
| `Ctrl+↑` / `Ctrl+↓` | Clock −50 / +50 ms |
| `↑` held / `↓` held | Slow / speed the clock |
| `Y` | Remove the next note |
| `Ctrl+Z` | Undo the most recent removal |
| `?` | Open the controls dialog |

Every action also has an on-screen button, including hold buttons for slower and faster playback.

On Windows/Linux, `Ctrl` works as listed; on macOS, `Cmd` is treated the same way.

## Timings

The built-in default lives in [`src/data/timings.txt`](src/data/timings.txt) and is copied from the original repository's `main/timings/timings` file.

The file format is one millisecond value per line. Import also accepts:

- commas as decimal separators (`4004,5`)
- blank lines
- whole-line `#` or `//` comments
- files that are not sorted; they are sorted on import and reported as such

Importing an invalid file leaves the current sequence untouched and reports the offending line. Export downloads `timings.txt` in the original format.

Edits are held in memory only; the theme choice is the sole stored preference. There is deliberately no timing storage, so a leave warning appears when there are unsaved changes and the footer repeats the session-only reminder.

## GitHub Pages deployment

The repository includes [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which runs tests, builds, and deploys with the official Pages actions.

1. Create a repository and push this folder (adjust the name/visibility as desired):

   ```bash
   git init
   git add .
   git commit -m "Build Drakengard 3 timing helper web app"
   gh repo create dod3-helper-web --public --source=. --push
   ```

2. In the repository, open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.

3. Push to `main` or `master`, or run **Deploy to GitHub Pages** from the Actions tab.

4. The site is published at `https://<user>.github.io/<repo>/`.

`vite.config.ts` uses `base: './'`, so the same build works at a project subpath, a user-site root, or a custom domain without editing a repository name. The app has no client-side routes, so no `404.html` fallback is needed.

## How it works

- `src/lib/timing.ts` — pure geometry, parsing, serialization, skip calculation, visible-note calculation, and ±50 ms mutations.
- `src/lib/clock.ts` — elapsed-time clock anchored to `performance.now()`, so throttled/background tabs catch up correctly.
- `src/lib/shortcuts.ts` — pure keyboard-to-action mapping with the source's Ctrl-over-Shift precedence.
- `src/lib/render.ts` — imperative Canvas 2D renderer for the rings and press cue.
- `src/hooks/useHelper.ts` — run state, actions, keyboard handling, file I/O, and the single animation loop. The canvas redraws at display rate; the React HUD publishes at roughly 15 Hz.
- `src/components/` — stage, run panel, calibration panel, timings panel, help dialog, and toast.
- `src/styles.css` — the responsive visual system and its dark/light token themes.

The logical stage is always 800×700 and is scaled by CSS; the canvas buffer is sized for the device pixel ratio.

### Fidelity notes

- The original removes a note when `dif <= -innerRadius`, comparing a pixel radius to milliseconds. That means the press cue is ±96 ms but a note disappears 24 ms after its timestamp. This behavior is preserved.
- Hold-to-slow/fast is normalized to the source's apparent 60 FPS: −120 ms per real second while slowing, +180 ms/s while speeding up. If both are held, fast wins, matching the source's Down-first check.
- The source has an unreachable end-of-sequence pause check. The web port explicitly enters a complete state when every note has passed.
- Note edits keep the sequence sorted and recompute the current position; the source assumes sorted input.
- The original `utils/timing.py` video-to-timings extractor is not part of this port. Import a prebuilt timing file instead.

## Attribution and license

This is an unofficial fan tool. The timing data and flower image come from [Drakengard3-helper](https://github.com/UnknownAr/Drakengard3-helper) by UnknownAr, which is distributed under the Apache License 2.0. The license text is included in [`LICENSE`](LICENSE).

*Drakengard 3* is a trademark of Square Enix. This project is not affiliated with or endorsed by Square Enix.
