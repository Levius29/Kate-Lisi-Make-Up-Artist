import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { ErrorText, Field, FieldLabel, HelperText } from '../components/ui/FormField'
import { SelectInput } from '../components/ui/SelectInput'
import { TextArea, TextInput } from '../components/ui/TextInput'
import {
  cutoffMilestoneLabel,
  romeDateKey,
  romeDateKeyToUtc,
} from '../lib/appointmentSchedule'
import {
  formatFullDate,
  formatFullDateTimeWithZone,
  formatFullDateWithWeekday,
  formatTime,
  formatTimeWithZone,
} from '../lib/dates'
import { storage } from '../storage'
import { useLive } from '../storage/useLive'
import type {
  Appointment,
  AppointmentStatus,
  BusinessProfile,
  Client,
  Service,
} from '../types'
import {
  applyServiceDefaults,
  appointmentToDraft,
  appointmentTotal,
  createDefaultAppointmentDraft,
  createLineItemDraft,
  mergeAppointmentForUpdate,
  prepareAppointmentForSave,
  romeInputToUtc,
  type AppointmentDraft,
  type AppointmentFieldErrors,
} from './appointmentForm'

type CalendarView = 'month' | 'week' | 'day'

interface CalendarRoute {
  kind: 'calendar' | 'new' | 'detail' | 'edit'
  appointmentId?: string
}

interface CalendarData {
  appointments: Appointment[]
  clients: Client[]
  services: Service[]
  profile: BusinessProfile | undefined
}

type MilestoneKind = 'recall' | 'cutoff' | 'balance'

interface AppointmentItem {
  kind: 'appointment'
  dateKey: string
  appointment: Appointment
}

interface MilestoneItem {
  kind: 'milestone'
  milestoneKind: MilestoneKind
  dateKey: string
  appointment: Appointment
  label: string
}

type CalendarItem = AppointmentItem | MilestoneItem

const STATUS_OPTIONS: ReadonlyArray<{ value: AppointmentStatus; label: string }> = [
  { value: 'enquiry', label: 'Enquiry' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'balance_paid', label: 'Balance paid' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  enquiry: 'border-[#ad8f85] bg-[#efe3dd] text-[#59433d]',
  quoted: 'border-[#ad9871] bg-[#f1eadb] text-[#5f4e2f]',
  confirmed: 'border-[#708c7c] bg-[#e1ebe5] text-[#365245]',
  balance_paid: 'border-[#6f8396] bg-[#e1e9ef] text-[#344b5e]',
  completed: 'border-[#867792] bg-[#eae4ee] text-[#4f405b]',
  cancelled: 'border-[#a7a19d] bg-[#ebe9e7] text-[#746f6c] opacity-65 grayscale',
}

function parseCalendarRoute(pathname: string): CalendarRoute {
  const segments = pathname.split('/').filter(Boolean)
  if (segments[0] !== 'calendar' || segments.length === 1) return { kind: 'calendar' }
  if (segments[1] === 'new') return { kind: 'new' }
  const appointmentId = segments[1]
  if (!appointmentId) return { kind: 'calendar' }
  return segments[2] === 'edit'
    ? { kind: 'edit', appointmentId }
    : { kind: 'detail', appointmentId }
}

function clientName(client: Client | undefined): string {
  return client ? `${client.firstName} ${client.lastName}` : 'Client unavailable'
}

function money(cents: number): string {
  return `EUR ${(cents / 100).toFixed(2)}`
}

function dateFromKey(key: string): Date {
  return parseISO(key)
}

function keyFromDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function longDateForKey(key: string): string {
  return formatFullDateWithWeekday(romeDateKeyToUtc(key))
}

function monthTitle(key: string): string {
  return formatFullDate(romeDateKeyToUtc(key)).replace(/^\d+\s/, '')
}

function statusLabel(status: AppointmentStatus): string {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status
}

function createCalendarItems(appointments: readonly Appointment[]): CalendarItem[] {
  return appointments.flatMap((appointment) => {
    const items: CalendarItem[] = [
      { kind: 'appointment', dateKey: romeDateKey(appointment.startAt), appointment },
    ]

    appointment.recalls.forEach((recall) => {
      items.push({
        kind: 'milestone',
        milestoneKind: 'recall',
        dateKey: romeDateKey(recall.dueAt),
        appointment,
        label: `${recall.channel === 'whatsapp' ? 'WhatsApp' : 'Email'} recall`,
      })
    })
    appointment.cancellationCutoffs.forEach((cutoff, index) => {
      // The final cutoff sits on the appointment's own date and announces no
      // following band, so it produces no marker.
      const label = cutoffMilestoneLabel(appointment.cancellationCutoffs, index)
      if (label === undefined) return
      items.push({
        kind: 'milestone',
        milestoneKind: 'cutoff',
        dateKey: romeDateKey(cutoff.date),
        appointment,
        label,
      })
    })
    items.push({
      kind: 'milestone',
      milestoneKind: 'balance',
      dateKey: romeDateKey(appointment.balanceDueAt ?? appointment.startAt),
      appointment,
      label: 'Balance due',
    })

    return items
  })
}

function FormSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-3xl border border-line bg-paper/70 px-4 py-6 sm:px-6 md:px-8">
      <div className="mb-6 border-b border-line pb-5">
        <h2 className="font-display text-2xl leading-tight text-ink">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      </div>
      {children}
    </section>
  )
}

