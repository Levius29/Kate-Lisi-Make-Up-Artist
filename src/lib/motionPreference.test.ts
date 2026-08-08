import { describe, expect, it } from 'vitest'

import { applyMotionPreference, resolveMotionPreference } from './motionPreference'

describe('app motion preference', () => {
  it('defaults to on until the owner explicitly turns it off', () => {
    expect(resolveMotionPreference(undefined)).toBe(true)
    expect(resolveMotionPreference(true)).toBe(true)
    expect(resolveMotionPreference(false)).toBe(false)
  })

  it('applies one root data attribute for every motion rule to follow', () => {
    const root = { dataset: {} as DOMStringMap }

    applyMotionPreference(false, root)
    expect(root.dataset.motion).toBe('off')

    applyMotionPreference(true, root)
    expect(root.dataset.motion).toBe('on')
  })
})
