import { addHours, addMinutes, format } from 'date-fns'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'

import {
  deriveAppointmentSchedule,
  rescheduleAppointmentSchedule,
  romeDateKey,
  romeDateKeyToUtc,
  type ScheduleIdFactory,
} from '../lib/appointmentSchedule'
import { BUSINESS_TIMEZONE } from '../lib/dates'
import type { CreateInput } from '../storage'
import type {
  Appointment,
  AppointmentLineItem,
  AppointmentStatus,
  BusinessProfile,
  Service,
} from '../types'
import { centsToEuros, eurosToCents } from './settingsForm'

export interface AppointmentLineItemDraft {
  id: string
  label: string
  quantity: string
  unitPriceEuros: string
}

export interface AppointmentDraft {
  clientId: string
  serviceId: string
  status: AppointmentStatus
  startLocal: string
  endLocal: string
  locationName: string
  locationAddress: string
  parentAppointmentId: string
  peopleCount: string
  ceremonyLocal: string
  travelKm: string
  lineItems: AppointmentLineItemDraft[]
  depositPercent: string
  balanceDueDate: string
  internalNotes: string
}

export type AppointmentFieldErrors = Record<string, string>

interface AppointmentSaveResult {
  appointment?: CreateInput<Appointment>
  errors: AppointmentFieldErrors
}

let lineItemId = 0

export function createLineItemDraft(
  label = '',
  quantity = '1',
  unitPriceEuros = '',
): AppointmentLineItemDraft {
  lineItemId += 1
  return { id: `line-item-${lineItemId}`, label, quantity, unitPriceEuros }
}

export function utcToRomeInput(iso: string): string {
  return format(toZonedTime(new Date(iso), BUSINESS_TIMEZONE), "yyyy-MM-dd'T'HH:mm")
}

export function romeInputToUtc(value: string): string {
  return fromZonedTime(value, BUSINESS_TIMEZONE).toISOString()
}

function defaultStart(now: Date): Date {
  const inRome = toZonedTime(now, BUSINESS_TIMEZONE)
  inRome.setSeconds(0, 0)
  inRome.setMinutes(0)
  return addHours(inRome, 1)
}

export function createDefaultAppointmentDraft(now = new Date()): AppointmentDraft {
  const startInRome = defaultStart(now)
  const startAt = fromZonedTime(startInRome, BUSINESS_TIMEZONE).toISOString()

  return {
    clientId: '',
    serviceId: '',
    status: 'enquiry',
    startLocal: utcToRomeInput(startAt),
    endLocal: utcToRomeInput(addMinutes(new Date(startAt), 60).toISOString()),
    locationName: '',
    locationAddress: '',
    parentAppointmentId: '',
    peopleCount: '1',
    ceremonyLocal: '',
    travelKm: '',
    lineItems: [],
    depositPercent: '',
    balanceDueDate: romeDateKey(startAt),
    internalNotes: '',
  }
}

export function defaultDepositPercent(
  service: Service,
  profile: BusinessProfile | undefined,
): number {
  return Number.isFinite(service.defaultDepositPercent)
    ? service.defaultDepositPercent
    : profile?.defaultDepositPercent ?? 0
}

export function serviceLineItems(
  service: Service,
  peopleCount = 1,
  travelKm?: number,
): AppointmentLineItemDraft[] {
  const items = [createLineItemDraft(service.name, '1', centsToEuros(service.basePrice))]
  const additionalPeople = Math.max(0, peopleCount - 1)

  if (service.perPersonPrice !== undefined && additionalPeople > 0) {
    items.push(
      createLineItemDraft(
        'Additional people',
        String(additionalPeople),
        centsToEuros(service.perPersonPrice),
      ),
    )
  }
  if (service.travelFeeFlat !== undefined) {
    items.push(createLineItemDraft('Travel fee', '1', centsToEuros(service.travelFeeFlat)))
  }
  if (service.travelFeePerKm !== undefined && travelKm !== undefined && travelKm > 0) {
    items.push(
      createLineItemDraft('Travel distance', String(travelKm), centsToEuros(service.travelFeePerKm)),
    )
  }

  return items
}

