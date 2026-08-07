import type { Table } from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'

import { db, type MetaRecord, type StoredProfile } from '../db/database'
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
import type {
  CreateInput,
  AppointmentPaymentRepository,
  ImportMode,
  ListOptions,
  MetaRepository,
  ProfileRepository,
  Repository,
  StorageAdapter,
  StorageDump,
  StorageValue,
} from './StorageAdapter'

const PROFILE_ID = 'business' as const

function now(): string {
  return new Date().toISOString()
}

function createId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function compareValues(left: unknown, right: unknown): number {
  if (left === right) return 0
  if (left === undefined || left === null) return -1
  if (right === undefined || right === null) return 1
  return String(left).localeCompare(String(right))
}

class DexieRepository<T extends EntityMetadata> implements Repository<T> {
  constructor(protected readonly table: Table<T, string, unknown>) {}

  async list(opts: ListOptions<T> = {}): Promise<T[]> {
    let entities = await this.table.toArray()

    if (!opts.includeDeleted) {
      entities = entities.filter((entity) => entity.deletedAt === undefined)
    }

    if (opts.orderBy !== undefined) {
      const direction = opts.direction === 'desc' ? -1 : 1
      const orderBy = opts.orderBy
      entities.sort((left, right) => compareValues(left[orderBy], right[orderBy]) * direction)
    }

    return opts.limit === undefined ? entities : entities.slice(0, opts.limit)
  }

  get(id: string): Promise<T | undefined> {
    return this.table.get(id)
  }

  async create(input: CreateInput<T>): Promise<T> {
    const timestamp = now()
    const entity = {
      ...input,
      id: input.id ?? createId(),
      createdAt: timestamp,
      updatedAt: timestamp,
    } as T

    await this.table.add(entity)
    return entity
  }

  async put(entity: T): Promise<T> {
    const updated = { ...entity, updatedAt: now() }
    await this.table.put(updated)
    return updated
  }

  async softDelete(id: string): Promise<void> {
    const entity = await this.table.get(id)
    if (!entity || entity.deletedAt !== undefined) return
    await this.table.put({ ...entity, deletedAt: now(), updatedAt: now() })
  }

  async restore(id: string): Promise<void> {
    const entity = await this.table.get(id)
    if (!entity || entity.deletedAt === undefined) return
    const { deletedAt: _deletedAt, ...restored } = entity
    await this.table.put({ ...restored, updatedAt: now() } as T)
  }
}

function immutableContractSnapshot(contract: Contract): string {
  const {
    id: _id,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    deletedAt: _deletedAt,
    signedAt: _signedAt,
    signedFileNote: _signedFileNote,
    ...snapshot
  } = contract
  return JSON.stringify(snapshot)
}

class ContractRepository extends DexieRepository<Contract> {
  override async put(entity: Contract): Promise<Contract> {
    const existing = await this.get(entity.id)
    if (
      existing &&
      immutableContractSnapshot(existing) !== immutableContractSnapshot(entity)
    ) {
      throw new Error('Issued contract snapshots are immutable.')
    }
    return super.put(entity)
  }
}

function immutableInvoiceSnapshot(invoice: Invoice): string {
  const {
    id: _id,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    deletedAt: _deletedAt,
    paidAt: _paidAt,
    ...snapshot
  } = invoice
  return JSON.stringify(snapshot)
}

class InvoiceRepository extends DexieRepository<Invoice> {
  override async put(entity: Invoice): Promise<Invoice> {
    const existing = await this.get(entity.id)
    if (existing && immutableInvoiceSnapshot(existing) !== immutableInvoiceSnapshot(entity)) {
      throw new Error('Issued invoice snapshots are immutable.')
    }
    return super.put(entity)
  }
}

class DexieProfileRepository implements ProfileRepository {
  async get(): Promise<BusinessProfile | undefined> {
    const stored = await db.profile.get(PROFILE_ID)
    if (!stored) return undefined
    const { id: _id, ...profile } = stored
    return profile
  }

  async save(profile: BusinessProfile): Promise<BusinessProfile> {
    const saved = { ...profile, updatedAt: now() }
    await db.profile.put({ ...saved, id: PROFILE_ID })
    return saved
  }
}

class DexieMetaRepository implements MetaRepository {
  async get<T extends StorageValue>(key: string): Promise<T | undefined> {
    const record = await db.meta.get(key)
    return record?.value as T | undefined
  }

  async set(key: string, value: StorageValue): Promise<void> {
    await db.meta.put({ key, value, updatedAt: now() })
  }
}

class DexieAppointmentPaymentRepository implements AppointmentPaymentRepository {
  add(appointmentId: string, payment: AppointmentPayment): Promise<Appointment> {
    return db.transaction('rw', [db.appointments, db.invoices], async () => {
      const appointment = await db.appointments.get(appointmentId)
      if (!appointment) throw new Error(`Appointment not found: ${appointmentId}`)
      if (!Number.isSafeInteger(payment.amount) || payment.amount <= 0) {
        throw new Error('Payment amount must be a positive whole number of cents.')
      }

      const updated = {
        ...appointment,
        payments: [...appointment.payments, { ...payment }],
        updatedAt: now(),
      }
      await db.appointments.put(updated)
      await this.syncInvoicePaidAt(appointmentId, updated.payments)
      return updated
    })
  }

