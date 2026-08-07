# Kate Lisi — Studio

An offline-first PWA for a solo make-up artist working in Rome with foreign clients. It replaces
a paper diary, WhatsApp chaos, Word contracts and "did she pay the deposit?" guesswork.

Full requirements live in [SPEC.md](SPEC.md). Agent instructions are in [CLAUDE.md](CLAUDE.md).

## What it does

| | |
|---|---|
| **Today** | Next appointment, recalls due, unpaid balances |
| **Calendar** | Month/week/day, with auto-generated cutoff, recall and balance-due milestones |
| **Clients** | Reusable records: allergies, patch test, product preferences, image release, GDPR consent |
| **Services** | Configurable catalogue with cancellation ladders and recall templates |
| **Contracts** | Ready-to-sign PDF under Italian law, English or Italian |
| **Money** | Deposits and balances, and a meter against the EUR 85,000 flat-rate threshold |
| **Invoices** | Gapless numbering, flat-rate wording, stamp duty, CSV/JSON for the accountant |
| **Backup** | One encrypted file, restorable onto a wiped device |
| **Timeline** | Backwards schedule from the ceremony, exportable for the planner |

Everything works with no network, including PDF generation. All data stays in IndexedDB on the
device — there is no server, no account and no third party.

## Running it

```sh
npm install
npm run dev        # development
npm run build      # typechecks (tsc -b) and builds
npm test           # unit tests
npm run preview    # serve the production build
```

Note: `npx tsc --noEmit` reports nothing in this repo — the root `tsconfig.json` is
solution-style (`files: []` plus project references). Use `npx tsc -b`, which `npm run build`
already does.

## Deploying

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds and publishes `dist/` to the
`gh-pages` branch. **This needs enabling once:** in the repository settings, set GitHub Pages to
serve from the `gh-pages` branch. The site is then served at
`https://<owner>.github.io/Kate-Lisi-Make-Up-Artist/`, which is why `vite.config.ts` sets that
`base` path.

## Before first use with a client

- **Have an Italian lawyer read `src/contract/template.ts`.** It is drafted to be enforceable
  under Italian law but has not been reviewed. The file contains a note block addressed to the
  reviewer, including a flag that a clause derogating from the consumer's forum
  (art. 33(2)(u) Codice del Consumo) is presumed vexatious and is not cured by the double
  signature alone — most clients here are consumers resident abroad.
- **Install it to the Home Screen on iOS.** Safari deletes the data of an uninstalled web app
  after seven days. The app blocks with instructions until this is acknowledged.
- **Set a backup passphrase and export once.** Lose the phone with no backup, lose everything.

## Notes for whoever works on this next

- All storage goes through `StorageAdapter`; nothing outside `src/storage/` and `src/db/` imports
  Dexie, so a Supabase backend can be swapped in without touching the UI.
- Money is integer cents everywhere. Dates reaching a client are always written out in full —
  `src/lib/dates.ts` deliberately exports no numeric formatter.
- Issued contracts are frozen snapshots. Editing the service catalogue must never alter one.
- The recharged EUR 2.00 stamp duty counts as revenue, not a pass-through. See the comment in
  `src/lib/revenue.ts` before "fixing" it.
