import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { ErrorText, Field, FieldLabel, HelperText } from '../components/ui/FormField'
import { TextInput } from '../components/ui/TextInput'
import { romeDateKeyToUtc } from '../lib/appointmentSchedule'
import { formatFullDate, formatTimeWithZone } from '../lib/dates'
import {
  calculateBridalTimeline,
  TimelineCalculationError,
  type BridalTimeline,
} from '../lib/timeline'
import { romeInputToUtc, utcToRomeInput } from './appointmentForm'
import { storage } from '../storage'
import { useLive } from '../storage/useLive'
import type { Appointment, Client } from '../types'
import { presentTimelinePdf } from '../timeline/presentPdf'

interface TimelineDraft {
  coupleName: string
  ceremonyDate: string
  ceremonyTime: string
  people: string
  minutesPerPerson: string
  bufferMinutes: string
  travelMinutes: string
}

interface SourceData {
  appointment: Appointment | undefined
  client: Client | undefined
}

const EMPTY_DRAFT: TimelineDraft = {
  coupleName: '',
  ceremonyDate: '',
  ceremonyTime: '',
  people: '1',
  minutesPerPerson: '45',
  bufferMinutes: '30',
  travelMinutes: '30',
}

function fullDate(dateKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return ''
  try {
    return formatFullDate(romeDateKeyToUtc(dateKey))
  } catch {
    return ''
  }
}

function appointmentDraft(appointment: Appointment, client: Client | undefined): TimelineDraft {
  const local = utcToRomeInput(appointment.ceremonyTime!)
  return {
    coupleName: client ? `${client.firstName} ${client.lastName}`.trim() : '',
    ceremonyDate: local.slice(0, 10),
    ceremonyTime: local.slice(11, 16),
    people: String(appointment.peopleCount),
    // Appointment records do not store preparation minutes per person. Forty-five
    // is a visible starting value, never a hidden inference from the service price/duration.
    minutesPerPerson: '45',
    bufferMinutes: '30',
    travelMinutes: '30',
  }
}

