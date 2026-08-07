import type { BusinessProfile, StampDutyDeadline } from '../types'

export interface BusinessProfileDraft {
  businessName: string
  registeredAddress: string
  email: string
  vatNumber: string
  taxCode: string
  regime: BusinessProfile['regime']
  atecoCode: string
  invoicePrefix: string
  nextInvoiceNumber: string
  contractPrefix: string
  nextContractNumber: string
  iban: string
  bicSwift: string
  accountHolder: string
  wiseHandle: string
  revolutHandle: string
  defaultDepositPercent: string
  courtOfJurisdiction: string
  annualRevenueTargetEuros: string
  stampDutyDeadlines: StampDutyDeadline[]
  updatedAt?: string
}

export type ProfileFieldErrors = Record<string, string>

interface ProfileSaveResult {
  profile?: BusinessProfile
  errors: ProfileFieldErrors
}

export interface ProfileReadState {
  profile: BusinessProfile | undefined
}

export async function readProfileState(
  read: () => Promise<BusinessProfile | undefined>,
): Promise<ProfileReadState> {
  return { profile: await read() }
}

function nextWeekday(year: number, monthIndex: number, day: number): string {
  const date = new Date(Date.UTC(year, monthIndex, day))
  const weekday = date.getUTCDay()

  if (weekday === 6) date.setUTCDate(date.getUTCDate() + 2)
  if (weekday === 0) date.setUTCDate(date.getUTCDate() + 1)

  return date.toISOString().slice(0, 10)
}

export function createDefaultProfileDraft(
  year = new Date().getFullYear(),
): BusinessProfileDraft {
  return {
    businessName: '',
    registeredAddress: '',
    email: '',
    vatNumber: '',
    taxCode: '',
    regime: 'forfettario',
    atecoCode: '',
    invoicePrefix: 'INV-',
    nextInvoiceNumber: '1',
    contractPrefix: 'CTR-',
    nextContractNumber: '1',
    iban: '',
    bicSwift: '',
    accountHolder: '',
    wiseHandle: '',
    revolutHandle: '',
    defaultDepositPercent: '30',
    courtOfJurisdiction: 'Rome, Italy',
    annualRevenueTargetEuros: '85000.00',
    stampDutyDeadlines: [
      { id: `stamp-q1-${year}`, label: `Q1 ${year}`, dueOn: nextWeekday(year, 4, 31) },
      { id: `stamp-q2-${year}`, label: `Q2 ${year}`, dueOn: nextWeekday(year, 8, 30) },
      { id: `stamp-q3-${year}`, label: `Q3 ${year}`, dueOn: nextWeekday(year, 10, 30) },
      {
        id: `stamp-q4-${year}`,
        label: `Q4 ${year}`,
        dueOn: nextWeekday(year + 1, 1, 28),
      },
    ],
  }
}

export function centsToEuros(cents: number): string {
  return (cents / 100).toFixed(2)
}

export function profileToDraft(profile: BusinessProfile): BusinessProfileDraft {
  return {
    ...profile,
    nextInvoiceNumber: String(profile.nextInvoiceNumber),
    nextContractNumber: String(profile.nextContractNumber),
    defaultDepositPercent: String(profile.defaultDepositPercent),
    annualRevenueTargetEuros: centsToEuros(profile.annualRevenueTarget),
    wiseHandle: profile.wiseHandle ?? '',
    revolutHandle: profile.revolutHandle ?? '',
    stampDutyDeadlines:
      profile.stampDutyDeadlines ?? createDefaultProfileDraft().stampDutyDeadlines,
  }
}

export function eurosToCents(value: string): number {
  const normalised = value.trim().replace(',', '.')
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalised)

  if (!match) {
    throw new Error('Enter an amount in euros with no more than two decimal places.')
  }

  const euros = Number(match[1])
  const cents = Number((match[2] ?? '').padEnd(2, '0'))
  const total = euros * 100 + cents

  if (!Number.isSafeInteger(total)) {
    throw new Error('Enter a smaller amount.')
  }

  return total
}

export function normaliseIban(value: string): string {
  return value.replace(/\s/g, '').toUpperCase()
}

function isPlausibleIban(value: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(value)) return false

  const rearranged = value.slice(4) + value.slice(0, 4)
  let remainder = 0

  for (const character of rearranged) {
    const digits = /[A-Z]/.test(character)
      ? String(character.charCodeAt(0) - 55)
      : character

    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97
    }
  }

  return remainder === 1
}

function isPositiveInteger(value: string): boolean {
  return /^\d+$/.test(value) && Number(value) > 0 && Number.isSafeInteger(Number(value))
}

