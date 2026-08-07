import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { BackupStatusLine } from '../components/BackupReminder'
import {
  ErrorText,
  Field,
  FieldLabel,
  HelperText,
} from '../components/ui/FormField'
import { SelectInput } from '../components/ui/SelectInput'
import { PageHeader } from '../components/ui/PageHeader'
import { TextArea, TextInput } from '../components/ui/TextInput'
import { storage } from '../storage'
import { useLive } from '../storage/useLive'
import type { StampDutyDeadline } from '../types'
import {
  createDefaultProfileDraft,
  formatDeadlineDate,
  prepareProfileForSave,
  profileToDraft,
  readProfileState,
  type BusinessProfileDraft,
  type ProfileFieldErrors,
} from './settingsForm'

interface FormSectionProps {
  title: string
  description: string
  children: ReactNode
}

function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <section className="rounded-3xl border border-line bg-paper/70 px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <div className="mb-6 border-b border-line pb-5">
        <h2 className="font-display text-2xl leading-tight text-ink">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p>
      </div>
      {children}
    </section>
  )
}

interface ConnectedTextInputProps
  extends Omit<React.ComponentProps<typeof TextInput>, 'id' | 'value' | 'onChange'> {
  field: keyof BusinessProfileDraft
  label: string
  value: string
  errors: ProfileFieldErrors
  onValueChange: (field: keyof BusinessProfileDraft, value: string) => void
  helper?: string
  required?: boolean
}

