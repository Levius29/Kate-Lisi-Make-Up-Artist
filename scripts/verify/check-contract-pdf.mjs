/**
 * Issues a real contract through the app and reads the PAGES of the PDF that comes out.
 *
 * The unit tests assert the pdfmake document definition — the instructions. This asserts the
 * result. The difference has mattered twice already in this project: the signature rules were
 * laid out on a 200pt canvas that ran off an A4 page, and the double-signature block was split
 * across two pages. Both were valid document definitions and both were wrong on paper.
 *
 * The load-bearing check is the last one. Articles 1341-1342 of the Civil Code require the
 * onerous clauses to be listed immediately above the second signature. If a page break lands
 * between the list and the line, the specific approval is not worth much — and no unit test
 * looking at the document definition can see that, because `unbreakable: true` is a request
 * that pdfmake silently ignores when the block is taller than the page.
 *
 * Usage:
 *   npm run build && npx vite preview --port 4173 &
 *   APP_URL=... USER_DIR=/tmp/studio-demo node scripts/verify/seed-demo.mjs
 *   APP_URL=... USER_DIR=/tmp/studio-demo node scripts/verify/check-contract-pdf.mjs
 *
 * Needs playwright and pdfjs-dist available ad hoc; neither is a dependency of the app.
 */
import { chromium } from 'playwright';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.APP_URL || 'http://127.0.0.1:4173/Kate-Lisi-Make-Up-Artist/';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const USER_DIR = process.env.USER_DIR;

if (!USER_DIR) {
  console.error('Set USER_DIR to a profile seeded by scripts/verify/seed-demo.mjs.');
  process.exit(2);
}

const A4_WIDTH = 595.28;
const RIGHT_MARGIN = 50; // pdf.ts page margins
const out = mkdtempSync(join(tmpdir(), 'contract-'));
let failures = 0;

function check(ok, label, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
}

/** Text of the PDF grouped by page, with the x/y of every run. */
async function readPdf(path) {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(path)) }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    pages.push({
      number: n,
      text: content.items.map((i) => i.str).join(' ').replace(/\s+/g, ' '),
      items: content.items.map((i) => ({
        str: i.str,
        x: i.transform[4],
        y: i.transform[5],
        width: i.width,
      })),
    });
  }
  return pages;
}

/** The page a phrase lands on, or 0 when it is nowhere. */
function pageOf(pages, needle) {
  const found = pages.find((p) => p.text.includes(needle));
  return found ? found.number : 0;
}

const context = await chromium.launchPersistentContext(USER_DIR, {
  executablePath: CHROME,
  args: ['--no-sandbox'],
  viewport: { width: 1280, height: 900 },
  acceptDownloads: true,
});
const page = context.pages()[0] || (await context.newPage());

// Stash the generated PDF as it is handed to the object URL, before anything navigates.
await page.addInitScript(() => {
  const original = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (object) => {
    if (object instanceof Blob && object.type === 'application/pdf') {
      const reader = new FileReader();
      reader.onload = () => {
        window.__capturedPdf = String(reader.result).split(',')[1];
      };
      reader.readAsDataURL(object);
    }
    return original(object);
  };
});

/*
 * Drop the precache and the worker before doing anything else. The profile is reused between
 * runs and this app is offline-first, so without this the check silently reads whichever build
 * the service worker cached first — a mutation test of this very script passed against a stale
 * bundle until this was added.
 */
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(async () => {
  for (const key of await caches.keys()) await caches.delete(key);
  for (const registration of await navigator.serviceWorker.getRegistrations()) {
    await registration.unregister();
  }
});
await page.reload({ waitUntil: 'networkidle' });

// Open the first appointment that has one, and issue its contract.
await page.goto(`${BASE}#/calendar`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const entry = page.locator('.calendar-month-grid button').filter({ hasText: /\d{2}:\d{2}/ }).first();
await entry.click();
await page.waitForTimeout(900);

/*
 * The label depends on whether this appointment already carries a contract: contracts are
 * immutable once issued, so a second run re-opens the first one instead of minting another.
 * Either path renders the same PDF, which is what is being checked here.
 */
const issue = page
  .getByRole('button', { name: /Issue and open contract|Issue contract|Open or share PDF/i })
  .first();
if (!(await issue.count())) {
  console.error('No contract action on the appointment screen; cannot verify.');
  await context.close();
  process.exit(2);
}

await issue.click();

/*
 * The app does not download the PDF: it opens it in a tab from an object URL (see
 * src/contract/presentPdf.ts, which does that so iOS Safari treats the window as solicited).
 * So capture the Blob at the point it is created — that is the same object the tab renders,
 * produced by the real code path rather than a re-render for the benefit of this check.
 */
const base64 = await page.waitForFunction(
  () => window.__capturedPdf,
  undefined,
  { timeout: 60000, polling: 250 },
).then((handle) => handle.jsonValue());

const file = join(out, 'contract.pdf');
writeFileSync(file, Buffer.from(base64, 'base64'));
await context.close();

const pages = await readPdf(file);
console.log(`\ncontract rendered: ${pages.length} pages\n`);

// 1. The clauses added in template 1.1.0 are actually on paper.
check(pageOf(pages, 'ATTENDANCE, TIMING AND WORKING CONDITIONS') > 0, 'clause 11 is printed');
check(pageOf(pages, 'ACCOMPANIMENT SERVICE') > 0, 'clause 12 is printed');

// 2. Nothing is laid out past the right margin.
const overflowing = pages.flatMap((p) =>
  p.items
    .filter((i) => i.str.trim() && i.x + i.width > A4_WIDTH - RIGHT_MARGIN + 1)
    .map((i) => `p${p.number} "${i.str.trim().slice(0, 26)}" ends at ${Math.round(i.x + i.width)}`),
);
check(overflowing.length === 0, 'nothing runs past the right margin', overflowing.slice(0, 3).join(' | '));

// 3. THE ONE THAT MATTERS. The onerous-clause list and the second signature line must be on
//    one page, or the specific approval under artt. 1341-1342 is separated from what it approves.
const listPage = pageOf(pages, 'expressly approves the following clauses');
const secondSignaturePage = pageOf(pages, 'second signature, for specific approval');
check(listPage > 0, 'the specific-approval list is printed', `page ${listPage}`);
check(secondSignaturePage > 0, 'the second signature line is printed', `page ${secondSignaturePage}`);
check(
  listPage > 0 && listPage === secondSignaturePage,
  'the approval list and the second signature share a page',
  `list p${listPage}, signature p${secondSignaturePage}`,
);

// 4. Clause 11 is among the clauses submitted for specific approval.
const approvalPageText = pages[Math.max(0, listPage - 1)]?.text ?? '';
check(
  /clause 11 \(the fee remaining payable in full/.test(approvalPageText),
  'clause 11 appears in the specific-approval list',
);

// 5. The footer repeats on every page.
const footerless = pages.filter((p) => !/page \d+ of \d+/.test(p.text)).map((p) => p.number);
check(footerless.length === 0, 'every page carries the footer', footerless.length ? `missing on ${footerless.join(', ')}` : '');

console.log(`\n${failures ? `${failures} FAILED` : 'contract PDF OK'}`);
process.exit(failures ? 1 : 0);