export function Timeline() {
  const [searchParams] = useSearchParams()
  const appointmentId = searchParams.get('appointment') ?? ''
  const source = useLive<SourceData>(async () => {
    if (!appointmentId) return { appointment: undefined, client: undefined }
    const appointment = await storage.appointments.get(appointmentId)
    const client = appointment ? await storage.clients.get(appointment.clientId) : undefined
    return { appointment, client }
  }, [appointmentId])
  const hydratedAppointment = useRef('')
  const [draft, setDraft] = useState<TimelineDraft>(EMPTY_DRAFT)
  const [timeline, setTimeline] = useState<BridalTimeline>()
  const [error, setError] = useState('')
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfMessage, setPdfMessage] = useState('')

  useEffect(() => {
    if (
      !appointmentId ||
      hydratedAppointment.current === appointmentId ||
      !source?.appointment?.ceremonyTime
    ) return
    setDraft(appointmentDraft(source.appointment, source.client))
    hydratedAppointment.current = appointmentId
  }, [appointmentId, source])

  function update(field: keyof TimelineDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
    setTimeline(undefined)
    setError('')
    setPdfMessage('')
  }

  function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setPdfMessage('')
    if (draft.coupleName.trim() === '') {
      setError('Enter the couple’s name for the planner schedule.')
      return
    }
    if (!draft.ceremonyDate || !draft.ceremonyTime) {
      setError('Choose the ceremony date and time.')
      return
    }

    try {
      const ceremonyAt = romeInputToUtc(`${draft.ceremonyDate}T${draft.ceremonyTime}`)
      setTimeline(calculateBridalTimeline({
        ceremonyAt,
        people: Number(draft.people),
        minutesPerPerson: Number(draft.minutesPerPerson),
        bufferMinutes: Number(draft.bufferMinutes),
        travelMinutes: Number(draft.travelMinutes),
      }))
    } catch (calculationError) {
      setTimeline(undefined)
      setError(
        calculationError instanceof TimelineCalculationError
          ? calculationError.message
          : 'Check the ceremony date, time and durations.',
      )
    }
  }

  async function exportPdf() {
    if (!timeline) return
    setPdfBusy(true)
    setPdfMessage('')
    try {
      const result = await presentTimelinePdf(timeline, draft.coupleName.trim())
      setPdfMessage(
        result === 'cancelled'
          ? 'PDF export cancelled.'
          : result === 'shared'
            ? 'Timeline PDF shared with the planner.'
            : result === 'saved'
              ? 'Timeline PDF saved.'
              : 'Timeline PDF downloaded.',
      )
    } catch {
      setPdfMessage('The PDF could not be prepared. Try again; the timeline is still here.')
    } finally {
      setPdfBusy(false)
    }
  }

  const ceremonyDateLong = fullDate(draft.ceremonyDate)
  let ceremonyTimeLabel = 'Rome time. The result shows CET or CEST for this date.'
  if (draft.ceremonyDate && draft.ceremonyTime) {
    try {
      ceremonyTimeLabel = `Entered as ${formatTimeWithZone(
        romeInputToUtc(`${draft.ceremonyDate}T${draft.ceremonyTime}`),
      )}`
    } catch {
      // The calculation action gives the full validation message.
    }
  }
  const linkedAppointmentMissingCeremony =
    appointmentId !== '' && source !== undefined && !source.appointment?.ceremonyTime

  return (
    <div className="mx-auto w-full max-w-3xl min-w-0">
      <header className="mb-8 border-b border-line pb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Planning tool</p>
            <h1 className="mt-2 font-display text-4xl leading-tight text-ink md:text-5xl">Bridal timeline</h1>
          </div>
          {source?.appointment ? (
            <Link to={`/calendar/${source.appointment.id}`} className="inline-flex min-h-11 items-center text-sm font-bold text-accent">Back to appointment</Link>
          ) : null}
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
          Work backwards from the ceremony. The bride is scheduled last, then the buffer protects the ceremony time.
        </p>
      </header>

      {linkedAppointmentMissingCeremony ? (
        <p className="mb-6 rounded-2xl border border-amber-800/30 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">
          This appointment has no ceremony time. Add one in the appointment, or use the calculator as a standalone plan below.
        </p>
      ) : null}

      <form onSubmit={calculate} noValidate className="rounded-3xl border border-line bg-paper/75 p-4 sm:p-6 md:p-8">
        <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2">
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="timeline-couple" required>Couple’s name</FieldLabel>
            <TextInput id="timeline-couple" value={draft.coupleName} onChange={(event) => update('coupleName', event.target.value)} autoComplete="off" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="timeline-date" required>Ceremony date</FieldLabel>
            <TextInput id="timeline-date" type="date" value={draft.ceremonyDate} onChange={(event) => update('ceremonyDate', event.target.value)} required />
            {ceremonyDateLong ? <HelperText>{ceremonyDateLong}</HelperText> : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="timeline-time" required>Ceremony time</FieldLabel>
            <TextInput id="timeline-time" type="time" value={draft.ceremonyTime} onChange={(event) => update('ceremonyTime', event.target.value)} required />
            <HelperText>{ceremonyTimeLabel}</HelperText>
          </Field>
          <Field>
            <FieldLabel htmlFor="timeline-people" required>Number of people</FieldLabel>
            <TextInput id="timeline-people" type="number" inputMode="numeric" min="1" max="30" step="1" value={draft.people} onChange={(event) => update('people', event.target.value)} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="timeline-minutes" required>Minutes per person</FieldLabel>
            <TextInput id="timeline-minutes" type="number" inputMode="numeric" min="10" max="240" step="1" value={draft.minutesPerPerson} onChange={(event) => update('minutesPerPerson', event.target.value)} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="timeline-buffer" required>Buffer before ceremony (minutes)</FieldLabel>
            <TextInput id="timeline-buffer" type="number" inputMode="numeric" min="0" max="240" step="1" value={draft.bufferMinutes} onChange={(event) => update('bufferMinutes', event.target.value)} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="timeline-travel" required>Travel time (minutes)</FieldLabel>
            <TextInput id="timeline-travel" type="number" inputMode="numeric" min="0" max="480" step="1" value={draft.travelMinutes} onChange={(event) => update('travelMinutes', event.target.value)} required />
            <HelperText>How long the journey takes. She leaves this many minutes before she arrives.</HelperText>
          </Field>
        </div>
        {error ? <ErrorText className="mt-5 rounded-xl border border-red-800/25 bg-red-50 p-3">{error}</ErrorText> : null}
        <button type="submit" className="mt-6 min-h-12 w-full rounded-xl bg-accent px-5 text-base font-bold text-paper sm:w-auto">Calculate timeline</button>
      </form>

      {timeline ? (
        <section className="mt-8 min-w-0 rounded-3xl border border-accent/35 bg-paper p-4 sm:p-6 md:p-8" aria-live="polite">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Calculated schedule</p>
          <h2 className="mt-2 break-words font-display text-3xl leading-tight">{draft.coupleName.trim()}</h2>
          <p className="mt-2 text-sm font-semibold text-muted">{formatFullDate(timeline.ceremonyAt)}</p>

          <div className="mt-5 rounded-2xl bg-accent px-4 py-5 text-paper sm:px-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-paper/75">Arrives at the venue</p>
            <p className="mt-1 font-display text-3xl leading-tight">{formatTimeWithZone(timeline.arrivalAt)}</p>
            <p className="mt-2 text-sm text-paper/80">
              Leave by {formatTimeWithZone(timeline.departAt)} — {timeline.travelMinutes} minutes travel
            </p>
          </div>

          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-line p-4">
              <dt className="text-xs font-bold uppercase tracking-[0.13em] text-muted">Make-up starts</dt>
              <dd className="mt-1 text-base font-bold">{formatTimeWithZone(timeline.startAt)}</dd>
            </div>
            <div className="rounded-2xl border border-line p-4">
              <dt className="text-xs font-bold uppercase tracking-[0.13em] text-muted">Ceremony</dt>
              <dd className="mt-1 text-base font-bold">{formatTimeWithZone(timeline.ceremonyAt)}</dd>
            </div>
          </dl>

          <div className="mt-6 max-w-full overflow-x-auto overscroll-x-contain rounded-2xl border border-line [-webkit-overflow-scrolling:touch]">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <thead className="bg-canvas">
                <tr>
                  <th className="px-4 py-3 font-bold">Person</th>
                  <th className="px-4 py-3 font-bold">Start</th>
                  <th className="px-4 py-3 font-bold">Finish</th>
                </tr>
              </thead>
              <tbody>
                {timeline.slots.map((slot) => (
                  <tr key={slot.label} className={`border-t border-line ${slot.isBride ? 'bg-[#efe6e0] font-bold text-accent' : ''}`}>
                    <th className="px-4 py-3 font-semibold">{slot.label}</th>
                    <td className="px-4 py-3 whitespace-nowrap">{formatTimeWithZone(slot.startsAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatTimeWithZone(slot.endsAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted">
            {timeline.bufferMinutes}-minute buffer after the bride · {timeline.travelMinutes}-minute travel allowance before the first slot.
          </p>
          <button type="button" onClick={() => void exportPdf()} disabled={pdfBusy} className="mt-5 min-h-12 w-full rounded-xl bg-accent px-5 text-base font-bold text-paper disabled:opacity-60 sm:w-auto">
            {pdfBusy ? 'Preparing PDF…' : 'Export planner PDF'}
          </button>
          {pdfMessage ? <p className="mt-3 text-sm font-semibold leading-6 text-muted" role="status">{pdfMessage}</p> : null}
        </section>
      ) : null}
    </div>
  )
}
