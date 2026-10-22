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
