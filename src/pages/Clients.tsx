import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { ErrorText, Field, FieldLabel, HelperText } from '../components/ui/FormField'
import { PageHeader } from '../components/ui/PageHeader'
import { TextArea, TextInput } from '../components/ui/TextInput'
import { formatClientLocalTime, formatFullDate } from '../lib/dates'
import { storage } from '../storage'
import { useLive } from '../storage/useLive'
import type { Client } from '../types'
import {
  clientToDraft,
  createDefaultClientDraft,
  filterClients,
  getSupportedTimeZones,
  isValidIanaTimeZone,
  mergeClientForUpdate,
  prepareClientForSave,
  type ClientDraft,
  type ClientFieldErrors,
  type ClientImageReleaseLevel,
} from './clientForm'

const IMAGE_RELEASE_OPTIONS: ReadonlyArray<{
  value: Exclude<ClientImageReleaseLevel, ''>
  title: string
  description: string
}> = [
  {
    value: 'none',
    title: 'No image use',
    description: 'No permission to use images in a portfolio, website or publication.',
  },
  {
    value: 'private_portfolio',
    title: 'Private portfolio only',
    description:
      'Images may be shown privately to prospective clients, but may not be posted publicly.',
  },
  {
    value: 'social_media',
    title: 'Public portfolio and social media',
    description:
      'Identifiable images may be published on the artist’s website, portfolio and social channels.',
  },
  {
    value: 'face_obscured',
    title: 'Public use with face obscured',
    description:
      'Images may be published only when the client’s face and identity are not recognisable.',
  },
]

interface ClientRoute {
  kind: 'list' | 'new' | 'detail' | 'edit'
  clientId?: string
}

function parseClientRoute(pathname: string): ClientRoute {
  const segments = pathname.split('/').filter(Boolean)
  if (segments[0] !== 'clients' || segments.length === 1) return { kind: 'list' }
  if (segments[1] === 'new') return { kind: 'new' }

  const clientId = segments[1]
  if (!clientId) return { kind: 'list' }
  return segments[2] === 'edit'
    ? { kind: 'edit', clientId }
    : { kind: 'detail', clientId }
}

