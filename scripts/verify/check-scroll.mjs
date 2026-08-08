/**
 * The bottom navigation must never cover content that cannot be scrolled into view, and must
 * itself stay tappable.
 *
 * Two defects produced this file. The first: the bar was position:fixed over a pane that was
 * itself 100dvh tall, so it floated above the pane's last centimetres and the content under it
 * could never be reached. The shell became a grid whose rows are the pane and the bar, so
 * overlap is impossible by construction.
 *
 * The second is why this file was rewritten. The check ran on a fixed list of routes against an
 * EMPTY database, reported 40/40 clean, and had never once opened `#/calendar/<id>` — where the
 * routed detail was rendered inside a fixed modal sheet with 457px of content below the bar and
 * a backdrop covering the navigation. Every route it did check rendered an empty state.
 *
 * So it now does three things it did not do:
 *   - resolves real record ids from a seeded profile and checks the data-dependent routes;
 *   - measures the lowest VISIBLE DESCENDANT, not `main.children.at(-1)`. That old assertion is
 *     what returned green: the last direct child ended at 755 while real content reached 1244;
 *   - hit-tests the navigation, because content being reachable is no use if a fixed overlay
 *     swallows the taps.
 *
 * Usage:
 *   npm run build && npx vite preview --port 4173 &
 *   APP_URL=... USER_DIR=/tmp/demo node scripts/verify/seed-demo.mjs
 *   APP_URL=... USER_DIR=/tmp/demo node scripts/verify/check-scroll.mjs
 */
import { chromium } from 'playwright';
import { resolveDataRoutes, warnIfNoData } from './routes.mjs';

const BASE = process.env.APP_URL || 'http://127.0.0.1:4173/Kate-Lisi-Make-Up-Artist/';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const USER_DIR = process.env.USER_DIR;

const STATIC_ROUTES = [
  '', '#/calendar', '#/calendar/new', '#/clients', '#/clients/new',
  '#/settings', '#/services', '#/money', '#/backup', '#/timeline', '#/settings/contracts',
];

// The bar only exists below 1024px; above that the navigation is a left rail.
const DEVICES = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone 16 Pro', width: 393, height: 852 },
  { name: 'iPhone 16 Pro Max', width: 430, height: 932 },
  { name: 'iPhone SE landscape', width: 667, height: 375 },
  { name: 'iPad Split View', width: 320, height: 1024 },
];

/** Measures one route at the current viewport, with everything scrolled as far as it goes. */
async function measure(page) {
  return page.evaluate(async () => {
    // Drive every scroller to its end — the outer pane and anything nested inside it.
    const scrollers = [document.querySelector('[data-app-scroll]'), ...document.querySelectorAll('main *, aside')]
      .filter((el) => el && el.scrollHeight > el.clientHeight + 1);
    for (const el of scrollers) el.scrollTop = el.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((resolve) => setTimeout(resolve, 300));

    /*
     * The bottom bar is the visible nav sitting at the bottom of the viewport — NOT simply the
     * last <nav> in the document. Picking `.at(-1)` reported bar=251 on a 667px screen, because
     * a page can carry its own nav landmark.
     */
    const bar = [...document.querySelectorAll('nav')]
      .filter((nav) => getComputedStyle(nav).display !== 'none')
      .map((nav) => ({ nav, box: nav.getBoundingClientRect() }))
      .filter(({ box }) => box.height > 0 && box.bottom >= window.innerHeight - 2)
      .sort((a, b) => a.box.top - b.box.top)
      .at(-1)?.nav;
    if (!bar) return { skip: 'no bottom bar at this width' };
    const barBox = bar.getBoundingClientRect();

    /*
     * The lowest thing a person can actually see, wherever it sits in the tree.
     *
     * Skips position:fixed elements. A fixed element does not scroll, so it is never "content
     * that cannot be scrolled into view"; including them made a `fixed inset-0` backdrop the
     * lowest element on every screen and reported its bottom — exactly the viewport height —
     * as hidden content. A fixed element covering the bar is a real defect, and the hit-test
     * below is what catches it.
     *
     * Skips elements with no text of their own, so a decorative spacer is not reported as
     * unreachable content.
     */
    const isFixed = (el) => {
      for (let node = el; node && node !== document.body; node = node.parentElement) {
        if (getComputedStyle(node).position === 'fixed') return true;
      }
      return false;
    };

    let lowest = null;
    let lowestBottom = -Infinity;
    for (const el of document.querySelectorAll('main *')) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
      const box = el.getBoundingClientRect();
      if (box.height === 0 || box.width === 0) continue;
      if (!(el.textContent || '').trim()) continue;
      if (isFixed(el)) continue;
      if (box.bottom > lowestBottom) {
        lowestBottom = box.bottom;
        lowest = el;
      }
    }
    if (!lowest) return { skip: 'no content' };

    // Is the navigation still the thing under a finger placed on it?
    const hit = document.elementFromPoint(barBox.left + barBox.width / 2, barBox.top + barBox.height / 2);
    const navReachable = bar.contains(hit);
    const covering = navReachable
      ? null
      : `${hit?.tagName.toLowerCase() ?? '?'}.${String(hit?.className ?? '').trim().split(/\s+/).slice(0, 3).join('.')}`;

    return {
      barTop: Math.round(barBox.top),
      lowestBottom: Math.round(lowestBottom),
      lowestText: (lowest?.textContent || '').trim().slice(0, 30),
      clear: lowestBottom <= barBox.top + 1,
      navReachable,
      covering,
    };
  });
}

