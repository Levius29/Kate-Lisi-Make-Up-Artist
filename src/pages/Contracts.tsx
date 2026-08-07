import { useState } from 'react'
import { Link } from 'react-router-dom'

import { PageHeader } from '../components/ui/PageHeader'
import { presentContractPdf } from '../contract/presentPdf'
import { formatFullDate } from '../lib/dates'
import { storage } from '../storage'
import { useLive } from '../storage/useLive'

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'The PDF could not be prepared. Try again.'
}

export function Contracts() {
  const contracts = useLive(() =>
    storage.contracts.list({ orderBy: 'generatedAt', direction: 'desc' }),
  )
  const [openingId, setOpeningId] = useState<string>()
  const [message, setMessage] = useState('')

  async function openContract(contractId: string) {
    const contract = contracts?.find((candidate) => candidate.id === contractId)
    if (!contract) return

    setOpeningId(contractId)
    setMessage('Preparing the contract PDF…')
    try {
      const result = await presentContractPdf(contract)
      setMessage(
        result === 'cancelled'
          ? 'Sharing was cancelled. The contract is still saved.'
          : result === 'shared'
            ? 'The contract is ready in the share sheet.'
            : 'The contract PDF opened in a new tab.',
      )
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setOpeningId(undefined)
    }
  }

  if (contracts === undefined) {
    return <p className="text-sm text-muted" aria-busy="true">Loading contracts…</p>
  }

  return (
    <div className="mx-auto min-w-0 w-full max-w-3xl">
      <PageHeader
        eyebrow="Settings"
        title="Issued contracts"
        subtitle="Completed contracts, newest first. Open any one to share or save its PDF again."
        bordered
        action={<Link to="/settings" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-semibold text-muted">
          Back to Settings
        </Link>}
      />

      <div className="min-h-6" aria-live="polite">
        {message ? <p className="break-words text-sm font-semibold leading-6 text-muted">{message}</p> : null}
      </div>

      {contracts.length === 0 ? (
        <p className="mt-4 rounded-3xl border border-dashed border-line px-5 py-10 text-center text-sm leading-6 text-muted">
          No contracts have been issued yet. Issue one from an appointment in Calendar.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {contracts.map((contract) => {
            const name = `${contract.clientSnapshot.firstName} ${contract.clientSnapshot.lastName}`.trim()
            const isOpening = openingId === contract.id
            return (
              <button
                key={contract.id}
                type="button"
                onClick={() => void openContract(contract.id)}
                disabled={openingId !== undefined}
                className="grid min-h-20 w-full min-w-0 grid-cols-1 gap-2 rounded-2xl border border-line bg-paper/75 p-4 text-left disabled:opacity-60 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4"
              >
                <span className="min-w-0">
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="min-w-0 break-all text-sm font-bold text-accent">{contract.contractNumber}</span>
                    <span className="min-w-0 break-words font-display text-xl leading-tight text-ink">{name || 'Client name unavailable'}</span>
                  </span>
                  <span className="mt-1 block break-words text-sm leading-5 text-muted">
                    {formatFullDate(contract.financialSnapshot.startAt)} · {contract.language === 'en' ? 'English' : 'Italian'}
                  </span>
                </span>
                <span className="text-sm font-bold text-accent">{isOpening ? 'Preparing…' : 'Open PDF →'}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
