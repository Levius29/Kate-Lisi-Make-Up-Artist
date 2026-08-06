# BUILD SPEC — Make-up Artist Management PWA

> **How to use this file.** Save it in the repository root as `SPEC.md` and commit it, then run
> the build with Claude Code. Also create `CLAUDE.md` (see §8) — it is read at the start of every
> session and is what keeps a long, multi-session build coherent.
>
> **Use the Codex tool.** You have OpenAI Codex available via the `codex` skill. Use it during
> this build — as a second opinion, not as a subcontractor. It is most useful for reviewing work
> already written: pass it a finished stage and ask it to find what is broken. Treat what comes
> back as a colleague's opinion, not a verdict; where you disagree and are confident, say so and
> keep your version.
>
> One exception, and it is not negotiable: **never hand the contract template to Codex for
> rewriting.** See §8.
>
> Interface language: **English only** (clients are US / UK / Gulf). Code comments in English.

---

## 0. CONTEXT

Solo make-up artist. Based in **Rome, Italy**. Clients are almost exclusively foreign:
American, British, Gulf-region. Bridal work, editorial, private events.
No destination work outside Italy (do **not** build travel/VAT-abroad logic).

Italian VAT registered, **regime forfettario** (flat-rate scheme).

She needs one tool that replaces: paper diary, WhatsApp chaos, Word contracts, and
"did she pay the deposit?" guesswork.

---

## 1. NON-NEGOTIABLE CONSTRAINTS

1. **Static hosting on GitHub Pages.** No server, no backend, no API keys in the repo.
2. **All client data stays on her device.** IndexedDB only. Never commit data to the repo.
3. **Offline-first.** She works in villas and hotels with dead Wi-Fi. Every feature must
   work with zero connectivity, including PDF generation.
4. **Mobile-first.** She uses this one-handed, standing up, holding a brush. Desktop is secondary.
5. **Storage layer must be abstracted** behind an interface (`StorageAdapter`) so a future
   Supabase (EU region) backend can be swapped in without touching UI code.

---

## 2. TECH STACK

- React + Vite + TypeScript
- Tailwind CSS
- `vite.config.ts` → `base: '/<repo-name>/'` for GitHub Pages subpath
- Router: hash-based (`HashRouter`) — GitHub Pages has no SPA rewrite
- IndexedDB via **Dexie.js**
- PDF: **pdfmake** (declarative, handles page breaks, footers, offline). Not html2canvas.
- Service worker via `vite-plugin-pwa`, `registerType: 'autoUpdate'`, precache everything
- Date handling: date-fns + date-fns-tz
- Deploy: GitHub Actions → `gh-pages` branch

### iOS survival requirements (critical)
- Call `navigator.storage.persist()` on first load.
- Detect iOS Safari not in standalone mode → show a **blocking** onboarding screen with
  illustrated "Add to Home Screen" instructions. Explain plainly: *data will be deleted by
  the browser after 7 days if the app is not installed*. Allow dismissal only after an
  explicit "I understand" tap.
- Full `apple-touch-icon`, `theme-color`, `display: standalone` manifest.

---

## 3. DATA MODEL

### 3.1 `BusinessProfile` (singleton, set in Settings)
```
businessName
registeredAddress      // fiscal domicile — the ONLY business address. Goes on invoices
                       // and identifies the party in contracts.
                       // There is no fixed studio: the activity is itinerant, performed at
                       // the client's venue. Place of performance is per-appointment,
                       // never a business-level field. Do not invent a second address.
vatNumber (P.IVA)
taxCode
regime: 'forfettario' | 'ordinario'
atecoCode
invoicePrefix, nextInvoiceNumber
contractPrefix, nextContractNumber
iban, bicSwift, accountHolder
wiseHandle?, revolutHandle?
defaultDepositPercent   // editable per booking
courtOfJurisdiction     // default: "Rome, Italy"
annualRevenueTarget: 85000   // forfettario threshold
```

