/**
 * Builds the contract PDF from an issued Contract record.
 *
 * Two rules govern this file:
 *
 * 1. It reads ONLY the snapshots stored on the Contract. It never looks up a
 *    client, a service or the business profile, because an issued contract is
 *    frozen: editing the service catalogue afterwards must not change a document
 *    someone has already signed.
 * 2. Every date reaching the page goes through formatFullDate, and every amount
 *    through formatEUR. There is no numeric date format anywhere in the app, and
 *    this is the document where that would matter most.
 */
import type { Contract, ImageReleaseLevel } from '../types'
import {
  BUSINESS_TIMEZONE,
  formatFullDate,
  formatTimeWithZone,
} from '../lib/dates'
import { formatEUR } from '../lib/money'
import {
  contractTemplate,
  noneDeclared,
  patchTestStatements,
  type ContractLocale,
  type ContractText,
} from './template'

/* ------------------------------------------------------------------ tokens */

type Tokens = Record<string, string>

function fill(text: string, tokens: Tokens): string {
  return text.replace(/\{(\w+)\}/g, (whole: string, name: string) => {
    const value = tokens[name]
    // An unknown token stays visible rather than becoming an empty gap: a
    // stray {token} in a contract is obvious, a silently missing amount is not.
    return value === undefined ? whole : value
  })
}

function durationText(minutes: number, locale: ContractLocale): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const h = locale === 'it' ? (hours === 1 ? 'ora' : 'ore') : hours === 1 ? 'hour' : 'hours'
  const m = locale === 'it' ? 'minuti' : 'minutes'
  if (hours === 0) return `${rest} ${m}`
  if (rest === 0) return `${hours} ${h}`
  return `${hours} ${h} ${rest} ${m}`
}

function productRequirements(
  preferences: { halal: boolean; vegan: boolean; crueltyFree: boolean; other: string },
  locale: ContractLocale,
): string {
  const parts: string[] = []
  if (preferences.halal) {
    parts.push(
      locale === 'it'
        ? 'prodotti halal: nessun derivato suino, nessun prodotto a base alcolica'
        : 'halal products: no pork derivatives, no alcohol-based products',
    )
  }
  if (preferences.vegan) parts.push(locale === 'it' ? 'prodotti vegani' : 'vegan products')
  if (preferences.crueltyFree) {
    parts.push(locale === 'it' ? 'prodotti cruelty-free' : 'cruelty-free products')
  }
  if (preferences.other.trim() !== '') parts.push(preferences.other.trim())
  return parts.length === 0 ? noneDeclared[locale] : parts.join('; ')
}

function buildTokens(contract: Contract): Tokens {
  const locale = contract.language
  const { businessSnapshot: b, clientSnapshot: c, serviceSnapshot: s, financialSnapshot: f } =
    contract
  const appointmentStart = f.startAt
  const balanceCents = f.total - f.depositAmount

  return {
    generatedDateLong: formatFullDate(contract.generatedAt, locale),
    contractNumber: contract.contractNumber,

    businessName: b.businessName,
    registeredAddress: b.registeredAddress,
    businessEmail: b.email,
    vatNumber: b.vatNumber,
    taxCode: b.taxCode,
    accountHolder: b.accountHolder,
    iban: b.iban,
    bicSwift: b.bicSwift,
    courtOfJurisdiction: b.courtOfJurisdiction,

    clientFullName: `${c.firstName} ${c.lastName}`.trim(),
    clientAddress: [c.addressLine, c.city, c.country].filter((part) => part.trim() !== '').join(', '),
    allergies: c.allergies.trim() === '' ? noneDeclared[locale] : c.allergies.trim(),
    productRequirements: productRequirements(c.productPreferences, locale),

    serviceName: s.name,
    serviceDescription: s.description,
    durationText: durationText(s.durationMinutes, locale),
    peopleCount: String(f.peopleCount),
    venueName: f.locationName,
    venueAddress: f.locationAddress,

    dateLong: formatFullDate(appointmentStart, locale),
    startTime: formatTimeWithZone(appointmentStart, BUSINESS_TIMEZONE),

    depositAmount: formatEUR(f.depositAmount, locale),
    depositDoubleAmount: formatEUR(f.depositAmount * 2, locale),
    balanceAmount: formatEUR(balanceCents, locale),
    balanceDueDateLong: formatFullDate(f.balanceDueAt ?? appointmentStart, locale),

    patchTestStatement: patchTestStatement(contract),
  }
}

