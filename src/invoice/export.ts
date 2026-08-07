import { romeDateKey } from '../lib/appointmentSchedule'
import { formatEUR } from '../lib/money'
import type { Invoice, InvoiceLineItem } from '../types'

export type InvoiceExportFormat = 'csv' | 'json'
export type InvoiceExportResult = 'downloaded' | 'shared' | 'cancelled'

interface ExportLine extends InvoiceLineItem {
  type: 'service' | 'stamp_duty'
}

function exportLines(invoice: Invoice): ExportLine[] {
  const lines: ExportLine[] = invoice.lineItems.map((item) => ({ ...item, type: 'service' }))
  if (invoice.stampDuty > 0) {
    lines.push({
      type: 'stamp_duty',
      label: 'Stamp duty (recharged to client)',
      quantity: 1,
      unitPrice: invoice.stampDuty,
      amount: invoice.stampDuty,
    })
  }
  return lines
}

function fullAddress(invoice: Invoice): string {
  const client = invoice.clientSnapshot
  return [client.addressLine, client.city, client.country].filter(Boolean).join(', ')
}

export function invoiceExportRecord(invoice: Invoice) {
  const client = invoice.clientSnapshot
  return {
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: romeDateKey(invoice.issuedAt),
    serviceDate: romeDateKey(invoice.serviceDate),
    currency: 'EUR' as const,
    supplier: {
      name: invoice.businessSnapshot.businessName,
      registeredAddress: invoice.businessSnapshot.registeredAddress,
      vatNumber: invoice.businessSnapshot.vatNumber,
      taxCode: invoice.businessSnapshot.taxCode,
    },
    client: {
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      addressLine: client.addressLine,
      city: client.city,
      country: client.country,
      fullAddress: fullAddress(invoice),
      recipientCode: invoice.recipientCode,
      taxCode: invoice.clientTaxCode,
    },
    lineItems: exportLines(invoice).map((line) => ({
      type: line.type,
      description: line.label,
      quantity: line.quantity,
      unitPriceCents: line.unitPrice,
      amountCents: line.amount,
    })),
    vatRatePercent: 0,
    serviceSubtotalCents: invoice.subtotal,
    // Recharged stamp duty is compensation under SPEC.md §4.6, so the taxable
    // total includes it even though it is also broken out for F24 tracking.
    taxableTotalCents: invoice.total,
    stampDutyCents: invoice.stampDuty,
    grandTotalCents: invoice.total,
    flatRateWording: invoice.flatRateWording,
  }
}

export function invoicesToJson(invoices: readonly Invoice[]): string {
  return JSON.stringify(
    {
      format: 'kate-lisi-forfettario-invoices',
      version: 1,
      invoices: invoices.map(invoiceExportRecord),
    },
    null,
    2,
  )
}

export function quoteCsvField(value: string | number): string {
  const field = String(value)
  return /[",\r\n]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field
}

const CSV_HEADERS = [
  'invoice_number',
  'invoice_date',
  'service_date',
  'client_name',
  'client_email',
  'client_address',
  'client_city',
  'client_country',
  'recipient_code',
  'client_tax_code',
  'line_type',
  'line_description',
  'quantity',
  'unit_price',
  'line_total',
  'service_subtotal',
  'taxable_total',
  'stamp_duty',
  'grand_total',
  'currency',
  'vat_rate_percent',
  'flat_rate_wording',
] as const

export function invoicesToCsv(invoices: readonly Invoice[]): string {
  const rows: Array<Array<string | number>> = [CSV_HEADERS.slice()]

  for (const invoice of invoices) {
    const client = invoice.clientSnapshot
    for (const line of exportLines(invoice)) {
      rows.push([
        invoice.invoiceNumber,
        romeDateKey(invoice.issuedAt),
        romeDateKey(invoice.serviceDate),
        `${client.firstName} ${client.lastName}`,
        client.email,
        client.addressLine,
        client.city,
        client.country,
        invoice.recipientCode,
        invoice.clientTaxCode,
        line.type,
        line.label,
        line.quantity,
        formatEUR(line.unitPrice),
        formatEUR(line.amount),
        formatEUR(invoice.subtotal),
        formatEUR(invoice.total),
        formatEUR(invoice.stampDuty),
        formatEUR(invoice.total),
        'EUR',
        0,
        invoice.flatRateWording,
      ])
    }
  }

  return `${rows.map((row) => row.map(quoteCsvField).join(',')).join('\r\n')}\r\n`
}

function exportFile(format: InvoiceExportFormat, invoices: readonly Invoice[]): File {
  const content = format === 'csv' ? invoicesToCsv(invoices) : invoicesToJson(invoices)
  const type = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8'
  return new File([content], `invoices-${romeDateKey(new Date().toISOString())}.${format}`, {
    type,
  })
}

function canShareFile(file: File): boolean {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
    return false
  }
  try {
    return navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

export async function presentInvoiceExport(
  format: InvoiceExportFormat,
  invoices: readonly Invoice[],
): Promise<InvoiceExportResult> {
  if (invoices.length === 0) throw new Error('There are no invoices to export yet.')
  const file = exportFile(format, invoices)

  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: 'Forfettario invoice export' })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      throw error
    }
  }

  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'downloaded'
}