export function applyServiceDefaults(
  draft: AppointmentDraft,
  service: Service,
  profile: BusinessProfile | undefined,
): AppointmentDraft {
  const startAt = romeInputToUtc(draft.startLocal)
  const endAt = addMinutes(new Date(startAt), service.durationMinutes).toISOString()
  const peopleCount = Number(draft.peopleCount) || 1
  const travelKm = draft.travelKm.trim() === '' ? undefined : Number(draft.travelKm)

  return {
    ...draft,
    serviceId: service.id,
    endLocal: utcToRomeInput(endAt),
    lineItems: serviceLineItems(service, peopleCount, travelKm),
    depositPercent: String(defaultDepositPercent(service, profile)),
  }
}

export function appointmentToDraft(appointment: Appointment): AppointmentDraft {
  return {
    clientId: appointment.clientId,
    serviceId: appointment.serviceId,
    status: appointment.status,
    startLocal: utcToRomeInput(appointment.startAt),
    endLocal: utcToRomeInput(appointment.endAt),
    locationName: appointment.locationName,
    locationAddress: appointment.locationAddress,
    parentAppointmentId: appointment.parentAppointmentId ?? '',
    peopleCount: String(appointment.peopleCount),
    ceremonyLocal: appointment.ceremonyTime ? utcToRomeInput(appointment.ceremonyTime) : '',
    travelKm: appointment.travelKm === undefined ? '' : String(appointment.travelKm),
    lineItems: appointment.lineItems.map((item) =>
      createLineItemDraft(item.label, String(item.quantity), centsToEuros(item.unitPrice)),
    ),
    depositPercent: String(appointment.depositPercent),
    balanceDueDate: romeDateKey(appointment.balanceDueAt ?? appointment.startAt),
    internalNotes: appointment.internalNotes,
  }
}

function parseLineItems(
  drafts: readonly AppointmentLineItemDraft[],
  errors: AppointmentFieldErrors,
): AppointmentLineItem[] {
  if (drafts.length === 0) errors.lineItems = 'Add at least one line item.'

  return drafts.map((draft) => {
    const labelKey = `lineItems.${draft.id}.label`
    const quantityKey = `lineItems.${draft.id}.quantity`
    const priceKey = `lineItems.${draft.id}.unitPriceEuros`
    let unitPrice = 0

    if (draft.label.trim() === '') errors[labelKey] = 'Add a label.'
    const quantity = Number(draft.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors[quantityKey] = 'Use a number greater than zero.'
    }

    try {
      unitPrice = eurosToCents(draft.unitPriceEuros)
    } catch (error) {
      errors[priceKey] = error instanceof Error ? error.message : 'Enter a valid amount.'
    }

    return { label: draft.label.trim(), quantity, unitPrice }
  })
}

function validPercentage(value: string): boolean {
  if (value.trim() === '') return false
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100
}

