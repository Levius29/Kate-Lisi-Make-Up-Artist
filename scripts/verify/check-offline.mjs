// Stage 1 gate (SPEC.md §6 row 1): the app must load with the network disabled.
// Loads once so the service worker precaches AND takes control, then kills the
// network and does a full document reload — not a hash change, which would pass
// trivially without touching the network at all.
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
  await page2.waitForSelector('main', { timeout: 10000 });
  const main = (await page2.textContent('main')).trim();
  console.log(`cold deep link offline:    PASS — main="${main.slice(0, 40)}"`);
  await page2.close();
} catch (e) {
  ok = false;
  console.log('cold deep link offline:    FAIL —', String(e).split('\n')[0]);
}

if (errors.length) {
  console.log('\nerrors seen while offline:');
  for (const e of [...new Set(errors)].slice(0, 8)) console.log('  -', e);
}

await browser.close();
console.log(`\n${ok ? 'OFFLINE OK' : 'OFFLINE BROKEN'}`);
process.exit(ok ? 0 : 1);
