import { useMemo, useState } from 'react'

import { presentInvoiceExport, type InvoiceExportFormat } from '../../invoice/export'
import { FLAT_RATE_WORDING, issueInvoice } from '../../invoice/issue'
import { quarterlyStampDutyTotals } from '../../invoice/stampDuty'
import { formatFullDate } from '../../lib/dates'
import { formatEUR } from '../../lib/money'
import { storage } from '../../storage'
import type { Appointment, BusinessProfile, Client, Invoice } from '../../types'
import { ErrorText } from '../ui/FormField'
import { SelectInput } from '../ui/SelectInput'

function clientName(client: Client | undefined): string {
  return client ? `${client.firstName} ${client.lastName}` : 'Client unavailable'
}

function deadlineDate(dueOn: string): string {
  return formatFullDate(`${dueOn}T12:00:00.000Z`, 'en', 'UTC')
}

export function InvoicePanel({
  appointments,
  clientsById,
  invoices,
  profile,
}: {
  appointments: Appointment[]
  clientsById: Map<string, Client>
  invoices: Invoice[]
  profile: BusinessProfile | undefined
}) {
  const [appointmentId, setAppointmentId] = useState('')
  const [issuing, setIssuing] = useState(false)
  const [exporting, setExporting] = useState<InvoiceExportFormat>()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const issuedAppointmentIds = useMemo(
    () => new Set(invoices.map((invoice) => invoice.appointmentId)),
    [invoices],
  )
  const candidates = useMemo(
    () =>
      appointments
        .filter(
          (appointment) =>
            appointment.deletedAt === undefined &&
            appointment.status !== 'cancelled' &&
            !issuedAppointmentIds.has(appointment.id),
        )
        .sort((left, right) => right.startAt.localeCompare(left.startAt)),
    [appointments, issuedAppointmentIds],
  )
  const orderedInvoices = useMemo(
    () => [...invoices].sort((left, right) => right.issuedAt.localeCompare(left.issuedAt)),
    [invoices],
  )
  const quarters = useMemo(
    () => quarterlyStampDutyTotals(invoices, profile?.stampDutyDeadlines ?? []),
    [invoices, profile?.stampDutyDeadlines],
  )

  async function issue() {
    if (!appointmentId) {
      setError('Choose a booking to invoice.')
      return
    }
    setIssuing(true)
    setError('')
    setMessage('')
    try {
      const invoice = await issueInvoice(storage, appointmentId)
      setAppointmentId('')
      setMessage(`Invoice ${invoice.invoiceNumber} issued and saved on this device.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The invoice could not be issued.')
    } finally {
      setIssuing(false)
    }
  }

  async function exportInvoices(format: InvoiceExportFormat) {
    setExporting(format)
    setError('')
    setMessage('')
    try {
      const chronological = [...invoices].sort((left, right) =>
        left.issuedAt.localeCompare(right.issuedAt),
      )
      const result = await presentInvoiceExport(format, chronological)
      if (result !== 'cancelled') {
        setMessage(
          result === 'shared'
            ? `${format.toUpperCase()} export opened in the share sheet.`
            : `${format.toUpperCase()} export downloaded.`,
        )
      }
    } catch {
      setError('The invoice export could not be prepared. Try again.')
    } finally {
      setExporting(undefined)
    }
  }

  return (
    <section className="mt-10 min-w-0 rounded-3xl border border-line bg-paper/75 p-4 sm:p-6" aria-labelledby="invoice-heading">
      <header className="border-b border-line pb-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Accountant hand-off</p>
        <h2 id="invoice-heading" className="mt-2 font-display text-3xl leading-tight text-ink">Forfettario invoices</h2>
        <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-ink">
          This app does not transmit invoices to the SdI. Issuing here creates a local record and clean files for the accountant; it does not file or send anything.
        </p>
        <p className="mt-3 max-w-2xl text-xs leading-5 text-muted">
          No VAT is charged. Fiscal wording: “{FLAT_RATE_WORDING}”
        </p>
      </header>

      <div className="mt-5 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <label className="min-w-0">
          <span className="mb-2 block text-sm font-bold text-ink">Booking to invoice</span>
          <SelectInput
            value={appointmentId}
            onChange={(event) => {
              setAppointmentId(event.target.value)
              setError('')
            }}
            aria-label="Booking to invoice"
          >
            <option value="">Choose a booking</option>
            {candidates.map((appointment) => (
              <option key={appointment.id} value={appointment.id}>
                {clientName(clientsById.get(appointment.clientId))} — {formatFullDate(appointment.startAt)} — {formatEUR(appointment.total)}
              </option>
            ))}
          </SelectInput>
        </label>
        <button
          type="button"
          onClick={() => void issue()}
          disabled={issuing || !appointmentId}
          className="min-h-12 w-full rounded-xl bg-accent px-5 text-base font-bold text-paper disabled:opacity-50 md:w-auto"
        >
          {issuing ? 'Issuing…' : 'Issue invoice'}
        </button>
      </div>
      {candidates.length === 0 ? (
        <p className="mt-3 text-sm leading-6 text-muted">Every available booking already has an invoice, or there are no bookings yet.</p>
      ) : null}

      <div className="mt-5 flex min-w-0 flex-wrap gap-3 border-t border-line pt-5">
        <button
          type="button"
          disabled={!invoices.length || exporting !== undefined}
          onClick={() => void exportInvoices('csv')}
          className="min-h-11 flex-1 rounded-xl border border-accent px-4 text-sm font-bold text-accent disabled:opacity-50 sm:flex-none"
        >
          {exporting === 'csv' ? 'Preparing…' : 'Export CSV'}
        </button>
        <button
          type="button"
          disabled={!invoices.length || exporting !== undefined}
          onClick={() => void exportInvoices('json')}
          className="min-h-11 flex-1 rounded-xl border border-accent px-4 text-sm font-bold text-accent disabled:opacity-50 sm:flex-none"
        >
          {exporting === 'json' ? 'Preparing…' : 'Export JSON'}
        </button>
        <p className="w-full text-xs leading-5 text-muted">On iPhone and iPad, the share sheet is offered when the device accepts files. Otherwise the file downloads as a blob.</p>
      </div>

      <div className="min-h-7" aria-live="polite">
        {error ? <ErrorText className="mt-3">{error}</ErrorText> : null}
        {message ? <p className="mt-3 text-sm font-semibold leading-6 text-success-text">{message}</p> : null}
      </div>

      <section className="mt-6 border-t border-line pt-5" aria-labelledby="stamp-tracker-heading">
        <h3 id="stamp-tracker-heading" className="font-display text-2xl text-ink">Quarterly stamp duty</h3>
        <p className="mt-2 text-sm leading-6 text-muted">The client funds each EUR 2.00 charge, but you remit the cumulative amount by F24. Cross-check these totals with the Agenzia delle Entrate portal.</p>
        {quarters.length ? (
          <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {quarters.map((quarter) => (
              <article key={quarter.key} className="min-w-0 rounded-2xl border border-line bg-canvas/55 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-muted">Q{quarter.quarter} {quarter.year}</p>
                <p className="mt-2 font-display text-2xl text-ink">{formatEUR(quarter.total)}</p>
                <p className="mt-1 text-xs leading-5 text-muted">{quarter.invoiceCount} stamp-duty {quarter.invoiceCount === 1 ? 'charge' : 'charges'}</p>
                <p className="mt-3 border-t border-line pt-3 text-xs leading-5 text-muted">
                  {quarter.deadline
                    ? `${quarter.deadline.label} · due ${deadlineDate(quarter.deadline.dueOn)}`
                    : 'No payment deadline configured for this quarter.'}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-muted">No invoice stamp duty or configured quarterly deadlines yet.</p>
        )}
      </section>

      <section className="mt-7 min-w-0 border-t border-line pt-5" aria-labelledby="invoice-register-heading">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-muted">Saved locally</p>
            <h3 id="invoice-register-heading" className="mt-1 font-display text-2xl text-ink">Invoice register</h3>
          </div>
          <span className="flex h-8 min-w-8 items-center justify-center rounded-full border border-line bg-paper px-2 text-sm font-bold text-accent">{invoices.length}</span>
        </div>
        {orderedInvoices.length ? (
          <div className="mt-4 max-w-full overflow-x-auto rounded-2xl border border-line bg-paper [-webkit-overflow-scrolling:touch]" tabIndex={0} aria-label="Invoice register, scroll horizontally for all columns">
            <table className="min-w-[52rem] border-collapse text-left text-sm">
              <thead className="bg-canvas/75 text-xs uppercase tracking-[0.12em] text-muted">
                <tr>
                  <th className="px-4 py-3">Number</th>
                  <th className="px-4 py-3">Issued</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Recipient</th>
                  <th className="px-4 py-3 text-right">Services</th>
                  <th className="px-4 py-3 text-right">Taxable</th>
                  <th className="px-4 py-3 text-right">Stamp</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {orderedInvoices.map((invoice) => (
                  <tr key={invoice.id} className="border-t border-line align-top">
                    <td className="whitespace-nowrap px-4 py-4 font-bold text-ink">{invoice.invoiceNumber}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-muted">{formatFullDate(invoice.issuedAt)}</td>
                    <td className="px-4 py-4">
                      <span className="block font-semibold text-ink">{clientName(invoice.clientSnapshot)}</span>
                      <span className="mt-1 block max-w-56 text-xs leading-5 text-muted">{invoice.clientSnapshot.addressLine}, {invoice.clientSnapshot.city}, {invoice.clientSnapshot.country}</span>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-muted">{invoice.recipientCode || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right text-ink">{formatEUR(invoice.subtotal)}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right text-ink">{formatEUR(invoice.total)}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right text-ink">{formatEUR(invoice.stampDuty)}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-bold text-accent">{formatEUR(invoice.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-muted">No invoices issued yet.</p>
        )}
      </section>
    </section>
  )
}