export function prepareAppointmentForSave(
  draft: AppointmentDraft,
  service: Service,
  existing?: Appointment,
  createId?: ScheduleIdFactory,
): AppointmentSaveResult {
  const errors: AppointmentFieldErrors = {}

  if (draft.clientId === '') errors.clientId = 'Choose a client.'
  if (draft.serviceId === '') errors.serviceId = 'Choose a service.'
  if (draft.locationName.trim() === '') errors.locationName = 'Add the venue name.'
  if (draft.locationAddress.trim() === '') errors.locationAddress = 'Add the venue address.'
  if (!/^\d+$/.test(draft.peopleCount) || Number(draft.peopleCount) < 1) {
    errors.peopleCount = 'Use a positive whole number.'
  }
  if (!validPercentage(draft.depositPercent)) {
    errors.depositPercent = 'Enter a percentage from 0 to 100.'
  }
  if (existing && draft.parentAppointmentId === existing.id) {
    errors.parentAppointmentId = 'An appointment cannot link to itself.'
  }

  let startAt = ''
  let endAt = ''
  try {
    startAt = romeInputToUtc(draft.startLocal)
    endAt = romeInputToUtc(draft.endLocal)
    if (new Date(endAt) <= new Date(startAt)) {
      errors.endLocal = 'End time must be after the start time.'
    }
  } catch {
    errors.startLocal = 'Choose a valid start date and time.'
  }

  let ceremonyTime: string | undefined
  if (draft.ceremonyLocal) {
    try {
      ceremonyTime = romeInputToUtc(draft.ceremonyLocal)
    } catch {
      errors.ceremonyLocal = 'Choose a valid ceremony date and time.'
    }
  }

  let travelKm: number | undefined
  if (draft.travelKm.trim() !== '') {
    travelKm = Number(draft.travelKm)
    if (!Number.isFinite(travelKm) || travelKm < 0) {
      errors.travelKm = 'Use zero or a positive distance.'
    }
  }

  let balanceDueAt = ''
  try {
    balanceDueAt = romeDateKeyToUtc(draft.balanceDueDate || romeDateKey(startAt))
  } catch {
    errors.balanceDueDate = 'Choose a valid balance due date.'
  }

  const lineItems = parseLineItems(draft.lineItems, errors)
  const subtotal = lineItems.reduce((sum, item) => sum + Math.round(item.quantity * item.unitPrice), 0)
  if (!Number.isSafeInteger(subtotal)) errors.lineItems = 'The booking total is too large.'
  const total = subtotal
  const depositPercent = Number(draft.depositPercent)
  const depositAmount = Math.round((total * depositPercent) / 100)

  if (Object.keys(errors).length > 0 || !startAt || !endAt || !balanceDueAt) {
    return { errors }
  }

  const schedule =
    existing && existing.serviceId === service.id
      ? rescheduleAppointmentSchedule(
          existing.startAt,
          startAt,
          existing.cancellationCutoffs,
          existing.recalls,
        )
      : deriveAppointmentSchedule(
          startAt,
          service.cancellationTiers,
          service.recallTemplates,
          createId,
        )

  return {
    errors,
    appointment: {
      clientId: draft.clientId,
      serviceId: service.id,
      status: draft.status,
      startAt,
      endAt,
      locationName: draft.locationName.trim(),
      locationAddress: draft.locationAddress.trim(),
      ...(draft.parentAppointmentId ? { parentAppointmentId: draft.parentAppointmentId } : {}),
      peopleCount: Number(draft.peopleCount),
      ...(ceremonyTime ? { ceremonyTime } : {}),
      ...(travelKm === undefined ? {} : { travelKm }),
      lineItems,
      subtotal,
      total,
      depositPercent,
      depositAmount,
      payments: existing?.payments.map((payment) => ({ ...payment })) ?? [],
      cancellationCutoffs: schedule.cancellationCutoffs,
      balanceDueAt,
      recalls: schedule.recalls,
      ...(existing?.contractId ? { contractId: existing.contractId } : {}),
      internalNotes: draft.internalNotes.trim(),
    },
  }
}

export function mergeAppointmentForUpdate(
  existing: Appointment,
  prepared: CreateInput<Appointment>,
): Appointment {
  const {
    parentAppointmentId: _parentAppointmentId,
    ceremonyTime: _ceremonyTime,
    travelKm: _travelKm,
    contractId: _contractId,
    ...requiredExisting
  } = existing

  return { ...requiredExisting, ...prepared }
}

export function appointmentTotal(draft: AppointmentDraft): number | undefined {
  try {
    const total = draft.lineItems.reduce(
      (sum, item) => sum + Math.round(Number(item.quantity) * eurosToCents(item.unitPriceEuros)),
      0,
    )
    return Number.isSafeInteger(total) ? total : undefined
  } catch {
    return undefined
  }
}