function useCurrentInstant(): string {
  const [instant, setInstant] = useState(() => new Date().toISOString())

  useEffect(() => {
    const timer = window.setInterval(() => setInstant(new Date().toISOString()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  return instant
}

function longPatchTestDate(iso: string): string {
  return formatFullDate(iso, 'en', 'UTC')
}

interface FormSectionProps {
  title: string
  description: string
  children: ReactNode
  safety?: boolean
}

function FormSection({ title, description, children, safety = false }: FormSectionProps) {
  return (
    <section
      className={`min-w-0 rounded-3xl border px-4 py-6 sm:px-6 md:px-8 md:py-8 ${
        safety ? 'border-warning-line bg-warning-surface' : 'border-line bg-paper/70'
      }`}
    >
      <div className={`mb-6 border-b pb-5 ${safety ? 'border-warning-line' : 'border-line'}`}>
        <h2 className="font-display text-2xl leading-tight text-ink">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p>
      </div>
      {children}
    </section>
  )
}

interface ConnectedInputProps
  extends Omit<React.ComponentProps<typeof TextInput>, 'id' | 'value' | 'onChange'> {
  field: keyof ClientDraft
  label: string
  value: string
  errors: ClientFieldErrors
  onValueChange: (field: keyof ClientDraft, value: string) => void
  helper?: string
  required?: boolean
}

function ConnectedInput({
  field,
  label,
  value,
  errors,
  onValueChange,
  helper,
  required = false,
  ...inputProps
}: ConnectedInputProps) {
  const id = `client-${field}`
  const error = errors[field]
  const describedBy = [helper ? `${id}-help` : '', error ? `${id}-error` : '']
    .filter(Boolean)
    .join(' ')

  return (
    <Field>
      <FieldLabel htmlFor={id} required={required}>
        {label}
      </FieldLabel>
      <TextInput
        id={id}
        value={value}
        onChange={(event) => onValueChange(field, event.target.value)}
        hasError={Boolean(error)}
        aria-describedby={describedBy || undefined}
        required={required}
        {...inputProps}
      />
      {helper ? <HelperText id={`${id}-help`}>{helper}</HelperText> : null}
      {error ? <ErrorText id={`${id}-error`}>{error}</ErrorText> : null}
    </Field>
  )
}

interface ClientEditorProps {
  initialClient?: Client
  onCancel: () => void
  onSaved: (client: Client) => void
}

function ClientEditor({ initialClient, onCancel, onSaved }: ClientEditorProps) {
  const [draft, setDraft] = useState<ClientDraft>(() =>
    initialClient ? clientToDraft(initialClient) : createDefaultClientDraft(),
  )
  const [errors, setErrors] = useState<ClientFieldErrors>({})
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const timeZones = useMemo(getSupportedTimeZones, [])
  const instant = useCurrentInstant()
  const timezoneIsValid = isValidIanaTimeZone(draft.timezone)
  const currentLocalTime = timezoneIsValid
    ? formatClientLocalTime(instant, draft.timezone)
    : undefined

  useEffect(() => {
    if (!isDirty) return undefined
    const warnBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [isDirty])

  function markChanged() {
    setIsDirty(true)
    setSaveError('')
  }

  function clearError(field: keyof ClientDraft) {
    setErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function updateField(field: keyof ClientDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
    clearError(field)
    markChanged()
  }

  function updatePreference(
    field: keyof ClientDraft['productPreferences'],
    value: boolean | string,
  ) {
    setDraft((current) => ({
      ...current,
      productPreferences: { ...current.productPreferences, [field]: value },
    }))
    markChanged()
  }

  function cancel() {
    if (isDirty && !window.confirm('Discard the changes on this client?')) return
    onCancel()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = prepareClientForSave(draft)
    setErrors(result.errors)
    setSaveError('')

    if (!result.client) {
      const firstError = Object.keys(result.errors)[0]
      if (firstError) document.getElementById(`client-${firstError}`)?.focus()
      return
    }

    setIsSaving(true)
    try {
      const saved = initialClient
        ? await storage.clients.put(mergeClientForUpdate(initialClient, result.client))
        : await storage.clients.create(result.client)
      setIsDirty(false)
      onSaved(saved)
    } catch {
      setSaveError('The client could not be saved. Your changes are still here; try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const patchDateLong = draft.patchTestDate
    ? longPatchTestDate(`${draft.patchTestDate}T00:00:00.000Z`)
    : undefined

  return (
    <div className="min-w-0">
      <PageHeader
        eyebrow={initialClient ? 'Edit client' : 'New client'}
        title={initialClient ? `${initialClient.firstName} ${initialClient.lastName}` : 'Client details'}
        subtitle={<><span className="font-semibold text-accent" aria-hidden="true">*</span>{' '}Required field</>}
        compactAtRail
      />

      <form className="space-y-6" noValidate onSubmit={handleSubmit}>
        <FormSection
          title="Safety first"
          description="Keep allergies visible before products, trials or appointments are discussed."
          safety
        >
          <Field>
            <FieldLabel htmlFor="client-allergies">Allergies and sensitivities</FieldLabel>
            <TextArea
              id="client-allergies"
              rows={4}
              value={draft.allergies}
              onChange={(event) => updateField('allergies', event.target.value)}
              placeholder="List known allergies, sensitivities, or write none known"
              enterKeyHint="next"
            />
            <HelperText>Do not leave a known allergy only in general notes.</HelperText>
          </Field>

          <div className="mt-5 space-y-4">
            <label className="rounded-2xl border border-warning-line bg-paper/70 px-4 py-2.5 text-sm font-semibold text-ink">
              <input
                type="checkbox"
                checked={draft.patchTestDone}
                onChange={(event) => {
                  setDraft((current) => ({
                    ...current,
                    patchTestDone: event.target.checked,
                    patchTestDate: event.target.checked ? current.patchTestDate : '',
                  }))
                  clearError('patchTestDate')
                  markChanged()
                }}
              />
              Patch test completed
            </label>
            {draft.patchTestDone ? (
              <Field>
                <FieldLabel htmlFor="client-patchTestDate">Patch-test date</FieldLabel>
                <TextInput
                  id="client-patchTestDate"
                  type="date"
                  value={draft.patchTestDate}
                  onChange={(event) => updateField('patchTestDate', event.target.value)}
                  hasError={Boolean(errors.patchTestDate)}
                  aria-describedby={
                    [patchDateLong ? 'client-patchTestDate-long' : '', errors.patchTestDate ? 'client-patchTestDate-error' : '']
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                />
                {patchDateLong ? (
                  <HelperText id="client-patchTestDate-long">{patchDateLong}</HelperText>
                ) : (
                  <HelperText>Date is optional if the exact day is not known.</HelperText>
                )}
                {errors.patchTestDate ? (
                  <ErrorText id="client-patchTestDate-error">{errors.patchTestDate}</ErrorText>
                ) : null}
              </Field>
            ) : null}
          </div>
        </FormSection>

        <FormSection title="Identity" description="Reusable contact details for returning clients.">
          <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2">
            <ConnectedInput
              field="firstName"
              label="First name"
              value={draft.firstName}
              errors={errors}
              onValueChange={updateField}
              autoComplete="given-name"
              enterKeyHint="next"
              required
            />
            <ConnectedInput
              field="lastName"
              label="Last name"
              value={draft.lastName}
              errors={errors}
              onValueChange={updateField}
              autoComplete="family-name"
              enterKeyHint="next"
              required
            />
            <ConnectedInput
              field="nationality"
              label="Nationality"
              value={draft.nationality}
              errors={errors}
              onValueChange={updateField}
              autoComplete="off"
              enterKeyHint="next"
            />
            <ConnectedInput
              field="phoneE164"
              label="International phone"
              value={draft.phoneE164}
              errors={errors}
              onValueChange={updateField}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              placeholder="+39 333 123 4567"
              helper="Include + and the country code. Spaces, dashes and brackets are removed when saved."
              required
            />
            <ConnectedInput
              field="email"
              label="Email"
              value={draft.email}
              errors={errors}
              onValueChange={updateField}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
            />

            <Field className="md:col-span-2">
              <FieldLabel htmlFor="client-timezone" required>Timezone</FieldLabel>
              <TextInput
                id="client-timezone"
                list="client-timezone-options"
                value={draft.timezone}
                onChange={(event) => updateField('timezone', event.target.value)}
                hasError={Boolean(errors.timezone)}
                aria-describedby="client-timezone-help client-timezone-error"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                required
              />
              <datalist id="client-timezone-options">
                {timeZones.map((timeZone) => <option key={timeZone} value={timeZone} />)}
              </datalist>
              <HelperText id="client-timezone-help">
                {currentLocalTime
                  ? `Client’s local time now: ${currentLocalTime}`
                  : 'Search and choose an IANA timezone, for example America/New_York.'}
              </HelperText>
              {errors.timezone ? <ErrorText id="client-timezone-error">{errors.timezone}</ErrorText> : null}
            </Field>
          </div>
        </FormSection>

        <FormSection title="Address" description="Used again when preparing client documents.">
          <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2">
            <ConnectedInput
              field="addressLine"
              label="Address line"
              value={draft.addressLine}
              errors={errors}
              onValueChange={updateField}
              autoComplete="street-address"
              enterKeyHint="next"
              className="md:col-span-2"
            />
            <ConnectedInput
              field="city"
              label="City"
              value={draft.city}
              errors={errors}
              onValueChange={updateField}
              autoComplete="address-level2"
              enterKeyHint="next"
            />
            <ConnectedInput
              field="country"
              label="Country"
              value={draft.country}
              errors={errors}
              onValueChange={updateField}
              autoComplete="country-name"
              enterKeyHint="next"
            />
          </div>
        </FormSection>

        <FormSection title="Product preferences" description="Practical product requirements to carry into future bookings.">
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
            {([
              ['halal', 'Halal products'],
              ['vegan', 'Vegan products'],
              ['crueltyFree', 'Cruelty-free products'],
            ] as const).map(([field, label]) => (
              <label key={field} className="rounded-2xl border border-line bg-canvas/50 px-4 py-2.5 text-sm font-semibold text-ink">
                <input
                  type="checkbox"
                  checked={draft.productPreferences[field]}
                  onChange={(event) => updatePreference(field, event.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>
          <Field className="mt-5">
            <FieldLabel htmlFor="client-product-other">Other product preferences</FieldLabel>
            <TextArea
              id="client-product-other"
              rows={3}
              value={draft.productPreferences.other}
              onChange={(event) => updatePreference('other', event.target.value)}
              enterKeyHint="next"
            />
          </Field>
        </FormSection>

        <FormSection title="Privacy and consent" description="These choices are carried into the client’s contract exactly as selected.">
          <fieldset id="client-imageReleaseLevel" className="min-w-0">
            <legend className="text-sm font-semibold leading-5 text-ink">
              Image release <span className="text-accent" aria-hidden="true">*</span>
            </legend>
            <div className="mt-3 grid min-w-0 grid-cols-1 gap-3">
              {IMAGE_RELEASE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`min-w-0 rounded-2xl border px-4 py-3 transition-colors ${
                    draft.imageReleaseLevel === option.value
                      ? 'border-accent bg-accent/10'
                      : 'border-line bg-canvas/45'
                  }`}
                >
                  <input
                    type="radio"
                    name="imageReleaseLevel"
                    value={option.value}
                    checked={draft.imageReleaseLevel === option.value}
                    onChange={() => {
                      setDraft((current) => ({ ...current, imageReleaseLevel: option.value }))
                      clearError('imageReleaseLevel')
                      markChanged()
                    }}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{option.title}</span>
                    <span className="mt-1 block text-sm leading-5 text-muted">{option.description}</span>
                  </span>
                </label>
              ))}
            </div>
            {errors.imageReleaseLevel ? (
              <ErrorText id="client-imageReleaseLevel-error" className="mt-2">{errors.imageReleaseLevel}</ErrorText>
            ) : null}
          </fieldset>

          <div id="client-gdprConsentAt" className="mt-6 rounded-2xl border border-line bg-canvas/55 px-4 py-3">
            <label className="text-sm font-semibold text-ink">
              <input
                type="checkbox"
                checked={Boolean(draft.gdprConsentAt)}
                onChange={(event) => {
                  updateField('gdprConsentAt', event.target.checked ? new Date().toISOString() : '')
                }}
              />
              Client has given consent for their details to be stored and used to manage their booking.
            </label>
            {draft.gdprConsentAt ? (
              <p className="mt-2 text-sm leading-5 text-muted">
                Consent recorded on {formatFullDate(draft.gdprConsentAt)}.
              </p>
            ) : null}
            {errors.gdprConsentAt ? <ErrorText className="mt-2">{errors.gdprConsentAt}</ErrorText> : null}
          </div>
        </FormSection>

        <FormSection title="Notes" description="Private working notes that do not replace allergy information.">
          <Field>
            <FieldLabel htmlFor="client-notes">Notes</FieldLabel>
            <TextArea
              id="client-notes"
              rows={5}
              value={draft.notes}
              onChange={(event) => updateField('notes', event.target.value)}
              enterKeyHint="done"
            />
          </Field>
        </FormSection>

        <div className="border-t border-line pb-2 pt-6 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div className="min-h-11" aria-live="polite">
            {saveError ? <p className="text-sm font-semibold leading-6 text-danger-text">{saveError}</p> : null}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <button
              type="button"
              className="min-h-12 rounded-xl border border-line px-5 text-base font-semibold text-muted"
              onClick={cancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-12 rounded-xl bg-accent px-6 text-base font-semibold text-paper disabled:cursor-wait disabled:opacity-60"
              disabled={isSaving}
            >
              {isSaving ? 'Saving…' : initialClient ? 'Save changes' : 'Create client'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function DetailValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border-b border-line py-4 last:border-b-0">
      <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{label}</dt>
      <dd className="mt-1.5 min-w-0 whitespace-pre-wrap break-words text-base leading-6 text-ink">
        {children || 'Not provided'}
      </dd>
    </div>
  )
}

interface ClientDetailProps {
  client: Client
  instant: string
  onArchive: () => Promise<void>
  onRestore: () => Promise<void>
}

function ClientDetail({ client, instant, onArchive, onRestore }: ClientDetailProps) {
  const release = IMAGE_RELEASE_OPTIONS.find((option) => option.value === client.imageReleaseLevel)
  const preferences = [
    client.productPreferences.halal ? 'Halal products' : '',
    client.productPreferences.vegan ? 'Vegan products' : '',
    client.productPreferences.crueltyFree ? 'Cruelty-free products' : '',
    client.productPreferences.other,
  ].filter(Boolean)

  return (
    <article className="min-w-0">
      <PageHeader
        eyebrow="Client"
        title={`${client.firstName} ${client.lastName}`}
        subtitle={client.deletedAt ? <span className="inline-flex rounded-full border border-line bg-paper px-3 py-1 text-sm font-semibold text-muted">Archived</span> : undefined}
        bordered
        spacing="none"
        compactAtRail
        action={
          <div className="flex flex-wrap gap-2">
            {!client.deletedAt ? (
              <Link
                to={`/clients/${client.id}/edit`}
                className="inline-flex min-h-11 items-center rounded-xl border border-accent px-4 text-sm font-semibold text-accent"
              >
                Edit
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => void (client.deletedAt ? onRestore() : onArchive())}
              className={`min-h-11 rounded-xl px-4 text-sm font-semibold ${
                client.deletedAt
                  ? 'bg-accent text-paper'
                  : 'border border-line text-muted'
              }`}
            >
              {client.deletedAt ? 'Restore client' : 'Archive client'}
            </button>
          </div>
        }
      />

      <section className="mt-6 rounded-3xl border border-warning-line bg-warning-surface p-5 md:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-warning-text">Safety</p>
        <h2 className="mt-2 font-display text-2xl text-ink">Allergies and sensitivities</h2>
        <p className="mt-3 whitespace-pre-wrap break-words text-base font-semibold leading-7 text-ink">
          {client.allergies || 'No allergies recorded.'}
        </p>
        <p className="mt-4 text-sm leading-6 text-muted">
          {client.patchTestDone
            ? `Patch test completed${client.patchTestDate ? ` on ${longPatchTestDate(client.patchTestDate)}` : ''}.`
            : 'Patch test not recorded as completed.'}
        </p>
      </section>

      <section className="mt-6 rounded-3xl border border-line bg-paper/70 px-5 py-2 md:px-6">
        <h2 className="sr-only">Contact and address</h2>
        <dl>
          <DetailValue label="Phone">{client.phoneE164}</DetailValue>
          <DetailValue label="Email">{client.email}</DetailValue>
          <DetailValue label="Local time">{formatClientLocalTime(instant, client.timezone)}</DetailValue>
          <DetailValue label="Timezone">{client.timezone}</DetailValue>
          <DetailValue label="Nationality">{client.nationality}</DetailValue>
          <DetailValue label="Address">{[client.addressLine, client.city, client.country].filter(Boolean).join('\n')}</DetailValue>
        </dl>
      </section>

      <section className="mt-6 rounded-3xl border border-line bg-paper/70 p-5 md:p-6">
        <h2 className="font-display text-2xl text-ink">Products and privacy</h2>
        <dl className="mt-2">
          <DetailValue label="Product preferences">{preferences.join(', ')}</DetailValue>
          <DetailValue label="Image release">
            {release ? `${release.title}. ${release.description}` : 'Not provided'}
          </DetailValue>
          <DetailValue label="GDPR consent">
            Recorded on {formatFullDate(client.gdprConsentAt)}
          </DetailValue>
        </dl>
      </section>

      <section className="mt-6 rounded-3xl border border-line bg-paper/70 p-5 md:p-6">
        <h2 className="font-display text-2xl text-ink">Notes</h2>
        <p className="mt-3 whitespace-pre-wrap break-words text-base leading-7 text-muted">
          {client.notes || 'No notes.'}
        </p>
      </section>
    </article>
  )
}

interface ClientMasterProps {
  clients: Client[] | undefined
  selectedId: string | undefined
  query: string
  showArchived: boolean
  onQueryChange: (value: string) => void
  onShowArchivedChange: (value: boolean) => void
}

function ClientMaster({
  clients,
  selectedId,
  query,
  showArchived,
  onQueryChange,
  onShowArchivedChange,
}: ClientMasterProps) {
  return (
    <section className="min-w-0 lg:rounded-3xl lg:border lg:border-line lg:bg-paper/55 lg:p-5">
      <PageHeader
        eyebrow="Studio"
        title="Clients"
        subtitle="Client details ready for future bookings."
        compactAtRail
        action={<Link
            to="/clients/new"
            className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-paper"
          >
            Add client
          </Link>}
      />

      <Field>
        <FieldLabel htmlFor="client-search">Search clients</FieldLabel>
        <TextInput
          id="client-search"
          type="search"
          inputMode="search"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Name, phone or email"
        />
      </Field>

      <label className="mt-3 px-1 py-1 text-sm font-semibold text-muted">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(event) => onShowArchivedChange(event.target.checked)}
        />
        Show archived
      </label>

      <div className="mt-5 space-y-2" aria-live="polite">
        {clients === undefined ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">Loading clients…</p>
        ) : clients.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm leading-6 text-muted">
            {query ? 'No clients match this search.' : showArchived ? 'No clients saved yet.' : 'No active clients yet.'}
          </p>
        ) : (
          clients.map((client) => (
            <Link
              key={client.id}
              to={`/clients/${client.id}`}
              aria-current={selectedId === client.id ? 'page' : undefined}
              className={`flex min-h-16 min-w-0 items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                selectedId === client.id
                  ? 'border-accent bg-accent/10'
                  : 'border-line bg-paper hover:border-accent'
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-base font-semibold text-ink">{client.firstName} {client.lastName}</span>
                <span className="mt-0.5 block truncate text-sm text-muted">{client.email || client.phoneE164}</span>
              </span>
              {client.deletedAt ? <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">Archived</span> : null}
            </Link>
          ))
        )}
      </div>
    </section>
  )
}

export function Clients() {
  const location = useLocation()
  const navigate = useNavigate()
  const route = useMemo(() => parseClientRoute(location.pathname), [location.pathname])
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const allClients = useLive(
    () => storage.clients.list({ includeDeleted: showArchived }),
    [showArchived],
  )
  const selectedState = useLive(
    async () => ({
      client: route.clientId ? await storage.clients.get(route.clientId) : undefined,
    }),
    [route.clientId],
  )
  const instant = useCurrentInstant()

  const visibleClients = useMemo(() => {
    if (!allClients) return undefined
    return filterClients(allClients, query).sort((left, right) => {
      const byLastName = left.lastName.localeCompare(right.lastName, 'en', { sensitivity: 'base' })
      return byLastName || left.firstName.localeCompare(right.firstName, 'en', { sensitivity: 'base' })
    })
  }, [allClients, query])

  const selectedClient = selectedState?.client
  const showMasterOnMobile = route.kind === 'list'

  function goBackToList() {
    navigate('/clients')
  }

  async function archiveSelected() {
    if (!selectedClient) return
    const confirmed = window.confirm(
      `Archive ${selectedClient.firstName} ${selectedClient.lastName}? The client will leave the active list and can be restored later.`,
    )
    if (!confirmed) return
    await storage.clients.softDelete(selectedClient.id)
    navigate('/clients')
  }

  async function restoreSelected() {
    if (!selectedClient) return
    await storage.clients.restore(selectedClient.id)
    setShowArchived(true)
  }

  return (
    <div className="min-w-0 lg:grid lg:grid-cols-[minmax(17rem,20rem)_minmax(0,1fr)] lg:items-start lg:gap-7">
      <div className={showMasterOnMobile ? 'block' : 'hidden lg:block'}>
        <ClientMaster
          clients={visibleClients}
          selectedId={route.clientId}
          query={query}
          showArchived={showArchived}
          onQueryChange={setQuery}
          onShowArchivedChange={(value) => {
            setShowArchived(value)
            if (!value && selectedClient?.deletedAt) navigate('/clients')
          }}
        />
      </div>

      <div className={showMasterOnMobile ? 'hidden lg:block' : 'block'}>
        <div className="mb-6 lg:hidden">
          <button
            type="button"
            className="min-h-11 rounded-xl border border-line bg-paper px-4 text-sm font-semibold text-muted"
            onClick={goBackToList}
          >
            ← Back to clients
          </button>
        </div>

        {route.kind === 'new' ? (
          <ClientEditor
            key="new-client"
            onCancel={goBackToList}
            onSaved={(client) => navigate(`/clients/${client.id}`, { replace: true })}
          />
        ) : route.kind === 'edit' && selectedClient ? (
          <ClientEditor
            key={selectedClient.id}
            initialClient={selectedClient}
            onCancel={() => navigate(`/clients/${selectedClient.id}`)}
            onSaved={(client) => navigate(`/clients/${client.id}`, { replace: true })}
          />
        ) : route.clientId && selectedState === undefined ? (
          <p className="text-sm text-muted" aria-busy="true">Loading client…</p>
        ) : route.clientId && !selectedClient ? (
          <div className="rounded-3xl border border-dashed border-line px-6 py-8 text-left md:py-12">
            <PageHeader eyebrow="Clients" title="Client not found" subtitle="This client may have been archived or removed." spacing="none" />
          </div>
        ) : selectedClient ? (
          <ClientDetail
            client={selectedClient}
            instant={instant}
            onArchive={archiveSelected}
            onRestore={restoreSelected}
          />
        ) : (
          <div className="rounded-3xl border border-dashed border-line px-6 py-16 text-center">
            <p className="font-display text-3xl text-ink">Select a client</p>
            <p className="mt-2 text-sm leading-6 text-muted">Their safety notes and details will appear here.</p>
          </div>
        )}
      </div>
    </div>
  )
}
