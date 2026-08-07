import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { ErrorText, Field, FieldLabel, HelperText } from '../components/ui/FormField'
import { SelectInput } from '../components/ui/SelectInput'
import { TextInput } from '../components/ui/TextInput'
import { romeDateKey, romeDateKeyToUtc } from '../lib/appointmentSchedule'
import { formatFullDate } from '../lib/dates'
import { centsToEuros, formatEUR, parseEurosToCents, stampDutyForTotal } from '../lib/money'
import {
  calculatePaymentSummary,
  outstandingAppointments,
  type AppointmentPaymentSummary,
  type OutstandingAppointment,
} from '../lib/payments'
import { calculateCurrentYearRevenue, revenueMeterState } from '../lib/revenue'
import { storage } from '../storage'
import { useLive } from '../storage/useLive'
import type {
  Appointment,
  AppointmentPayment,
  BusinessProfile,
  Client,
  PaymentMethod,
  Service,
} from '../types'

interface MoneyData {
  appointments: Appointment[]
  clients: Client[]
  services: Service[]
  profile: BusinessProfile | undefined
}

const PAYMENT_METHODS: ReadonlyArray<{ value: PaymentMethod; label: string }> = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'wise', label: 'Wise' },
  { value: 'revolut', label: 'Revolut' },
]

function clientName(client: Client | undefined): string {
  return client ? `${client.firstName} ${client.lastName}` : 'Client unavailable'
}

function paymentMethodLabel(method: PaymentMethod): string {
  return PAYMENT_METHODS.find(({ value }) => value === method)?.label ?? method
}

function RevenueMeter({
  appointments,
  profile,
  nowIso,
}: {
  appointments: Appointment[]
  profile: BusinessProfile | undefined
  nowIso: string
}) {
  const revenue = calculateCurrentYearRevenue(appointments, nowIso)

  if (!profile) {
    return (
      <section className="mt-8 rounded-3xl border border-dashed border-line bg-paper/55 p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Annual revenue</p>
        <h2 className="mt-2 font-display text-2xl text-ink">Add the business profile</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          The annual target is set in Settings and is needed to draw the revenue meter.
        </p>
        <Link to="/settings" className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-accent px-4 text-sm font-bold text-accent">
          Open Settings
        </Link>
      </section>
    )
  }

  const state = revenueMeterState(revenue, profile.annualRevenueTarget)
  const progress = Math.min(100, Math.max(0, state.percentage))
  const year = romeDateKey(nowIso).slice(0, 4)
  const tone = state.band === 'warning'
    ? 'border-amber-700/25 bg-amber-50/55'
    : state.band === 'over'
      ? 'border-accent/40 bg-paper'
      : 'border-line bg-paper'

  return (
    <section className={`mt-8 min-w-0 rounded-3xl border p-5 sm:p-6 ${tone}`} aria-labelledby="revenue-heading">
      <div className="min-w-0 sm:flex sm:items-end sm:justify-between sm:gap-5">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Cash received · {year}</p>
          <h2 id="revenue-heading" className="mt-2 break-words font-display text-3xl leading-tight text-ink">
            {formatEUR(state.revenue)}
          </h2>
        </div>
        <p className="mt-2 shrink-0 font-display text-2xl text-accent sm:mt-0">
          {state.percentage.toFixed(1)}%
        </p>
      </div>

      <div
        className="relative mt-5 h-4 w-full min-w-0 overflow-hidden rounded-full border border-line bg-paper"
        role="meter"
        aria-label={`${year} revenue against annual target`}
        aria-valuemin={0}
        aria-valuemax={profile.annualRevenueTarget}
        aria-valuenow={Math.min(state.revenue, profile.annualRevenueTarget)}
      >
        <span className="absolute inset-y-0 right-0 w-1/5 bg-amber-100" aria-hidden="true" />
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${state.band === 'warning' ? 'bg-amber-700/70' : 'bg-accent'}`}
          style={{ width: `${progress}%` }}
          aria-hidden="true"
        />
      </div>

      <div className="mt-5 grid min-w-0 grid-cols-1 gap-4 border-t border-line pt-4 sm:grid-cols-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Annual target</p>
          <p className="mt-1 break-words text-sm font-semibold text-ink">{formatEUR(state.target)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Headroom left</p>
          <p className="mt-1 break-words text-sm font-semibold text-ink">{formatEUR(state.headroom)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Planning band</p>
          <p className="mt-1 break-words text-sm font-semibold text-ink">
            Starts at {formatEUR(state.warningAt)}
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs leading-5 text-muted">
        Cash-basis total by payment date. The softly shaded final fifth is the 80% planning band.
        Recharged EUR 2.00 stamp duty is included for qualifying bookings because it is part of compensation.
      </p>
    </section>
  )
}

function PortionLine({ label, portion }: {
  label: string
  portion: AppointmentPaymentSummary['deposit']
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-b border-line py-3 last:border-b-0">
      <p className="min-w-0 text-sm font-bold text-ink">{label}</p>
      <p className="text-right text-sm font-bold text-accent">{formatEUR(portion.outstanding)} due</p>
      <p className="min-w-0 text-xs leading-5 text-muted">Paid {formatEUR(portion.paid)}</p>
      <p className="text-right text-xs leading-5 text-muted">of {formatEUR(portion.due)}</p>
    </div>
  )
}

function BookingRow({
  item,
  client,
  service,
  selected,
  onSelect,
}: {
  item: OutstandingAppointment<Appointment>
  client: Client | undefined
  service: Service | undefined
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full min-w-0 rounded-2xl border p-4 text-left transition-colors ${selected ? 'border-accent bg-paper' : item.overdue ? 'border-red-900/25 bg-red-50/55' : 'border-line bg-paper/65'}`}
    >
      <span className="flex min-w-0 items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block break-words font-display text-xl leading-tight text-ink">{clientName(client)}</span>
          <span className="mt-1 block break-words text-sm font-semibold leading-5 text-accent">{service?.name ?? 'Service unavailable'}</span>
        </span>
        <span className="shrink-0 text-right text-sm font-bold text-ink">{formatEUR(item.summary.totalOutstanding)}</span>
      </span>
      <span className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs font-semibold text-muted">
        <span>{item.overdue ? 'Overdue since' : 'Due'} {formatFullDate(item.dueAt)}</span>
        <span aria-hidden="true">Manage →</span>
      </span>
    </button>
  )
}

