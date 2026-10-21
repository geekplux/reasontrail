// Identity flow (phase 2): fonts, favicon, wordmark, landmarks, layout at both viewports, dark theme, CVD previews.
import { axeProblems } from '../axe.mjs';
import { applyCvd, MATRICES } from '../cvd.mjs';

const FONT_BUDGET = 45 * 1024;

async function ready(page) {
  await page.waitForSelector('[data-testid="garden"][data-ready="true"]', { timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);
}

export async function run({ page, context, baseURL, shot, log, fail }) {
  const fonts = [];
  page.on('requestfinished', async (req) => {
    if (req.resourceType() !== 'font') return;
    const body = await (await req.response())?.body().catch(() => null);
    fonts.push({ url: req.url(), bytes: body?.length ?? 0 });
  });

  // Desktop, light: fonts, favicon, wordmark, landmarks, above the fold.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseURL}/`, { waitUntil: 'load' });
  await ready(page);
  await page.waitForTimeout(200); // let the second font response finish
  const fontBytes = fonts.reduce((sum, f) => sum + f.bytes, 0);
  log(`fonts: ${fonts.map((f) => `${f.url.split('/').pop()} ${f.bytes} B`).join(', ')}; total ${fontBytes} B`);
  if (fonts.length !== 2) fail(`expected exactly 2 font requests, got ${fonts.length}`);
  if (fontBytes > FONT_BUDGET) fail(`fonts ${fontBytes} B > ${FONT_BUDGET} B`);
  fonts.filter((f) => new URL(f.url).origin !== baseURL).forEach((f) => fail(`font not same-origin: ${f.url}`));

  const icon = await page.getAttribute('link[rel="icon"]', 'href');
  const iconRes = await page.request.get(new URL(icon ?? '/missing', baseURL).href);
  if (!iconRes.ok() || !String(iconRes.headers()['content-type']).includes('svg')) fail(`favicon ${icon} not served as SVG`);

  const mark = await page.evaluate(() => {
    const style = (sel) => {
      const el = document.querySelector(sel);
      return el && { family: getComputedStyle(el).fontFamily, italic: getComputedStyle(el).fontStyle, text: el.textContent };
    };
    return {
      logo: Boolean(document.querySelector('header .wordmark svg.logo-mark')),
      reason: style('header .wordmark-reason'),
      trail: style('header .wordmark-trail'),
      loaded: document.fonts.check('500 16px "IBM Plex Mono"') && document.fonts.check('italic 400 16px "Instrument Serif"'),
      landmarks: ['header', 'main', 'footer'].map((t) => document.querySelectorAll(t).length),
    };
  });
  log(`wordmark: ${JSON.stringify(mark)}`);
  if (!mark.logo) fail('header wordmark has no logo mark');
  if (mark.reason?.text !== 'reason' || !mark.reason.family.startsWith('"IBM Plex Mono"')) fail('"reason" is not set in IBM Plex Mono');
  if (mark.trail?.text !== 'trail' || !mark.trail.family.startsWith('"Instrument Serif"') || mark.trail.italic !== 'italic')
    fail('"trail" is not set in Instrument Serif Italic');
  if (!mark.loaded) fail('self-hosted fonts did not load');
  if (mark.landmarks.join() !== '1,1,1') fail(`expected one header, main and footer, got ${mark.landmarks}`);
  // One name for the brand link; the header also links to the source.
  if ((await page.getByRole('link', { name: 'Reasontrail', exact: true }).count()) !== 1) fail('brand link is not named "Reasontrail"');
  if (!(await page.title()).includes('Reasontrail')) fail('<title> does not contain "Reasontrail"');
  if ((await page.locator('header').getByRole('link', { name: 'GitHub', exact: true }).count()) !== 1) fail('header has no GitHub link');

  const fold = await page.evaluate(() =>
    ['.site-header', '.specimen', '[data-testid="garden"]'].map((sel) => {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      return { sel, bottom: r?.bottom ?? Infinity, right: r?.right ?? Infinity };
    }),
  );
  fold.filter((f) => f.bottom > 800 || f.right > 1280).forEach((f) => fail(`desktop: ${f.sel} is below the fold (${JSON.stringify(f)})`));

  // The garden scroll region is never a tab stop (phase 5): the focused branch scrolls itself into view.
  const checkScrollStop = async (where) => {
    const ok = await page
      .waitForFunction(() => {
        const el = document.querySelector('.garden-scroll');
        return !el.hasAttribute('tabindex') && !!el.querySelector('[role="treeitem"][tabindex="0"]');
      }, null, { timeout: 2000 })
      .then(() => true, () => false);
    if (!ok) fail(`${where}: .garden-scroll is a tab stop, or the tree has none`);
  };
  await checkScrollStop('desktop');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const duration = await page.evaluate(() => {
    const probe = Object.assign(document.createElement('div'), { style: 'transition: opacity 1s' });
    document.body.append(probe);
    const value = getComputedStyle(probe).transitionDuration;
    probe.remove();
    return value;
  });
  if (duration !== '0s') fail(`reduced motion: transition-duration is ${duration}`);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  for (const p of await axeProblems(page, 'light desktop')) fail(p);
  await shot('identity-desktop');

  // CVD previews of the light theme.
  for (const type of Object.keys(MATRICES)) {
    await applyCvd(page, type);
    await shot(`identity-cvd-${type}`);
  }
  await applyCvd(page, null);

  // Dark theme.
  await page.emulateMedia({ colorScheme: 'dark' });
  const bg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  if (bg !== 'rgb(17, 24, 19)') fail(`dark: page background is ${bg}, expected --tg-paper #111813`);
  for (const p of await axeProblems(page, 'dark desktop')) fail(p);
  await shot('identity-dark');
  await page.emulateMedia({ colorScheme: 'light' });

  // Mobile: nothing overflows except the garden's own scroll container; labels keep their size.
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => {
    const vw = window.innerWidth;
    const scroller = document.querySelector('.garden-scroll');
    const outside = [...document.body.querySelectorAll('*')]
      .filter((el) => !scroller?.contains(el) && el.getBoundingClientRect().right > vw + 0.5)
      .map((el) => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? `.${el.className}` : ''));
    const svg = document.querySelector('[data-testid="garden"]');
    const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    const label = parseFloat(getComputedStyle(svg.querySelector('text')).fontSize) * scale;
    return { pageOverflow: document.documentElement.scrollWidth - vw, outside, scrolls: scroller.scrollWidth > scroller.clientWidth, label };
  });
  log(`mobile: ${JSON.stringify(mobile)}`);
  if (mobile.pageOverflow > 0) fail(`mobile: page overflows horizontally by ${mobile.pageOverflow}px`);
  if (mobile.outside.length) fail(`mobile: overflowing outside the garden scroller: ${mobile.outside.join(', ')}`);
  if (mobile.label < 12) fail(`mobile: token labels render at ${mobile.label.toFixed(1)}px (< 12px)`);
  await checkScrollStop('mobile');
  for (const p of await axeProblems(page, 'light mobile')) fail(p);
  await shot('identity-mobile');

  // The wordmark at 3x, and the favicon as it would sit in a tab.
  const hiDpi = await context.browser().newContext({ viewport: { width: 640, height: 200 }, deviceScaleFactor: 3 });
  try {
    const hiPage = await hiDpi.newPage();
    await hiPage.goto(`${baseURL}/`, { waitUntil: 'load' });
    await ready(hiPage);
    await shot('wordmark@3x', hiPage.locator('header .brand'));
  } finally {
    await hiDpi.close();
  }
  const tab = await context.newPage();
  await tab.setViewportSize({ width: 64, height: 64 });
  await tab.setContent(`<body style="margin:0"><img src="${baseURL}/favicon.svg" width="64" height="64" alt="favicon"></body>`);
  await tab.waitForFunction(() => document.images[0]?.complete && document.images[0].naturalWidth > 0);
  await shot('favicon-tab', tab);
  await tab.close();
}
