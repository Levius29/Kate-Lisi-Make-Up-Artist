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

| script | asserts |
|---|---|
| `check-viewports.mjs` | The SPEC.md §10 matrix: 10 iPhone/iPad viewports and orientations. No horizontal page scroll, 44×44 tap targets, 16px form fields, exactly one visible `<nav>`, no console errors, and no primary surface hidden inside its own scroller. Writes screenshots to `SHOT_DIR`. |
| `check-scroll.mjs` | The bottom bar never covers content that cannot be scrolled into view. Reported from a real iPhone; the bar used to be `position: fixed` over a full-height pane. |
| `check-offline.mjs` | The app loads with the network cut — a full document reload **and** a cold deep link in a fresh tab. She works in villas with dead Wi-Fi (SPEC.md §1.3). |
| `audit-dom.mjs` | Duplicate element ids, an undeclared `color-scheme`, developer jargon leaking into user-facing text, which routes render the backup reminder, and whether every one of the first 20 real tab stops shows a visible focus ring. |
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
