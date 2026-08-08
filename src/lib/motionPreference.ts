export const DEFAULT_MOTION_ENABLED = true

interface MotionRoot {
  dataset: DOMStringMap
}

export function resolveMotionPreference(stored: boolean | undefined): boolean {
  return stored ?? DEFAULT_MOTION_ENABLED
}

export function applyMotionPreference(enabled: boolean, root: MotionRoot): void {
  root.dataset.motion = enabled ? 'on' : 'off'
}
