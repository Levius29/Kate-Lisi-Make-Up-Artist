import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { storage } from '../storage'
import { AppShell } from './AppShell'

function renderShell(pathname: string, liveValue: unknown = undefined): string {
  vi.spyOn(storage, 'live').mockReturnValue(liveValue)

  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="*" element={<p>Page content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('application shell', () => {
  it('shows the overdue-backup reminder on Today only', () => {
    expect(renderShell('/', {})).toContain('Your data needs a backup')
    expect(renderShell('/calendar', {})).not.toContain('Your data needs a backup')
    expect(renderShell('/backup', {})).not.toContain('Your data needs a backup')
  })

  it('renders one decorative line icon for every label in both responsive navigations', () => {
    const markup = renderShell('/')

    expect(markup.match(/<svg/g)).toHaveLength(10)
    expect(markup.match(/<svg[^>]+aria-hidden="true"/g)).toHaveLength(10)
    expect(markup).toContain('Today')
    expect(markup).toContain('Settings')
  })

  it('marks Settings active on its backup subpage', () => {
    const markup = renderShell('/backup')

    expect(markup).toMatch(/aria-current="page"[^>]*href="\/settings"/)
  })
})
