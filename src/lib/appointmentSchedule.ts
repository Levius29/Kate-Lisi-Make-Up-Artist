import { differenceInCalendarDays, startOfDay, subDays } from 'date-fns'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'

import { BUSINESS_TIMEZONE } from './dates'
import type {
  AppointmentRecall,
  CancellationCutoff,
  CancellationTier,
  RecallTemplate,
} from '../types'

export interface AppointmentSchedule {
  cancellationCutoffs: CancellationCutoff[]
  recalls: AppointmentRecall[]
}

export type ScheduleIdFactory = () => string

function randomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function romeCalendarDay(iso: string): Date {
  return startOfDay(toZonedTime(new Date(iso), BUSINESS_TIMEZONE))
}

function utcFromRomeWallTime(date: Date): string {
  return fromZonedTime(date, BUSINESS_TIMEZONE).toISOString()
}

/** A stable date key for grouping UTC instants by their Rome calendar day. */
export function romeDateKey(iso: string): string {
  const date = toZonedTime(new Date(iso), BUSINESS_TIMEZONE)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Midnight at the beginning of a Rome calendar date, stored as UTC. */
export function romeDateKeyToUtc(dateKey: string): string {
  return fromZonedTime(`${dateKey}T00:00:00`, BUSINESS_TIMEZONE).toISOString()
}

/**
 * A cutoff is the last calendar day on which its own band applies: for a tier
 * with threshold D on an appointment starting on W, that day is W - D.
 *
 * Every tier gets a row, including the lowest. Dropping the floor would leave
 * the snapshot unable to say what is retained in the final band, forcing
 * whoever renders it to assume 100% — which is only true of the default ladder,
 * and she can edit it. The floor's row lands on the appointment's own date and
 * reads correctly: notice given on the day itself retains the final percentage.
 */
export function deriveCancellationCutoffs(
  startAt: string,
  tiers: readonly CancellationTier[],
): CancellationCutoff[] {
  return [...tiers]
    .sort((left, right) => right.daysBefore - left.daysBefore)
    .map((tier) => ({
      date: utcFromRomeWallTime(subDays(romeCalendarDay(startAt), tier.daysBefore)),
      retainPercent: tier.retainPercent,
    }))
}

/** Recalls keep the appointment's Rome wall-clock time across DST boundaries. */
export function deriveRecalls(
  startAt: string,
  templates: readonly RecallTemplate[],
  createId: ScheduleIdFactory = randomId,
): AppointmentRecall[] {
  const startInRome = toZonedTime(new Date(startAt), BUSINESS_TIMEZONE)

  return templates.map((template) => ({
    id: createId(),
    daysBefore: template.daysBefore,
    channel: template.channel,
    messageTemplate: template.messageTemplate,
    dueAt: utcFromRomeWallTime(subDays(startInRome, template.daysBefore)),
  }))
}

export function deriveAppointmentSchedule(
  startAt: string,
  tiers: readonly CancellationTier[],
  recallTemplates: readonly RecallTemplate[],
  createId: ScheduleIdFactory = randomId,
): AppointmentSchedule {
  return {
    cancellationCutoffs: deriveCancellationCutoffs(startAt, tiers),
    recalls: deriveRecalls(startAt, recallTemplates, createId),
  }
}

/**
 * Moves an existing booking without consulting the live service catalogue.
 * Cutoff thresholds are recovered from the stored calendar dates; recalls
 * already carry their snapshotted day offsets and message/channel values.
 */
export function rescheduleAppointmentSchedule(
  previousStartAt: string,
  nextStartAt: string,
  cutoffs: readonly CancellationCutoff[],
  recalls: readonly AppointmentRecall[],
): AppointmentSchedule {
  const previousDay = romeCalendarDay(previousStartAt)
  const nextDay = romeCalendarDay(nextStartAt)
  const nextStartInRome = toZonedTime(new Date(nextStartAt), BUSINESS_TIMEZONE)

  return {
    cancellationCutoffs: cutoffs.map((cutoff) => {
      const noticeDays = differenceInCalendarDays(previousDay, romeCalendarDay(cutoff.date))
      return {
        ...cutoff,
        date: utcFromRomeWallTime(subDays(nextDay, noticeDays)),
      }
    }),
    recalls: recalls.map((recall) => ({
      ...recall,
      dueAt: utcFromRomeWallTime(subDays(nextStartInRome, recall.daysBefore)),
    })),
  }
}

export function noticePeriodDays(startAt: string, cutoffDate: string): number {
  return differenceInCalendarDays(romeCalendarDay(startAt), romeCalendarDay(cutoffDate))
}

/**
 * Marker wording reads forward, as SPEC.md §4.1 requires: the marker sitting on
 * a cutoff announces the band that begins the following day, so it carries the
 * NEXT row's percentage, never its own.
 *
 * The last cutoff falls on the appointment's own date and has no following band,
 * so it gets no marker — returns undefined and the caller skips it.
 */
export function cutoffMilestoneLabel(
  cutoffs: readonly CancellationCutoff[],
  cutoffIndex: number,
): string | undefined {
  const next = cutoffs[cutoffIndex + 1]
  if (next === undefined) return undefined
  return `After this date: ${next.retainPercent}% retained`
}
