# Verification harness

These scripts are the operational definition of "green" for this app. They exist because the
things that break here are not caught by unit tests: where the ink lands on a page, whether a
bar covers content, whether a colour is distinguishable, whether the app still works with the
network off.

Every one of them was written in response to a defect that actually happened.

## Running them

Build and serve first — these check the **production build**, not the dev server:

```sh
npm run build
npx vite preview --port 4173 --host 127.0.0.1 &
export APP_URL=http://127.0.0.1:4173/Kate-Lisi-Make-Up-Artist/
```

They need Playwright and a Chromium binary. Playwright is deliberately **not** a dependency of
this app — install it ad hoc when you need to verify:

```sh
npm install --no-save playwright
export CHROME=/path/to/chromium        # optional; defaults to the CI/sandbox path
```

### Then seed, or you are only checking the easy case

Most of these take `USER_DIR`. Point it at a profile made by `seed-demo.mjs` and they resolve
real record ids and visit the routes that only exist once there is data — the appointment
detail, a client record, a payment detail. Without it they see empty states everywhere, and they
now say so loudly instead of printing a confident green total over less of the app.

This is not hypothetical. The harness reported "40/40 routes clear the bottom bar" while
`#/calendar/<id>` rendered inside a fixed modal sheet with 457px of content below the navigation
and a backdrop swallowing every tap on it. No check had ever opened that screen.

```sh
USER_DIR=/tmp/demo node scripts/verify/seed-demo.mjs
USER_DIR=/tmp/demo node scripts/verify/check-scroll.mjs
```

| script | asserts |
|---|---|
| `check-viewports.mjs` | The SPEC.md §10 matrix: 10 iPhone/iPad viewports and orientations. No horizontal page scroll, 44×44 tap targets, 16px form fields, exactly one visible `<nav>`, no console errors, and no primary surface hidden inside its own scroller. Writes screenshots to `SHOT_DIR`. |
| `seed-demo.mjs` | Not a check — fills a throwaway browser profile with invented clients, services and appointments by driving the app's own forms, so the records carry real generated cutoffs, recalls and milestones. Run it before anything visual. |
| `check-scroll.mjs` | The bottom bar never covers content that cannot be scrolled into view, **and stays tappable**. Measures the lowest visible descendant (not `main.children.at(-1)`, which reported clear at 755 while content reached 1244) and hit-tests the bar with `elementFromPoint`. Needs `USER_DIR` to cover the detail routes. |
| `check-offline.mjs` | The app loads with the network cut — a full document reload, a cold deep link in a fresh tab, and a walk through all ten routes she has never opened. She works in villas with dead Wi-Fi (SPEC.md §1.3). **Read the limit noted at the top of the file**: Chromium's own HTTP cache makes this pass even with the precache wiped, so it shows behaviour, not cause. |
| `check-precache.mjs` | Every built asset is in the service worker's precache manifest. This is the check that actually proves a route she has never visited will open offline on an iPhone; the browser-level one cannot. No browser needed. |
| `check-width-sweep.mjs` | Every width from 320 to 1024, not only the ten device sizes: no inline content spills out of its box onto a neighbour, and the page never scrolls sideways. Written after a container query threshold broke the calendar's weekday headings in the 648–680px band, which no device in the matrix lands on, so all 110 checks stayed green. |
| `audit-dom.mjs` | Duplicate element ids, an undeclared `color-scheme`, developer jargon leaking into user-facing text, which routes render the backup reminder, and whether every one of the first 20 real tab stops shows a visible focus ring. |
| `check-contract-pdf.mjs` | Issues a contract through the app and reads the resulting PDF's **pages**: the clauses print, nothing crosses the right margin, and the onerous-clause list shares a page with the second signature line — artt. 1341-1342 depend on that, and `unbreakable: true` is a request pdfmake ignores when a block outgrows the page. |
| `routes.mjs` | Shared helper, not a check: reads real record ids out of IndexedDB so the checkers can reach the data-dependent routes, and warns when a run saw only empty screens. |
| `../check-contrast.mjs` | Every colour pair actually used meets its contrast target. Text ≥5.5:1, borders ≥3:1, cards distinguishable from the page. |

All of them cover every route by default. Set `ROUTES` (comma-separated hash routes) and
`SHOT_DIR` to narrow or redirect a run — but be aware that narrowing is how a checker comes to
print a confident total over a fraction of the app:

```sh
ROUTES=",#/calendar,#/settings" SHOT_DIR=/tmp/shots node scripts/verify/check-viewports.mjs
```

## Deliberately not in CI

CI stays fast: typecheck, unit tests, build, deploy. These need a browser and are for the
person or agent making a change — run them before pushing anything that touches layout, colour
or the service worker, and read the screenshots rather than only the exit code. Three of the
four worst defects in this project's history were found by looking at output, not by a red test.