  remove(appointmentId: string, paymentIndex: number): Promise<Appointment> {
    return db.transaction('rw', [db.appointments, db.invoices], async () => {
      const appointment = await db.appointments.get(appointmentId)
      if (!appointment) throw new Error(`Appointment not found: ${appointmentId}`)
      if (
        !Number.isInteger(paymentIndex) ||
        paymentIndex < 0 ||
        paymentIndex >= appointment.payments.length
      ) {
        throw new Error(`Payment not found at index: ${paymentIndex}`)
      }

      const payments = appointment.payments.filter((_, index) => index !== paymentIndex)
      const updated = { ...appointment, payments, updatedAt: now() }
      await db.appointments.put(updated)
      await this.syncInvoicePaidAt(appointmentId, payments)
      return updated
    })
  }

  private async syncInvoicePaidAt(
    appointmentId: string,
    payments: readonly AppointmentPayment[],
  ): Promise<void> {
    const invoice = await db.invoices.where('appointmentId').equals(appointmentId).first()
    if (!invoice) return

    const paidAt = [...payments]
      .sort((left, right) => left.paidAt.localeCompare(right.paidAt))[0]
      ?.paidAt
    const { paidAt: _paidAt, ...withoutPaidAt } = invoice
    await db.invoices.put({
      ...withoutPaidAt,
      ...(paidAt === undefined ? {} : { paidAt }),
      updatedAt: now(),
    })
  }
}

export class DexieStorageAdapter implements StorageAdapter {
  readonly profile: ProfileRepository = new DexieProfileRepository()
  readonly clients: Repository<Client> = new DexieRepository<Client>(db.clients)
  readonly services: Repository<Service> = new DexieRepository<Service>(db.services)
  readonly appointments: Repository<Appointment> = new DexieRepository<Appointment>(
    db.appointments,
  )
  readonly appointmentPayments: AppointmentPaymentRepository =
    new DexieAppointmentPaymentRepository()
  readonly contracts: Repository<Contract> = new ContractRepository(db.contracts)
  readonly invoices: Repository<Invoice> = new InvoiceRepository(db.invoices)
  readonly meta: MetaRepository = new DexieMetaRepository()

  transaction<T>(fn: (storage: StorageAdapter) => Promise<T>): Promise<T> {
    return db.transaction(
      'rw',
      [
        db.profile,
        db.clients,
        db.services,
        db.appointments,
        db.contracts,
        db.invoices,
        db.meta,
      ],
      () => fn(this),
    )
  }

  async exportAll(): Promise<StorageDump> {
    const [profile, clients, services, appointments, contracts, invoices, metaRecords] =
      await Promise.all([
        this.profile.get(),
        this.clients.list({ includeDeleted: true }),
        this.services.list({ includeDeleted: true }),
        this.appointments.list({ includeDeleted: true }),
        this.contracts.list({ includeDeleted: true }),
        this.invoices.list({ includeDeleted: true }),
        db.meta.toArray(),
      ])

    const meta = Object.fromEntries(
      metaRecords.map((record) => [record.key, record.value as StorageValue]),
    )

    return {
      formatVersion: 1,
      exportedAt: now(),
      profile: profile ?? null,
      clients,
      services,
      appointments,
      contracts,
      invoices,
      meta,
    }
  }

  async importAll(dump: StorageDump, mode: ImportMode): Promise<void> {
    if (dump.formatVersion !== 1) {
      throw new Error(`Unsupported storage format version: ${String(dump.formatVersion)}`)
    }

    await db.transaction(
      'rw',
      [
        db.profile,
        db.clients,
        db.services,
        db.appointments,
        db.contracts,
        db.invoices,
        db.meta,
      ],
      async () => {
        if (mode === 'replace') {
          await Promise.all([
            db.profile.clear(),
            db.clients.clear(),
            db.services.clear(),
            db.appointments.clear(),
            db.contracts.clear(),
            db.invoices.clear(),
            db.meta.clear(),
          ])
        }

        const profile: StoredProfile | undefined = dump.profile
          ? { ...dump.profile, id: PROFILE_ID }
          : undefined
        const metaRecords: MetaRecord[] = Object.entries(dump.meta).map(([key, value]) => ({
          key,
          value,
          updatedAt: dump.exportedAt,
        }))

        await Promise.all([
          profile ? db.profile.put(profile) : Promise.resolve(),
          db.clients.bulkPut(dump.clients),
          db.services.bulkPut(dump.services),
          db.appointments.bulkPut(dump.appointments),
          db.contracts.bulkPut(dump.contracts),
          db.invoices.bulkPut(dump.invoices),
          db.meta.bulkPut(metaRecords),
        ])
      },
    )
  }

  live<T>(query: () => Promise<T>, deps: readonly unknown[]): T | undefined {
    return useLiveQuery(query, [...deps])
  }
}