function patchTestStatement(contract: Contract): string {
  const locale = contract.language
  const statements = patchTestStatements[locale]
  if (!contract.serviceSnapshot.requiresPatchTest) return statements.not_required
  if (!contract.clientSnapshot.patchTestDone) return statements.required_not_done
  return fill(statements.done, {
    patchTestDateLong: contract.clientSnapshot.patchTestDate
      ? formatFullDate(contract.clientSnapshot.patchTestDate, locale)
      : formatFullDate(contract.generatedAt, locale),
  })
}

/* ------------------------------------------------------------------ tables */

/**
 * The ladder rows read as dates, not day counts. Each stored cutoff is the last
 * day its band applies, so row N covers "after cutoff N-1 and on or before
 * cutoff N", and the final row is everything after the last cutoff.
 */
export function buildLadderRows(contract: Contract): { when: string; consequence: string }[] {
  const locale = contract.language
  const t = contractTemplate[locale]
  const cutoffs = contract.financialSnapshot.cancellationCutoffs

  /*
   * Exactly one row per band. The last band is open-ended — "After 15 August
   * 2026" — because it runs to the appointment itself. Adding a further row
   * after the final cutoff would describe cancelling after the wedding has
   * already happened, and would repeat the last band's percentage.
   */
  return cutoffs.map((cutoff, index) => {
    const previous = cutoffs[index - 1]
    const isLast = index === cutoffs.length - 1

    let when: string
    if (index === 0) {
      when = fill(t.ladder.rowFirst, { cutoffDateLong: formatFullDate(cutoff.date, locale) })
    } else if (isLast) {
      when = fill(t.ladder.rowLast, {
        previousCutoffDateLong: formatFullDate(previous!.date, locale),
      })
    } else {
      when = fill(t.ladder.rowMiddle, {
        cutoffDateLong: formatFullDate(cutoff.date, locale),
        previousCutoffDateLong: formatFullDate(previous!.date, locale),
      })
    }

    return { when, consequence: consequenceText(contract, cutoff.retainPercent) }
  })
}

function consequenceText(contract: Contract, retainPercent: number): string {
  const locale = contract.language
  const t = contractTemplate[locale]
  const f = contract.financialSnapshot
  if (retainPercent === 0) {
    return fill(t.ladder.consequenceDepositOnly, {
      depositAmount: formatEUR(f.depositAmount, locale),
    })
  }
  return fill(t.ladder.consequencePercent, {
    retainPercent: String(retainPercent),
    retainedAmount: formatEUR(Math.round((f.total * retainPercent) / 100), locale),
  })
}

function feeTableBody(contract: Contract, t: ContractText) {
  const locale = contract.language
  const f = contract.financialSnapshot
  const header = [
    { text: t.feeTable.description, style: 'th' },
    { text: t.feeTable.quantity, style: 'th', alignment: 'right' },
    { text: t.feeTable.unitPrice, style: 'th', alignment: 'right' },
    { text: t.feeTable.amount, style: 'th', alignment: 'right' },
  ]
  const lines = f.lineItems.map((item) => [
    { text: item.label, style: 'td' },
    { text: String(item.quantity), style: 'td', alignment: 'right' },
    { text: formatEUR(item.unitPrice, locale), style: 'td', alignment: 'right' },
    { text: formatEUR(item.unitPrice * item.quantity, locale), style: 'td', alignment: 'right' },
  ])
  const totals = [
    [
      { text: t.feeTable.total, style: 'tdStrong', colSpan: 3 },
      {},
      {},
      { text: formatEUR(f.total, locale), style: 'tdStrong', alignment: 'right' },
    ],
    [
      { text: t.feeTable.deposit, style: 'td', colSpan: 3 },
      {},
      {},
      { text: formatEUR(f.depositAmount, locale), style: 'td', alignment: 'right' },
    ],
    [
      {
        text: fill(t.feeTable.balance, {
          balanceDueDateLong: formatFullDate(f.balanceDueAt ?? f.startAt, locale),
        }),
        style: 'td',
        colSpan: 3,
      },
      {},
      {},
      {
        text: formatEUR(f.total - f.depositAmount, locale),
        style: 'td',
        alignment: 'right',
      },
    ],
  ]
  return [header, ...lines, ...totals]
}

const IMAGE_OPTION_ORDER: ImageReleaseLevel[] = [
  'none',
  'private_portfolio',
  'social_media',
  'face_obscured',
]

function imageOptionLines(contract: Contract, t: ContractText) {
  return IMAGE_OPTION_ORDER.map((option) => ({
    text: `${contract.clientSnapshot.imageReleaseLevel === option ? '[X]' : '[  ]'}  ${t.imageOptions[option]}`,
    style: 'clause',
    margin: [0, 2, 0, 2] as [number, number, number, number],
  }))
}

