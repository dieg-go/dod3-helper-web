/**
 * Resolve public assets against the document so they also work from a GitHub
 * Pages project subpath where the Vite base is relative.
 */
export const FLOWER_URL = new URL(`${import.meta.env.BASE_URL}flower.png`, document.baseURI).href;
export const MIKHAIL_URL = new URL(
  `${import.meta.env.BASE_URL}mikhail-idle.webp`,
  document.baseURI,
).href;
export const MIKHAIL_PASS_URL = new URL(
  `${import.meta.env.BASE_URL}mikhail-pass.webp`,
  document.baseURI,
).href;
export const ZERO_URL = new URL(`${import.meta.env.BASE_URL}zero.png`, document.baseURI).href;
export const ONE_URL = new URL(`${import.meta.env.BASE_URL}one.png`, document.baseURI).href;
export const TWO_URL = new URL(`${import.meta.env.BASE_URL}two.png`, document.baseURI).href;
export const THREE_URL = new URL(`${import.meta.env.BASE_URL}three.png`, document.baseURI).href;
export const FOUR_URL = new URL(`${import.meta.env.BASE_URL}four.png`, document.baseURI).href;
export const FIVE_URL = new URL(`${import.meta.env.BASE_URL}five.png`, document.baseURI).href;
