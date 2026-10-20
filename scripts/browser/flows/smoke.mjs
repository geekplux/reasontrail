// Smoke flow: first view renders the recorded garden; thickness follows probability; axe is clean.
import { axeProblems } from '../axe.mjs';

export async function run({ page, baseURL, shot, log, fail }) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseURL}/`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="garden"][data-ready="true"]', { timeout: 10_000 });

  const prompt = 'The old lighthouse keeper opened the door and';
  if (!(await page.getByText(prompt, { exact: false }).first().isVisible())) fail(`prompt not visible: ${prompt}`);

  const root = await page.$$eval('[data-testid="garden"] g[data-depth="1"]', (gs) =>
    gs.map((g) => ({
      key: g.getAttribute('data-key'),
      label: g.querySelector('text')?.textContent,
      p: Number(g.getAttribute('data-p')),
      w: Number(g.querySelector('[data-role="branch-stroke"]')?.getAttribute('stroke-width')),
    })),
  );
  log(`root branches: ${root.map((b) => `${JSON.stringify(b.label)} p=${b.p} w=${b.w}`).join('; ')}`);
  if (root.length !== 5) fail(`expected 5 root branches, got ${root.length}`);
  root.forEach((b) => b.label !== b.key && fail(`label ${JSON.stringify(b.label)} != key ${JSON.stringify(b.key)}`));
  for (let i = 1; i < root.length; i++) {
    const [a, b] = [root[i - 1], root[i]];
    if (a.p < b.p) fail(`data-p order does not match label order at ${JSON.stringify(b.label)}`);
    if (!(a.w > b.w)) fail(`stroke-width not strictly ordered: ${a.label}=${a.w} vs ${b.label}=${b.w}`);
  }
  const ready = await page.evaluate(() => performance.getEntriesByName('tg:garden-ready')[0]?.startTime);
  log(`tg:garden-ready at ${ready?.toFixed(0)} ms`);
  if (ready === undefined) fail('missing performance mark tg:garden-ready');

  for (const p of await axeProblems(page, 'desktop')) fail(p);
  await shot('smoke-desktop');

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) fail(`mobile: page overflows horizontally by ${overflow}px`);
  for (const p of await axeProblems(page, 'mobile')) fail(p);
  await shot('smoke-mobile');
}