/* ------------------------------------------------------- document assembly */

export function buildContractDocDefinition(contract: Contract): Record<string, unknown> {
  const locale = contract.language
  const t = contractTemplate[locale]
  const tokens = buildTokens(contract)
  const clause = (text: string) => ({ text: fill(text, tokens), style: 'clause' })

  const content: Record<string, unknown>[] = [
    { text: t.documentTitle, style: 'title' },
    { text: `${t.contractNumberLabel} ${contract.contractNumber}`, style: 'subtitle' },
    ...t.preamble.map(clause),
  ]

  for (const key of [
    'parties',
    'object',
    'fees',
    'deposit',
    'cancellation',
    'forceMajeure',
    'allergies',
    'dataProtection',
    'imageRelease',
    'governingLaw',
    'performance',
    'accompaniment',
  ] as const) {
    const c = t.clauses[key]
    content.push({ text: `${c.number}. ${c.heading}`, style: 'clauseHeading' })

    for (const paragraph of c.paragraphs) {
      if (paragraph.trim() === '{feeTable}') {
        content.push({
          table: { headerRows: 1, widths: ['*', 'auto', 'auto', 'auto'], body: feeTableBody(contract, t) },
          layout: 'lightHorizontalLines',
          margin: [0, 6, 0, 10],
        })
        continue
      }
      if (paragraph.trim() === '{ladderTable}') {
        content.push({
          table: {
            headerRows: 1,
            widths: ['*', '*'],
            body: [
              [
                { text: t.ladder.columnDate, style: 'th' },
                { text: t.ladder.columnConsequence, style: 'th' },
              ],
              ...buildLadderRows(contract).map((row) => [
                { text: row.when, style: 'td' },
                { text: row.consequence, style: 'td' },
              ]),
            ],
          },
          layout: 'lightHorizontalLines',
          margin: [0, 6, 0, 10],
        })
        continue
      }
      if (paragraph.trim() === '{imageOptions}') {
        content.push(...imageOptionLines(contract, t))
        continue
      }
      content.push(clause(paragraph))
    }
  }

  /*
   * The two signature blocks must be unmistakably separate on the page: the
   * first approves the contract as a whole, the second approves the onerous
   * clauses individually under Articles 1341-1342. The clause list sits
   * immediately above the second line, which is what makes it work.
   */
  content.push(
    /*
     * Each block is unbreakable so a page break cannot separate a signature line
     * from what it approves. That matters most for the second block: Articles
     * 1341-1342 work because the client re-reads the listed clauses and signs
     * immediately below them. If the list ends on one page and the line sits
     * alone on the next, the client signs a page showing none of the clauses,
     * which is exactly the defect the double signature exists to prevent.
     */
    {
      stack: [
        { text: fill(t.signatures.readAndApproved, tokens), style: 'clause' },
        signatureRow(t.signatures.placeAndDate, t.signatures.theClient, t.signatures.theArtist),
      ],
      unbreakable: true,
      margin: [0, 14, 0, 0],
    },
    {
      stack: [
        { text: t.signatures.specificApprovalHeading, style: 'clauseHeading', margin: [0, 0, 0, 6] },
        { text: fill(t.signatures.specificApprovalIntro, tokens), style: 'clause' },
        {
          ul: t.signatures.onerousClauses.map((item) => fill(item, tokens)),
          style: 'clause',
          margin: [0, 2, 0, 10],
        },
        signatureRow(t.signatures.placeAndDate, t.signatures.theClientSecondSignature),
      ],
      unbreakable: true,
      margin: [0, 20, 0, 0],
    },
  )

  return {
    pageSize: 'A4',
    pageMargins: [50, 56, 50, 64],
    info: { title: `${t.contractNumberLabel} ${contract.contractNumber}` },
    content,
    footer: (currentPage: number, pageCount: number) => ({
      text: fill(t.footer.line, {
        ...tokens,
        page: String(currentPage),
        pages: String(pageCount),
      }),
      style: 'footer',
      margin: [50, 16, 50, 0],
    }),
    /*
     * Times, not Roboto. A grotesque set in bold capitals reads as a demand;
     * a book serif reads as a document, which is what a client is being asked
     * to sign. Times is one of the PDF base-14 faces that pdfmake ships as a
     * font container, so it costs only metrics — no embedded glyphs, and it
     * still renders with no network.
     *
     * Everything else is softened to match: warm near-black instead of pure
     * black, headings carried by a muted accent and letter-spacing rather than
     * heavy bold, and more air between lines.
     */
    defaultStyle: { font: 'Times', fontSize: 10.5, lineHeight: 1.4, color: '#332e2b' },
    styles: {
      title: { fontSize: 17, alignment: 'center', characterSpacing: 0.6, margin: [0, 0, 0, 5] },
      subtitle: { fontSize: 10, alignment: 'center', color: '#7a6f6a', margin: [0, 0, 0, 20] },
      clauseHeading: {
        fontSize: 10.5,
        bold: true,
        color: '#6d564f',
        characterSpacing: 0.3,
        margin: [0, 15, 0, 6],
      },
      clause: { fontSize: 10.5, alignment: 'justify', margin: [0, 0, 0, 6] },
      th: { fontSize: 9.5, bold: true, color: '#6d564f', margin: [0, 5, 0, 5] },
      td: { fontSize: 9.5, margin: [0, 5, 0, 5] },
      tdStrong: { fontSize: 9.5, bold: true, margin: [0, 5, 0, 5] },
      footer: { fontSize: 8, color: '#8a807c', alignment: 'center' },
      sigLabel: { fontSize: 9, color: '#5c534f' },
    },
  }
}

