import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { storage } from '../storage'
import { BackupStatusLine } from './BackupReminder'

function renderStatus(live: unknown): string {
  vi.spyOn(storage, 'live').mockReturnValue(live)
  return renderToStaticMarkup(
    <MemoryRouter>
      <BackupStatusLine />
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('backup status line', () => {
  /*
   * A pending read and a key that was never written both surface as undefined. Reporting "no
   * backup created yet" while the read is still in flight tells her the only copy of her
   * records does not exist, which is the one thing this line must never get wrong.
   */
  it('says nothing at all while the read is still in flight', () => {
    expect(renderStatus(undefined)).toBe('')
  })

  it('prompts for a first backup once the read confirms there is none', () => {
    expect(renderStatus({ lastBackupAt: undefined })).toContain('No backup created yet.')
  })

  it('writes the date of the last backup out in full, never numerically', () => {
    const markup = renderStatus({ lastBackupAt: '2026-08-06T09:00:00.000Z' })

    expect(markup).toContain('Last backup: 6 August 2026.')
    expect(markup).not.toMatch(/\d{1,2}\/\d{1,2}/)
  })
})
