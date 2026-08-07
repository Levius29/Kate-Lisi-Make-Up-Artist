import { DexieStorageAdapter } from './DexieStorageAdapter'

export const storage = new DexieStorageAdapter()

export type {
  CreateInput,
  AppointmentPaymentRepository,
  ImportMode,
  ListOptions,
  Repository,
  StorageAdapter,
  StorageDump,
  StorageValue,
} from './StorageAdapter'
