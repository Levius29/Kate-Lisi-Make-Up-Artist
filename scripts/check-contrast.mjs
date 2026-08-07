import { readFileSync, readdirSync } from 'node:fs'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const colors = new Map(
  [...css.matchAll(/--color-([\w-]+):\s*(#[\da-f]{6})\s*;/gi)].map((match) => [
    match[1],
    match[2].toLowerCase(),
  ]),
)

const checks = [
  ['Secondary text on page', 'muted', 'canvas', 5.5],
  ['Secondary text on cards', 'muted', 'paper', 5.5],
  ['Primary text on page', 'ink', 'canvas', 10],
  ['Primary text on cards', 'ink', 'paper', 10],
  ['Accent text on page', 'accent', 'canvas', 5.5],
  ['Accent text on cards', 'accent', 'paper', 5.5],
  ['Accent text on soft accent', 'accent', 'accent-soft', 5.5],
  ['Accent border on page', 'accent', 'canvas', 3],
  ['Accent border on cards', 'accent', 'paper', 3],
  ['Card border on page', 'line', 'canvas', 3],
  ['Input border on cards', 'line', 'paper', 3],
  ['Card surface on page', 'paper', 'canvas', 1.25],
  ['Button text on accent', 'paper', 'accent', 4.5],
  ['Button text on ink', 'canvas', 'ink', 4.5],
  ['Warning text', 'warning-text', 'warning-surface', 5.5],
  ['Warning text on page', 'warning-text', 'canvas', 5.5],
  ['Warning text on cards', 'warning-text', 'paper', 5.5],
  ['Warning border', 'warning-line', 'warning-surface', 3],
  ['Warning border on cards', 'warning-line', 'paper', 3],
  ['Warning button text', 'paper', 'warning-text', 4.5],
  ['Danger text', 'danger-text', 'danger-surface', 5.5],
  ['Danger text on page', 'danger-text', 'canvas', 5.5],
  ['Danger text on cards', 'danger-text', 'paper', 5.5],
  ['Danger border', 'danger-line', 'danger-surface', 3],
  ['Danger input border', 'danger-line', 'paper', 3],
  ['Success text on page', 'success-text', 'canvas', 5.5],
  ['Success text on cards', 'success-text', 'paper', 5.5],
  ...['enquiry', 'quoted', 'confirmed', 'paid', 'completed', 'cancelled'].flatMap(
    (status) => [
      [`Calendar ${status} text`, `status-${status}-text`, `status-${status}-surface`, 4.5],
      [`Calendar ${status} border`, `status-${status}-line`, `status-${status}-surface`, 3],
    ],
  ),
]

function channel(value) {
  const normalized = value / 255
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4
}

function luminance(hex) {
  const [red, green, blue] = hex
    .slice(1)
    .match(/.{2}/g)
    .map((part) => channel(Number.parseInt(part, 16)))
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrast(first, second) {
  const lighter = Math.max(luminance(first), luminance(second))
  const darker = Math.min(luminance(first), luminance(second))
  return (lighter + 0.05) / (darker + 0.05)
}

let failed = false
console.log('Pair'.padEnd(34), 'Foreground'.padEnd(12), 'Background'.padEnd(12), 'Ratio'.padStart(7), 'Target'.padStart(8), 'Result')

for (const [label, foregroundName, backgroundName, minimum] of checks) {
  const foreground = colors.get(foregroundName)
  const background = colors.get(backgroundName)
  if (!foreground || !background) {
    failed = true
    console.log(label.padEnd(34), `${foreground ?? `missing:${foregroundName}`}`.padEnd(12), `${background ?? `missing:${backgroundName}`}`.padEnd(12), '—'.padStart(7), minimum.toFixed(2).padStart(8), 'FAIL')
    continue
  }

  const ratio = contrast(foreground, background)
  const passes = ratio + Number.EPSILON >= minimum
  failed ||= !passes
  console.log(label.padEnd(34), foreground.padEnd(12), background.padEnd(12), `${ratio.toFixed(2)}:1`.padStart(7), `${minimum.toFixed(2)}:1`.padStart(8), passes ? 'PASS' : 'FAIL')
}

if (failed) process.exitCode = 1

const sourceFiles = readdirSync(new URL('../src', import.meta.url), { recursive: true })
  .filter((path) => typeof path === 'string' && path.endsWith('.tsx'))

const fadedContent = sourceFiles.flatMap((path) => {
  const source = readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
  return [...source.matchAll(/(?<!disabled:)\bopacity-(\d+)\b/g)].map((match) => ({
    path,
    opacity: match[1],
  }))
})

if (fadedContent.length > 0) {
  process.exitCode = 1
  console.log('\nSemantic content opacity guard: FAIL')
  for (const match of fadedContent) console.log(`  ${match.path}: opacity-${match.opacity}`)
} else {
  console.log('\nSemantic content opacity guard: PASS')
}
