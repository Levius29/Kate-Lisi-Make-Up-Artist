import { formatFullDateTimeWithZone } from './lib/dates'

declare const __BUILD_COMMIT__: string
declare const __BUILD_DATE__: string

/*
 * Which build am I looking at?
 *
 * This app is offline-first, so a deploy does not reach the phone until the service worker
 * updates. "Is this the new version or the old one?" has cost real time repeatedly — once for
 * the owner staring at an unchanged screen after a deploy, and twice for an agent verifying a
 * change against a bundle that predated it. This line is the answer, and it is the first thing
 * to check when something "isn't showing up".
 *
 * It uses the app's own date helpers rather than its own formatting: dates in this interface are
 * written out in full and carry an explicit zone, everywhere, including here. The earlier
 * version printed "09:54 UTC", which is both a different rule and a word the interface does not
 * use — the DOM audit flagged it, correctly.
 */
export function formatBuildDate(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Unknown build date'
  return formatFullDateTimeWithZone(date.toISOString())
}

export function formatBuildMarker(commit: string, dateIso: string): string {
  // Seven characters identify a commit unambiguously in a repository this size, and read as a
  // reference rather than a wall of hex.
  return `Version ${commit.slice(0, 7)} · ${formatBuildDate(dateIso)}`
}

export const BUILD_COMMIT =
  typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : 'development'
export const BUILD_DATE =
  typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : new Date().toISOString()
export const BUILD_MARKER = formatBuildMarker(BUILD_COMMIT, BUILD_DATE)