### 3.2 `Client`
```
firstName, lastName
nationality
timezone                // IANA, e.g. "America/New_York" — used for recall timing
phoneE164               // full international format, drives wa.me links
email
addressLine, city, country
allergies: string
patchTestDone: boolean, patchTestDate?
productPreferences: { halal: bool, vegan: bool, crueltyFree: bool, other: string }
imageReleaseLevel: 'none' | 'private_portfolio' | 'social_media' | 'face_obscured'
gdprConsentAt: date
notes
createdAt, updatedAt
```
Clients are reusable — never re-type details for a returning client.

**Halal note:** when `halal` is true, surface a persistent badge on the appointment card
reading "No pork derivatives / no alcohol-based products". This is a working reminder, not decoration.

### 3.3 `Service` (fully configurable catalogue, seeded with defaults)
```
name, description
durationMinutes
basePrice
perPersonPrice?         // bridesmaids, family
travelFeePerKm?, travelFeeFlat?
defaultDepositPercent   // overridable per booking
cancellationTiers: [ { daysBefore: number, retainPercent: number } ]
recallTemplates: [ { daysBefore: number, channel: 'whatsapp'|'email', messageTemplate: string } ]
requiresTrial: boolean
contractTemplateId
active: boolean
```

Default cancellation ladder (editable):
`>90 days → retain deposit only` · `90–30 days → 50%` · `<30 days → 100%`

### 3.4 `Appointment`
```
clientId
serviceId
status: 'enquiry' | 'quoted' | 'confirmed' | 'balance_paid' | 'completed' | 'cancelled'
startAt, endAt          // stored UTC, displayed Europe/Rome
locationName, locationAddress
parentAppointmentId?    // links a trial to its wedding
peopleCount
ceremonyTime?           // bridal only — drives the timeline calculator
travelKm?
lineItems: [ { label, quantity, unitPrice } ]
subtotal, total         // computed
depositPercent, depositAmount
payments: [ { type: 'deposit'|'balance', amount, method, paidAt } ]
cancellationCutoffs: [ { date, retainPercent } ]   // auto-derived from service tiers
contractId?
internalNotes
```

### 3.5 `Contract`
Immutable snapshot. Once generated and signed, the terms are frozen — later edits to the
service catalogue must **never** retroactively alter an issued contract.
```
contractNumber          // sequential, gapless
appointmentId
clientSnapshot, businessSnapshot, serviceSnapshot, financialSnapshot
language: 'en' | 'it'
generatedAt
signedAt?, signedFileNote?
```

---

## 4. FEATURES

### 4.1 Calendar
- Month / week / day views. Month is the default on mobile.
- Colour-coded by status. Cancelled events greyed, not deleted.
- Auto-generated **milestone markers**, visually distinct from real appointments:
  - each recall date
  - each cancellation cutoff date ("after this date: 50% retained")
  - balance due date
- Tapping an appointment opens a sheet: client, service, money owed, contract button,
  recall buttons, directions link.
- Trial and wedding shown as visually linked (connector line or shared tag).

### 4.2 Bridal timeline calculator
Input: ceremony time, number of people, minutes per person, buffer, travel time.
Output: backwards-calculated arrival time and a per-person running schedule.
Exportable as a small PDF to send to the planner.

### 4.3 Recalls
There is no server, so **nothing sends itself**. Design honestly around that:
- A **"Today" dashboard** on app launch listing every recall due, overdue, or upcoming.
- Each row has one button that opens `https://wa.me/<phoneE164>?text=<encoded>` with the
  message pre-written from the template, merge fields already filled.
- Show the client's **local time** next to the button, plus a soft warning if it is outside
  09:00–20:00 in their timezone.
- Mark-as-sent tracking so nothing is chased twice.
- Templates support merge fields: `{firstName}`, `{serviceName}`, `{dateLong}`,
  `{startTime}`, `{location}`, `{balanceDue}`, `{cancellationDate}`.

### 4.4 Money
- Deposit % is **freely editable per booking** — she decides case by case.
- Track deposit and balance separately, with method and date.
- Dashboard: outstanding balances, overdue payments.
- Running revenue meter against the €85,000 forfettario threshold, with a warning band at 80%.
- Payment methods offered in the UI: **bank transfer, Wise, Revolut**.
  Do **not** offer PayPal or card as first-class options — chargeback exposure runs 120 days.

