// Stage 1 gate (SPEC.md §6 row 1): the app must load with the network disabled.
// Loads once so the service worker precaches AND takes control, then kills the
// network and does a full document reload — not a hash change, which would pass
// trivially without touching the network at all.
//
// KNOWN LIMIT — read before trusting a green run. Chromium serves subresources from its own
// HTTP cache when the network is cut, and workbox populates that cache as a side effect of
// fetching each asset to precache it. So this file passes even with every Cache API entry
// deleted and the worker unregistered; that was measured, not assumed. It proves the app
// *behaves* offline here, not that the precache is the reason. iOS Safari has no such safety
// net. `check-precache.mjs` is the check that actually proves it — run both.
import { chromium } from 'playwright';

const BASE = process.env.APP_URL || 'http://127.0.0.1:4173/Kate-Lisi-Make-Up-Artist/';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url().slice(-60)} ${r.failure()?.errorText}`));

await page.goto(BASE, { waitUntil: 'networkidle' });

// Wait until the SW is not just active but actually CONTROLLING this page.
const swState = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    await new Promise((resolve) => {
      const t = setTimeout(resolve, 10000);
      navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(t); resolve(); }, { once: true });
    });
  }
  const keys = await caches.keys();
  const counts = {};
  for (const k of keys) counts[k] = (await (await caches.open(k)).keys()).length;
  return {
    active: !!reg.active,
    controlled: !!navigator.serviceWorker.controller,
    caches: counts,
  };
});
console.log('service worker:', JSON.stringify(swState));

const dbNames = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
console.log('indexedDB:', JSON.stringify(dbNames));
console.log('meta rows:', await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('kate-lisi-studio'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  if (!db.objectStoreNames.contains('meta')) return 'no meta store';
  return await new Promise((res) => { const r = db.transaction('meta').objectStore('meta').getAll(); r.onsuccess = () => res(r.result.map((x) => `${x.key}=${JSON.stringify(x.value)}`)); });
}));

// --- cut the network ---
errors.length = 0;
await ctx.setOffline(true);
console.log('\nnetwork: OFFLINE');

let ok = true;

// 1. Full document reload of the app root.
try {
  await page.reload({ waitUntil: 'load', timeout: 20000 });
  await page.waitForSelector('h1', { timeout: 10000 });
  const heading = await page.textContent('h1');
  const nav = await page.evaluate(() => [...document.querySelectorAll('nav')].filter(n => getComputedStyle(n).display !== 'none').flatMap(n => [...n.querySelectorAll('a')].map(a => a.textContent.trim())));
  console.log(`reload while offline:      PASS — h1="${heading}", nav=[${nav.join(', ')}]`);
} catch (e) {
  ok = false;
  console.log('reload while offline:      FAIL —', String(e).split('\n')[0]);
}

// 2. Cold navigation to a deep link in a BRAND NEW tab, still offline.
//    This is the case that exercises navigateFallback for real.
try {
  const page2 = await ctx.newPage();
  await page2.goto(BASE + '#/settings', { waitUntil: 'load', timeout: 20000 });
  // Wait for the page's own heading, not merely for <main> to exist: routes are lazy now, so
  // the Suspense fallback satisfies a bare `main` selector instantly and this assertion would
  // pass without a single route chunk ever resolving.
  await page2.waitForFunction(
    () => {
      const h1 = document.querySelector('main h1');
      return !!h1 && h1.textContent.trim().length > 0;
    },
    { timeout: 10000 },
  );
  const main = (await page2.textContent('main')).trim();
  console.log(`cold deep link offline:    PASS — main="${main.slice(0, 40)}"`);
  await page2.close();
} catch (e) {
  ok = false;
  console.log('cold deep link offline:    FAIL —', String(e).split('\n')[0]);
}

/*
 * 3. Every route she has never opened, reached by tapping while offline.
 *    Routes are React.lazy() chunks, so a tap on Calendar in a villa with no signal is a
 *    network request unless workbox precached that chunk. This walks the whole navigation
 *    from a session that only ever saw Today — the real sequence: open the app at home,
 *    drive out, tap something new.
 */
/*
 * Each route is paired with the heading it must actually render. Asserting merely that some
 * <h1> appeared is not enough: when a lazy chunk fails to load, AppErrorBoundary catches the
 * rejection and renders its own <main><h1>This screen stopped working</h1>, which satisfies a
 * naive check. A wiped-precache mutation run proved that exact false pass.
 */
const NAVIGATION = [
  ['#/calendar', 'Calendar'],
  ['#/clients', 'Clients'],
  ['#/money', 'Money'],
  ['#/settings', 'Business profile'],
  ['#/services', 'Services catalogue'],
  ['#/backup', 'Backup & restore'],
  ['#/timeline', 'Bridal timeline'],
  ['#/settings/contracts', 'Issued contracts'],
  ['#/calendar/new', 'Booking details'],
  // Note: /clients/new carries two <h1>s — the list's and the editor's. Pre-existing, and the
  // reason this matches any heading on the page rather than the first.
  ['#/clients/new', 'Client details'],
];
const BOUNDARY_HEADING = 'This screen stopped working';
try {
  const fresh = await ctx.newPage();
  await fresh.goto(BASE, { waitUntil: 'load', timeout: 20000 });
  await fresh.waitForSelector('h1', { timeout: 10000 });

  const unreachable = [];
  for (const [route, expected] of NAVIGATION) {
    try {
      await fresh.evaluate((hash) => { window.location.hash = hash.slice(1); }, route);
      await fresh.waitForFunction(
        (want) => [...document.querySelectorAll('main h1')]
          .some((h1) => h1.textContent.trim().startsWith(want)),
        expected,
        { timeout: 8000 },
      );
    } catch {
      const shown = await fresh.evaluate(
        () => [...document.querySelectorAll('main h1')].map((h1) => h1.textContent.trim()).join(' / ') || '(nothing)',
      );
      unreachable.push(`${route} → ${shown === BOUNDARY_HEADING ? 'ERROR BOUNDARY' : shown}`);
    }
  }
  if (unreachable.length) {
    ok = false;
    console.log(`offline route walk:        FAIL — never rendered: ${unreachable.join(', ')}`);
  } else {
    console.log(`offline route walk:        PASS — all ${NAVIGATION.length} unvisited routes opened`);
  }
  await fresh.close();
} catch (e) {
  ok = false;
  console.log('offline route walk:        FAIL —', String(e).split('\n')[0]);
}

if (errors.length) {
  console.log('\nerrors seen while offline:');
  for (const e of [...new Set(errors)].slice(0, 8)) console.log('  -', e);
}

await browser.close();
console.log(`\n${ok ? 'OFFLINE OK' : 'OFFLINE BROKEN'}`);
process.exit(ok ? 0 : 1);
