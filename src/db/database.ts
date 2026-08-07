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
    /*
     * Deliberately still at version 1. Every field added since launch is unindexed and every
     * reader tolerates its absence, so records written by an older build still open.
     *
     * Touch an *index* — a new key in schemaV1, a compound index, a new table — and this must
     * become version(2).stores(...) with an upgrade(), or Dexie throws VersionError on a phone
     * that already holds data. There is no server copy to re-seed from: her only records are
     * the ones on the device.
     */
    this.version(1).stores(schemaV1)
  }
}

export const db = new StudioDatabase()