const context = USER_DIR
  ? await chromium.launchPersistentContext(USER_DIR, {
      executablePath: CHROME,
      args: ['--no-sandbox'],
      viewport: { width: 393, height: 852 },
      hasTouch: true,
      isMobile: true,
    })
  : await (await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })).newContext({
      viewport: { width: 393, height: 852 },
      hasTouch: true,
      isMobile: true,
    });

const browser = context.browser();
const probe = context.pages()[0] || (await context.newPage());
await probe.goto(BASE, { waitUntil: 'networkidle' });
// Offline-first: without this the run can silently measure a bundle from an earlier build.
await probe.evaluate(async () => {
  for (const key of await caches.keys()) await caches.delete(key);
  for (const registration of await navigator.serviceWorker.getRegistrations()) {
    await registration.unregister();
  }
});
await probe.reload({ waitUntil: 'networkidle' });

const { routes: dataRoutes, ids } = await resolveDataRoutes(probe);
const noData = warnIfNoData(dataRoutes, USER_DIR);
const ROUTES = [...STATIC_ROUTES, ...dataRoutes];
if (dataRoutes.length) {
  console.log(`seeded profile: ${ids.appointments} appointments — checking ${dataRoutes.length} data routes too\n`);
}

let failures = 0;
let total = 0;

for (const device of DEVICES) {
  await probe.setViewportSize({ width: device.width, height: device.height });

  for (const route of ROUTES) {
    await probe.goto(BASE + route, { waitUntil: 'networkidle' });
    await probe.waitForTimeout(450);
    const result = await measure(probe);
    if (result.skip) continue;

    total += 1;
    const ok = result.clear && result.navReachable;
    if (!ok) failures += 1;
    const label = (route || '#/ (Today)').replace(/[0-9a-f]{8}-[0-9a-f-]+/, '<id>');
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${device.name.padEnd(19)} ${label.padEnd(26)}` +
        ` last=${String(result.lowestBottom).padStart(5)} bar=${String(result.barTop).padStart(4)}` +
        `${result.clear ? '' : `  HIDDEN ${result.lowestBottom - result.barTop}px "${result.lowestText}"`}` +
        `${result.navReachable ? '' : `  NAV COVERED BY ${result.covering}`}`,
    );
  }
}

await context.close();
await browser?.close();
console.log(`\n${total - failures}/${total} route/viewport pairs clear the bottom bar and keep it tappable`);
if (noData) console.log('COVERAGE INCOMPLETE — data routes were not checked.');
process.exit(failures || noData ? 1 : 0);
