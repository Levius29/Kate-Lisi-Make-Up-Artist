import { formatFullDate, formatTimeWithZone } from '../lib/dates'
import type { BridalTimeline } from '../lib/timeline'

interface PdfOutput {
  getBlob: () => Promise<Blob>
}

interface PdfMakeBrowser {
  addVirtualFileSystem?: (vfs: unknown) => void
  vfs?: unknown
  createPdf: (definition: unknown) => PdfOutput
}

export function buildTimelineDocDefinition(
  timeline: BridalTimeline,
  coupleName: string,
): Record<string, unknown> {
  return {
    pageSize: 'A5',
    pageMargins: [34, 38, 34, 38],
    info: { title: `Bridal timeline — ${coupleName}` },
    defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.25 },
    content: [
      { text: 'BRIDAL TIMELINE', style: 'eyebrow' },
      { text: coupleName, style: 'title' },
      { text: formatFullDate(timeline.ceremonyAt), style: 'date' },
      {
        stack: [
          { text: 'ARTIST ARRIVES AT THE VENUE', style: 'arrivalLabel' },
          { text: formatTimeWithZone(timeline.arrivalAt), style: 'arrival' },
        ],
        style: 'arrivalBox',
      },
      {
        // The planner needs the arrival; the departure is hers. Keeping them
        // distinct avoids promising the venue an arrival a travel-time early.
        columns: [
          { text: `Leave by\n${formatTimeWithZone(timeline.departAt)}`, style: 'summary' },
          { text: `Ceremony\n${formatTimeWithZone(timeline.ceremonyAt)}`, style: 'summary' },
        ],
        columnGap: 12,
        margin: [0, 0, 0, 18],
      },
      {
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto'],
          body: [
            [
              { text: 'Person', style: 'th' },
              { text: 'Start', style: 'th' },
              { text: 'Finish', style: 'th' },
            ],
            ...timeline.slots.map((slot) => [
              { text: slot.label, style: slot.isBride ? 'bride' : 'td' },
              { text: formatTimeWithZone(slot.startsAt), style: slot.isBride ? 'bride' : 'td' },
              { text: formatTimeWithZone(slot.endsAt), style: slot.isBride ? 'bride' : 'td' },
            ]),
          ],
        },
        layout: 'lightHorizontalLines',
      },
      {
        text: `${timeline.bufferMinutes}-minute buffer after make-up · ${timeline.travelMinutes}-minute travel allowance before start`,
        style: 'note',
      },
    ],
    styles: {
      eyebrow: { fontSize: 8, bold: true, color: '#765f5a', characterSpacing: 1.5 },
      title: { fontSize: 22, bold: true, color: '#302a29', margin: [0, 5, 0, 3] },
      date: { fontSize: 11, color: '#746b68', margin: [0, 0, 0, 18] },
      arrivalBox: { fillColor: '#efe6e0', margin: [0, 0, 0, 16] },
      arrivalLabel: { fontSize: 8, bold: true, color: '#765f5a', margin: [12, 10, 12, 1] },
      arrival: { fontSize: 18, bold: true, color: '#302a29', margin: [12, 0, 12, 10] },
      summary: { fontSize: 9, bold: true, color: '#302a29' },
      th: { fontSize: 8, bold: true, color: '#765f5a', margin: [0, 5, 0, 5] },
      td: { fontSize: 8, margin: [0, 5, 0, 5] },
      bride: { fontSize: 8, bold: true, color: '#765f5a', margin: [0, 5, 0, 5] },
      note: { fontSize: 8, color: '#746b68', margin: [0, 14, 0, 0] },
    },
  }
}

async function loadPdfMake(): Promise<PdfMakeBrowser> {
  const [pdfMakeModule, vfsModule] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ])
  const pdfMake = ((pdfMakeModule as Record<string, unknown>).default ?? pdfMakeModule) as PdfMakeBrowser
  const vfsExport = (vfsModule as Record<string, unknown>).default ?? vfsModule
  const vfs = (vfsExport as { pdfMake?: { vfs?: unknown } }).pdfMake?.vfs ?? vfsExport
  if (typeof pdfMake.addVirtualFileSystem === 'function') pdfMake.addVirtualFileSystem(vfs)
  else pdfMake.vfs = vfs
  return pdfMake
}

export async function generateTimelinePdfBlob(
  timeline: BridalTimeline,
  coupleName: string,
): Promise<Blob> {
  const pdfMake = await loadPdfMake()
  return pdfMake.createPdf(buildTimelineDocDefinition(timeline, coupleName)).getBlob()
}

export function timelineFileName(coupleName: string): string {
  const safeName = coupleName.trim().replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return `bridal-timeline-${safeName || 'couple'}.pdf`
}

