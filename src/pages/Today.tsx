import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  formatClientLocalTime,
  formatFullDate,
  formatTimeWithZone,
  isOutsideCourtesyHours,
} from '../lib/dates'
import {
  buildRecallLink,
  splitRecallsByDueDate,
  updateRecallSentAt,
  type RecallGroups,
} from '../lib/recalls'
import { formatEUR } from '../lib/money'
import { outstandingAppointments, type OutstandingAppointment } from '../lib/payments'
import { storage } from '../storage'
import { useLive } from '../storage/useLive'
import type { Appointment, AppointmentRecall, Client, Service } from '../types'

interface TodayData {
  appointments: Appointment[]
  clients: Client[]
  services: Service[]
}

interface RecallListItem {
  appointment: Appointment
  recall: AppointmentRecall
  client: Client | undefined
  serviceName: string
}

interface UndoRecall {
  appointmentId: string
  recallId: string
  clientName: string
  previousSentAt: string | undefined
}

function fullClientName(client: Client | undefined): string {
  return client ? `${client.firstName} ${client.lastName}` : 'Client unavailable'
}

function channelLabel(recall: AppointmentRecall): string {
  return recall.channel === 'whatsapp' ? 'WhatsApp' : 'email'
}

function activeAppointment(appointment: Appointment): boolean {
  return appointment.status !== 'cancelled' && appointment.status !== 'completed'
}

function NextAppointment({
  appointment,
  client,
  serviceName,
}: {
  appointment: Appointment | undefined
  client: Client | undefined
  serviceName: string
}) {
  return (
    <section aria-labelledby="next-appointment-heading">
      <div className="flex items-end justify-between gap-3 border-b border-line pb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Diary</p>
          <h2 id="next-appointment-heading" className="mt-1 font-display text-2xl leading-tight">
            Next appointment
          </h2>
        </div>
      </div>

      {appointment ? (
        <article className="mt-4 min-w-0 rounded-3xl border border-line bg-paper p-5 sm:p-6">
          <p className="break-words font-display text-2xl leading-tight text-ink">
            {fullClientName(client)}
          </p>
          <p className="mt-2 break-words text-sm font-semibold leading-6 text-accent">
            {serviceName}
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            {formatFullDate(appointment.startAt)} · {formatTimeWithZone(appointment.startAt)}
          </p>
          <p className="mt-1 break-words text-sm leading-6 text-muted">
            {appointment.locationName}
            {appointment.locationAddress ? `, ${appointment.locationAddress}` : ''}
          </p>
          <Link
            to={`/calendar/${appointment.id}`}
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-accent px-4 text-sm font-bold text-accent md:w-auto"
          >
            View appointment
          </Link>
        </article>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-line px-5 py-7 text-sm leading-6 text-muted">
          No upcoming appointment.
        </p>
      )}
    </section>
  )
}

function UnpaidBalances({
  items,
  clientsById,
  servicesById,
}: {
  items: OutstandingAppointment<Appointment>[]
  clientsById: Map<string, Client>
  servicesById: Map<string, Service>
}) {
  const shown = items.slice(0, 3)
  return (
    <section aria-labelledby="unpaid-balances-heading">
      <header className="flex min-w-0 items-end justify-between gap-3 border-b border-line pb-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Payments</p>
          <h2 id="unpaid-balances-heading" className="mt-1 font-display text-2xl leading-tight text-ink">Unpaid balances</h2>
        </div>
        <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full border border-line bg-paper px-2 text-sm font-bold text-accent">{items.length}</span>
      </header>
      {shown.length ? (
        <div className="mt-4 space-y-3">
          {shown.map(({ appointment, summary, dueAt, overdue }) => (
            <Link key={appointment.id} to={`/money/${appointment.id}`} className={`flex min-h-16 min-w-0 items-center justify-between gap-3 rounded-2xl border p-4 ${overdue ? 'border-danger-line bg-danger-surface' : 'border-line bg-paper/70'}`}>
              <span className="min-w-0">
                <span className="block break-words font-display text-lg leading-tight text-ink">{fullClientName(clientsById.get(appointment.clientId))}</span>
                <span className="mt-1 block break-words text-xs leading-5 text-muted">{servicesById.get(appointment.serviceId)?.name ?? 'Service unavailable'} · {overdue ? 'Overdue since' : 'Due'} {formatFullDate(dueAt)}</span>
              </span>
              <strong className="shrink-0 text-sm text-accent">{formatEUR(summary.balance.outstanding)}</strong>
            </Link>
          ))}
          {items.length > shown.length ? <Link to="/money" className="inline-flex min-h-11 items-center text-sm font-bold text-accent">View all {items.length} unpaid balances →</Link> : null}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-6 text-muted">No unpaid balances.</p>
      )}
    </section>
  )
}