function BookingList({
  title,
  eyebrow,
  empty,
  items,
  clientsById,
  servicesById,
  selectedId,
  onSelect,
}: {
  title: string
  eyebrow: string
  empty: string
  items: OutstandingAppointment<Appointment>[]
  clientsById: Map<string, Client>
  servicesById: Map<string, Service>
  selectedId: string | undefined
  onSelect: (appointment: Appointment) => void
}) {
  return (
    <section className="min-w-0">
      <header className="flex min-w-0 items-end justify-between gap-3 border-b border-line pb-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">{eyebrow}</p>
          <h2 className="mt-1 font-display text-2xl leading-tight text-ink">{title}</h2>
        </div>
        <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full border border-line bg-paper px-2 text-sm font-bold text-accent">{items.length}</span>
      </header>
      {items.length ? (
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <BookingRow
              key={item.appointment.id}
              item={item}
              client={clientsById.get(item.appointment.clientId)}
              service={servicesById.get(item.appointment.serviceId)}
              selected={selectedId === item.appointment.id}
              onSelect={() => onSelect(item.appointment)}
            />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-6 text-muted">{empty}</p>
      )}
    </section>
  )
}

function PaymentForm({ appointment }: { appointment: Appointment }) {
  const summary = calculatePaymentSummary(appointment)
  const initialType = summary.deposit.outstanding > 0 ? 'deposit' : 'balance'
  const [type, setType] = useState<AppointmentPayment['type']>(initialType)
  const [amount, setAmount] = useState(() => String(centsToEuros(summary[initialType].outstanding)))
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer')
  const [paidOn, setPaidOn] = useState(() => romeDateKey(new Date().toISOString()))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const outstanding = summary[type].outstanding

  useEffect(() => {
    setAmount(String(centsToEuros(outstanding)))
  }, [appointment.id, outstanding, type])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const cents = parseEurosToCents(amount)
    if (cents === null || cents <= 0) {
      setError('Enter a payment greater than zero.')
      return
    }
    if (cents > outstanding) {
      setError(`This is more than the ${type} outstanding (${formatEUR(outstanding)}).`)
      return
    }

    let paidAt: string
    try {
      paidAt = romeDateKeyToUtc(paidOn)
    } catch {
      setError('Choose a valid payment date.')
      return
    }

    setSaving(true)
    try {
      await storage.appointmentPayments.add(appointment.id, { type, amount: cents, method, paidAt })
    } catch {
      setError('The payment could not be saved. Your entry is still here; try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-5 rounded-2xl border border-line bg-canvas/65 p-4">
      <h3 className="font-display text-xl text-ink">Record payment</h3>
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="payment-type">Payment part</FieldLabel>
          <SelectInput id="payment-type" value={type} onChange={(event) => setType(event.target.value as AppointmentPayment['type'])}>
            <option value="deposit">Deposit</option>
            <option value="balance">Balance</option>
          </SelectInput>
          <HelperText>{formatEUR(outstanding)} outstanding</HelperText>
        </Field>
        <Field>
          <FieldLabel htmlFor="payment-amount">Amount</FieldLabel>
          <TextInput id="payment-amount" inputMode="decimal" value={amount} onChange={(event) => { setAmount(event.target.value); setError('') }} hasError={Boolean(error)} />
          <HelperText>EUR, stored as exact cents.</HelperText>
        </Field>
        <Field>
          <FieldLabel htmlFor="payment-method">Method</FieldLabel>
          <SelectInput id="payment-method" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </SelectInput>
        </Field>
        <Field>
          <FieldLabel htmlFor="payment-date">Date received</FieldLabel>
          <TextInput id="payment-date" type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} />
          {paidOn ? <HelperText>{formatFullDate(romeDateKeyToUtc(paidOn))}</HelperText> : null}
        </Field>
      </div>
      <div className="min-h-6" aria-live="polite">{error ? <ErrorText className="mt-3">{error}</ErrorText> : null}</div>
      <button type="submit" disabled={saving || outstanding <= 0} className="mt-3 min-h-12 w-full rounded-xl bg-accent px-4 text-base font-bold text-paper disabled:opacity-50">
        {saving ? 'Saving…' : outstanding <= 0 ? `${type === 'deposit' ? 'Deposit' : 'Balance'} paid` : 'Save payment'}
      </button>
    </form>
  )
}

