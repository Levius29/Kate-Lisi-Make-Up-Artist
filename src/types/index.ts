export type ISODateTime = string
export type MoneyCents = number

export interface EntityMetadata {
  id: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
  deletedAt?: ISODateTime
}

export interface BusinessProfile {
  businessName: string
  registeredAddress: string
  vatNumber: string
  taxCode: string
  regime: 'forfettario' | 'ordinario'
  atecoCode: string
  invoicePrefix: string
  nextInvoiceNumber: number
  contractPrefix: string
  nextContractNumber: number
  iban: string
  bicSwift: string
  accountHolder: string
  wiseHandle?: string
  revolutHandle?: string
  defaultDepositPercent: number
  courtOfJurisdiction: string
  annualRevenueTarget: MoneyCents
  updatedAt: ISODateTime
}

export interface ProductPreferences {
  halal: boolean
  vegan: boolean
  crueltyFree: boolean
  other: string
}

export interface Client extends EntityMetadata {
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
  patchTestDate?: ISODateTime
  productPreferences: ProductPreferences
  imageReleaseLevel: 'none' | 'private_portfolio' | 'social_media' | 'face_obscured'
  gdprConsentAt: ISODateTime
  notes: string
}

export interface CancellationTier {
  daysBefore: number
  retainPercent: number
}

export type RecallChannel = 'whatsapp' | 'email'

export interface RecallTemplate {
  daysBefore: number
  channel: RecallChannel
  messageTemplate: string
}

export interface Service extends EntityMetadata {
  name: string
  description: string
  durationMinutes: number
  basePrice: MoneyCents
  perPersonPrice?: MoneyCents
  travelFeePerKm?: MoneyCents
  travelFeeFlat?: MoneyCents
  defaultDepositPercent: number
  cancellationTiers: CancellationTier[]
  recallTemplates: RecallTemplate[]
  requiresTrial: boolean
  contractTemplateId: string
  active: boolean
}

export type AppointmentStatus =
  | 'enquiry'
  | 'quoted'
  | 'confirmed'
  | 'balance_paid'
  | 'completed'
  | 'cancelled'

export interface AppointmentLineItem {
  label: string
  quantity: number
  unitPrice: MoneyCents
}

export type PaymentMethod = 'bank_transfer' | 'wise' | 'revolut'

export interface AppointmentPayment {
  type: 'deposit' | 'balance'
  amount: MoneyCents
  method: PaymentMethod
  paidAt: ISODateTime
}

export interface CancellationCutoff {
  date: ISODateTime
  retainPercent: number
}

export interface AppointmentRecall {
  id: string
  daysBefore: number
  channel: RecallChannel
  messageTemplate: string
  dueAt: ISODateTime
  sentAt?: ISODateTime
}

export interface Appointment extends EntityMetadata {
  clientId: string
  serviceId: string
  status: AppointmentStatus
  startAt: ISODateTime
  endAt: ISODateTime
  locationName: string
  locationAddress: string
  parentAppointmentId?: string
  peopleCount: number
  ceremonyTime?: ISODateTime
  travelKm?: number
  lineItems: AppointmentLineItem[]
  subtotal: MoneyCents
  total: MoneyCents
  depositPercent: number
  depositAmount: MoneyCents
  payments: AppointmentPayment[]
  cancellationCutoffs: CancellationCutoff[]
  balanceDueAt?: ISODateTime
  recalls: AppointmentRecall[]
  contractId?: string
  internalNotes: string
}

export interface ContractFinancialSnapshot {
  lineItems: AppointmentLineItem[]
  subtotal: MoneyCents
  total: MoneyCents
  depositPercent: number
  depositAmount: MoneyCents
  balanceDueAt?: ISODateTime
  cancellationCutoffs: CancellationCutoff[]
}

export interface Contract extends EntityMetadata {
  contractNumber: string
  appointmentId: string
  clientSnapshot: Client
  businessSnapshot: BusinessProfile
  serviceSnapshot: Service
  financialSnapshot: ContractFinancialSnapshot
  language: 'en' | 'it'
  templateVersion: string
  generatedAt: ISODateTime
  signedAt?: ISODateTime
  signedFileNote?: string
}

export interface InvoiceLineItem {
  label: string
  quantity: number
  unitPrice: MoneyCents
  amount: MoneyCents
}

export interface Invoice extends EntityMetadata {
  invoiceNumber: string
  appointmentId: string
  clientId: string
  clientSnapshot: Client
  businessSnapshot: BusinessProfile
  issuedAt: ISODateTime
  paidAt?: ISODateTime
  recipientCode: string
  clientTaxCode?: string
  lineItems: InvoiceLineItem[]
  subtotal: MoneyCents
  stampDuty: MoneyCents
  total: MoneyCents
}

export type StoredEntity = Client | Service | Appointment | Contract | Invoice
