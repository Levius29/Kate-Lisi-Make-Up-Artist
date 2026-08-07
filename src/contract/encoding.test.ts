import { describe, expect, it } from 'vitest'

import {
  contractTemplate,
  noneDeclared,
  patchTestStatements,
  type ContractLocale,
} from './template'

/*
 * The contract is set in Times, one of the PDF base-14 faces. Those encode
 * WinAnsi (CP1252) and nothing else: a character outside it does not fall back
 * to a similar glyph, it fails to render. Verified by hand that the Italian
 * text renders correctly — attività, lattìce, perché, Città, Verdì, « », — and
 * the typographic apostrophe all come out as real glyphs.
 *
 * This test exists so that stays true. If someone later edits the template and
 * introduces, say, a Greek letter, a non-breaking hyphen or a prime mark, it
 * fails here instead of producing a gap in a signed contract.
 */

/** CP1252: Latin-1 plus the printable characters in the 0x80–0x9F window. */
const WIN_ANSI_EXTRAS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'

function unsupportedCharacters(text: string): string[] {
  const bad = new Set<string>()
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    const isAsciiPrintable = code >= 0x20 && code <= 0x7e
    const isLatin1 = code >= 0xa0 && code <= 0xff
    const isNewline = ch === '\n'
    if (isAsciiPrintable || isLatin1 || isNewline) continue
    if (WIN_ANSI_EXTRAS.includes(ch)) continue
    bad.add(`${ch} (U+${code.toString(16).toUpperCase().padStart(4, '0')})`)
  }
  return [...bad]
}

function everyStringIn(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) value.forEach((v) => everyStringIn(v, out))
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => everyStringIn(v, out))
  return out
}

describe('every contract string can be encoded by the Times base-14 face', () => {
  for (const locale of ['en', 'it'] as ContractLocale[]) {
    it(`holds for the ${locale.toUpperCase()} template`, () => {
      const strings = [
        ...everyStringIn(contractTemplate[locale]),
        ...everyStringIn(patchTestStatements[locale]),
        noneDeclared[locale],
      ]
      const offenders = strings.flatMap((s) => unsupportedCharacters(s).map((c) => `${c} in "${s.slice(0, 60)}…"`))
      expect(offenders).toEqual([])
    })
  }

  it('recognises a character Times cannot encode', () => {
    // Guard the guard: a Greek alpha and a prime are outside CP1252.
    expect(unsupportedCharacters('caparra α confirmatoria')).toHaveLength(1)
    expect(unsupportedCharacters('14′ September')).toHaveLength(1)
    // The Italian text the contract actually uses must pass.
    expect(unsupportedCharacters('attività, perché, Città, «caparra» — Dell’Orsò')).toEqual([])
  })
})
