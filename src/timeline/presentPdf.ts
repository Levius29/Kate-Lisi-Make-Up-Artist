import type { BridalTimeline } from '../lib/timeline'
import { generateTimelinePdfBlob, timelineFileName } from './pdf'

export type TimelinePdfResult = 'shared' | 'saved' | 'downloaded' | 'cancelled'

interface WritableFile {
  write(data: Blob): Promise<void>
  close(): Promise<void>
}

type SavePickerWindow = Window & {
  showSaveFilePicker?: (options?: unknown) => Promise<{ createWritable(): Promise<WritableFile> }>
}

function canShare(file: File): boolean {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false
  try {
    return navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

function cancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export async function presentTimelinePdf(
  timeline: BridalTimeline,
  coupleName: string,
): Promise<TimelinePdfResult> {
  const blob = await generateTimelinePdfBlob(timeline, coupleName)
  const file = new File([blob], timelineFileName(coupleName), { type: 'application/pdf' })

  if (canShare(file)) {
    try {
      await navigator.share({ files: [file], title: `Bridal timeline — ${coupleName}` })
      return 'shared'
    } catch (error) {
      if (cancelled(error)) return 'cancelled'
      throw error
    }
  }

  const picker = (window as SavePickerWindow).showSaveFilePicker
  if (typeof picker === 'function') {
    try {
      const handle = await picker.call(window, {
        suggestedName: file.name,
        types: [{ description: 'PDF document', accept: { 'application/pdf': ['.pdf'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(file)
      await writable.close()
      return 'saved'
    } catch (error) {
      if (cancelled(error)) return 'cancelled'
      throw error
    }
  }

  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'downloaded'
}
