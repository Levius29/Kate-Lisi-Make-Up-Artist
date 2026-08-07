import type {
  Appointment,
  AppointmentRecall,
  Client,
  MoneyCents,
} from '../types'
import { romeDateKey } from './appointmentSchedule'
import { formatFullDate, formatTimeWithZone } from './dates'
import { substituteMergeFields } from './mergeFields'
import { formatEUR, sumCents } from './money'

type RecallAppointment = Pick<
  Appointment,
  | 'startAt'
  | 'locationName'
  | 'locationAddress'
  | 'total'
  | 'payments'
  | 'cancellationCutoffs'
>

type RecallClient = Pick<Client, 'firstName' | 'phoneE164' | 'email'>

interface RecallLinkInput {
  appointment: RecallAppointment
  client: RecallClient
  serviceName: string
  recall: Pick<AppointmentRecall, 'channel' | 'messageTemplate'>
  nowIso: string
}

interface DueRecall {
  recall: Pick<AppointmentRecall, 'dueAt' | 'sentAt'>
}

export interface RecallGroups<T> {
  overdue: T[]
  dueToday: T[]
  upcoming: T[]
}

export function calculateBalanceDue(
  appointment: Pick<Appointment, 'total' | 'payments'>,
): MoneyCents {
  return appointment.total - sumCents(appointment.payments.map(({ amount }) => amount))
}

function nextCancellationDate(
  appointment: Pick<Appointment, 'cancellationCutoffs'>,
  nowIso: string,
): string {
  const todayKey = romeDateKey(nowIso)
  const next = appointment.cancellationCutoffs
    .filter(({ date }) => romeDateKey(date) >= todayKey)
    .sort((left, right) => left.date.localeCompare(right.date))[0]

  return next ? formatFullDate(next.date) : ''
}

function recallLocation(
  appointment: Pick<Appointment, 'locationName' | 'locationAddress'>,
): string {
  const address = appointment.locationAddress.trim()
  return address ? `${appointment.locationName}, ${address}` : appointment.locationName
}

function buildRecallBody(input: RecallLinkInput): string {
  const { appointment, client, serviceName, recall, nowIso } = input
  return substituteMergeFields(recall.messageTemplate, {
    firstName: client.firstName,
    serviceName,
    dateLong: formatFullDate(appointment.startAt),
    startTime: formatTimeWithZone(appointment.startAt),
    location: recallLocation(appointment),
    balanceDue: formatEUR(calculateBalanceDue(appointment)),
    cancellationDate: nextCancellationDate(appointment, nowIso),
  })
}

export function buildRecallLink(input: RecallLinkInput): string | undefined {
  const body = encodeURIComponent(buildRecallBody(input))

  if (input.recall.channel === 'email') {
    const email = input.client.email.trim()
    return email ? `mailto:${email}?body=${body}` : undefined
  }

  const digitsOnlyPhone = input.client.phoneE164.replace(/\D/g, '')
  return digitsOnlyPhone ? `https://wa.me/${digitsOnlyPhone}?text=${body}` : undefined
}

export function splitRecallsByDueDate<T extends DueRecall>(
  items: readonly T[],
  nowIso: string,
): RecallGroups<T> {
  const todayKey = romeDateKey(nowIso)
  const groups: RecallGroups<T> = { overdue: [], dueToday: [], upcoming: [] }
  const unsent = items
    .filter(({ recall }) => recall.sentAt === undefined)
    .sort((left, right) => left.recall.dueAt.localeCompare(right.recall.dueAt))

  for (const item of unsent) {
    const dueKey = romeDateKey(item.recall.dueAt)
    if (dueKey < todayKey) groups.overdue.push(item)
    else if (dueKey === todayKey) groups.dueToday.push(item)
    else groups.upcoming.push(item)
  }

  return groups
}

export function updateRecallSentAt<T extends Pick<Appointment, 'recalls'>>(
  appointment: T,
  recallId: string,
  sentAt: string | undefined,
): T {
  if (!appointment.recalls.some(({ id }) => id === recallId)) {
    throw new Error(`Recall not found: ${recallId}`)
  }

  return {
    ...appointment,
    recalls: appointment.recalls.map((recall) => {
      if (recall.id !== recallId) return recall
      if (sentAt !== undefined) return { ...recall, sentAt }
      const { sentAt: _sentAt, ...unsentRecall } = recall
      return unsentRecall
    }),
  }
}
