/**
 * The bottom navigation must never cover content that cannot be scrolled into view.
 *
 * This was a real defect reported from the owner's iPhone: the bar was
 * position:fixed over a scroll pane that was itself 100dvh tall, so it floated
 * above the pane's last few centimetres and the content underneath could never
 * be reached — the pane was already at its end. The shell is now a grid whose
 * rows are the content pane and the bar, so overlap is impossible by
 * construction. This asserts it stays that way.
 *
 * Usage:
 *   npm run build && npx vite preview --port 4173 &
 *   APP_URL=http://127.0.0.1:4173/Kate-Lisi-Make-Up-Artist/ node scripts/verify/check-scroll.mjs
 *
 * Needs Playwright available (npx playwright, or an ad-hoc install) and a
 * Chromium binary; set CHROME to override the path.
 */
import { chromium } from 'playwright';

const BASE = process.env.APP_URL || 'http://127.0.0.1:4173/Kate-Lisi-Make-Up-Artist/';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const ROUTES = [
  '', '#/calendar', '#/calendar/new', '#/clients', '#/clients/new',
  '#/settings', '#/services', '#/money', '#/backup', '#/timeline',
];

// The bar only exists below 1024px; above that the navigation is a left rail.
const DEVICES = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone 16 Pro', width: 393, height: 852 },
  { name: 'iPhone SE landscape', width: 667, height: 375 },
  { name: 'iPad Split View', width: 320, height: 1024 },
];

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
let failures = 0;
let total = 0;

for (const device of DEVICES) {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();

  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(350);

    const result = await page.evaluate(async () => {
      const pane = document.querySelector('[data-app-scroll]');
      if (pane) pane.scrollTop = pane.scrollHeight;
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((resolve) => setTimeout(resolve, 250));

      const visibleNavs = [...document.querySelectorAll('nav')]
        .filter((nav) => getComputedStyle(nav).display !== 'none');
      const bar = visibleNavs.at(-1);
      const barTop = bar ? bar.getBoundingClientRect().top : window.innerHeight;

      const main = document.querySelector('main');
      const last = main ? [...main.children].at(-1) : undefined;
      const lastBottom = last ? last.getBoundingClientRect().bottom : 0;

      const atEnd = pane
        ? pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 2
        : true;

      return {
        barTop: Math.round(barTop),
        lastBottom: Math.round(lastBottom),
        atEnd,
        clear: lastBottom <= barTop + 1,
      };
    });

    total += 1;
    if (!result.clear) failures += 1;
    console.log(
      `${result.clear ? 'PASS' : 'FAIL'}  ${device.name.padEnd(20)} ${(route || '#/ (Today)').padEnd(16)}` +
        ` last=${result.lastBottom} bar=${result.barTop} scrolledToEnd=${result.atEnd}`,
    );
  }

  await context.close();
}

await browser.close();
console.log(`\n${total - failures}/${total} routes clear the bottom bar`);
process.exit(failures ? 1 : 0);
