import type { Client } from '../types'
import type { CreateInput } from '../storage'

export type ClientImageReleaseLevel = Client['imageReleaseLevel'] | ''

export interface ClientDraft {
  firstName: string
  lastName: string
  nationality: string
  timezone: string
  phoneE164: string
  email: string
  addressLine: string
  city: string
  country: string
  allergies: string
  patchTestDone: boolean
  patchTestDate: string
  productPreferences: {
    halal: boolean
    vegan: boolean
    crueltyFree: boolean
    other: string
  }
  imageReleaseLevel: ClientImageReleaseLevel
  gdprConsentAt: string
  notes: string
}

export type ClientFieldErrors = Partial<Record<keyof ClientDraft, string>>

interface ClientSaveResult {
  client?: CreateInput<Client>
  errors: ClientFieldErrors
}

const FALLBACK_TIME_ZONES = [
  'Europe/Rome',
  'Europe/London',
  'Europe/Paris',
  'Europe/Madrid',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'Asia/Dubai',
  'Asia/Qatar',
  'Asia/Riyadh',
  'Asia/Singapore',
  'Australia/Sydney',
] as const

export function createDefaultClientDraft(): ClientDraft {
  return {
    firstName: '',
    lastName: '',
    nationality: '',
    timezone: 'Europe/Rome',
    phoneE164: '',
    email: '',
    addressLine: '',
    city: '',
    country: '',
    allergies: '',
    patchTestDone: false,
    patchTestDate: '',
    productPreferences: {
      halal: false,
      vegan: false,
      crueltyFree: false,
      other: '',
    },
    imageReleaseLevel: '',
    gdprConsentAt: '',
    notes: '',
  }
}

export function clientToDraft(client: Client): ClientDraft {
  return {
    firstName: client.firstName,
    lastName: client.lastName,
    nationality: client.nationality,
    timezone: client.timezone,
    phoneE164: client.phoneE164,
    email: client.email,
    addressLine: client.addressLine,
    city: client.city,
    country: client.country,
    allergies: client.allergies,
    patchTestDone: client.patchTestDone,
    patchTestDate: client.patchTestDate?.slice(0, 10) ?? '',
    productPreferences: { ...client.productPreferences },
    imageReleaseLevel: client.imageReleaseLevel,
    gdprConsentAt: client.gdprConsentAt,
    notes: client.notes,
  }
}

export function normaliseSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en')
    .trim()
    .replace(/\s+/g, ' ')
}

export function filterClients(clients: readonly Client[], query: string): Client[] {
  const terms = normaliseSearchText(query).split(' ').filter(Boolean)
  if (terms.length === 0) return [...clients]

  return clients.filter((client) => {
    const searchable = normaliseSearchText(
      `${client.firstName} ${client.lastName} ${client.phoneE164} ${client.email}`,
    )
    return terms.every((term) => searchable.includes(term))
  })
}

export function normalisePhoneE164(value: string): string {
  const stripped = value.replace(/[\s\-().[\]]/g, '')
  /*
   * "00" is the ITU international prefix, so 0039... and +39... are the same
   * number written two ways — European clients routinely write the first.
   * Converting it is unambiguous; a national-format number without any prefix
   * is still rejected, because it would silently break the wa.me link later.
   */
  return stripped.startsWith('00') ? `+${stripped.slice(2)}` : stripped
}

function isValidPhoneE164(value: string): boolean {
  return /^\+\d{8,15}$/.test(value)
}

export function isValidIanaTimeZone(value: string): boolean {
  if (value.trim() === '') return false

  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

export function getSupportedTimeZones(): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: 'timeZone') => string[]
  }
  const discovered =
    typeof intl.supportedValuesOf === 'function'
      ? intl.supportedValuesOf('timeZone')
      : [...FALLBACK_TIME_ZONES]
  const zones = new Set<string>(['Europe/Rome', ...discovered])

  return [...zones].sort((left, right) => {
    if (left === 'Europe/Rome') return -1
    if (right === 'Europe/Rome') return 1
    return left.localeCompare(right)
  })
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function required(
  errors: ClientFieldErrors,
  field: keyof ClientDraft,
  value: string,
): void {
  if (value.trim() === '') errors[field] = 'This field is required.'
}

export function prepareClientForSave(draft: ClientDraft): ClientSaveResult {
  const errors: ClientFieldErrors = {}
  required(errors, 'firstName', draft.firstName)
  required(errors, 'lastName', draft.lastName)

  if (!isValidIanaTimeZone(draft.timezone)) {
    errors.timezone = 'Choose a valid IANA timezone.'
  }

  const phoneE164 = normalisePhoneE164(draft.phoneE164)
  if (!isValidPhoneE164(phoneE164)) {
    errors.phoneE164 = 'Use full international format: + followed by 8 to 15 digits.'
  }

  if (draft.imageReleaseLevel === '') {
    errors.imageReleaseLevel = 'Choose one image release option.'
  }

  if (draft.gdprConsentAt === '') {
    errors.gdprConsentAt = 'Record GDPR consent before saving.'
  }

  if (draft.patchTestDate !== '' && !isValidDateOnly(draft.patchTestDate)) {
    errors.patchTestDate = 'Choose a valid patch-test date.'
  }

  if (Object.keys(errors).length > 0 || draft.imageReleaseLevel === '') {
    return { errors }
  }

  return {
    errors,
    client: {
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      nationality: draft.nationality.trim(),
      timezone: draft.timezone,
      phoneE164,
      email: draft.email.trim().toLocaleLowerCase('en'),
      addressLine: draft.addressLine.trim(),
      city: draft.city.trim(),
      country: draft.country.trim(),
      allergies: draft.allergies.trim(),
      patchTestDone: draft.patchTestDone,
      ...(draft.patchTestDone && draft.patchTestDate
        ? { patchTestDate: `${draft.patchTestDate}T00:00:00.000Z` }
        : {}),
      productPreferences: {
        ...draft.productPreferences,
        other: draft.productPreferences.other.trim(),
      },
      imageReleaseLevel: draft.imageReleaseLevel,
      gdprConsentAt: draft.gdprConsentAt,
      notes: draft.notes.trim(),
    },
  }
}

export function mergeClientForUpdate(
  existing: Client,
  prepared: CreateInput<Client>,
): Client {
  const { patchTestDate: _previousPatchTestDate, ...withoutPatchTestDate } = existing
  return { ...withoutPatchTestDate, ...prepared }
}
