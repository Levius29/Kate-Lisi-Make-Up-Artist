/**
 * Every width from 320 to 1024, not just the ten device sizes.
 *
 * This exists because the §10 matrix checks ten specific viewports, and a layout can be broken
 * between two of them. It happened: a container query threshold for the calendar's weekday
 * headings was lowered from 42rem to 34rem, which turned full weekday names on while the grid
 * was still too narrow for them. "WEDNESDAY" and "THURSDAY" overlapped again in the 592-624px
 * band — a band no device in the matrix lands on, so all 110 checks stayed green. Sweeping
 * every width found it in one run.
 *
 * Checks, at each width: nothing overflows its own header cell, and the page never scrolls
 * sideways (SPEC.md §10).
 *
 * Usage:
 *   npm run build && npx vite preview --port 4173 &
 *   APP_URL=http://127.0.0.1:4173/Kate-Lisi-Make-Up-Artist/ node scripts/verify/check-width-sweep.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.APP_URL || 'http://127.0.0.1:4173/Kate-Lisi-Make-Up-Artist/';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const STEP = Number(process.env.STEP || 16);
const ROUTES = process.env.ROUTES ? process.env.ROUTES.split(',') : ['#/calendar', '', '#/money', '#/settings'];

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
let failures = 0;
let checks = 0;

for (const route of ROUTES) {
  for (let width = 320; width <= 1024; width += STEP) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      hasTouch: true,
      isMobile: width < 1024,
    });
    const page = await ctx.newPage();
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => { const m = document.querySelector('main'); return !!m && m.innerText.trim().length > 0; },
      { timeout: 15000 },
    ).catch(() => undefined);
    await page.waitForTimeout(120);

    const result = await page.evaluate(() => {
      const de = document.documentElement;
      /*
       * Content wider than its own box, where overflow-x is `visible` — so it spills out and
       * lands on top of whatever sits beside it. That is the WEDNESDAYTHURSDAY signature.
       *
       * Do NOT restrict this to leaf elements. The weekday heading is a <div> wrapping two
       * <span>s: the spans size to their own text and never overflow, while the div that clips
       * them does. A leaf-only filter reported 45/45 clean with the defect present — verified
       * by reintroducing it.
       *
       * `auto`/`scroll` are deliberate scrollers and `hidden` is usually a truncation with an
       * ellipsis; neither overlaps a neighbour, so neither is reported here.
       */
      const inlineOnly = (el) => [...el.children].every((child) => {
        const display = getComputedStyle(child).display;
        // A hidden child cannot make its parent overflow, so it must not disqualify the parent
        // either — the weekday heading always carries one hidden span and one visible one.
        if (display === 'none') return true;
        /*
         * `display: contents` is transparent: the box is gone and its children lay out against
         * the grandparent. So look THROUGH it. Treating it as inline reported the calendar page
         * wrapper as clipped at 320-352px, where the only overflow is the month grid
         * deliberately bleeding 24px into the page gutter to fit seven 44px columns.
         */
        if (display === 'contents') return inlineOnly(child);
        return display === 'inline' || display === 'inline-block';
      });

      const clipped = [...document.querySelectorAll('main *')]
        .filter((el) => (el.textContent || '').trim())
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .filter((el) => getComputedStyle(el).overflowX === 'visible')
        /*
         * Only boxes whose own inline content spills. An element with block children can be
         * "overflowing" because a child is deliberately wider than it — the month grid bleeds
         * into the page gutter below 360px so seven 44px columns fit — and that is a layout
         * decision, not text landing on top of its neighbour.
         */
        .filter(inlineOnly)
        .map((el) => `${el.tagName.toLowerCase()}="${(el.textContent || '').trim().slice(0, 22)}"`)
        .slice(0, 4);
      return { clipped, sideways: de.scrollWidth > de.clientWidth + 1 };
    });

    checks += 1;
    if (result.clipped.length || result.sideways) {
      failures += 1;
      console.log(
        `FAIL  ${(route || '#/ (Today)').padEnd(14)} ${String(width).padStart(4)}px` +
          `${result.sideways ? '  PAGE SCROLLS SIDEWAYS' : ''}` +
          `${result.clipped.length ? '  clipped: ' + result.clipped.join(' | ') : ''}`,
      );
    }
    await ctx.close();
  }
}

await browser.close();
console.log(`\n${checks - failures}/${checks} width samples clean`);
process.exit(failures ? 1 : 0);