interface RecallRowProps {
  item: RecallListItem
  nowIso: string
  awaitingConfirmation: boolean
  busy: boolean
  onLinkOpened: () => void
  onConfirmSent: () => void
  onDismissConfirmation: () => void
}

function RecallRow({
  item,
  nowIso,
  awaitingConfirmation,
  busy,
  onLinkOpened,
  onConfirmSent,
  onDismissConfirmation,
}: RecallRowProps) {
  const { appointment, recall, client, serviceName } = item
  const clientTime = client
    ? formatClientLocalTime(nowIso, client.timezone)
    : 'Timezone unavailable'
  const outsideCourtesyHours = client
    ? isOutsideCourtesyHours(nowIso, client.timezone)
    : false
  const link = client
    ? buildRecallLink({ appointment, client, serviceName, recall, nowIso })
    : undefined
  const actionLabel = recall.channel === 'whatsapp' ? 'Open WhatsApp' : 'Open email'
  const missingContactLabel = !client
    ? 'Client details unavailable'
    : recall.channel === 'whatsapp'
      ? 'Phone number unavailable'
      : 'Email address unavailable'

  return (
    <article className="min-w-0 rounded-2xl border border-line bg-paper/80 p-4 sm:p-5">
      <div className="min-w-0 md:flex md:items-start md:justify-between md:gap-5">
        <div className="min-w-0">
          <h4 className="break-words font-display text-xl leading-tight text-ink">
            {fullClientName(client)}
          </h4>
          <p className="mt-1 break-words text-sm font-semibold leading-5 text-accent">
            {serviceName}
          </p>
        </div>
        <p className="mt-3 shrink-0 text-sm font-semibold text-muted md:mt-0 md:text-right">
          Due {formatFullDate(recall.dueAt)}
        </p>
      </div>

      <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 border-t border-line pt-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">
            Client local time
          </p>
          <p className="mt-1 break-words text-base font-semibold leading-6 text-ink">
            {clientTime}
          </p>
          <p className="mt-0.5 break-all text-xs leading-5 text-muted">
            {client?.timezone ?? 'No client timezone'}
          </p>
          {outsideCourtesyHours ? (
            <p className="mt-2 inline-flex min-h-7 items-center rounded-full border border-warning-line bg-warning-surface px-2.5 text-xs font-bold text-warning-text">
              Outside 09:00–20:00 — send only if appropriate
            </p>
          ) : null}
        </div>

        {link ? (
          <a
            href={link}
            target={recall.channel === 'whatsapp' ? '_blank' : undefined}
            rel={recall.channel === 'whatsapp' ? 'noreferrer' : undefined}
            onClick={onLinkOpened}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-accent px-5 text-base font-bold text-paper md:w-auto"
          >
            {actionLabel}
          </a>
        ) : (
          <span className="flex min-h-12 w-full items-center justify-center rounded-xl border border-line px-4 text-center text-sm font-bold text-muted md:w-auto">
            {missingContactLabel}
          </span>
        )}
      </div>

      {awaitingConfirmation ? (
        <div className="mt-4 rounded-xl border border-accent bg-canvas p-3" aria-live="polite">
          <p className="text-sm font-semibold leading-6 text-ink">
            Did you send this {channelLabel(recall)} message?
          </p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Opening the app does not mark anything sent.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onDismissConfirmation}
              disabled={busy}
              className="min-h-11 rounded-xl border border-line px-3 text-sm font-bold text-muted disabled:opacity-60"
            >
              Not yet
            </button>
            <button
              type="button"
              onClick={onConfirmSent}
              disabled={busy}
              className="min-h-11 rounded-xl bg-accent px-3 text-sm font-bold text-paper disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Mark as sent'}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  )
}

function RecallSection({
  id,
  eyebrow,
  title,
  emptyMessage,
  items,
  nowIso,
  confirmationKey,
  busyKey,
  onLinkOpened,
  onConfirmSent,
  onDismissConfirmation,
}: {
  id: string
  eyebrow: string
  title: string
  emptyMessage: string
  items: RecallListItem[]
  nowIso: string
  confirmationKey: string | undefined
  busyKey: string | undefined
  onLinkOpened: (key: string) => void
  onConfirmSent: (item: RecallListItem) => void
  onDismissConfirmation: () => void
}) {
  return (
    <section className="min-w-0" aria-labelledby={id}>
      <header className="flex min-w-0 items-end justify-between gap-3 border-b border-line pb-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">{eyebrow}</p>
          <h3 id={id} className="mt-1 font-display text-2xl leading-tight text-ink">{title}</h3>
        </div>
        <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full border border-line bg-paper px-2 text-sm font-bold text-accent">
          {items.length}
        </span>
      </header>

      {items.length > 0 ? (
        <div className="mt-4 space-y-3">
          {items.map((item) => {
            const key = `${item.appointment.id}:${item.recall.id}`
            return (
              <RecallRow
                key={key}
                item={item}
                nowIso={nowIso}
                awaitingConfirmation={confirmationKey === key}
                busy={busyKey !== undefined}
                onLinkOpened={() => onLinkOpened(key)}
                onConfirmSent={() => onConfirmSent(item)}
                onDismissConfirmation={onDismissConfirmation}
              />
            )
          })}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-6 text-muted">{emptyMessage}</p>
      )}
    </section>
  )
}

export function Today() {
  const [nowIso, setNowIso] = useState(() => new Date().toISOString())
  const [confirmationKey, setConfirmationKey] = useState<string>()
  const [busyKey, setBusyKey] = useState<string>()
  const [undoRecall, setUndoRecall] = useState<UndoRecall>()
  const [actionError, setActionError] = useState('')
  const data = useLive<TodayData>(async () => {
    const [appointments, clients, services] = await Promise.all([
      storage.appointments.list({ orderBy: 'startAt' }),
      storage.clients.list({ includeDeleted: true }),
      storage.services.list({ includeDeleted: true }),
    ])
    return { appointments, clients, services }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNowIso(new Date().toISOString()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const clientsById = useMemo(
    () => new Map((data?.clients ?? []).map((client) => [client.id, client])),
    [data?.clients],
  )
  const servicesById = useMemo(
    () => new Map((data?.services ?? []).map((service) => [service.id, service])),
    [data?.services],
  )
  const appointments = data?.appointments ?? []
  const recallItems = useMemo<RecallListItem[]>(
    () =>
      appointments.filter(activeAppointment).flatMap((appointment) => {
        const client = clientsById.get(appointment.clientId)
        // Recall timing/channel/template come only from this appointment snapshot.
        // The schema stores serviceId rather than a service-name snapshot, so only
        // the display/merge name is resolved from the catalogue.
        const serviceName = servicesById.get(appointment.serviceId)?.name ?? 'Service unavailable'
        return appointment.recalls.map((recall) => ({
          appointment,
          recall,
          client,
          serviceName,
        }))
      }),
    [appointments, clientsById, servicesById],
  )
  const recallGroups: RecallGroups<RecallListItem> = useMemo(
    () => splitRecallsByDueDate(recallItems, nowIso),
    [recallItems, nowIso],
  )
  const nextAppointment = useMemo(
    () =>
      appointments.find(
        (appointment) =>
          activeAppointment(appointment) &&
          new Date(appointment.startAt).getTime() >= new Date(nowIso).getTime(),
      ),
    [appointments, nowIso],
  )
  const unpaidBalances = useMemo(
    () => outstandingAppointments(appointments, nowIso).filter(({ summary }) => summary.balance.outstanding > 0),
    [appointments, nowIso],
  )
  const unsentCount =
    recallGroups.overdue.length +
    recallGroups.dueToday.length +
    recallGroups.upcoming.length

  async function markAsSent(item: RecallListItem) {
    const key = `${item.appointment.id}:${item.recall.id}`
    setBusyKey(key)
    setActionError('')
    try {
      const latest = await storage.appointments.get(item.appointment.id)
      if (!latest) throw new Error('Appointment not found')
      const sentAt = new Date().toISOString()
      await storage.appointments.put(updateRecallSentAt(latest, item.recall.id, sentAt))
      setConfirmationKey(undefined)
      setUndoRecall({
        appointmentId: item.appointment.id,
        recallId: item.recall.id,
        clientName: fullClientName(item.client),
        previousSentAt: item.recall.sentAt,
      })
    } catch {
      setActionError('The recall could not be marked as sent. Try again; it is still in the list.')
    } finally {
      setBusyKey(undefined)
    }
  }

  async function undoSent() {
    if (!undoRecall) return
    const key = `${undoRecall.appointmentId}:${undoRecall.recallId}`
    setBusyKey(key)
    setActionError('')
    try {
      const latest = await storage.appointments.get(undoRecall.appointmentId)
      if (!latest) throw new Error('Appointment not found')
      await storage.appointments.put(
        updateRecallSentAt(latest, undoRecall.recallId, undoRecall.previousSentAt),
      )
      setUndoRecall(undefined)
    } catch {
      setActionError('Undo could not be saved. The recall remains marked as sent.')
    } finally {
      setBusyKey(undefined)
    }
  }

  if (data === undefined) {
    return <p className="text-sm text-muted" aria-busy="true">Loading today…</p>
  }

  return (
    <div className="min-w-0">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Studio</p>
        <h1 className="mt-3 font-display text-5xl leading-none">Today</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-muted">
          A calm view of the next booking and the messages that need your attention.
        </p>
      </header>

      <div className="mt-10">
        <NextAppointment
          appointment={nextAppointment}
          client={nextAppointment ? clientsById.get(nextAppointment.clientId) : undefined}
          serviceName={
            nextAppointment
              ? servicesById.get(nextAppointment.serviceId)?.name ?? 'Service unavailable'
              : ''
          }
        />
      </div>

      <div className="mt-12">
        <UnpaidBalances items={unpaidBalances} clientsById={clientsById} servicesById={servicesById} />
      </div>

      <section className="mt-12 min-w-0" aria-labelledby="recalls-heading">
        <header className="min-w-0">
          <div className="flex min-w-0 items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Follow-up</p>
              <h2 id="recalls-heading" className="mt-1 font-display text-3xl leading-tight text-ink">
                Recalls
              </h2>
            </div>
            <p className="shrink-0 text-sm font-semibold text-muted">
              {unsentCount} open
            </p>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
            These are prompts for you to send. Nothing is scheduled or sent automatically.
          </p>
        </header>

        <div className="min-h-6" aria-live="polite">
          {actionError ? (
            <p className="mt-4 rounded-xl border border-danger-line bg-danger-surface p-3 text-sm font-semibold leading-6 text-danger-text">
              {actionError}
            </p>
          ) : null}
        </div>

        <div className="mt-5 space-y-10">
          <RecallSection
            id="recalls-overdue"
            eyebrow="Needs attention"
            title="Overdue"
            emptyMessage="Nothing overdue."
            items={recallGroups.overdue}
            nowIso={nowIso}
            confirmationKey={confirmationKey}
            busyKey={busyKey}
            onLinkOpened={(key) => { setConfirmationKey(key); setActionError('') }}
            onConfirmSent={(item) => void markAsSent(item)}
            onDismissConfirmation={() => setConfirmationKey(undefined)}
          />
          <RecallSection
            id="recalls-today"
            eyebrow="Send today"
            title="Due today"
            emptyMessage="No recalls due today."
            items={recallGroups.dueToday}
            nowIso={nowIso}
            confirmationKey={confirmationKey}
            busyKey={busyKey}
            onLinkOpened={(key) => { setConfirmationKey(key); setActionError('') }}
            onConfirmSent={(item) => void markAsSent(item)}
            onDismissConfirmation={() => setConfirmationKey(undefined)}
          />
          <RecallSection
            id="recalls-upcoming"
            eyebrow="On the horizon"
            title="Upcoming"
            emptyMessage="No upcoming recalls."
            items={recallGroups.upcoming}
            nowIso={nowIso}
            confirmationKey={confirmationKey}
            busyKey={busyKey}
            onLinkOpened={(key) => { setConfirmationKey(key); setActionError('') }}
            onConfirmSent={(item) => void markAsSent(item)}
            onDismissConfirmation={() => setConfirmationKey(undefined)}
          />
        </div>
      </section>

      {undoRecall ? (
        <aside
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-[calc(1rem+env(safe-area-inset-left))] right-[calc(1rem+env(safe-area-inset-right))] z-50 mx-auto max-w-md rounded-2xl border border-line bg-ink p-3 text-paper shadow-xl lg:bottom-[calc(1rem+env(safe-area-inset-bottom))]"
          aria-live="polite"
        >
          <div className="flex min-w-0 items-center gap-3">
            <p className="min-w-0 flex-1 break-words text-sm leading-5">
              Recall for {undoRecall.clientName} marked as sent.
            </p>
            <button
              type="button"
              onClick={() => void undoSent()}
              disabled={busyKey !== undefined}
              className="min-h-11 shrink-0 rounded-xl bg-paper px-4 text-sm font-bold text-ink disabled:opacity-60"
            >
              {busyKey ? 'Saving…' : 'Undo'}
            </button>
            <button
              type="button"
              onClick={() => setUndoRecall(undefined)}
              className="h-11 w-11 shrink-0 rounded-xl border border-paper text-xl"
              aria-label="Dismiss sent confirmation"
            >
              ×
            </button>
          </div>
        </aside>
      ) : null}
    </div>
  )
}
