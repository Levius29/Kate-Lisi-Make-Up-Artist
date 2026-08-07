/**
 * Page-level hygiene that unit tests cannot see: duplicate element ids, an undeclared
 * color-scheme, developer jargon leaking into user-facing text, where the backup reminder
 * renders, and whether a keyboard user can see what they have focused.
 *
 * Usage:
 *   npm run build && npx vite preview --port 4173 &
 *   APP_URL=http://127.0.0.1:4173/Kate-Lisi-Make-Up-Artist/ node scripts/verify/audit-dom.mjs
 *
 * Set ROUTES (comma-separated) to narrow the run.
 */
import { chromium } from 'playwright';

const BASE = process.env.APP_URL || 'http://127.0.0.1:4173/Kate-Lisi-Make-Up-Artist/';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// Every route the shell can reach. '#/contracts' is NOT one of them — it falls through to the
// catch-all and silently redirects to Today, so auditing it audits Today twice.
const DEFAULT_ROUTES = [
  '', '#/calendar', '#/calendar/new', '#/clients', '#/clients/new', '#/money',
  '#/settings', '#/services', '#/backup', '#/timeline', '#/settings/contracts',
];
const routes = process.env.ROUTES ? process.env.ROUTES.split(',') : DEFAULT_ROUTES;

const JARGON = /integer cents|IndexedDB|IANA|E\.164|UTC|snapshot|schema|Dexie|whitespace|null|undefined/i;

/** How many tab stops to walk before concluding the keyboard journey is representative. */
const TAB_STOPS = 20;

const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
let failures = 0;

for (const vp of [
  { n: 'phone', w: 393, h: 852, mobile: true },
  { n: 'ipad-land', w: 1366, h: 1024, mobile: false },
]) {
  const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: true, isMobile: vp.mobile });
  const p = await ctx.newPage();
  console.log('==== ' + vp.n + ' ====');

  for (const r of routes) {
    await p.goto(BASE + r, { waitUntil: 'networkidle' });
    await p.waitForTimeout(300);

    const res = await p.evaluate((jargonSrc) => {
      const jargon = new RegExp(jargonSrc, 'i');
      const ids = {};
      document.querySelectorAll('[id]').forEach((e) => { ids[e.id] = (ids[e.id] || 0) + 1; });
      const dup = Object.entries(ids).filter(([, n]) => n > 1).map(([i, n]) => i + '×' + n);
      return {
        dup,
        banner: /your data needs a backup/i.test(document.body.innerText),
        cs: getComputedStyle(document.documentElement).colorScheme,
        jargonHits: [...new Set(document.body.innerText.split('\n')
          .filter((l) => jargon.test(l)).map((l) => l.trim().slice(0, 70)))].slice(0, 3),
      };
    }, JARGON.source);

    /*
     * Walk real tab stops rather than calling .focus() on one arbitrary button. The old check
     * sampled document.querySelector('button'), which for a long time was the backup reminder's
     * "Later" on every page — so it was really measuring one component, and it started
     * reporting false the moment that banner moved. A ring is whatever the eye can see: a real
     * outline, or a box-shadow standing in for one.
     */
    await p.evaluate(() => { document.body.focus(); });
    const ringless = [];
    let stops = 0;
    const seen = new Set();
    for (let i = 0; i < TAB_STOPS; i += 1) {
      await p.keyboard.press('Tab');
      const stop = await p.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const st = getComputedStyle(el);
        const outlined = st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) > 0;
        return {
          key: el.tagName + '#' + (el.id || '') + '.' + (el.className || '').toString().slice(0, 30),
          label: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 32),
          ring: outlined || st.boxShadow !== 'none',
        };
      });
      if (!stop || seen.has(stop.key)) continue;
      seen.add(stop.key);
      stops += 1;
      if (!stop.ring) ringless.push(stop.label);
    }
    if (res.dup.length || res.jargonHits.length || res.cs !== 'light' || ringless.length) failures += 1;

    console.log(
      (r || '#/').padEnd(22),
      'dupIDs=' + (res.dup.length ? res.dup.join(',') : 'none'),
      'banner=' + res.banner,
      'colorScheme=' + res.cs,
      `focus=${stops - ringless.length}/${stops} ringed`,
      res.jargonHits.length ? '\n    jargon: ' + res.jargonHits.join(' | ') : '',
      ringless.length ? '\n    NO FOCUS RING: ' + ringless.join(' | ') : '',
    );
  }
  await ctx.close();
}

await b.close();
console.log(failures ? `\n${failures} route/viewport combinations have findings` : '\nDOM audit clean');
process.exit(failures ? 1 : 0);
