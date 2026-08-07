import type {
  Appointment,
  AppointmentPayment,
  BusinessProfile,
  Client,
  Contract,
  EntityMetadata,
  Invoice,
  Service,
} from '../types'

export interface ListOptions<T> {
  includeDeleted?: boolean
  orderBy?: keyof T
  direction?: 'asc' | 'desc'
  limit?: number
}

export type CreateInput<T extends EntityMetadata> = Omit<T, keyof EntityMetadata> & {
  id?: string
}

export interface Repository<T extends EntityMetadata> {
  list(opts?: ListOptions<T>): Promise<T[]>
  get(id: string): Promise<T | undefined>
  create(input: CreateInput<T>): Promise<T>
  put(entity: T): Promise<T>
  softDelete(id: string): Promise<void>
  restore(id: string): Promise<void>
}

export interface ProfileRepository {
  get(): Promise<BusinessProfile | undefined>
  save(profile: BusinessProfile): Promise<BusinessProfile>
}

export interface AppointmentPaymentRepository {
  add(appointmentId: string, payment: AppointmentPayment): Promise<Appointment>
  remove(appointmentId: string, paymentIndex: number): Promise<Appointment>
}

export type StorageValue =
  | null
  | boolean
  | number
  | string
  | StorageValue[]
  | { [key: string]: StorageValue }

export interface MetaRepository {
  get<T extends StorageValue>(key: string): Promise<T | undefined>
  set(key: string, value: StorageValue): Promise<void>
}

export interface StorageDump {
  formatVersion: 1
  exportedAt: string
  profile: BusinessProfile | null
  clients: Client[]
  services: Service[]
  appointments: Appointment[]
  contracts: Contract[]
  invoices: Invoice[]
  meta: Record<string, StorageValue>
}

export type ImportMode = 'merge' | 'replace'

export interface StorageAdapter {
  profile: ProfileRepository
  clients: Repository<Client>
  services: Repository<Service>
  appointments: Repository<Appointment>
  appointmentPayments: AppointmentPaymentRepository
  contracts: Repository<Contract>
  invoices: Repository<Invoice>
  meta: MetaRepository
  transaction<T>(fn: (storage: StorageAdapter) => Promise<T>): Promise<T>
  exportAll(): Promise<StorageDump>
  importAll(dump: StorageDump, mode: ImportMode): Promise<void>
  live<T>(query: () => Promise<T>, deps: readonly unknown[]): T | undefined
}
