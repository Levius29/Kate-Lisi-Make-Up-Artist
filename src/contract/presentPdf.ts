import type { Contract } from '../types'
import { contractFileName, generateContractPdfBlob } from './pdf'

export type ContractPdfResult = 'opened' | 'shared' | 'cancelled'

let pdfMakeCompatibilityReady: Promise<void> | undefined
let rejectCurrentPdf: ((reason?: unknown) => void) | undefined

function ensurePdfMakeCallbackCompatibility(): Promise<void> {
  pdfMakeCompatibilityReady ??= (async () => {
    // The installed pdfmake 0.3 browser build returns a Promise from getBlob,
    // while the existing, forbidden document helper supplies a callback. Adapt
    // that package boundary here so the tested builder remains untouched.
    const module = await import('pdfmake/build/pdfmake')
    const pdfMake = ((module as Record<string, unknown>).default ?? module) as {
      createPdf: (...args: unknown[]) => { getBlob: (...args: unknown[]) => unknown }
    }
    const originalCreatePdf = pdfMake.createPdf.bind(pdfMake)

    pdfMake.createPdf = (...args: unknown[]) => {
      const output = originalCreatePdf(...args)
      if (output.getBlob.length !== 0) return output

      const promiseGetBlob = output.getBlob.bind(output) as () => Promise<Blob>
      output.getBlob = (callback?: unknown) => {
        const result = promiseGetBlob()
        const rejectForThisDocument = rejectCurrentPdf
        if (typeof callback === 'function') {
          void result.then(
            (blob) => (callback as (value: Blob) => void)(blob),
            (error) => rejectForThisDocument?.(error),
          )
        }
        return result
      }
      return output
    }
  })()

  return pdfMakeCompatibilityReady
}

function canSharePdf(name: string): boolean {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
    return false
  }

  try {
    const probe = new File([new Uint8Array()], name, { type: 'application/pdf' })
    return navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

/**
 * Starts the non-share fallback before the first await. Safari otherwise treats
 * window.open after the font chunk has loaded as an unsolicited popup.
 */
export async function presentContractPdf(contract: Contract): Promise<ContractPdfResult> {
  const name = contractFileName(contract)
  const shareFiles = canSharePdf(name)
  const pendingWindow = shareFiles ? null : window.open('about:blank', '_blank')

  if (pendingWindow) {
    pendingWindow.opener = null
    pendingWindow.document.title = 'Preparing contract PDF'
    pendingWindow.document.body.textContent = 'Preparing contract PDF…'
  }

  if (!shareFiles && !pendingWindow) {
    throw new Error('The PDF window was blocked. Allow pop-ups for this app and try again.')
  }

  try {
    await ensurePdfMakeCallbackCompatibility()
    let timeoutId: number | undefined
    const renderFailure = new Promise<never>((_resolve, reject) => {
      rejectCurrentPdf = reject
    })
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutId = window.setTimeout(
        () => reject(new Error('The PDF took too long to prepare. Close any blank PDF tab and try again.')),
        60_000,
      )
    })
    let blob: Blob
    try {
      blob = await Promise.race([generateContractPdfBlob(contract), renderFailure, timeout])
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      rejectCurrentPdf = undefined
    }

    if (shareFiles) {
      const file = new File([blob], name, { type: 'application/pdf' })
      if (!navigator.canShare({ files: [file] })) {
        throw new Error('This device cannot share the generated PDF file.')
      }
      try {
        await navigator.share({
          files: [file],
          title: `Contract ${contract.contractNumber}`,
        })
        return 'shared'
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
        throw error
      }
    }

    const pdfWindow = pendingWindow
    if (!pdfWindow) {
      throw new Error('The PDF window was blocked. Allow pop-ups for this app and try again.')
    }

    const objectUrl = URL.createObjectURL(blob)
    try {
      pdfWindow.location.replace(objectUrl)
      // Give the browser PDF viewer time to finish reading the blob, then release it.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
      return 'opened'
    } catch (error) {
      URL.revokeObjectURL(objectUrl)
      pdfWindow.close()
      throw error
    }
  } catch (error) {
    pendingWindow?.close()
    throw error
  }
}