function HalalBadge() {
  return (
    <div className="mt-3 rounded-xl border-2 border-amber-800 bg-amber-50 px-3 py-2 text-sm font-bold leading-5 text-amber-950">
      No pork derivatives / no alcohol-based products
    </div>
  )
}

function LinkedTag({ appointment, children }: { appointment: Appointment; children: Appointment[] }) {
  if (!appointment.parentAppointmentId && children.length === 0) return null
  return (
    <span className="inline-flex min-h-7 items-center rounded-full border border-accent/50 bg-paper px-2.5 text-xs font-bold uppercase tracking-[0.1em] text-accent">
      ↔ Linked wedding set
    </span>
  )
}

interface AppointmentCardProps {
  appointment: Appointment
  client: Client | undefined
  service: Service | undefined
  children: Appointment[]
  onOpen: () => void
}

function AppointmentCard({ appointment, client, service, children, onOpen }: AppointmentCardProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full min-w-0 rounded-2xl border-l-4 p-4 text-left ${STATUS_STYLES[appointment.status]}`}
    >
      <span className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-sm font-bold">{formatTime(appointment.startAt)} · {clientName(client)}</span>
          <span className="mt-1 block text-sm leading-5 opacity-80">{service?.name ?? 'Service unavailable'} · {appointment.locationName}</span>
        </span>
        <span className="shrink-0 text-xs font-bold uppercase tracking-wide">{statusLabel(appointment.status)}</span>
      </span>
      <span className="mt-2 flex flex-wrap gap-2">
        <LinkedTag appointment={appointment} children={children} />
      </span>
      {client?.productPreferences.halal ? <HalalBadge /> : null}
    </button>
  )
}

function MilestoneCard({ item, client, service, onOpen }: {
  item: MilestoneItem
  client: Client | undefined
  service: Service | undefined
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-14 w-full min-w-0 items-center gap-3 rounded-2xl border border-dashed border-accent/60 bg-paper/70 px-4 py-3 text-left"
    >
      <span className="h-4 w-4 shrink-0 rotate-45 border-2 border-accent bg-canvas" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-sm font-bold text-accent">{item.label}</span>
        <span className="mt-0.5 block truncate text-sm text-muted">{clientName(client)} · {service?.name ?? 'Service unavailable'}</span>
      </span>
    </button>
  )
}

function DayAgenda({ dateKey, items, clientsById, servicesById, childAppointments, onOpen }: {
  dateKey: string
  items: CalendarItem[]
  clientsById: Map<string, Client>
  servicesById: Map<string, Service>
  childAppointments: Map<string, Appointment[]>
  onOpen: (appointment: Appointment) => void
}) {
  const sorted = [...items].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'appointment' ? -1 : 1
    return left.appointment.startAt.localeCompare(right.appointment.startAt)
  })

  return (
    <section className="min-w-0" aria-label={`Schedule for ${longDateForKey(dateKey)}`}>
      <header className="mb-5 border-b border-line pb-4">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Selected day</p>
        <h2 className="mt-2 font-display text-2xl leading-tight text-ink">{longDateForKey(dateKey)}</h2>
      </header>
      <div className="space-y-3">
        {sorted.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm leading-6 text-muted">No appointments or milestones on this day.</p>
        ) : sorted.map((item, index) => {
          const appointment = item.appointment
          const client = clientsById.get(appointment.clientId)
          const service = servicesById.get(appointment.serviceId)
          return item.kind === 'appointment' ? (
            <AppointmentCard
              key={`appointment-${appointment.id}`}
              appointment={appointment}
              client={client}
              service={service}
              children={childAppointments.get(appointment.id) ?? []}
              onOpen={() => onOpen(appointment)}
            />
          ) : (
            <MilestoneCard
              key={`${item.milestoneKind}-${appointment.id}-${index}`}
              item={item}
              client={client}
              service={service}
              onOpen={() => onOpen(appointment)}
            />
          )
        })}
      </div>
    </section>
  )
}

function MonthGrid({ anchorKey, selectedKey, itemsByDate, clientsById, childAppointments, onSelectDay, onOpen }: {
  anchorKey: string
  selectedKey: string
  itemsByDate: Map<string, CalendarItem[]>
  clientsById: Map<string, Client>
  childAppointments: Map<string, Appointment[]>
  onSelectDay: (key: string) => void
  onOpen: (appointment: Appointment) => void
}) {
  const anchor = dateFromKey(anchorKey)
  const first = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 })
  const last = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: first, end: last })
  const weekdays = days.slice(0, 7)

  return (
    <div className="max-w-full overflow-x-auto overscroll-x-contain rounded-2xl border border-line bg-paper/65 [-webkit-overflow-scrolling:touch]">
      {/*
        No minimum width: month is the default view on a phone (SPEC.md §4.1), so
        all seven columns must be visible at 320px. Pushing the grid into its own
        horizontal scroller technically satisfies "the page never scrolls
        sideways" while hiding Friday to Sunday, which is worse than useless.
      */}
      <div className="grid grid-cols-7">
        {weekdays.map((day) => {
          const key = keyFromDate(day)
          const name = longDateForKey(key).split(' ')[0] ?? ''
          return (
            <div key={key} className="border-b border-line px-1 py-3 text-center text-[0.65rem] font-bold uppercase tracking-wide text-muted sm:text-xs">
              <span className="md:hidden">{name.slice(0, 3)}</span>
              <span className="hidden md:inline">{name}</span>
            </div>
          )
        })}
        {days.map((day) => {
          const key = keyFromDate(day)
          const dayItems = itemsByDate.get(key) ?? []
          const outsideMonth = day.getMonth() !== anchor.getMonth()
          return (
            <div key={key} className={`min-h-24 min-w-0 border-b border-r border-line p-1 last:border-r-0 sm:min-h-32 sm:p-1.5 md:min-h-36 ${outsideMonth ? 'bg-canvas/45' : ''}`}>
              {/*
                The whole cell width is the tap target, not a 44px circle: at
                320px a column is only ~40px wide, so a fixed circle would
                overflow. Height still clears the 44px minimum.
              */}
              <button
                type="button"
                onClick={() => onSelectDay(key)}
                aria-label={longDateForKey(key)}
                aria-pressed={selectedKey === key}
                className={`flex h-11 w-full items-center justify-center rounded-xl text-sm font-bold sm:w-11 sm:rounded-full ${selectedKey === key ? 'bg-accent text-paper' : outsideMonth ? 'text-muted/65' : 'text-ink'}`}
              >
                {day.getDate()}
              </button>
              <div className="mt-1 space-y-1">
                {dayItems.map((item, index) => {
                  const appointment = item.appointment
                  if (item.kind === 'appointment') {
                    const linked = Boolean(appointment.parentAppointmentId) || (childAppointments.get(appointment.id)?.length ?? 0) > 0
                    return (
                      <button
                        key={`appointment-${appointment.id}`}
                        type="button"
                        onClick={() => onOpen(appointment)}
                        className={`min-h-11 w-full min-w-0 rounded-lg border-l-4 px-1.5 py-1 text-left text-[0.68rem] font-bold leading-tight ${STATUS_STYLES[appointment.status]}`}
                        aria-label={`${formatTime(appointment.startAt)}, ${clientName(clientsById.get(appointment.clientId))}${linked ? ', linked wedding set' : ''}`}
                      >
                        <span className="block truncate">{formatTime(appointment.startAt)}</span>
                        <span className="block truncate">{linked ? '↔ ' : ''}{clientName(clientsById.get(appointment.clientId))}</span>
                      </button>
                    )
                  }
                  return (
                    <button
                      key={`${item.milestoneKind}-${appointment.id}-${index}`}
                      type="button"
                      onClick={() => onOpen(appointment)}
                      className="flex min-h-11 w-full min-w-0 items-center gap-1.5 rounded-lg border border-dashed border-accent/60 bg-canvas px-1.5 py-1 text-left text-[0.62rem] font-bold leading-tight text-accent"
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rotate-45 border border-accent" aria-hidden="true" />
                      <span className="line-clamp-3">{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekGrid({ anchorKey, selectedKey, itemsByDate, clientsById, childAppointments, onSelectDay, onOpen }: Parameters<typeof MonthGrid>[0]) {
  const anchor = dateFromKey(anchorKey)
  const days = eachDayOfInterval({
    start: startOfWeek(anchor, { weekStartsOn: 1 }),
    end: endOfWeek(anchor, { weekStartsOn: 1 }),
  })

  return (
    <div className="max-w-full overflow-x-auto rounded-2xl border border-line bg-paper/65 [-webkit-overflow-scrolling:touch]">
      {/* Seven columns of appointment detail cannot be read on a phone, so the
          week stacks into a day list below md and only becomes a grid above it. */}
      <div className="grid grid-cols-1 md:grid-cols-7">
        {days.map((day) => {
          const key = keyFromDate(day)
          const dayItems = itemsByDate.get(key) ?? []
          return (
            <div key={key} className="min-h-24 min-w-0 border-b border-line p-2 last:border-b-0 md:min-h-72 md:border-b-0 md:border-r md:p-1.5 md:last:border-r-0">
              <button
                type="button"
                onClick={() => onSelectDay(key)}
                aria-label={longDateForKey(key)}
                aria-pressed={selectedKey === key}
                className={`min-h-14 w-full rounded-xl px-1 text-center text-xs font-bold ${selectedKey === key ? 'bg-accent text-paper' : 'text-ink'}`}
              >
                <span className="block uppercase">{longDateForKey(key).split(' ')[0]}</span>
                <span className="mt-0.5 block text-base">{day.getDate()}</span>
              </button>
              <div className="mt-2 space-y-1.5">
                {dayItems.map((item, index) => item.kind === 'appointment' ? (
                  <button key={`appointment-${item.appointment.id}`} type="button" onClick={() => onOpen(item.appointment)} className={`min-h-11 w-full rounded-lg border-l-4 p-1.5 text-left text-[0.68rem] font-bold leading-tight ${STATUS_STYLES[item.appointment.status]}`}>
                    {formatTime(item.appointment.startAt)}<br />{clientName(clientsById.get(item.appointment.clientId))}
                    {(item.appointment.parentAppointmentId || childAppointments.get(item.appointment.id)?.length) ? <span className="block">↔ Linked</span> : null}
                  </button>
                ) : (
                  <button key={`${item.milestoneKind}-${item.appointment.id}-${index}`} type="button" onClick={() => onOpen(item.appointment)} className="min-h-11 w-full rounded-lg border border-dashed border-accent/60 p-1.5 text-left text-[0.62rem] font-bold leading-tight text-accent">
                    ◆ {item.label}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CalendarMaster({ view, anchorKey, selectedKey, itemsByDate, clientsById, childAppointments, onViewChange, onAnchorChange, onSelectDay, onOpen, onCreate }: {
  view: CalendarView
  anchorKey: string
  selectedKey: string
  itemsByDate: Map<string, CalendarItem[]>
  clientsById: Map<string, Client>
  childAppointments: Map<string, Appointment[]>
  onViewChange: (view: CalendarView) => void
  onAnchorChange: (key: string) => void
  onSelectDay: (key: string) => void
  onOpen: (appointment: Appointment) => void
  onCreate: () => void
}) {
  function move(direction: -1 | 1) {
    const anchor = dateFromKey(anchorKey)
    const moved = view === 'month'
      ? direction < 0 ? subMonths(anchor, 1) : addMonths(anchor, 1)
      : view === 'week'
        ? direction < 0 ? subWeeks(anchor, 1) : addWeeks(anchor, 1)
        : direction < 0 ? subDays(anchor, 1) : addDays(anchor, 1)
    onAnchorChange(keyFromDate(moved))
  }

  return (
    <section className="min-w-0">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent">Studio schedule</p>
        <div className="mt-3 flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-4xl leading-tight text-ink md:text-5xl lg:text-4xl">Calendar</h1>
            <p className="mt-2 text-sm leading-6 text-muted">Appointments and booking milestones in Rome time.</p>
          </div>
          <button type="button" onClick={onCreate} className="min-h-11 shrink-0 rounded-xl bg-accent px-4 text-sm font-bold text-paper">Add appointment</button>
        </div>
      </header>

      <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="grid grid-cols-3 rounded-xl border border-line bg-paper p-1" aria-label="Calendar view">
          {(['month', 'week', 'day'] as const).map((option) => (
            <button key={option} type="button" onClick={() => onViewChange(option)} aria-pressed={view === option} className={`min-h-11 rounded-lg px-3 text-sm font-bold capitalize ${view === option ? 'bg-accent text-paper' : 'text-muted'}`}>{option}</button>
          ))}
        </div>
        <div className="flex min-w-0 items-center gap-1">
          <button type="button" onClick={() => move(-1)} className="h-11 w-11 rounded-xl border border-line bg-paper text-xl text-accent" aria-label={`Previous ${view}`}>‹</button>
          <button type="button" onClick={() => onAnchorChange(romeDateKey(new Date().toISOString()))} className="min-h-11 rounded-xl border border-line bg-paper px-3 text-sm font-bold text-muted">Today</button>
          <button type="button" onClick={() => move(1)} className="h-11 w-11 rounded-xl border border-line bg-paper text-xl text-accent" aria-label={`Next ${view}`}>›</button>
        </div>
      </div>

      <h2 className="mb-3 font-display text-2xl text-ink">{view === 'month' ? monthTitle(anchorKey) : longDateForKey(anchorKey)}</h2>
      {view === 'month' ? (
        <MonthGrid {...{ anchorKey, selectedKey, itemsByDate, clientsById, childAppointments, onSelectDay, onOpen }} />
      ) : view === 'week' ? (
        <WeekGrid {...{ anchorKey, selectedKey, itemsByDate, clientsById, childAppointments, onSelectDay, onOpen }} />
      ) : (
        <div className="rounded-2xl border border-line bg-paper/65 p-4">
          <p className="text-sm leading-6 text-muted">Day view keeps the full agenda visible in the detail panel.</p>
        </div>
      )}
    </section>
  )
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-line py-3 last:border-b-0">
      <dt className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm leading-6 text-ink">{children || 'Not provided'}</dd>
    </div>
  )
}

function AppointmentDetail({ appointment, client, service, parent, children, onClose, onEdit, onOpenLinked }: {
  appointment: Appointment
  client: Client | undefined
  service: Service | undefined
  parent: Appointment | undefined
  children: Appointment[]
  onClose: () => void
  onEdit: () => void
  onOpenLinked: (appointment: Appointment) => void
}) {
  const paid = appointment.payments.reduce((sum, payment) => sum + payment.amount, 0)
  const owed = Math.max(0, appointment.total - paid)
  const directionsQuery = appointment.locationAddress || appointment.locationName
  return (
    <article className="min-w-0">
      <header className="border-b border-line pb-5">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Appointment</p>
            <h2 className="mt-2 break-words font-display text-3xl leading-tight text-ink">{clientName(client)}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{service?.name ?? 'Service unavailable'}</p>
          </div>
          <button type="button" onClick={onClose} className="h-11 w-11 shrink-0 rounded-full border border-line text-xl text-muted" aria-label="Close appointment detail">×</button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className={`inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-bold uppercase tracking-wide ${STATUS_STYLES[appointment.status]}`}>{statusLabel(appointment.status)}</span>
          <LinkedTag appointment={appointment} children={children} />
        </div>
        {client?.productPreferences.halal ? <HalalBadge /> : null}
      </header>

      <dl className="mt-3">
        <DetailRow label="Date and time">{formatFullDateTimeWithZone(appointment.startAt)} – {formatTimeWithZone(appointment.endAt)}</DetailRow>
        <DetailRow label="Venue">{appointment.locationName}<br />{appointment.locationAddress}</DetailRow>
        <DetailRow label="People">{appointment.peopleCount}</DetailRow>
        {appointment.ceremonyTime ? <DetailRow label="Ceremony">{formatFullDateTimeWithZone(appointment.ceremonyTime)}</DetailRow> : null}
        <DetailRow label="Booking total">{money(appointment.total)}</DetailRow>
        <DetailRow label="Deposit">{appointment.depositPercent}% · {money(appointment.depositAmount)}</DetailRow>
        <DetailRow label="Money owed"><strong className="text-base">{money(owed)}</strong></DetailRow>
        <DetailRow label="Balance due">{formatFullDate(appointment.balanceDueAt ?? appointment.startAt)}</DetailRow>
      </dl>

      {(parent || children.length > 0) ? (
        <section className="mt-5 rounded-2xl border border-accent/35 bg-canvas p-4">
          <h3 className="text-sm font-bold text-ink">Linked wedding set</h3>
          <div className="mt-2 space-y-2">
            {parent ? <button type="button" onClick={() => onOpenLinked(parent)} className="min-h-11 w-full rounded-xl border border-line bg-paper px-3 text-left text-sm font-bold text-accent">Wedding · {formatFullDate(parent.startAt)} →</button> : null}
            {children.map((child) => <button key={child.id} type="button" onClick={() => onOpenLinked(child)} className="min-h-11 w-full rounded-xl border border-line bg-paper px-3 text-left text-sm font-bold text-accent">Trial · {formatFullDate(child.startAt)} →</button>)}
          </div>
        </section>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(directionsQuery)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-accent px-3 text-center text-sm font-bold text-accent">Directions</a>
        <button type="button" onClick={onEdit} className="min-h-12 rounded-xl bg-accent px-3 text-sm font-bold text-paper">Edit appointment</button>
      </div>

      {appointment.internalNotes ? (
        <section className="mt-5 border-t border-line pt-4">
          <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-muted">Internal notes</h3>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink">{appointment.internalNotes}</p>
        </section>
      ) : null}
    </article>
  )
}

function AppointmentEditor({ initial, clients, services, appointments, profile, onCancel, onSaved }: {
  initial?: Appointment
  clients: Client[]
  services: Service[]
  appointments: Appointment[]
  profile: BusinessProfile | undefined
  onCancel: () => void
  onSaved: (appointment: Appointment) => void
}) {
  const [draft, setDraft] = useState<AppointmentDraft>(() => initial ? appointmentToDraft(initial) : createDefaultAppointmentDraft())
  const [errors, setErrors] = useState<AppointmentFieldErrors>({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [balanceDateEdited, setBalanceDateEdited] = useState(Boolean(initial))
  const selectedService = services.find((service) => service.id === draft.serviceId)
  const selectedClient = clients.find((client) => client.id === draft.clientId)
  const total = appointmentTotal(draft)
  const deposit = total === undefined || !Number.isFinite(Number(draft.depositPercent)) ? undefined : Math.round(total * Number(draft.depositPercent) / 100)
  const parentOptions = appointments.filter((appointment) =>
    appointment.id !== initial?.id &&
    !appointment.parentAppointmentId &&
    appointment.clientId === draft.clientId,
  )

  function update<K extends keyof AppointmentDraft>(field: K, value: AppointmentDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
    setSaveError('')
  }

  function dateHelp(local: string, dateOnly = false): string | undefined {
    if (!local) return undefined
    try {
      const iso = dateOnly ? romeDateKeyToUtc(local) : romeInputToUtc(local)
      return dateOnly ? formatFullDate(iso) : formatFullDateTimeWithZone(iso)
    } catch {
      return undefined
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedService) {
      setErrors((current) => ({ ...current, serviceId: 'Choose a service.' }))
      return
    }
    const result = prepareAppointmentForSave(draft, selectedService, initial)
    setErrors(result.errors)
    if (!result.appointment) {
      const firstError = Object.keys(result.errors)[0]
      if (firstError) document.getElementById(`appointment-${firstError.replace(/[^a-zA-Z0-9_-]/g, '-')}`)?.focus()
      return
    }

    setIsSaving(true)
    setSaveError('')
    try {
      const saved = initial
        ? await storage.appointments.put(mergeAppointmentForUpdate(initial, result.appointment))
        : await storage.appointments.create(result.appointment)
      onSaved(saved)
    } catch {
      setSaveError('The appointment could not be saved. Your changes are still here; try again.')
    } finally {
      setIsSaving(false)
    }
  }

  function setStart(value: string) {
    const previousStart = new Date(draft.startLocal).getTime()
    const previousEnd = new Date(draft.endLocal).getTime()
    const nextStart = new Date(value).getTime()
    const duration = Math.max(60_000, previousEnd - previousStart)
    setDraft((current) => ({
      ...current,
      startLocal: value,
      endLocal: Number.isFinite(nextStart) ? new Date(nextStart + duration).toISOString().slice(0, 16) : current.endLocal,
      balanceDueDate: balanceDateEdited ? current.balanceDueDate : value.slice(0, 10),
    }))
    setErrors((current) => {
      const next = { ...current }
      delete next.startLocal
      delete next.endLocal
      return next
    })
  }

  return (
    <div className="min-w-0">
      <header className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent">{initial ? 'Edit appointment' : 'New appointment'}</p>
        <h1 className="mt-3 font-display text-4xl leading-tight text-ink md:text-5xl lg:text-4xl">{initial ? clientName(selectedClient) : 'Booking details'}</h1>
        <p className="mt-3 text-sm leading-6 text-muted">Times are shown in Rome time. Milestones are snapshotted when the booking is created.</p>
      </header>

      <form className="space-y-6" noValidate onSubmit={handleSubmit}>
        <FormSection title="Booking" description="Choose the reusable client and catalogue service for this appointment.">
          <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="appointment-clientId" required>Client</FieldLabel>
              <SelectInput id="appointment-clientId" value={draft.clientId} onChange={(event) => update('clientId', event.target.value)} hasError={Boolean(errors.clientId)} required>
                <option value="">Choose a client</option>
                {clients.filter((client) => !client.deletedAt || client.id === initial?.clientId).map((client) => <option key={client.id} value={client.id}>{clientName(client)}</option>)}
              </SelectInput>
              {errors.clientId ? <ErrorText>{errors.clientId}</ErrorText> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="appointment-serviceId" required>Service</FieldLabel>
              <SelectInput
                id="appointment-serviceId"
                value={draft.serviceId}
                onChange={(event) => {
                  const service = services.find((candidate) => candidate.id === event.target.value)
                  if (service) setDraft((current) => applyServiceDefaults(current, service, profile))
                  else update('serviceId', '')
                }}
                hasError={Boolean(errors.serviceId)}
                required
              >
                <option value="">Choose a service</option>
                {services.filter((service) => service.active || service.id === initial?.serviceId).map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
              </SelectInput>
              {errors.serviceId ? <ErrorText>{errors.serviceId}</ErrorText> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="appointment-status" required>Status</FieldLabel>
              <SelectInput id="appointment-status" value={draft.status} onChange={(event) => update('status', event.target.value as AppointmentStatus)} required>
                {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </SelectInput>
            </Field>
            <Field>
              <FieldLabel htmlFor="appointment-parentAppointmentId">Linked wedding</FieldLabel>
              <SelectInput id="appointment-parentAppointmentId" value={draft.parentAppointmentId} onChange={(event) => update('parentAppointmentId', event.target.value)} hasError={Boolean(errors.parentAppointmentId)} disabled={!draft.clientId}>
                <option value="">Not a linked trial</option>
                {parentOptions.map((appointment) => <option key={appointment.id} value={appointment.id}>{formatFullDate(appointment.startAt)} · {services.find((service) => service.id === appointment.serviceId)?.name ?? 'Wedding'}</option>)}
              </SelectInput>
              <HelperText>Select the wedding appointment when this booking is its trial.</HelperText>
              {errors.parentAppointmentId ? <ErrorText>{errors.parentAppointmentId}</ErrorText> : null}
            </Field>
          </div>
        </FormSection>

        <FormSection title="Date and place" description="Stored in UTC and displayed in Europe/Rome with an explicit timezone.">
          <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="appointment-startLocal" required>Starts</FieldLabel>
              <TextInput id="appointment-startLocal" type="datetime-local" value={draft.startLocal} onChange={(event) => setStart(event.target.value)} hasError={Boolean(errors.startLocal)} required />
              {dateHelp(draft.startLocal) ? <HelperText>{dateHelp(draft.startLocal)}</HelperText> : null}
              {errors.startLocal ? <ErrorText>{errors.startLocal}</ErrorText> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="appointment-endLocal" required>Ends</FieldLabel>
              <TextInput id="appointment-endLocal" type="datetime-local" value={draft.endLocal} onChange={(event) => update('endLocal', event.target.value)} hasError={Boolean(errors.endLocal)} required />
              {dateHelp(draft.endLocal) ? <HelperText>{dateHelp(draft.endLocal)}</HelperText> : null}
              {errors.endLocal ? <ErrorText>{errors.endLocal}</ErrorText> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="appointment-locationName" required>Venue name</FieldLabel>
              <TextInput id="appointment-locationName" value={draft.locationName} onChange={(event) => update('locationName', event.target.value)} hasError={Boolean(errors.locationName)} required />
              {errors.locationName ? <ErrorText>{errors.locationName}</ErrorText> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="appointment-locationAddress" required>Venue address</FieldLabel>
              <TextInput id="appointment-locationAddress" value={draft.locationAddress} onChange={(event) => update('locationAddress', event.target.value)} hasError={Boolean(errors.locationAddress)} autoComplete="street-address" required />
              {errors.locationAddress ? <ErrorText>{errors.locationAddress}</ErrorText> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="appointment-peopleCount" required>People</FieldLabel>
              <TextInput id="appointment-peopleCount" inputMode="numeric" pattern="[0-9]*" value={draft.peopleCount} onChange={(event) => update('peopleCount', event.target.value)} hasError={Boolean(errors.peopleCount)} required />
              {errors.peopleCount ? <ErrorText>{errors.peopleCount}</ErrorText> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="appointment-travelKm">Travel distance (km)</FieldLabel>
              <TextInput id="appointment-travelKm" inputMode="decimal" value={draft.travelKm} onChange={(event) => update('travelKm', event.target.value)} hasError={Boolean(errors.travelKm)} />
              {errors.travelKm ? <ErrorText>{errors.travelKm}</ErrorText> : null}
            </Field>
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="appointment-ceremonyLocal">Ceremony time</FieldLabel>
              <TextInput id="appointment-ceremonyLocal" type="datetime-local" value={draft.ceremonyLocal} onChange={(event) => update('ceremonyLocal', event.target.value)} hasError={Boolean(errors.ceremonyLocal)} />
              {dateHelp(draft.ceremonyLocal) ? <HelperText>{dateHelp(draft.ceremonyLocal)}</HelperText> : <HelperText>Optional; use for bridal bookings.</HelperText>}
              {errors.ceremonyLocal ? <ErrorText>{errors.ceremonyLocal}</ErrorText> : null}
            </Field>
          </div>
        </FormSection>

        <FormSection title="Fees" description="Amounts stay in integer cents. The total is the sum of these line items.">
          {errors.lineItems ? <ErrorText className="mb-4">{errors.lineItems}</ErrorText> : null}
          <div className="space-y-4">
            {draft.lineItems.map((item, index) => {
              const labelError = errors[`lineItems.${item.id}.label`]
              const quantityError = errors[`lineItems.${item.id}.quantity`]
              const priceError = errors[`lineItems.${item.id}.unitPriceEuros`]
              return (
                <fieldset key={item.id} className="min-w-0 rounded-2xl border border-line bg-canvas/55 p-4">
                  <legend className="px-2 text-sm font-bold text-muted">Line item {index + 1}</legend>
                  <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_7rem_10rem]">
                    <Field>
                      <FieldLabel htmlFor={`appointment-lineItems-${item.id}-label`} required>Label</FieldLabel>
                      <TextInput id={`appointment-lineItems-${item.id}-label`} value={item.label} onChange={(event) => setDraft((current) => ({ ...current, lineItems: current.lineItems.map((candidate) => candidate.id === item.id ? { ...candidate, label: event.target.value } : candidate) }))} hasError={Boolean(labelError)} required />
                      {labelError ? <ErrorText>{labelError}</ErrorText> : null}
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`appointment-lineItems-${item.id}-quantity`} required>Quantity</FieldLabel>
                      <TextInput id={`appointment-lineItems-${item.id}-quantity`} inputMode="decimal" value={item.quantity} onChange={(event) => setDraft((current) => ({ ...current, lineItems: current.lineItems.map((candidate) => candidate.id === item.id ? { ...candidate, quantity: event.target.value } : candidate) }))} hasError={Boolean(quantityError)} required />
                      {quantityError ? <ErrorText>{quantityError}</ErrorText> : null}
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`appointment-lineItems-${item.id}-unitPriceEuros`} required>Unit price (EUR)</FieldLabel>
                      <TextInput id={`appointment-lineItems-${item.id}-unitPriceEuros`} inputMode="decimal" value={item.unitPriceEuros} onChange={(event) => setDraft((current) => ({ ...current, lineItems: current.lineItems.map((candidate) => candidate.id === item.id ? { ...candidate, unitPriceEuros: event.target.value } : candidate) }))} hasError={Boolean(priceError)} required />
                      {priceError ? <ErrorText>{priceError}</ErrorText> : null}
                    </Field>
                  </div>
                  <button type="button" onClick={() => setDraft((current) => ({ ...current, lineItems: current.lineItems.filter((candidate) => candidate.id !== item.id) }))} className="mt-3 min-h-11 rounded-xl border border-line px-4 text-sm font-bold text-muted">Remove</button>
                </fieldset>
              )
            })}
          </div>
          <button type="button" onClick={() => setDraft((current) => ({ ...current, lineItems: [...current.lineItems, createLineItemDraft()] }))} className="mt-4 min-h-11 rounded-xl border border-accent px-4 text-sm font-bold text-accent">Add line item</button>
          <div className="mt-6 grid min-w-0 grid-cols-1 gap-5 border-t border-line pt-5 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="appointment-depositPercent" required>Deposit percentage</FieldLabel>
              <TextInput id="appointment-depositPercent" inputMode="decimal" value={draft.depositPercent} onChange={(event) => update('depositPercent', event.target.value)} hasError={Boolean(errors.depositPercent)} required />
              <HelperText>Freely editable for this booking. Deposit: {deposit === undefined ? '—' : money(deposit)}</HelperText>
              {errors.depositPercent ? <ErrorText>{errors.depositPercent}</ErrorText> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="appointment-balanceDueDate">Balance due date</FieldLabel>
              <TextInput id="appointment-balanceDueDate" type="date" value={draft.balanceDueDate} onChange={(event) => { setBalanceDateEdited(true); update('balanceDueDate', event.target.value) }} hasError={Boolean(errors.balanceDueDate)} />
              {dateHelp(draft.balanceDueDate, true) ? <HelperText>{dateHelp(draft.balanceDueDate, true)}</HelperText> : <HelperText>Defaults to the appointment date.</HelperText>}
              {errors.balanceDueDate ? <ErrorText>{errors.balanceDueDate}</ErrorText> : null}
            </Field>
          </div>
          <p className="mt-5 text-right font-display text-2xl text-ink">Total {total === undefined ? '—' : money(total)}</p>
        </FormSection>

        <FormSection title="Private notes" description="Working notes stay on this device and are not client-facing.">
          <Field>
            <FieldLabel htmlFor="appointment-internalNotes">Internal notes</FieldLabel>
            <TextArea id="appointment-internalNotes" rows={5} value={draft.internalNotes} onChange={(event) => update('internalNotes', event.target.value)} />
          </Field>
        </FormSection>

        <div className="border-t border-line pb-2 pt-6 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div className="min-h-11" aria-live="polite">{saveError ? <p className="text-sm font-bold leading-6 text-red-800">{saveError}</p> : null}</div>
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <button type="button" onClick={onCancel} className="min-h-12 rounded-xl border border-line px-5 text-base font-bold text-muted">Cancel</button>
            <button type="submit" disabled={isSaving} className="min-h-12 rounded-xl bg-accent px-6 text-base font-bold text-paper disabled:opacity-60">{isSaving ? 'Saving…' : initial ? 'Save changes' : 'Create appointment'}</button>
          </div>
        </div>
      </form>
    </div>
  )
}

export function Calendar() {
  const location = useLocation()
  const navigate = useNavigate()
  const route = useMemo(() => parseCalendarRoute(location.pathname), [location.pathname])
  const todayKey = romeDateKey(new Date().toISOString())
  const [view, setView] = useState<CalendarView>('month')
  const [anchorKey, setAnchorKey] = useState(todayKey)
  const [selectedKey, setSelectedKey] = useState(todayKey)
  const data = useLive<CalendarData>(async () => {
    const [appointments, clients, services, profile] = await Promise.all([
      storage.appointments.list({ orderBy: 'startAt' }),
      storage.clients.list({ includeDeleted: true }),
      storage.services.list({ includeDeleted: true }),
      storage.profile.get(),
    ])
    return { appointments, clients, services, profile }
  }, [])

  const appointments = data?.appointments ?? []
  const clients = data?.clients ?? []
  const services = data?.services ?? []
  const clientsById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients])
  const servicesById = useMemo(() => new Map(services.map((service) => [service.id, service])), [services])
  const appointmentsById = useMemo(() => new Map(appointments.map((appointment) => [appointment.id, appointment])), [appointments])
  const childAppointments = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    appointments.forEach((appointment) => {
      if (!appointment.parentAppointmentId) return
      map.set(appointment.parentAppointmentId, [...(map.get(appointment.parentAppointmentId) ?? []), appointment])
    })
    return map
  }, [appointments])
  const items = useMemo(() => createCalendarItems(appointments), [appointments])
  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>()
    items.forEach((item) => map.set(item.dateKey, [...(map.get(item.dateKey) ?? []), item]))
    return map
  }, [items])
  const selectedAppointment = route.appointmentId ? appointmentsById.get(route.appointmentId) : undefined

  useEffect(() => {
    if (!selectedAppointment) return
    const key = romeDateKey(selectedAppointment.startAt)
    setAnchorKey(key)
    setSelectedKey(key)
  }, [selectedAppointment])

  function openAppointment(appointment: Appointment) {
    setSelectedKey(romeDateKey(appointment.startAt))
    navigate(`/calendar/${appointment.id}`)
  }

  if (data === undefined) return <p className="text-sm text-muted" aria-busy="true">Loading calendar…</p>

  if (route.kind === 'new') {
    return <AppointmentEditor clients={clients} services={services} appointments={appointments} profile={data.profile} onCancel={() => navigate('/calendar')} onSaved={(appointment) => navigate(`/calendar/${appointment.id}`, { replace: true })} />
  }

  if (route.kind === 'edit' && selectedAppointment) {
    return <AppointmentEditor key={selectedAppointment.id} initial={selectedAppointment} clients={clients} services={services} appointments={appointments} profile={data.profile} onCancel={() => navigate(`/calendar/${selectedAppointment.id}`)} onSaved={(appointment) => navigate(`/calendar/${appointment.id}`, { replace: true })} />
  }

  if ((route.kind === 'detail' || route.kind === 'edit') && !selectedAppointment) {
    return (
      <div className="rounded-3xl border border-dashed border-line px-6 py-12 text-center">
        <h1 className="font-display text-3xl text-ink">Appointment not found</h1>
        <button type="button" onClick={() => navigate('/calendar')} className="mt-4 min-h-11 rounded-xl border border-accent px-4 text-sm font-bold text-accent">Back to calendar</button>
      </div>
    )
  }

  const detail = selectedAppointment ? (
    <AppointmentDetail
      appointment={selectedAppointment}
      client={clientsById.get(selectedAppointment.clientId)}
      service={servicesById.get(selectedAppointment.serviceId)}
      parent={selectedAppointment.parentAppointmentId ? appointmentsById.get(selectedAppointment.parentAppointmentId) : undefined}
      children={childAppointments.get(selectedAppointment.id) ?? []}
      onClose={() => navigate('/calendar')}
      onEdit={() => navigate(`/calendar/${selectedAppointment.id}/edit`)}
      onOpenLinked={openAppointment}
    />
  ) : (
    <DayAgenda
      dateKey={selectedKey}
      items={itemsByDate.get(selectedKey) ?? []}
      clientsById={clientsById}
      servicesById={servicesById}
      childAppointments={childAppointments}
      onOpen={openAppointment}
    />
  )

  return (
    <div className="min-w-0 lg:grid lg:grid-cols-[minmax(22rem,1.35fr)_minmax(18rem,0.8fr)] lg:items-start lg:gap-6">
      <CalendarMaster
        view={view}
        anchorKey={anchorKey}
        selectedKey={selectedKey}
        itemsByDate={itemsByDate}
        clientsById={clientsById}
        childAppointments={childAppointments}
        onViewChange={setView}
        onAnchorChange={(key) => { setAnchorKey(key); setSelectedKey(key) }}
        onSelectDay={(key) => { setSelectedKey(key); setAnchorKey(key) }}
        onOpen={openAppointment}
        onCreate={() => navigate('/calendar/new')}
      />

      <aside className="mt-7 hidden min-w-0 rounded-3xl border border-line bg-paper/75 p-5 lg:sticky lg:top-6 lg:mt-0 lg:block lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
        {detail}
      </aside>

      {!selectedAppointment ? (
        <div className="mt-7 min-w-0 lg:hidden">{detail}</div>
      ) : (
        <>
          <button type="button" onClick={() => navigate('/calendar')} className="fixed inset-0 z-40 bg-ink/25 lg:hidden" aria-label="Close appointment detail backdrop" />
          <aside className="fixed inset-x-0 bottom-0 z-50 max-h-[calc(100dvh-env(safe-area-inset-top))] overflow-y-auto rounded-t-3xl border-t border-line bg-paper pb-[calc(1.5rem+env(safe-area-inset-bottom))] pl-[calc(1.25rem+env(safe-area-inset-left))] pr-[calc(1.25rem+env(safe-area-inset-right))] pt-5 shadow-2xl lg:hidden">
            {detail}
          </aside>
        </>
      )}
    </div>
  )
}
