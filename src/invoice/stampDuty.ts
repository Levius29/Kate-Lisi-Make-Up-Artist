import { romeDateKey } from '../lib/appointmentSchedule'
import { sumCents } from '../lib/money'
import type { Invoice, StampDutyDeadline } from '../types'

export interface QuarterlyStampDutyTotal {
  key: string
  year: number
  quarter: 1 | 2 | 3 | 4
  invoiceCount: number
  total: number
  deadline?: StampDutyDeadline
}

function quarterKey(year: number, quarter: number): string {
  return `${year}-Q${quarter}`
}

function invoiceQuarter(invoice: Invoice): { year: number; quarter: 1 | 2 | 3 | 4 } {
  const date = romeDateKey(invoice.issuedAt)
  const month = Number(date.slice(5, 7))
  return {
    year: Number(date.slice(0, 4)),
    quarter: (Math.floor((month - 1) / 3) + 1) as 1 | 2 | 3 | 4,
  }
}

function deadlineQuarter(deadline: StampDutyDeadline) {
  // The profile model predates Stage 9 and has no explicit quarter field. Its
  // editable label/id carries the Q# + year association; dueOn remains wholly
  // user-configured and is never replaced with a hard-coded fiscal date.
  const token = `${deadline.label} ${deadline.id}`.match(/Q([1-4])\D*(\d{4})/i)
  if (!token) return undefined
  return { quarter: Number(token[1]) as 1 | 2 | 3 | 4, year: Number(token[2]) }
}

export function quarterlyStampDutyTotals(
  invoices: readonly Invoice[],
  deadlines: readonly StampDutyDeadline[],
): QuarterlyStampDutyTotal[] {
  const totals = new Map<string, QuarterlyStampDutyTotal>()

  for (const deadline of deadlines) {
    const parsed = deadlineQuarter(deadline)
    if (!parsed) continue
    const key = quarterKey(parsed.year, parsed.quarter)
    totals.set(key, {
      key,
      ...parsed,
      invoiceCount: 0,
      total: 0,
      deadline,
    })
  }

  for (const invoice of invoices) {
    if (invoice.stampDuty <= 0) continue
    const parsed = invoiceQuarter(invoice)
    const key = quarterKey(parsed.year, parsed.quarter)
    const current = totals.get(key) ?? {
      key,
      ...parsed,
      invoiceCount: 0,
      total: 0,
    }
    totals.set(key, {
      ...current,
      invoiceCount: current.invoiceCount + 1,
      total: sumCents([current.total, invoice.stampDuty]),
    })
  }

  return [...totals.values()].sort((left, right) => left.key.localeCompare(right.key))
}