### 4.5 Contract PDF generator
One button on any appointment → fully formatted, ready-to-sign PDF.

**Formatting rules — enforce strictly:**
- **All dates written out in full: "14 September 2026".** Never numeric. US and UK clients
  read `09/14` and `14/09` in opposite directions; on a wedding date this is catastrophic.
- Times in 24h with an explicit timezone label: `14:00 (CET, Rome)`.
- Currency always `EUR 450.00`, never a bare `€` symbol alone.
- A4, page numbers, contract number in the footer of every page.

**Required contract sections:**
1. Parties — business identified by its **registered address** (the single fiscal address).
2. Service description, date, time, number of people, and **place of performance = the actual
   venue of that appointment** (villa, hotel, client's address), pulled from the appointment
   record. Never a generic "Rome".
3. Fees, itemised. Deposit amount and balance due date.
4. **Deposit clause** — must state explicitly that it is a *caparra confirmatoria* under
   **Article 1385 of the Italian Civil Code**, and must carry the Italian term in the English
   text with an inline explanation. A bare English "deposit" is read as a refundable advance
   and will not hold.
   The clause must state both directions: forfeited by the client on withdrawal, **and**
   double the amount owed by the artist should she withdraw.
5. **Cancellation ladder** — generated from the service tiers, with each cutoff date written
   out in full. Reference Article 1382 (penalty clause).
6. Force majeure. Postponement policy (deposit transferable once, within 12 months).
7. Allergy and patch-test declaration — client confirms disclosed allergies and, where the
   service requires it, that a patch test was performed.
8. **GDPR consent block** — controller identity, purposes, retention period, rights under
   Articles 15–22, contact address.
9. **Image release** — reproduce the client's granular selection (none / private portfolio /
   social media / face obscured) as explicit checked options, not a blanket yes.
10. Governing law: Italy. Jurisdiction: **Courts of Rome**.
11. **Double signature block, Articles 1341–1342 Civil Code.** First signature for the contract
    as a whole; second, separate signature specifically approving the onerous clauses, which
    must be listed by number immediately above the second signature line. Both blocks must be
    unmistakably separate on the page — this is what makes the cancellation and jurisdiction
    clauses enforceable.

**Drafting register:** Italian legal concepts rendered in English. Do **not** import
Anglo-American boilerplate — no "liquidated damages", no "consideration", no "time is of the
essence". Those terms carry no meaning before an Italian court and muddy the ones that do.

Language toggle EN / IT on the generator. English is the default; the Italian version is for
the occasional Italian client, where an English-only contract would weaken every clause.

### 4.6 Invoice export (forfettario)
The app does **not** transmit to the SdI. It produces a clean handoff for her accountant.

- Per-invoice record with sequential gapless numbering.
- **No VAT charged.** Print the mandatory wording: *"Operation not subject to VAT under
  Article 1, paragraphs 54–89, Law 190/2014 — flat-rate scheme"*.
- **€2.00 stamp duty** line auto-added when the invoice total exceeds **€77.47**.
  It is **always recharged to the client** — hard-code this, no per-invoice toggle.
- Critical consequence: when recharged, the €2.00 counts as **part of her compensation**. It
  therefore feeds the taxable base *and* the €85,000 threshold meter. Do not treat it as a
  pass-through. Add it to revenue like any other line.
- She remits the stamp duty herself, quarterly, via F24 — the client merely funds it. Include a
  **quarterly stamp-duty tracker**: cumulative €2 charges per quarter, so she knows the amount
  due and can cross-check against the pre-filled figure in the Agenzia delle Entrate portal.
  Show payment deadlines as a configurable list in Settings rather than hard-coded dates.
- For foreign clients: recipient code `XXXXXXX`, tax code field left empty, full foreign address.
- Export as CSV + JSON, structured for import into Fatture in Cloud or hand-off to the accountant.

### 4.7 Backup — treat as a headline feature, not a settings afterthought
- One-tap **Export All** → single JSON file, AES-encrypted with a passphrase she sets.
- **Import / restore** with a preview of what will be overwritten.
- Optional Google Drive picker upload — her own account, no third party in the chain.
- Persistent nag: if no backup in 7 days, show a dismissable-but-returning banner.
- Onboarding must say it in plain words: **lose the phone with no backup, lose everything.**