function PaymentHistory({ appointment }: { appointment: Appointment }) {
  const [removing, setRemoving] = useState<number>()
  const [error, setError] = useState('')
  const payments = appointment.payments
    .map((payment, index) => ({ payment, index }))
    .sort((left, right) => right.payment.paidAt.localeCompare(left.payment.paidAt))

  async function remove(index: number) {
    if (!window.confirm('Remove this payment record? This cannot be undone.')) return
    setRemoving(index)
    setError('')
    try {
      await storage.appointmentPayments.remove(appointment.id, index)
    } catch {
      setError('The payment could not be removed. Try again.')
    } finally {
      setRemoving(undefined)
    }
  }

  return (
    <section className="mt-6 border-t border-line pt-5">
      <h3 className="font-display text-xl text-ink">Payment history</h3>
      {payments.length ? (
        <div className="mt-3 space-y-2">
          {payments.map(({ payment, index }) => (
            <div key={`${payment.paidAt}-${payment.type}-${index}`} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-line bg-paper p-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-bold capitalize text-ink">{payment.type} · {formatEUR(payment.amount)}</p>
                <p className="mt-1 break-words text-xs leading-5 text-muted">{formatFullDate(payment.paidAt)} · {paymentMethodLabel(payment.method)}</p>
              </div>
              <button type="button" onClick={() => void remove(index)} disabled={removing !== undefined} className="h-11 min-w-11 rounded-xl border border-line px-3 text-sm font-bold text-muted disabled:opacity-50" aria-label={`Remove ${payment.type} payment of ${formatEUR(payment.amount)}`}>
                {removing === index ? '…' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-6 text-muted">No payments recorded yet.</p>
      )}
      <div className="min-h-6" aria-live="polite">{error ? <ErrorText className="mt-3">{error}</ErrorText> : null}</div>
    </section>
  )
}

function PaymentDetail({ appointment, client, service, onClose }: {
  appointment: Appointment
  client: Client | undefined
  service: Service | undefined
  onClose: () => void
}) {
  const summary = calculatePaymentSummary(appointment)
  const stampDuty = stampDutyForTotal(appointment.total)

  return (
    <article className="min-w-0">
      <header className="flex min-w-0 items-start justify-between gap-3 border-b border-line pb-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Booking money</p>
          <h2 className="mt-2 break-words font-display text-3xl leading-tight text-ink">{clientName(client)}</h2>
          <p className="mt-1 break-words text-sm leading-6 text-muted">{service?.name ?? 'Service unavailable'} · {formatFullDate(appointment.startAt)}</p>
        </div>
        <button type="button" onClick={onClose} className="h-11 w-11 shrink-0 rounded-full border border-line text-xl text-muted" aria-label="Close payment detail">×</button>
      </header>

      <div className="mt-3">
        <PortionLine label={`Deposit · ${appointment.depositPercent}%`} portion={summary.deposit} />
        <PortionLine label="Balance" portion={summary.balance} />
      </div>
      <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl bg-ink px-4 py-3 text-paper">
        <span className="text-sm font-semibold">Total outstanding</span>
        <strong className="break-words font-display text-xl">{formatEUR(summary.totalOutstanding)}</strong>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted">
        Balance due {formatFullDate(appointment.balanceDueAt ?? appointment.startAt)}.
        {stampDuty ? ` This booking also contributes ${formatEUR(stampDuty)} recharged stamp duty to annual revenue.` : ''}
      </p>

      <PaymentForm appointment={appointment} />
      <PaymentHistory appointment={appointment} />
      <Link to={`/calendar/${appointment.id}`} className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-accent px-4 text-sm font-bold text-accent">
        View appointment
      </Link>
    </article>
  )
}

export function Money() {
  const location = useLocation()
  const navigate = useNavigate()
  const [nowIso, setNowIso] = useState(() => new Date().toISOString())
  const data = useLive<MoneyData>(async () => {
    const [appointments, clients, services, profile] = await Promise.all([
      storage.appointments.list({ includeDeleted: true }),
      storage.clients.list({ includeDeleted: true }),
      storage.services.list({ includeDeleted: true }),
      storage.profile.get(),
    ])
    return { appointments, clients, services, profile }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNowIso(new Date().toISOString()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const selectedId = location.pathname.split('/')[2]
  const appointments = data?.appointments ?? []
  const visibleAppointments = useMemo(
    () => appointments.filter(({ deletedAt }) => deletedAt === undefined),
    [appointments],
  )
  const clientsById = useMemo(() => new Map((data?.clients ?? []).map((client) => [client.id, client])), [data?.clients])
  const servicesById = useMemo(() => new Map((data?.services ?? []).map((service) => [service.id, service])), [data?.services])
  const open = useMemo(() => outstandingAppointments(visibleAppointments, nowIso), [visibleAppointments, nowIso])
  const overdue = open.filter((item) => item.overdue)
  const upcoming = open.filter((item) => !item.overdue)
  const selected = visibleAppointments.find(({ id }) => id === selectedId)

  if (data === undefined) return <p className="text-sm text-muted" aria-busy="true">Loading money…</p>

  return (
    <div className="min-w-0">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Studio</p>
        <h1 className="mt-3 font-display text-5xl leading-none">Money</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
          A quiet view of what has arrived, what remains, and the annual threshold.
        </p>
      </header>

      <RevenueMeter appointments={appointments} profile={data.profile} nowIso={nowIso} />

      <div className="mt-10 min-w-0 lg:grid lg:grid-cols-[minmax(20rem,0.95fr)_minmax(20rem,1.05fr)] lg:items-start lg:gap-6">
        <div className="min-w-0 space-y-10">
          <BookingList title="Overdue balances" eyebrow="Needs attention" empty="Nothing overdue." items={overdue} clientsById={clientsById} servicesById={servicesById} selectedId={selectedId} onSelect={(appointment) => navigate(`/money/${appointment.id}`)} />
          <BookingList title="Outstanding" eyebrow="Soonest first" empty="No outstanding booking payments." items={upcoming} clientsById={clientsById} servicesById={servicesById} selectedId={selectedId} onSelect={(appointment) => navigate(`/money/${appointment.id}`)} />
        </div>

        {selected ? <button type="button" onClick={() => navigate('/money')} className="fixed inset-0 z-40 bg-ink/25 lg:hidden" aria-label="Close payment detail backdrop" /> : null}
        <aside className={`${selected ? 'fixed inset-x-0 bottom-0 z-50 max-h-[calc(100dvh-env(safe-area-inset-top))] overflow-y-auto rounded-t-3xl border-t border-line bg-paper pb-[calc(1.5rem+env(safe-area-inset-bottom))] pl-[calc(1.25rem+env(safe-area-inset-left))] pr-[calc(1.25rem+env(safe-area-inset-right))] pt-5 shadow-2xl' : 'hidden'} lg:sticky lg:top-6 lg:z-auto lg:block lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:rounded-3xl lg:border lg:border-line lg:bg-paper/75 lg:p-5 lg:shadow-none`}>
          {selected ? (
            <PaymentDetail appointment={selected} client={clientsById.get(selected.clientId)} service={servicesById.get(selected.serviceId)} onClose={() => navigate('/money')} />
          ) : (
            <div className="rounded-2xl border border-dashed border-line px-5 py-10 text-center">
              <p className="font-display text-2xl text-ink">Choose a booking</p>
              <p className="mt-2 text-sm leading-6 text-muted">Its deposit, balance, and payment history will stay beside the list.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
