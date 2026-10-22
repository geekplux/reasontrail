// Colour-vision-deficiency preview for screenshots: Machado et al. (2009) severity-1.0 matrices applied as an SVG
// feColorMatrix filter on <html> (filters work in linear RGB, as the matrices expect). Same values as
// src/styles/colorMath.ts MACHADO (cvd.test.mjs keeps them in sync).
export const MATRICES = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

/** Applies the simulation for `type` to the whole page, or removes it when `type` is null. */
export async function applyCvd(page, type) {
  const values = type ? [...MATRICES[type].flatMap((row) => [...row, 0, 0]), 0, 0, 0, 1, 0].join(' ') : null;
  await page.evaluate((v) => {
    document.getElementById('tg-cvd')?.remove();
    document.documentElement.style.filter = '';
    if (!v) return;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.id = 'tg-cvd';
    svg.setAttribute('aria-hidden', 'true');
    Object.assign(svg.style, { position: 'absolute', width: '0', height: '0' }); // CSSOM, which the site's CSP allows
    svg.innerHTML = `<filter id="tg-cvd-filter" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="${v}"/></filter>`;
    document.body.append(svg);
    document.documentElement.style.filter = 'url(#tg-cvd-filter)';
  }, values);
}