---

## 5. UI DIRECTION

Editorial and restrained. This is a beauty professional's tool and it will be seen by clients
over her shoulder — it should not look like accounting software.

- Serif display face for headings, clean sans for the interface.
- Muted, low-saturation palette. Generous whitespace.
- Large tap targets — she is often using this with one hand.
- Home screen = **Today**: next appointment, recalls due, unpaid balances. Nothing else.
- Bottom navigation: Today · Calendar · Clients · Money · Settings

---

## 6. BUILD ORDER — ONE STAGE PER SESSION

Each stage must end green before the next begins. "Green" means `npm run build` succeeds and the
stated criteria are demonstrably true in the running app. Do not scaffold ahead of the current
stage: no placeholder files, no stubbed components for later features, no `TODO` shells.

| # | Stage | Done when |
|---|---|---|
| 1 | Scaffold, PWA shell, service worker, Dexie schema, `StorageAdapter`, iOS install gate | App builds, installs to iOS Home Screen, loads with the network disabled, `navigator.storage.persist()` returns true |
| 2 | Settings + business profile | Profile saves, survives a full app restart, reloads from IndexedDB |
| 3 | Clients CRUD | A client can be created, edited, searched, and soft-deleted; allergy and image-release fields persist |
| 4 | Services catalogue | A service with three cancellation tiers and two recall templates round-trips through storage intact |
| 5 | Calendar + appointments + milestones | Creating an appointment auto-generates its cutoff and recall milestones on the correct dates; a trial links to its wedding |
| 6 | Contract PDF generator | PDF opens on iOS Safari, all dates render in full ("14 September 2026"), both signature blocks present and visually separate, contract is frozen against later catalogue edits |
| 7 | Recalls dashboard + WhatsApp links | Due recalls listed on launch; the link opens WhatsApp with merge fields already filled; client-local time shown |
| 8 | Payments + €85,000 meter | Deposit and balance tracked separately; recharged stamp duty included in the revenue total |
| 9 | Invoice export | CSV and JSON export with sequential gapless numbering and the correct flat-rate wording |
| 10 | Backup / restore / encryption | Export produces an encrypted file; import into a wiped database restores every record |
| 11 | Bridal timeline calculator | Backwards calculation from ceremony time is correct; timeline exports to PDF |

### Verification rule
After each stage, run the build and open the app before reporting completion. A stage that
compiles but was never opened is not finished. Report honestly what was tested by hand and what
was not — do not describe untested behaviour as working.

---

## 7. DELEGATING TO CODEX CLI

Codex CLI is available in this environment. Use it for bulk implementation — but the division
of labour matters more than the throughput.

### Split the work
**Delegate freely** — mechanical, high-volume, easily verified:
scaffolding, Vite/PWA config, service worker, Dexie schema and migrations, CRUD screens,
calendar rendering, pdfmake plumbing, encryption helpers, GitHub Actions deploy pipeline.

**Never delegate** — write these yourself, verbatim from this spec:
- the contract template text, in full
- the *caparra confirmatoria* / Article 1385 clause
- the cancellation ladder wording and Article 1382 reference
- the double-signature block, Articles 1341–1342, including the clause list
- the forfettario invoice wording (Law 190/2014)
- the €2.00 stamp-duty treatment as taxable compensation

These are legal and fiscal instruments with no margin for paraphrase. Codex has no grounding in
Italian civil or tax law and will confidently produce Anglo-American contract boilerplate —
which §4.5 exists specifically to prevent.

### How to run it
- Feed Codex **this spec file directly** rather than re-describing the requirements.
- One `codex exec` per stage of the build order in §6. Verify each stage before starting the next.
- Ask which model and reasoning effort to use before the first call; default `gpt-5.6-sol` at `high`.
- Implementation stages need `--sandbox workspace-write --full-auto`. Always pass
  `--skip-git-repo-check`, append `2>/dev/null`, and append `</dev/null` when stdin is not a TTY.
