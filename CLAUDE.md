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
