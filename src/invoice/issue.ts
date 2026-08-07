/**
 * Invoice issuance follows the same critical section as contract issuance: the
 * snapshot, sequential number and updated counter are one atomic write.
 */
import { stampDutyForTotal, sumCents } from '../lib/money'
import type { StorageAdapter } from '../storage/StorageAdapter'
import type { Appointment, BusinessProfile, Client, Invoice } from '../types'

/** Fiscal wording required on a forfettario invoice. It must not be reworded. */
export const FLAT_RATE_WORDING =
  'Operation not subject to VAT under Article 1, paragraphs 54–89, Law 190/2014 — flat-rate scheme'

export const FOREIGN_RECIPIENT_CODE = 'XXXXXXX'

export class InvoiceIssueError extends Error {}

export function formatInvoiceNumber(prefix: string, sequence: number): string {
  return `${prefix}${String(sequence).padStart(4, '0')}`
}

export function isForeignClient(client: Pick<Client, 'country'>): boolean {
  const country = client.country.trim().toLocaleLowerCase('en')
  return !['italy', 'italia', 'it'].includes(country)
}

function firstPaymentAt(appointment: Appointment): string | undefined {
  return [...appointment.payments]
    .sort((left, right) => left.paidAt.localeCompare(right.paidAt))[0]
    ?.paidAt
}

export function buildInvoice(input: {
  invoiceNumber: string
  appointment: Appointment
  client: Client
  profile: BusinessProfile
  issuedAt: string
}): Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'> {
  const lineItems = input.appointment.lineItems.map((item) => ({
    ...structuredClone(item),
    amount: Math.round(item.quantity * item.unitPrice),
  }))
  const lineItemTotal = sumCents(lineItems.map(({ amount }) => amount))

  if (lineItemTotal !== input.appointment.total) {
    throw new InvoiceIssueError(
      'The booking line items no longer match its total. Re-save the booking before issuing the invoice.',
    )
  }

  const subtotal = input.appointment.total
  const stampDuty = stampDutyForTotal(subtotal)
  const paidAt = firstPaymentAt(input.appointment)
  const foreign = isForeignClient(input.client)

  return {
    invoiceNumber: input.invoiceNumber,
    appointmentId: input.appointment.id,
    clientId: input.client.id,
    clientSnapshot: structuredClone(input.client),
    businessSnapshot: structuredClone(input.profile),
    issuedAt: input.issuedAt,
    serviceDate: input.appointment.startAt,
    ...(paidAt === undefined ? {} : { paidAt }),
    recipientCode: foreign ? FOREIGN_RECIPIENT_CODE : '',
    // Client records have no Italian codice fiscale field. For the usual
    // foreign-client path the field is intentionally and explicitly blank.
    clientTaxCode: '',
    lineItems,
    subtotal,
    stampDuty,
    total: sumCents([subtotal, stampDuty]),
    flatRateWording: FLAT_RATE_WORDING,
  }
}

export async function issueInvoice(
  storage: StorageAdapter,
  appointmentId: string,
  issuedAt = new Date().toISOString(),
): Promise<Invoice> {
  return storage.transaction(async (tx) => {
    const appointment = await tx.appointments.get(appointmentId)
    if (!appointment) throw new InvoiceIssueError('That appointment no longer exists.')
    if (appointment.status === 'cancelled') {
      throw new InvoiceIssueError('A cancelled appointment cannot be invoiced.')
    }

    const existing = (await tx.invoices.list({ includeDeleted: true })).find(
      (invoice) => invoice.appointmentId === appointmentId,
    )
    if (existing) {
      throw new InvoiceIssueError(`Invoice ${existing.invoiceNumber} already covers this booking.`)
    }

    const [client, profile] = await Promise.all([
      tx.clients.get(appointment.clientId),
      tx.profile.get(),
    ])
    if (!client) throw new InvoiceIssueError('The client for this appointment is missing.')
    if (!profile) {
      throw new InvoiceIssueError(
        'Fill in the business profile in Settings before issuing an invoice.',
      )
    }
    if (profile.regime !== 'forfettario') {
      throw new InvoiceIssueError(
        'This exporter is only for the forfettario regime selected in Settings.',
      )
    }
    if (
      client.firstName.trim() === '' ||
      client.lastName.trim() === '' ||
      client.addressLine.trim() === '' ||
      client.city.trim() === '' ||
      client.country.trim() === ''
    ) {
      throw new InvoiceIssueError(
        'Complete the client name and full address before issuing the invoice.',
      )
    }
    if (!Number.isSafeInteger(profile.nextInvoiceNumber) || profile.nextInvoiceNumber < 1) {
      throw new InvoiceIssueError('Set a valid next invoice number in Settings.')
    }

    const sequence = profile.nextInvoiceNumber
    const invoice = await tx.invoices.create(
      buildInvoice({
        invoiceNumber: formatInvoiceNumber(profile.invoicePrefix, sequence),
        appointment,
        client,
        profile,
        issuedAt,
      }),
    )

    await tx.profile.save({ ...profile, nextInvoiceNumber: sequence + 1 })
    return invoice
  })
}
