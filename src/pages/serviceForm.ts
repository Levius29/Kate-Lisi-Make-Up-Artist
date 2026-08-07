import {
  DEFAULT_CANCELLATION_TIERS,
  normaliseCancellationTiers,
} from '../lib/cancellationTiers'
import type { CreateInput } from '../storage'
import type { RecallChannel, Service } from '../types'
import { centsToEuros, eurosToCents } from './settingsForm'

export interface CancellationTierDraft {
  id: string
  daysBefore: string
  retainPercent: string
}

export interface RecallTemplateDraft {
  id: string
  daysBefore: string
  channel: RecallChannel
  messageTemplate: string
}

export interface ServiceDraft {
  name: string
  description: string
  durationMinutes: string
  basePriceEuros: string
  perPersonPriceEuros: string
  travelFeePerKmEuros: string
  travelFeeFlatEuros: string
  defaultDepositPercent: string
  cancellationTiers: CancellationTierDraft[]
  recallTemplates: RecallTemplateDraft[]
  requiresTrial: boolean
  requiresPatchTest: boolean
  contractTemplateId: string
  active: boolean
}

export type ServiceFieldErrors = Record<string, string>

interface ServiceSaveResult {
  service?: CreateInput<Service>
  errors: ServiceFieldErrors
}

let draftId = 0

export function createServiceDraftId(prefix: 'tier' | 'recall'): string {
  draftId += 1
  return `${prefix}-${draftId}`
}

export function createCancellationTierDraft(
  daysBefore = '',
  retainPercent = '',
): CancellationTierDraft {
  return {
    id: createServiceDraftId('tier'),
    daysBefore,
    retainPercent,
  }
}

export function createRecallTemplateDraft(): RecallTemplateDraft {
  return {
    id: createServiceDraftId('recall'),
    daysBefore: '',
    channel: 'whatsapp',
    messageTemplate: '',
  }
}

export function createDefaultServiceDraft(): ServiceDraft {
  return {
    name: '',
    description: '',
    durationMinutes: '60',
    basePriceEuros: '',
    perPersonPriceEuros: '',
    travelFeePerKmEuros: '',
    travelFeeFlatEuros: '',
    defaultDepositPercent: '30',
    cancellationTiers: DEFAULT_CANCELLATION_TIERS.map((tier) =>
      createCancellationTierDraft(String(tier.daysBefore), String(tier.retainPercent)),
    ),
    recallTemplates: [],
    requiresTrial: false,
    requiresPatchTest: false,
    contractTemplateId: 'standard',
    active: true,
  }
}

export function cancellationTierBandLabels(
  tiers: readonly CancellationTierDraft[],
): Map<string, string> {
  const sorted = tiers
    .filter(({ daysBefore }) => /^\d+$/.test(daysBefore))
    .map((tier) => ({ ...tier, threshold: Number(tier.daysBefore) }))
    .sort((left, right) => right.threshold - left.threshold)
  const labels = new Map<string, string>()

  sorted.forEach((tier, index) => {
    const previous = sorted[index - 1]

    if (index === 0) {
      labels.set(
        tier.id,
        tier.threshold === 0
          ? 'All notice periods'
          : `More than ${tier.threshold - 1} days`,
      )
      return
    }

    if (tier.threshold === 0 && previous) {
      labels.set(tier.id, `Fewer than ${previous.threshold} days`)
      return
    }

    if (previous) {
      labels.set(tier.id, `${previous.threshold - 1} to ${tier.threshold} days`)
    }
  })

  return labels
}

export function serviceToDraft(service: Service): ServiceDraft {
  return {
    name: service.name,
    description: service.description,
    durationMinutes: String(service.durationMinutes),
    basePriceEuros: centsToEuros(service.basePrice),
    perPersonPriceEuros:
      service.perPersonPrice === undefined ? '' : centsToEuros(service.perPersonPrice),
    travelFeePerKmEuros:
      service.travelFeePerKm === undefined ? '' : centsToEuros(service.travelFeePerKm),
    travelFeeFlatEuros:
      service.travelFeeFlat === undefined ? '' : centsToEuros(service.travelFeeFlat),
    defaultDepositPercent: String(service.defaultDepositPercent),
    cancellationTiers: service.cancellationTiers.map((tier) =>
      createCancellationTierDraft(String(tier.daysBefore), String(tier.retainPercent)),
    ),
    recallTemplates: service.recallTemplates.map((recall) => ({
      id: createServiceDraftId('recall'),
      daysBefore: String(recall.daysBefore),
      channel: recall.channel,
      messageTemplate: recall.messageTemplate,
    })),
    requiresTrial: service.requiresTrial,
    requiresPatchTest: service.requiresPatchTest ?? false,
    contractTemplateId: service.contractTemplateId,
    active: service.active,
  }
}