/*
 * The rule is a table bottom-border at width '*', not a fixed-width canvas line.
 * A canvas cannot be given a percentage, so a hard 200pt line overflowed its
 * column as soon as there were three signatures: 3 × 200pt plus gaps is 648pt
 * against 495pt of usable A4, and the last line ran off the page edge. Found on
 * a real device, invisible to a test that only reads the document's text.
 */
function signatureRow(placeAndDate: string, ...names: string[]) {
  const line = (label: string) => ({
    stack: [
      { text: '', margin: [0, 16, 0, 0] },
      {
        table: { widths: ['*'], body: [[{ text: '', border: [false, false, false, true] }]] },
        layout: {
          hLineWidth: (i: number) => (i === 1 ? 0.7 : 0),
          vLineWidth: () => 0,
          hLineColor: () => '#8a807c',
          paddingTop: () => 0,
          paddingBottom: () => 0,
          paddingLeft: () => 0,
          paddingRight: () => 0,
        },
      },
      { text: label, style: 'sigLabel', margin: [0, 5, 0, 0] },
    ],
  })
  return {
    columns: [line(placeAndDate), ...names.map((n) => line(n))],
    columnGap: 20,
    margin: [0, 8, 0, 4],
  }
}

/* ------------------------------------------------------------- generation */

/**
 * pdfmake ships its browser build as UMD and its fonts as a separate CommonJS
 * file, so both shapes are normalised here. Imported lazily to keep the ~1.7 MB
 * font payload out of the first load — the service worker still precaches the
 * chunk, which is why stage 1 raised workbox's 2 MiB file limit.
 */
async function loadPdfMake(): Promise<{ createPdf: (d: unknown) => { getBlob: (cb: (b: Blob) => void) => void } }> {
  const [pdfMakeModule, vfsModule, timesModule] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
    // Base-14 Times: metrics only, no glyph payload, still works offline.
    import('pdfmake/build/standard-fonts/Times'),
  ])
  const pdfMake = ((pdfMakeModule as Record<string, unknown>).default ?? pdfMakeModule) as {
    addVirtualFileSystem?: (vfs: unknown) => void
    addFontContainer?: (container: unknown) => void
    vfs?: unknown
    createPdf: (d: unknown) => { getBlob: (cb: (b: Blob) => void) => void }
  }
  const vfsExport = (vfsModule as Record<string, unknown>).default ?? vfsModule
  const vfs =
    (vfsExport as { pdfMake?: { vfs?: unknown } }).pdfMake?.vfs ?? vfsExport

  if (typeof pdfMake.addVirtualFileSystem === 'function') pdfMake.addVirtualFileSystem(vfs)
  else pdfMake.vfs = vfs

  const times = (timesModule as Record<string, unknown>).default ?? timesModule
  if (typeof pdfMake.addFontContainer === 'function') pdfMake.addFontContainer(times)

  return pdfMake
}

export async function generateContractPdfBlob(contract: Contract): Promise<Blob> {
  const pdfMake = await loadPdfMake()
  const doc = buildContractDocDefinition(contract)
  return new Promise<Blob>((resolve) => {
    pdfMake.createPdf(doc).getBlob(resolve)
  })
}

export function contractFileName(contract: Contract): string {
  const client = `${contract.clientSnapshot.firstName}-${contract.clientSnapshot.lastName}`
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
  return `${contract.contractNumber}-${client}.pdf`.replace(/\//g, '-')
}
