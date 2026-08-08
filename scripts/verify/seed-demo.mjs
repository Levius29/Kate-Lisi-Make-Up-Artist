/**
 * Fills a throwaway browser profile with enough invented data to see the app working.
 *
 * Most of the defects in this project's history were only visible with content on the screen.
 * An empty calendar looks fine; the month grid full of reminders reading "W" over "re" does
 * not. Every visual check should be run against a seeded profile, not an empty one.
 *
 * The data is driven through the app's own forms rather than written into IndexedDB, so the
 * records are exactly what the app would produce — including generated cancellation cutoffs,
 * recalls and balance-due milestones, which is the part that renders in the calendar.
 *
 * NOTHING HERE IS REAL. The names are invented, the numbers come from reserved documentation
 * ranges and the tax identifiers are placeholders. Never point this at, or seed it with, a real
 * client's details: no client data belongs in this repository (CLAUDE.md).
 *
 * Usage:
 *   npm run build && npx vite preview --port 4173 &
 *   APP_URL=http://127.0.0.1:4173/Kate-Lisi-Make-Up-Artist/ \
 *     USER_DIR=/tmp/studio-demo node scripts/verify/seed-demo.mjs
 *
 * Then point any other check at the same USER_DIR with launchPersistentContext.
 */
import { chromium } from 'playwright';

const BASE = process.env.APP_URL || 'http://127.0.0.1:4173/Kate-Lisi-Make-Up-Artist/';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const USER_DIR = process.env.USER_DIR;

if (!USER_DIR) {
  console.error('Set USER_DIR to a scratch directory for the browser profile.');
  process.exit(2);
}

/** Invented. See the header. */
const CLIENTS = [
  ['Sofia', 'Marchetti', '+390600000101'],
  ['Emily', 'Carter', '+15550000102'],
  ['Amira', 'Haddad', '+9710000000103'],
  ['Charlotte', 'Whitfield', '+445500000104'],
  ['Giulia', 'Rossi', '+390600000105'],
];

/** Spread across one month so the grid has both quiet days and crowded ones. */
const BOOKINGS = [
  ['2026-08-11T09:30', '2026-08-11T12:00', 'Villa Aurelia'],
  ['2026-08-14T08:00', '2026-08-14T11:30', 'Villa Miani'],
  ['2026-08-14T15:00', '2026-08-14T17:00', 'Hotel de Russie'],
  ['2026-08-19T07:30', '2026-08-19T10:00', 'Castello di Tor Crescenza'],
  ['2026-08-22T09:00', '2026-08-22T12:30', 'Villa Pamphili'],
  ['2026-08-22T14:00', '2026-08-22T16:00', 'Studio, Trastevere'],
  ['2026-08-27T08:30', '2026-08-27T11:00', 'Villa Aurelia'],
];

const PROFILE = {
  'profile-businessName': 'Kate Lisi Studio',
  'profile-registeredAddress': 'Via di Prova 1\n00100 Roma RM\nItaly',
  'profile-email': 'studio@example.invalid',
  // Eleven digits and no country code: the field holds the Partita IVA itself, and "IT" is the
  // EU prefix added elsewhere. Placeholder value.
  'profile-vatNumber': '00000000000',
  'profile-taxCode': 'RSSMRA80A01H501U',
  'profile-atecoCode': '96.02.02',
  'profile-accountHolder': 'Kate Lisi Studio',
  'profile-iban': 'IT60X0542811101000000123456',
  'profile-bicSwift': 'BPMOIT22XXX',
};

const context = await chromium.launchPersistentContext(USER_DIR, {
  executablePath: CHROME,
  args: ['--no-sandbox'],
  viewport: { width: 1280, height: 900 },
  acceptDownloads: true,
});
const page = context.pages()[0] || (await context.newPage());
page.on('pageerror', (error) => console.log('PAGE ERROR', String(error).slice(0, 160)));

async function settle(ms = 500) {
  await page.waitForTimeout(ms);
}

// 1. Service catalogue.
await page.goto(`${BASE}#/services`, { waitUntil: 'networkidle' });
await settle(700);
const starter = page.getByRole('button', { name: /Add starter services/i });
if (await starter.count()) {
  await starter.first().click();
  await settle(1200);
}

// 2. Clients. The form refuses to save without a phone in E.164, an image-release choice and
// recorded GDPR consent — all three are deliberate, so the seeder has to satisfy them.
for (const [first, last, phone] of CLIENTS) {
  await page.goto(`${BASE}#/clients/new`, { waitUntil: 'networkidle' });
  await settle(350);
  await page.fill('#client-firstName', first);
  await page.fill('#client-lastName', last);
  await page.fill('#client-phoneE164', phone);
  await page.check('input[name="imageReleaseLevel"][value="social_media"]');
  await page.check('#client-gdprConsentAt input[type="checkbox"]');
  await page.getByRole('button', { name: 'Create client' }).click();
  await settle(700);
}

// 3. Business profile, so contracts and invoices can be issued.
await page.goto(`${BASE}#/settings`, { waitUntil: 'networkidle' });
await settle(700);
for (const [id, value] of Object.entries(PROFILE)) await page.fill(`#${id}`, value);
await page.getByRole('button', { name: /Save/i }).first().click();
await settle(1200);

// 4. Appointments.
let created = 0;
for (let index = 0; index < BOOKINGS.length; index += 1) {
  const [start, end, venue] = BOOKINGS[index];
  await page.goto(`${BASE}#/calendar/new`, { waitUntil: 'networkidle' });
  await settle(400);
  const clientIds = await page.$$eval('#appointment-clientId option', (o) =>
    o.map((x) => x.value).filter(Boolean),
  );
  const serviceIds = await page.$$eval('#appointment-serviceId option', (o) =>
    o.map((x) => x.value).filter(Boolean),
  );
  if (!clientIds.length || !serviceIds.length) break;
  await page.selectOption('#appointment-clientId', clientIds[index % clientIds.length]);
  await page.selectOption('#appointment-serviceId', serviceIds[index % serviceIds.length]);
  await page.fill('#appointment-startLocal', start);
  await page.fill('#appointment-endLocal', end);
  await page.fill('#appointment-locationName', venue);
  await page.fill('#appointment-locationAddress', 'Roma RM, Italy');
  await page.getByRole('button', { name: /Save|Create/i }).first().click();
  await settle(900);
  if (!(await page.$('#appointment-startLocal'))) created += 1;
}

// Report what actually landed, rather than what was attempted.
await page.goto(BASE, { waitUntil: 'networkidle' });
const counts = await page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('kate-lisi-studio');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const out = {};
  for (const store of ['clients', 'services', 'appointments', 'profile']) {
    out[store] = db.objectStoreNames.contains(store)
      ? await new Promise((resolve) => {
          const request = db.transaction(store).objectStore(store).getAll();
          request.onsuccess = () => resolve(request.result.length);
        })
      : 0;
  }
  return out;
});

await context.close();

console.log(
  `seeded  clients=${counts.clients}  services=${counts.services}` +
    `  appointments=${counts.appointments}  profile=${counts.profile}`,
);
const ok =
  counts.clients === CLIENTS.length &&
  counts.services > 0 &&
  counts.appointments === BOOKINGS.length &&
  counts.profile === 1;
if (!ok) console.error(`INCOMPLETE — expected ${CLIENTS.length} clients, ${BOOKINGS.length} appointments, 1 profile (created=${created})`);
process.exit(ok ? 0 : 1);
