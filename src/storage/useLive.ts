import { storage } from '.'

export function useLive<T>(query: () => Promise<T>, deps: readonly unknown[] = []): T | undefined {
  return storage.live(query, deps)
}