function isPercentage(value: string): boolean {
  if (value.trim() === '') return false
  const percentage = Number(value)
  return Number.isFinite(percentage) && percentage >= 0 && percentage <= 100
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function required(
  errors: ProfileFieldErrors,
  key: keyof BusinessProfileDraft,
  value: string,
): void {
  if (value.trim() === '') errors[key] = 'This field is required.'
}

export function prepareProfileForSave(draft: BusinessProfileDraft): ProfileSaveResult {
  const errors: ProfileFieldErrors = {}

  required(errors, 'businessName', draft.businessName)
  required(errors, 'registeredAddress', draft.registeredAddress)
  required(errors, 'vatNumber', draft.vatNumber)
  required(errors, 'taxCode', draft.taxCode)
  required(errors, 'atecoCode', draft.atecoCode)
  required(errors, 'invoicePrefix', draft.invoicePrefix)
  required(errors, 'contractPrefix', draft.contractPrefix)
  required(errors, 'iban', draft.iban)
  required(errors, 'bicSwift', draft.bicSwift)
  required(errors, 'accountHolder', draft.accountHolder)
  required(errors, 'courtOfJurisdiction', draft.courtOfJurisdiction)
  required(errors, 'annualRevenueTargetEuros', draft.annualRevenueTargetEuros)

  if (draft.vatNumber.trim() !== '' && !/^\d{11}$/.test(draft.vatNumber.trim())) {
    errors.vatNumber = 'P.IVA must contain exactly 11 digits.'
  }

  const iban = normaliseIban(draft.iban)
  if (draft.iban.trim() !== '' && !isPlausibleIban(iban)) {
    errors.iban = 'Enter a valid IBAN.'
  }

  if (!isPositiveInteger(draft.nextInvoiceNumber)) {
    errors.nextInvoiceNumber = 'Use a positive whole number.'
  }

  if (!isPositiveInteger(draft.nextContractNumber)) {
    errors.nextContractNumber = 'Use a positive whole number.'
  }

  if (!isPercentage(draft.defaultDepositPercent)) {
    errors.defaultDepositPercent = 'Enter a percentage from 0 to 100.'
  }

  let annualRevenueTarget = 0
  if (draft.annualRevenueTargetEuros.trim() !== '') {
    try {
      annualRevenueTarget = eurosToCents(draft.annualRevenueTargetEuros)
      if (annualRevenueTarget <= 0) {
        errors.annualRevenueTargetEuros = 'Enter an amount greater than zero.'
      }
    } catch (error) {
      errors.annualRevenueTargetEuros =
        error instanceof Error ? error.message : 'Enter a valid euro amount.'
    }
  }

  for (const deadline of draft.stampDutyDeadlines) {
    const labelKey = `stampDutyDeadlines.${deadline.id}.label`
    const dueOnKey = `stampDutyDeadlines.${deadline.id}.dueOn`
    if (deadline.label.trim() === '') errors[labelKey] = 'Add a label.'
    if (!isIsoDate(deadline.dueOn)) errors[dueOnKey] = 'Choose a valid date.'
  }

  if (Object.keys(errors).length > 0) return { errors }

  return {
    errors,
    profile: {
      businessName: draft.businessName.trim(),
      registeredAddress: draft.registeredAddress.trim(),
      email: draft.email.trim(),
      vatNumber: draft.vatNumber.trim(),
      taxCode: draft.taxCode.trim().toUpperCase(),
      regime: draft.regime,
      atecoCode: draft.atecoCode.trim().toUpperCase(),
      invoicePrefix: draft.invoicePrefix.trim(),
      nextInvoiceNumber: Number(draft.nextInvoiceNumber),
      contractPrefix: draft.contractPrefix.trim(),
      nextContractNumber: Number(draft.nextContractNumber),
      iban,
      bicSwift: draft.bicSwift.trim().toUpperCase(),
      accountHolder: draft.accountHolder.trim(),
      ...(draft.wiseHandle.trim() ? { wiseHandle: draft.wiseHandle.trim() } : {}),
      ...(draft.revolutHandle.trim()
        ? { revolutHandle: draft.revolutHandle.trim() }
        : {}),
      defaultDepositPercent: Number(draft.defaultDepositPercent),
      courtOfJurisdiction: draft.courtOfJurisdiction.trim(),
      annualRevenueTarget,
      stampDutyDeadlines: draft.stampDutyDeadlines.map((deadline) => ({
        ...deadline,
        label: deadline.label.trim(),
      })),
      updatedAt: draft.updatedAt ?? '',
    },
  }
}

export function formatDeadlineDate(value: string): string | undefined {
  if (!isIsoDate(value)) return undefined
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`))
}