function ConnectedTextInput({
  field,
  label,
  value,
  errors,
  onValueChange,
  helper,
  required = true,
  ...inputProps
}: ConnectedTextInputProps) {
  const id = `profile-${field}`
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

function newDeadline(): StampDutyDeadline {
  const id =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `deadline-${Date.now()}-${Math.random().toString(16).slice(2)}`
  return { id, label: '', dueOn: '' }
}

export function Settings() {
  const profileState = useLive(() => readProfileState(() => storage.profile.get()))
  const savedProfile = profileState?.profile
  const [draft, setDraft] = useState<BusinessProfileDraft>(() =>
    createDefaultProfileDraft(),
  )
  const [isHydrated, setIsHydrated] = useState(false)
  const [errors, setErrors] = useState<ProfileFieldErrors>({})
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const loadedUpdatedAt = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (profileState === undefined) return

    if (!isHydrated) {
      if (savedProfile) {
        setDraft(profileToDraft(savedProfile))
        loadedUpdatedAt.current = savedProfile.updatedAt
      }
      setIsHydrated(true)
      return
    }

    if (
      savedProfile &&
      savedProfile.updatedAt !== loadedUpdatedAt.current &&
      !isDirty
    ) {
      setDraft(profileToDraft(savedProfile))
      loadedUpdatedAt.current = savedProfile.updatedAt
    }
  }, [isDirty, isHydrated, profileState, savedProfile])

  useEffect(() => {
    if (!isDirty) return undefined

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [isDirty])

  function markChanged() {
    setIsDirty(true)
    setSaveMessage('')
  }

  function updateField(field: keyof BusinessProfileDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
    markChanged()
  }

  function updateDeadline(id: string, field: 'label' | 'dueOn', value: string) {
    setDraft((current) => ({
      ...current,
      stampDutyDeadlines: current.stampDutyDeadlines.map((deadline) =>
        deadline.id === id ? { ...deadline, [field]: value } : deadline,
      ),
    }))
    const errorKey = `stampDutyDeadlines.${id}.${field}`
    setErrors((current) => {
      if (!current[errorKey]) return current
      const next = { ...current }
      delete next[errorKey]
      return next
    })
    markChanged()
  }

  function removeDeadline(id: string) {
    setDraft((current) => ({
      ...current,
      stampDutyDeadlines: current.stampDutyDeadlines.filter(
        (deadline) => deadline.id !== id,
      ),
    }))
    setErrors((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => !key.startsWith(`stampDutyDeadlines.${id}.`)),
      ),
    )
    markChanged()
  }

  function addDeadline() {
    setDraft((current) => ({
      ...current,
      stampDutyDeadlines: [...current.stampDutyDeadlines, newDeadline()],
    }))
    markChanged()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = prepareProfileForSave(draft)
    setErrors(result.errors)
    setSaveMessage('')

    if (!result.profile) {
      const firstError = Object.keys(result.errors)[0]
      const element = firstError
        ? document.getElementById(
            firstError.startsWith('stampDutyDeadlines.')
              ? firstError.replaceAll('.', '-')
              : `profile-${firstError}`,
          )
        : null
      element?.focus()
      return
    }

    setIsSaving(true)
    try {
      const saved = await storage.profile.save(result.profile)
      loadedUpdatedAt.current = saved.updatedAt
      setDraft(profileToDraft(saved))
      setIsDirty(false)
      setSaveMessage('Business profile saved on this device.')
    } catch {
      setSaveMessage('The profile could not be saved. Your changes are still here; try again.')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isHydrated) {
    return (
      <div className="mx-auto w-full max-w-3xl" aria-busy="true">
        <PageHeader
          eyebrow="Settings"
          title="Business profile"
          subtitle="Loading your business profile…"
          subtitleClassName="md:text-base md:leading-7"
        />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        eyebrow="Settings"
        title="Business profile"
        subtitle="Details for contracts, invoices, payments and business totals."
        subtitleClassName="md:text-base md:leading-7"
        action={<p
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
              isDirty
                ? 'border-warning-line bg-warning-surface text-warning-text'
                : 'border-line bg-paper text-muted'
            }`}
            role="status"
          >
            {isDirty ? 'Unsaved changes' : savedProfile ? 'Up to date' : 'Not saved yet'}
          </p>}
        footer={<p className="mt-3 text-sm text-muted md:mt-4">
          <span className="font-semibold text-accent" aria-hidden="true">*</span>{' '}Required field
        </p>}
      />

      <section className="mb-6 rounded-3xl border border-line bg-paper/70 p-5 sm:p-6 md:mb-8">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-2xl leading-tight text-ink">Bridal timeline</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
              Work backwards from a ceremony and export a planner-ready running schedule.
            </p>
          </div>
          <Link
            to="/timeline"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-accent px-4 text-sm font-semibold text-accent sm:w-auto"
          >
            Open calculator
          </Link>
        </div>
      </section>

      <section className="mb-6 rounded-3xl border border-line bg-paper/70 p-5 sm:p-6 md:mb-8">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Data safety</p>
            <h2 className="mt-1 font-display text-2xl leading-tight text-ink">Backup &amp; restore</h2>
            <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-ink">
              Lose the phone with no backup, lose everything.
            </p>
            <BackupStatusLine />
          </div>
          <Link
            to="/backup"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-paper sm:w-auto"
          >
            Open backup
          </Link>
        </div>
      </section>

      <section className="mb-6 rounded-3xl border border-line bg-paper/70 p-5 sm:p-6 md:mb-8">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-2xl leading-tight text-ink">Services catalogue</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
              Manage prices, cancellation tiers and recall message templates.
            </p>
          </div>
          <Link
            to="/services"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-accent px-4 text-sm font-semibold text-accent sm:w-auto"
          >
            Open services
          </Link>
        </div>
      </section>

      <section className="mb-6 rounded-3xl border border-line bg-paper/70 p-5 sm:p-6 md:mb-8">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-2xl leading-tight text-ink">Issued contracts</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
              Open completed contract records and create their PDFs again at any time.
            </p>
          </div>
          <Link
            to="/settings/contracts"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-accent px-4 text-sm font-semibold text-accent sm:w-auto"
          >
            Open contracts
          </Link>
        </div>
      </section>

      <form className="space-y-6 md:space-y-8" noValidate onSubmit={handleSubmit}>
        <FormSection
          title="Identity"
          description="Your registered details. These identify the business on formal documents."
        >
          <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
            <ConnectedTextInput
              field="businessName"
              label="Business name"
              value={draft.businessName}
              errors={errors}
              onValueChange={updateField}
              autoComplete="organization"
              enterKeyHint="next"
            />

            <Field className="md:col-span-2">
              <FieldLabel htmlFor="profile-registeredAddress" required>
                Registered address
              </FieldLabel>
              <TextArea
                id="profile-registeredAddress"
                rows={3}
                value={draft.registeredAddress}
                onChange={(event) => updateField('registeredAddress', event.target.value)}
                hasError={Boolean(errors.registeredAddress)}
                aria-describedby={
                  errors.registeredAddress
                    ? 'profile-registeredAddress-help profile-registeredAddress-error'
                    : 'profile-registeredAddress-help'
                }
                autoComplete="street-address"
                enterKeyHint="next"
                required
              />
              <HelperText id="profile-registeredAddress-help">
                This is the fiscal domicile and the only business address. The activity is
                itinerant and performed at the client’s venue; the place of performance is set
                separately for each appointment.
              </HelperText>
              {errors.registeredAddress ? (
                <ErrorText id="profile-registeredAddress-error">
                  {errors.registeredAddress}
                </ErrorText>
              ) : null}
            </Field>

            <ConnectedTextInput
              field="email"
              label="Data-protection contact email"
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
              helper="The contract names this contact address for GDPR data-protection requests."
            />

            <ConnectedTextInput
              field="vatNumber"
              label="P.IVA"
              value={draft.vatNumber}
              errors={errors}
              onValueChange={updateField}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={11}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
            />
            <ConnectedTextInput
              field="taxCode"
              label="Tax code"
              value={draft.taxCode}
              errors={errors}
              onValueChange={updateField}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
            />

            <Field>
              <FieldLabel htmlFor="profile-regime" required>
                Tax regime
              </FieldLabel>
              <SelectInput
                id="profile-regime"
                value={draft.regime}
                onChange={(event) => updateField('regime', event.target.value)}
                required
              >
                <option value="forfettario">Forfettario</option>
                <option value="ordinario">Ordinario</option>
              </SelectInput>
            </Field>
            <ConnectedTextInput
              field="atecoCode"
              label="ATECO code"
              value={draft.atecoCode}
              errors={errors}
              onValueChange={updateField}
              inputMode="decimal"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
            />
          </div>
        </FormSection>

        <FormSection
          title="Numbering"
          description="The next invoice and contract numbers. Numbering has to stay unbroken, so a number is taken only when you issue the document — never by saving this page."
        >
          <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
            <ConnectedTextInput
              field="invoicePrefix"
              label="Invoice prefix"
              value={draft.invoicePrefix}
              errors={errors}
              onValueChange={updateField}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
            />
            <ConnectedTextInput
              field="nextInvoiceNumber"
              label="Next invoice number"
              value={draft.nextInvoiceNumber}
              errors={errors}
              onValueChange={updateField}
              inputMode="numeric"
              pattern="[0-9]*"
              enterKeyHint="next"
            />
            <ConnectedTextInput
              field="contractPrefix"
              label="Contract prefix"
              value={draft.contractPrefix}
              errors={errors}
              onValueChange={updateField}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
            />
            <ConnectedTextInput
              field="nextContractNumber"
              label="Next contract number"
              value={draft.nextContractNumber}
              errors={errors}
              onValueChange={updateField}
              inputMode="numeric"
              pattern="[0-9]*"
              enterKeyHint="next"
            />
          </div>
        </FormSection>

        <FormSection
          title="Payment"
          description="Details clients can use to pay by bank transfer, Wise or Revolut."
        >
          <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
            <ConnectedTextInput
              field="accountHolder"
              label="Account holder"
              value={draft.accountHolder}
              errors={errors}
              onValueChange={updateField}
              autoComplete="name"
              enterKeyHint="next"
            />
            <ConnectedTextInput
              field="bicSwift"
              label="BIC / SWIFT"
              value={draft.bicSwift}
              errors={errors}
              onValueChange={updateField}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
            />
            <ConnectedTextInput
              field="iban"
              label="IBAN"
              value={draft.iban}
              errors={errors}
              onValueChange={updateField}
              className="font-mono"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              helper="Spaces are fine while typing; they are removed and letters are uppercased when saved."
            />
            <div className="hidden md:block" aria-hidden="true" />
            <ConnectedTextInput
              field="wiseHandle"
              label="Wise handle"
              value={draft.wiseHandle}
              errors={errors}
              onValueChange={updateField}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              required={false}
              helper="Optional"
            />
            <ConnectedTextInput
              field="revolutHandle"
              label="Revolut handle"
              value={draft.revolutHandle}
              errors={errors}
              onValueChange={updateField}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              required={false}
              helper="Optional"
            />
          </div>
        </FormSection>

        <FormSection
          title="Defaults"
          description="Starting values used by later bookings and business totals; each booking can still have its own deposit percentage."
        >
          <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
            <ConnectedTextInput
              field="defaultDepositPercent"
              label="Default deposit percentage"
              value={draft.defaultDepositPercent}
              errors={errors}
              onValueChange={updateField}
              inputMode="decimal"
              enterKeyHint="next"
              helper="A number from 0 to 100."
            />
            <ConnectedTextInput
              field="annualRevenueTargetEuros"
              label="Annual revenue target (EUR)"
              value={draft.annualRevenueTargetEuros}
              errors={errors}
              onValueChange={updateField}
              inputMode="decimal"
              enterKeyHint="next"
              helper="Shown in euros."
            />
            <ConnectedTextInput
              field="courtOfJurisdiction"
              label="Court of jurisdiction"
              value={draft.courtOfJurisdiction}
              errors={errors}
              onValueChange={updateField}
              autoComplete="off"
              enterKeyHint="next"
              className="md:col-span-2"
            />
          </div>
        </FormSection>

        <FormSection
          title="Stamp-duty deadlines"
          description="Quarterly F24 payment dates used by the later stamp-duty tracker. Defaults follow the standard calendar and move weekend dates to Monday; edit them whenever the Agenzia delle Entrate calendar differs."
        >
          <div className="space-y-4">
            {draft.stampDutyDeadlines.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line px-4 py-5 text-sm leading-6 text-muted">
                No deadlines saved. Add one whenever you want it to appear in the quarterly
                tracker.
              </p>
            ) : null}

            {draft.stampDutyDeadlines.map((deadline, index) => {
              const labelKey = `stampDutyDeadlines.${deadline.id}.label`
              const dueOnKey = `stampDutyDeadlines.${deadline.id}.dueOn`
              const labelId = `stampDutyDeadlines-${deadline.id}-label`
              const dueOnId = `stampDutyDeadlines-${deadline.id}-dueOn`
              const longDate = formatDeadlineDate(deadline.dueOn)

              return (
                <fieldset
                  key={deadline.id}
                  className="min-w-0 rounded-2xl border border-line bg-canvas/55 p-4 md:p-5"
                >
                  <legend className="px-2 text-sm font-semibold text-muted">
                    Deadline {index + 1}
                  </legend>
                  <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto] md:items-start">
                    <Field>
                      <FieldLabel htmlFor={labelId} required>
                        Label
                      </FieldLabel>
                      <TextInput
                        id={labelId}
                        value={deadline.label}
                        onChange={(event) =>
                          updateDeadline(deadline.id, 'label', event.target.value)
                        }
                        hasError={Boolean(errors[labelKey])}
                        aria-describedby={errors[labelKey] ? `${labelId}-error` : undefined}
                        enterKeyHint="next"
                        required
                      />
                      {errors[labelKey] ? (
                        <ErrorText id={`${labelId}-error`}>{errors[labelKey]}</ErrorText>
                      ) : null}
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={dueOnId} required>
                        Due date
                      </FieldLabel>
                      <TextInput
                        id={dueOnId}
                        type="date"
                        value={deadline.dueOn}
                        onChange={(event) =>
                          updateDeadline(deadline.id, 'dueOn', event.target.value)
                        }
                        hasError={Boolean(errors[dueOnKey])}
                        aria-describedby={
                          [longDate ? `${dueOnId}-long` : '', errors[dueOnKey] ? `${dueOnId}-error` : '']
                            .filter(Boolean)
                            .join(' ') || undefined
                        }
                        required
                      />
                      {longDate ? <HelperText id={`${dueOnId}-long`}>{longDate}</HelperText> : null}
                      {errors[dueOnKey] ? (
                        <ErrorText id={`${dueOnId}-error`}>{errors[dueOnKey]}</ErrorText>
                      ) : null}
                    </Field>
                    <button
                      type="button"
                      className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold text-muted transition-colors hover:border-accent hover:text-accent md:mt-7"
                      onClick={() => removeDeadline(deadline.id)}
                      aria-label={`Remove ${deadline.label || `deadline ${index + 1}`}`}
                    >
                      Remove
                    </button>
                  </div>
                </fieldset>
              )
            })}
          </div>

          <button
            type="button"
            className="mt-5 min-h-11 rounded-xl border border-accent px-4 text-sm font-semibold text-accent transition-colors hover:bg-accent hover:text-paper"
            onClick={addDeadline}
          >
            Add deadline
          </button>
        </FormSection>

        <div className="border-t border-line pb-2 pt-6 md:flex md:items-center md:justify-between md:gap-6">
          <div className="min-h-11" aria-live="polite">
            {saveMessage ? (
              <p
                className={`text-sm font-semibold leading-6 ${
                  saveMessage.startsWith('Business profile saved')
                    ? 'text-success-text'
                    : 'text-danger-text'
                }`}
              >
                {saveMessage}
              </p>
            ) : (
              <p className="text-sm leading-6 text-muted">
                {isDirty ? 'Changes stay on this screen until you save.' : 'No unsaved changes.'}
              </p>
            )}
          </div>
          <button
            type="submit"
            className="mt-3 min-h-12 w-full rounded-xl bg-accent px-6 text-base font-semibold text-paper transition-colors hover:bg-ink disabled:cursor-wait disabled:opacity-60 md:mt-0 md:w-auto md:min-w-40"
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>
    </div>
  )
}
