// Verification harness: drives the built app in Chromium at every viewport the
// owner's amendment (SPEC.md §10.1) requires, and asserts the layout rules.
// Chromium is not Safari — this checks layout and behaviour, not WebKit quirks.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.APP_URL || 'http://localhost:4173/Kate-Lisi-Make-Up-Artist/';
const OUT = process.env.SHOT_DIR || './shots';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'iphone-se-portrait', width: 375, height: 667 },
  { name: 'iphone-se-landscape', width: 667, height: 375 },
  { name: 'iphone-16-pro-portrait', width: 393, height: 852 },
  { name: 'iphone-16-pro-max-portrait', width: 430, height: 932 },
  { name: 'iphone-16-pro-landscape', width: 852, height: 393 },
  { name: 'ipad-air-portrait', width: 768, height: 1024 },
  { name: 'ipad-air-landscape', width: 1024, height: 768 },
  { name: 'ipad-pro-portrait', width: 1024, height: 1366 },
  { name: 'ipad-pro-landscape', width: 1366, height: 1024 },
  { name: 'ipad-splitview-narrow', width: 320, height: 1024 },
];

/*
 * Every route, not a sample. This defaulted to ['', '#/settings'] and a full run printed
 * "20/20 checks passed" — green, and blind to the other nine screens. A checker that reports
 * success over a fifth of the app is worse than no checker.
 */
const DEFAULT_ROUTES = [
  '', '#/calendar', '#/calendar/new', '#/clients', '#/clients/new', '#/money',
  '#/settings', '#/services', '#/backup', '#/timeline', '#/settings/contracts',
];
const ROUTES = process.env.ROUTES ? process.env.ROUTES.split(',') : DEFAULT_ROUTES;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});

let failures = 0;
const report = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    isMobile: vp.width < 1024,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    /*
     * Wait for the route's own content, not a fixed delay. Routes are React.lazy chunks and a
     * cold load of a deep link starts that fetch only after networkidle, so a 250ms sleep
     * measured the Suspense fallback instead of the page: an empty pane has no horizontal
     * overflow, no undersized field and no small tap target, so the whole matrix reported
     * 110/110 green over blank screenshots. Found by looking at the images, not the exit code.
     *
     * In real use this wait is nothing — an in-app tap with the worker warm reaches content in
     * 1-4ms. It is only the cold deep load that is slow enough to catch the checker out.
     */
    await page.waitForFunction(
      () => {
        const main = document.querySelector('main');
        return !!main && main.innerText.trim().length > 0;
      },
      { timeout: 15000 },
    );
    await page.waitForTimeout(150);

    const metrics = await page.evaluate(() => {
      const de = document.documentElement;
      // Any element wider than the viewport that is not inside its own scroller.
      const overflowing = [...document.querySelectorAll('*')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0) return false;
          if (r.right <= window.innerWidth + 1 && r.left >= -1) return false;
          let p = el.parentElement;
          while (p) {
            const ov = getComputedStyle(p).overflowX;
            if (ov === 'auto' || ov === 'scroll') return false;
            p = p.parentElement;
          }
          return true;
        })
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`);

      // Controls smaller than the Apple HIG 44px minimum.
      const small = [...document.querySelectorAll('button, a, [role=button]')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 24);
        })
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()}"${(el.textContent || '').trim().slice(0, 18)}"(${Math.round(el.getBoundingClientRect().height)}px)`);

      // Fonts below 16px on form fields cause iOS zoom-on-focus.
      const tinyFields = [...document.querySelectorAll('input, select, textarea')]
        .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()}[${el.getAttribute('name') || el.type || ''}]`);

      const navs = [...document.querySelectorAll('nav')].filter(
        (n) => getComputedStyle(n).display !== 'none',
      ).length;

      return {
        docScrollW: de.scrollWidth,
        innerW: window.innerWidth,
        horizontalScroll: de.scrollWidth > window.innerWidth + 1,
        overflowing,
        small,
        tinyFields,
        visibleNavs: navs,
      };
    });

    const problems = [];
    if (metrics.horizontalScroll)
      problems.push(`horizontal scroll (${metrics.docScrollW} > ${metrics.innerW})`);
    if (metrics.overflowing.length) problems.push(`overflowing: ${metrics.overflowing.join(', ')}`);
    if (metrics.small.length) problems.push(`tap targets < 44px: ${metrics.small.join(', ')}`);
    if (metrics.tinyFields.length) problems.push(`fields < 16px: ${metrics.tinyFields.join(', ')}`);
    if (metrics.visibleNavs !== 1) problems.push(`${metrics.visibleNavs} visible <nav> (want exactly 1)`);
    if (errors.length) problems.push(`console/page errors: ${errors.slice(0, 3).join(' | ')}`);

    if (problems.length) failures++;
    report.push({
      viewport: vp.name,
      route: route || '#/ (Today)',
      ok: problems.length === 0,
      problems,
    });

    const slug = `${vp.name}${route ? '-' + route.replace(/[#/]/g, '') : ''}`;
    await page.screenshot({ path: `${OUT}/${slug}.png`, fullPage: false });
  }

  await ctx.close();
}

await browser.close();

for (const r of report) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.viewport.padEnd(28)} ${r.route}`);
  for (const p of r.problems) console.log(`        - ${p}`);
}
console.log(`\n${report.length - failures}/${report.length} checks passed`);
process.exit(failures ? 1 : 0);
