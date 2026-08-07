import { build } from 'vite'
import { describe, expect, it } from 'vitest'

const lazyPageModules = [
  '/src/pages/Backup.tsx',
  '/src/pages/Calendar.tsx',
  '/src/pages/Clients.tsx',
  '/src/pages/Contracts.tsx',
  '/src/pages/Money.tsx',
  '/src/pages/Services.tsx',
  '/src/pages/Settings.tsx',
  '/src/pages/Timeline.tsx',
]

describe('application bundle', () => {
  it('emits every routed page except Today as a dynamic entry', async () => {
    const result = await build({
      configFile: false,
      logLevel: 'silent',
      build: {
        minify: false,
        write: false,
        rollupOptions: {
          input: 'src/App.tsx',
        },
      },
    })

    if (Array.isArray(result) || !('output' in result)) {
      throw new Error('Expected a single in-memory application build output.')
    }

    const dynamicEntries = result.output
      .flatMap((output) => {
        if (output.type !== 'chunk' || !output.isDynamicEntry || !output.facadeModuleId) return []
        return output.facadeModuleId.replaceAll('\\', '/')
      })

    for (const pageModule of lazyPageModules) {
      expect(dynamicEntries.some((moduleId) => moduleId.endsWith(pageModule))).toBe(true)
    }
    expect(dynamicEntries.some((moduleId) => moduleId.endsWith('/src/pages/Today.tsx'))).toBe(false)
  })
})