- Run synchronously. Codex emits nothing until it finishes; a killed process leaves silently
  empty output.
- Continue with `codex exec --skip-git-repo-check resume --last` via stdin, no config flags.

### Review every diff for these four regressions
Codex tends to "improve" precisely the constraints that matter here:
1. **Dates reformatted to numeric or ISO in the PDF.** Full-month format is a hard requirement —
   see §4.5.
2. **Contract snapshots replaced by live joins to the service catalogue.** Issued contracts must
   stay frozen.
3. **A backend, an API call, or `localStorage` quietly introduced.** Static hosting, IndexedDB,
   fully offline — no exceptions.
4. **Italian legal terms translated into English equivalents.** "Caparra confirmatoria" is not
   "non-refundable deposit" and the substitution voids the clause.

Treat Codex as a capable colleague, not an authority. Where its output contradicts this spec,
the spec wins.

---

## 8. WARNING TO CARRY INTO THE BUILD

The contract template is a legal instrument, not copy. It must be reviewed once by an Italian
lawyer before first use — after that it is reusable indefinitely. Generate the template as a
single clearly-marked file so a lawyer can read and amend it without touching application code.

Separately, and outside the scope of this build: the business is fiscally domiciled in Sardinia
while trading habitually in Rome, with no premises in either. Whether that requires any local
notification depends on how the activity is classified — this is a question for her accountant,
not something the software should attempt to encode or resolve.

---

## 8. `CLAUDE.md` — create this file at the repository root

Read automatically at the start of every session. It is what stops a long, multi-session build
from drifting. Copy the block below into `CLAUDE.md` verbatim. If any stage is delegated to
Codex, duplicate the same content into `AGENTS.md` — Codex reads that filename instead.

```markdown
# Agent instructions

## Project
Offline-first PWA for a solo make-up artist working in Rome with foreign clients.
Full requirements live in SPEC.md. Read it before writing any code.

## Absolute rules
- Static hosting on GitHub Pages. No backend, no server, no API keys in the repo.
- All client data lives in IndexedDB on the device. Never commit data, fixtures with real
  names, or `.env` files.
- Every feature must work offline, PDF generation included.
- All storage access goes through `StorageAdapter`. No component touches Dexie directly.
- Contracts are immutable once issued. Changing the service catalogue must never alter an
  already-generated contract.
- Dates shown to a client are always written in full: "14 September 2026". Never numeric.
  A US client reads 09/14 and a UK client reads 14/09 — on a wedding date that is unrecoverable.

## Working method
- Implement one stage from SPEC.md §6 per session. Do not scaffold ahead.
- Run `npm run build` and open the app before declaring a stage complete.
- If SPEC.md is ambiguous or looks wrong, stop and ask. Do not invent a resolution.
- If a requirement is not implementable as written, say so plainly rather than shipping a
  version that looks complete but is not.

## Using Codex
Codex is available via the `codex` skill and should be used during this build. Best use is
review: give it a completed stage and ask what is wrong with it. Second-best is anything
mechanical and self-contained — schema migrations, test fixtures, refactors.

Its output is a colleague's opinion, not an authority. Read every diff before accepting it.
Where you are confident it is wrong, keep your version and say why.

**Never send `src/contract/template.ts` to Codex, in any form, for any purpose.** See below.

## Legal text
Contract clauses live in `src/contract/template.ts` and nowhere else. They are drafted to be
enforceable under Italian law and are pending review by a lawyer. Do not reword, "improve",
condense, or translate them. Do not substitute Anglo-American contract boilerplate — terms
like "liquidated damages" or "consideration" carry no meaning before an Italian court and
weaken the clauses that do. A model asked to polish this file will produce something that
reads better in English and no longer holds in Rome. Changes need explicit human approval.

## Commits
Conventional commits. One stage per branch.
```

---

## 9. WHY THE STAGING MATTERS

This spec is long, and a single agent run will not hold all of it. The failure mode is a build
that looks finished, compiles cleanly, and quietly gets the deposit clause or the date format
wrong — neither of which surfaces until a client disputes a cancellation. Staging exists so each
piece can actually be opened and checked before the next one buries it.
