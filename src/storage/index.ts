import { DexieStorageAdapter } from './DexieStorageAdapter'

export const storage = new DexieStorageAdapter()

export type {
  CreateInput,
  ImportMode,
  ListOptions,
  Repository,
  StorageAdapter,
  StorageDump,
  StorageValue,
} from './StorageAdapter'