function isWholeNumber(value: string): boolean {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
}

function isPercentage(value: string): boolean {
  if (value.trim() === '') return false
  const percentage = Number(value)
  return Number.isFinite(percentage) && percentage >= 0 && percentage <= 100
}

function readMoney(
  value: string,
  field: keyof ServiceDraft,
  errors: ServiceFieldErrors,
  required: boolean,
): number | undefined {
  if (value.trim() === '') {
    if (required) errors[field] = 'Enter an amount in euros.'
    return undefined
  }

  try {
    return eurosToCents(value)
  } catch (error) {
    errors[field] =
      error instanceof Error ? error.message : 'Enter a valid amount in euros.'
    return undefined
  }
}

export function prepareServiceForSave(draft: ServiceDraft): ServiceSaveResult {
  const errors: ServiceFieldErrors = {}

  if (draft.name.trim() === '') errors.name = 'This field is required.'
  if (draft.description.trim() === '') errors.description = 'This field is required.'
  if (!isWholeNumber(draft.durationMinutes) || Number(draft.durationMinutes) === 0) {
    errors.durationMinutes = 'Use a positive whole number of minutes.'
  }
  if (!isPercentage(draft.defaultDepositPercent)) {
    errors.defaultDepositPercent = 'Enter a percentage from 0 to 100.'
  }
  if (draft.contractTemplateId.trim() === '') {
    errors.contractTemplateId = 'This field is required.'
  }

  const basePrice = readMoney(draft.basePriceEuros, 'basePriceEuros', errors, true)
  const perPersonPrice = readMoney(
    draft.perPersonPriceEuros,
    'perPersonPriceEuros',
    errors,
    false,
  )
  const travelFeePerKm = readMoney(
    draft.travelFeePerKmEuros,
    'travelFeePerKmEuros',
    errors,
    false,
  )
  const travelFeeFlat = readMoney(
    draft.travelFeeFlatEuros,
    'travelFeeFlatEuros',
    errors,
    false,
  )

  if (draft.cancellationTiers.length === 0) {
    errors.cancellationTiers = 'Add at least one cancellation tier.'
  } else if (
    !draft.cancellationTiers.some(
      (tier) => isWholeNumber(tier.daysBefore) && Number(tier.daysBefore) === 0,
    )
  ) {
    errors.cancellationTiers =
      'Include a 0-day tier so every notice period has a rule.'
  }

  const parsedTiers = draft.cancellationTiers.map((tier) => {
    if (!isWholeNumber(tier.daysBefore)) {
      errors[`cancellationTiers.${tier.id}.daysBefore`] =
        'Use zero or a positive whole number.'
    }
    if (!isPercentage(tier.retainPercent)) {
      errors[`cancellationTiers.${tier.id}.retainPercent`] =
        'Enter a percentage from 0 to 100.'
    }
    return {
      daysBefore: Number(tier.daysBefore),
      retainPercent: Number(tier.retainPercent),
    }
  })

  const thresholdCounts = new Map<number, number>()
  for (const { daysBefore } of parsedTiers) {
    thresholdCounts.set(daysBefore, (thresholdCounts.get(daysBefore) ?? 0) + 1)
  }
  draft.cancellationTiers.forEach((tier, index) => {
    if ((thresholdCounts.get(parsedTiers[index]?.daysBefore ?? Number.NaN) ?? 0) > 1) {
      errors[`cancellationTiers.${tier.id}.daysBefore`] =
        'Each notice threshold must be distinct.'
    }
  })

  const normalisedTiers = normaliseCancellationTiers(parsedTiers)

  const recallTemplates = draft.recallTemplates.map((recall) => {
    if (!isWholeNumber(recall.daysBefore)) {
      errors[`recallTemplates.${recall.id}.daysBefore`] =
        'Use zero or a positive whole number.'
    }
    if (recall.messageTemplate.trim() === '') {
      errors[`recallTemplates.${recall.id}.messageTemplate`] = 'Add a message.'
    }
    return {
      daysBefore: Number(recall.daysBefore),
      channel: recall.channel,
      messageTemplate: recall.messageTemplate.trim(),
    }
  })

  if (
    Object.keys(errors).length > 0 ||
    basePrice === undefined ||
    normalisedTiers.tiers === undefined
  ) {
    return { errors }
  }

  return {
    errors,
    service: {
      name: draft.name.trim(),
      description: draft.description.trim(),
      durationMinutes: Number(draft.durationMinutes),
      basePrice,
      ...(perPersonPrice === undefined ? {} : { perPersonPrice }),
      ...(travelFeePerKm === undefined ? {} : { travelFeePerKm }),
      ...(travelFeeFlat === undefined ? {} : { travelFeeFlat }),
      defaultDepositPercent: Number(draft.defaultDepositPercent),
      cancellationTiers: normalisedTiers.tiers,
      recallTemplates,
      requiresTrial: draft.requiresTrial,
      requiresPatchTest: draft.requiresPatchTest,
      contractTemplateId: draft.contractTemplateId.trim(),
      active: draft.active,
    },
  }
}

