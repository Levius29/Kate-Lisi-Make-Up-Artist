import { chromium } from 'playwright';
const BASE = process.env.APP_URL;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const routes = ['', '#/calendar', '#/calendar/new', '#/clients', '#/clients/new', '#/money', '#/settings', '#/services', '#/backup', '#/timeline', '#/contracts'];
const JARGON = /integer cents|IndexedDB|IANA|E\.164|UTC|snapshot|schema|Dexie|whitespace|null|undefined/i;
for (const vp of [{n:'phone',w:393,h:852,mobile:true},{n:'ipad-land',w:1366,h:1024,mobile:false}]) {
  const ctx = await b.newContext({ viewport:{width:vp.w,height:vp.h}, hasTouch:true, isMobile:vp.mobile });
  const p = await ctx.newPage();
  console.log('==== ' + vp.n + ' ====');
  for (const r of routes) {
    await p.goto(BASE + r, { waitUntil: 'networkidle' });
    await p.waitForTimeout(300);
    const res = await p.evaluate((jargonSrc) => {
      const jargon = new RegExp(jargonSrc, 'i');
      const ids = {};
      document.querySelectorAll('[id]').forEach(e => { ids[e.id] = (ids[e.id]||0)+1; });
      const dup = Object.entries(ids).filter(([,n]) => n>1).map(([i,n]) => i+'×'+n);
      const banner = /your data needs a backup/i.test(document.body.innerText);
      const cs = getComputedStyle(document.documentElement).colorScheme;
      const jargonHits = [...new Set(document.body.innerText.split('\n')
        .filter(l => jargon.test(l)).map(l => l.trim().slice(0,70)))].slice(0,3);
      const focusable = document.querySelector('button');
      let focusRing = null;
      if (focusable) { focusable.focus();
        const st = getComputedStyle(focusable);
        focusRing = (st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) > 0) || st.boxShadow !== 'none';
        focusable.blur();
      }
      return { dup, banner, cs, jargonHits, focusRing };
    }, JARGON.source);
    console.log((r||'#/').padEnd(16),
      'dupIDs=' + (res.dup.length ? res.dup.join(',') : 'none'),
      'banner=' + res.banner, 'colorScheme=' + res.cs, 'focusRing=' + res.focusRing,
      res.jargonHits.length ? '\n    jargon: ' + res.jargonHits.join(' | ') : '');
  }
  await ctx.close();
}
await b.close();
