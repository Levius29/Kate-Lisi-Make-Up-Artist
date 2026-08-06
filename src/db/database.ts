import Dexie, { type EntityTable } from 'dexie'

import type {
  Appointment,
  BusinessProfile,
  Client,
  Contract,
  Invoice,
  Service,
} from '../types'
import { DATABASE_NAME, schemaV1 } from './schema'

export interface StoredProfile extends BusinessProfile {
  id: 'business'
}

export interface MetaRecord {
  key: string
  value: unknown
  updatedAt: string
}

export class StudioDatabase extends Dexie {
  profile!: EntityTable<StoredProfile, 'id'>
  clients!: EntityTable<Client, 'id'>
  services!: EntityTable<Service, 'id'>
  appointments!: EntityTable<Appointment, 'id'>
  contracts!: EntityTable<Contract, 'id'>
  invoices!: EntityTable<Invoice, 'id'>
  meta!: EntityTable<MetaRecord, 'key'>

  constructor() {
    super(DATABASE_NAME)
    this.version(1).stores(schemaV1)
  }
}

export const db = new StudioDatabase()
