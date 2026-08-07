/**
 * Every built asset must be in the service worker's precache manifest.
 *
 * This exists because the browser-level offline check cannot prove it. Chromium serves
 * subresources from its own HTTP cache when the network is cut, and workbox's precaching
 * populates that HTTP cache as a side effect of fetching each asset — so an offline route walk
 * passes even with the Cache API wiped and the worker unregistered. That was verified, not
 * assumed: deleting every cache and still reaching Calendar, Money and Settings offline.
 *
 * On a real iPhone there is no such safety net. If a route chunk is missing from this manifest,
 * tapping Calendar in a villa with no signal fails, and route-level code splitting is exactly
 * the change that can cause it.
 *
 * Usage:
 *   npm run build && node scripts/verify/check-precache.mjs
 *
 * No browser required.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.env.DIST || 'dist';

const sw = readFileSync(join(DIST, 'sw.js'), 'utf8');
const assets = readdirSync(join(DIST, 'assets'));

const missing = assets.filter((name) => !sw.includes(name));

for (const name of assets) {
  console.log(`  ${missing.includes(name) ? '** MISSING ' : 'precached  '}${name}`);
}

console.log(
  missing.length
    ? `\n${missing.length}/${assets.length} built assets are NOT precached — these routes will fail offline:\n  ${missing.join('\n  ')}`
    : `\nall ${assets.length} built assets are precached`,
);
process.exit(missing.length ? 1 : 0);