export function mergeServiceForUpdate(
  existing: Service,
  prepared: CreateInput<Service>,
): Service {
  const {
    perPersonPrice: _perPersonPrice,
    travelFeePerKm: _travelFeePerKm,
    travelFeeFlat: _travelFeeFlat,
    ...withoutOptionalPrices
  } = existing
  return { ...withoutOptionalPrices, ...prepared }
}

const seededRecallTemplates = [
  {
    daysBefore: 14,
    channel: 'whatsapp' as const,
    messageTemplate:
      'Hello {firstName}, a reminder that your {serviceName} is on {dateLong} at {startTime}, at {location}.',
  },
  {
    daysBefore: 3,
    channel: 'email' as const,
    messageTemplate:
      'Hello {firstName}, your {serviceName} is on {dateLong}. Your balance is {balanceDue}.',
  },
]

export const SEEDED_SERVICE_INPUTS: CreateInput<Service>[] = [
  {
    name: 'Bridal make-up',
    description: 'Wedding-day make-up at the client venue.',
    durationMinutes: 120,
    basePrice: 45_000,
    perPersonPrice: 9_000,
    travelFeePerKm: 100,
    defaultDepositPercent: 30,
    cancellationTiers: DEFAULT_CANCELLATION_TIERS.map((tier) => ({ ...tier })),
    recallTemplates: seededRecallTemplates.map((recall) => ({ ...recall })),
    requiresTrial: true,
    requiresPatchTest: true,
    contractTemplateId: 'standard-bridal',
    active: true,
  },
  {
    name: 'Bridal trial',
    description: 'A dedicated make-up trial before the wedding day.',
    durationMinutes: 120,
    basePrice: 18_000,
    defaultDepositPercent: 30,
    cancellationTiers: DEFAULT_CANCELLATION_TIERS.map((tier) => ({ ...tier })),
    recallTemplates: seededRecallTemplates.map((recall) => ({ ...recall })),
    requiresTrial: false,
    requiresPatchTest: false,
    contractTemplateId: 'standard-trial',
    active: true,
  },
  {
    name: 'Bridesmaid / guest make-up',
    description: 'Event make-up for bridesmaids, family members and guests.',
    durationMinutes: 60,
    basePrice: 9_000,
    perPersonPrice: 9_000,
    defaultDepositPercent: 30,
    cancellationTiers: DEFAULT_CANCELLATION_TIERS.map((tier) => ({ ...tier })),
    recallTemplates: seededRecallTemplates.map((recall) => ({ ...recall })),
    requiresTrial: false,
    requiresPatchTest: false,
    contractTemplateId: 'standard-event',
    active: true,
  },
  {
    name: 'Editorial',
    description: 'Make-up for editorial, campaign and private creative work.',
    durationMinutes: 180,
    basePrice: 30_000,
    travelFeeFlat: 5_000,
    defaultDepositPercent: 30,
    cancellationTiers: DEFAULT_CANCELLATION_TIERS.map((tier) => ({ ...tier })),
    recallTemplates: seededRecallTemplates.map((recall) => ({ ...recall })),
    requiresTrial: false,
    requiresPatchTest: false,
    contractTemplateId: 'standard-editorial',
    active: true,
  },
]
