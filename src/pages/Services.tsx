import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { ErrorText, Field, FieldLabel, HelperText } from '../components/ui/FormField'
import { PageHeader } from '../components/ui/PageHeader'
import { SelectInput } from '../components/ui/SelectInput'
import { TextArea, TextInput } from '../components/ui/TextInput'
import {
  findUnknownMergeFields,
  mergeFieldNames,
  substituteMergeFields,
  type MergeFieldValues,
} from '../lib/mergeFields'
import { formatEUR } from '../lib/money'
import { storage } from '../storage'
import { useLive } from '../storage/useLive'
import type { Service } from '../types'
import {
  SEEDED_SERVICE_INPUTS,
  cancellationTierBandLabels,
  createCancellationTierDraft,
  createDefaultServiceDraft,
  createRecallTemplateDraft,
  mergeServiceForUpdate,
  prepareServiceForSave,
  serviceToDraft,
  type RecallTemplateDraft,
  type ServiceDraft,
  type ServiceFieldErrors,
} from './serviceForm'

const SAMPLE_MERGE_VALUES: MergeFieldValues = {
  firstName: 'Sofia',
  serviceName: 'Bridal make-up',
  dateLong: '14 September 2026',
  startTime: '09:30',
  location: 'Villa Aurelia, Rome',
  balanceDue: 'EUR 450.00',
  cancellationDate: '16 June 2026',
}

interface ServiceRoute {
  kind: 'list' | 'new' | 'detail' | 'edit'
  serviceId?: string
}

function parseServiceRoute(pathname: string): ServiceRoute {
  const segments = pathname.split('/').filter(Boolean)
  if (segments[0] !== 'services' || segments.length === 1) return { kind: 'list' }
  if (segments[1] === 'new') return { kind: 'new' }

  const serviceId = segments[1]
  if (!serviceId) return { kind: 'list' }
  return segments[2] === 'edit'
    ? { kind: 'edit', serviceId }
    : { kind: 'detail', serviceId }
}

function fieldId(errorKey: string): string {
  return `service-${errorKey.replaceAll('.', '-')}`
}

interface FormSectionProps {
  title: string
  description: string
  children: ReactNode
}

function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <section className="min-w-0 rounded-3xl border border-line bg-paper/70 px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <div className="mb-6 border-b border-line pb-5">
        <h2 className="font-display text-2xl leading-tight text-ink">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p>
      </div>
      {children}
    </section>
  )
}

interface ConnectedInputProps
  extends Omit<React.ComponentProps<typeof TextInput>, 'id' | 'value' | 'onChange'> {
  field: keyof ServiceDraft
  label: string
  value: string
  errors: ServiceFieldErrors
  onValueChange: (field: keyof ServiceDraft, value: string) => void
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
  const id = fieldId(field)
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

interface ServiceEditorProps {
  initialService?: Service
  onCancel: () => void
  onSaved: (service: Service) => void
}

function ServiceEditor({ initialService, onCancel, onSaved }: ServiceEditorProps) {
  const [draft, setDraft] = useState<ServiceDraft>(() =>
    initialService ? serviceToDraft(initialService) : createDefaultServiceDraft(),
  )
  const [errors, setErrors] = useState<ServiceFieldErrors>({})
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const tierLabels = useMemo(
    () => cancellationTierBandLabels(draft.cancellationTiers),
    [draft.cancellationTiers],
  )

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

  function clearErrors(prefix: string) {
    setErrors((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([key]) => key !== prefix && !key.startsWith(`${prefix}.`)),
      )
      return Object.keys(next).length === Object.keys(current).length ? current : next
    })
  }

  function updateField(field: keyof ServiceDraft, value: string | boolean) {
    setDraft((current) => ({ ...current, [field]: value }))
    clearErrors(field)
    markChanged()
  }

  function updateTier(
    id: string,
    field: 'daysBefore' | 'retainPercent',
    value: string,
  ) {
    setDraft((current) => ({
      ...current,
      cancellationTiers: current.cancellationTiers.map((tier) =>
        tier.id === id ? { ...tier, [field]: value } : tier,
      ),
    }))
    clearErrors(`cancellationTiers.${id}.${field}`)
    markChanged()
  }

  function addTier() {
    setDraft((current) => ({
      ...current,
      cancellationTiers: [
        ...current.cancellationTiers,
        createCancellationTierDraft(),
      ],
    }))
    clearErrors('cancellationTiers')
    markChanged()
  }

  function removeTier(id: string, label: string) {
    if (!window.confirm(`Remove the cancellation tier “${label}”?`)) return
    setDraft((current) => ({
      ...current,
      cancellationTiers: current.cancellationTiers.filter((tier) => tier.id !== id),
    }))
    clearErrors(`cancellationTiers.${id}`)
    markChanged()
  }

  function updateRecall(
    id: string,
    field: keyof Omit<RecallTemplateDraft, 'id'>,
    value: string,
  ) {
    setDraft((current) => ({
      ...current,
      recallTemplates: current.recallTemplates.map((recall) =>
        recall.id === id ? { ...recall, [field]: value } : recall,
      ),
    }))
    clearErrors(`recallTemplates.${id}.${field}`)
    markChanged()
  }

  function addRecall() {
    setDraft((current) => ({
      ...current,
      recallTemplates: [...current.recallTemplates, createRecallTemplateDraft()],
    }))
    markChanged()
  }

  function appendMergeField(recallId: string, fieldName: string) {
    setDraft((current) => ({
      ...current,
      recallTemplates: current.recallTemplates.map((recall) => {
        if (recall.id !== recallId) return recall
        const separator = recall.messageTemplate === '' || /\s$/.test(recall.messageTemplate) ? '' : ' '
        return {
          ...recall,
          messageTemplate: `${recall.messageTemplate}${separator}{${fieldName}}`,
        }
      }),
    }))
    clearErrors(`recallTemplates.${recallId}.messageTemplate`)
    markChanged()
  }

  function removeRecall(id: string, index: number) {
    if (!window.confirm(`Remove recall template ${index + 1}?`)) return
    setDraft((current) => ({
      ...current,
      recallTemplates: current.recallTemplates.filter((recall) => recall.id !== id),
    }))
    clearErrors(`recallTemplates.${id}`)
    markChanged()
  }

  function cancel() {
    if (isDirty && !window.confirm('Discard the changes on this service?')) return
    onCancel()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = prepareServiceForSave(draft)
    setErrors(result.errors)
    setSaveError('')

    if (!result.service) {
      const firstError = Object.keys(result.errors)[0]
      if (firstError) document.getElementById(fieldId(firstError))?.focus()
      return
    }

    if (
      initialService?.active &&
      !result.service.active &&
      !window.confirm(
        `Deactivate “${initialService.name}”? It will be hidden from future booking selection but kept for existing records.`,
      )
    ) {
      return
    }

    setIsSaving(true)
    try {
      const saved = initialService
        ? await storage.services.put(mergeServiceForUpdate(initialService, result.service))
        : await storage.services.create(result.service)
      setIsDirty(false)
      onSaved(saved)
    } catch {
      setSaveError('The service could not be saved. Your changes are still here; try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="mx-auto min-w-0 max-w-3xl">
      <PageHeader
        eyebrow={initialService ? 'Edit service' : 'New service'}
        title={initialService ? initialService.name : 'Service details'}
        subtitle={<><span className="font-semibold text-accent" aria-hidden="true">*</span>{' '}Required field</>}
      />

      <form className="min-w-0 space-y-6" noValidate onSubmit={handleSubmit}>
        <FormSection
          title="Service"
          description="The catalogue description and working time used when preparing a booking."
        >
          <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2">
            <ConnectedInput
              field="name"
              label="Name"
              value={draft.name}
              errors={errors}
              onValueChange={updateField}
              autoComplete="off"
              enterKeyHint="next"
              required
            />
            <ConnectedInput
              field="durationMinutes"
              label="Duration (minutes)"
              value={draft.durationMinutes}
              errors={errors}
              onValueChange={updateField}
              inputMode="numeric"
              pattern="[0-9]*"
              enterKeyHint="next"
              required
            />
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="service-description" required>Description</FieldLabel>
              <TextArea
                id="service-description"
                rows={4}
                value={draft.description}
                onChange={(event) => updateField('description', event.target.value)}
                hasError={Boolean(errors.description)}
                aria-describedby={errors.description ? 'service-description-error' : undefined}
                required
              />
              {errors.description ? (
                <ErrorText id="service-description-error">{errors.description}</ErrorText>
              ) : null}
            </Field>
          </div>
        </FormSection>

        <FormSection
          title="Pricing"
          description="Enter prices in euros."
        >
          <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2">
            <ConnectedInput
              field="basePriceEuros"
              label="Base price (EUR)"
              value={draft.basePriceEuros}
              errors={errors}
              onValueChange={updateField}
              inputMode="decimal"
              placeholder="450.00"
              required
            />
            <ConnectedInput
              field="perPersonPriceEuros"
              label="Per-person price (EUR)"
              value={draft.perPersonPriceEuros}
              errors={errors}
              onValueChange={updateField}
              inputMode="decimal"
              helper="Optional — for bridesmaids, family or guests."
            />
            <ConnectedInput
              field="travelFeePerKmEuros"
              label="Travel fee per km (EUR)"
              value={draft.travelFeePerKmEuros}
              errors={errors}
              onValueChange={updateField}
              inputMode="decimal"
              helper="Optional"
            />
            <ConnectedInput
              field="travelFeeFlatEuros"
              label="Flat travel fee (EUR)"
              value={draft.travelFeeFlatEuros}
              errors={errors}
              onValueChange={updateField}
              inputMode="decimal"
              helper="Optional"
            />
          </div>
        </FormSection>

        <FormSection
          title="Booking defaults"
          description="Starting values for future bookings. Each booking can still use a different deposit percentage."
        >
          <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2">
            <ConnectedInput
              field="defaultDepositPercent"
              label="Default deposit percentage"
              value={draft.defaultDepositPercent}
              errors={errors}
              onValueChange={updateField}
              inputMode="decimal"
              helper="A number from 0 to 100."
              required
            />
            <ConnectedInput
              field="contractTemplateId"
              label="Contract wording"
              value={draft.contractTemplateId}
              errors={errors}
              onValueChange={updateField}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              helper="Used to choose the matching contract wording for this service."
              required
            />
          </div>
          <div className="mt-5 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="rounded-2xl border border-line bg-canvas/50 px-4 py-3 text-sm font-semibold text-ink">
              <input
                type="checkbox"
                checked={draft.requiresTrial}
                onChange={(event) => updateField('requiresTrial', event.target.checked)}
              />
              <span className="min-w-0">
                <span className="block">Trial required</span>
                <span className="mt-1 block font-normal leading-5 text-muted">A trial is a styling rehearsal.</span>
              </span>
            </label>
            <label className="rounded-2xl border border-line bg-canvas/50 px-4 py-3 text-sm font-semibold text-ink">
              <input
                type="checkbox"
                checked={draft.requiresPatchTest}
                onChange={(event) => updateField('requiresPatchTest', event.target.checked)}
              />
              <span className="min-w-0">
                <span className="block">Patch test required</span>
                <span className="mt-1 block font-normal leading-5 text-muted">A patch test is a safety check, separate from a styling trial.</span>
              </span>
            </label>
            <label className="rounded-2xl border border-line bg-canvas/50 px-4 py-3 text-sm font-semibold text-ink sm:col-span-2">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(event) => updateField('active', event.target.checked)}
              />
              Available for future bookings
            </label>
          </div>
        </FormSection>

        <FormSection
          title="Cancellation ladder"
          description="A row applies when the client cancels with at least that much notice. The longest notice she still meets is the one that counts."
        >
          {errors.cancellationTiers ? (
            <ErrorText id="service-cancellationTiers" className="mb-4" tabIndex={-1}>
              {errors.cancellationTiers}
            </ErrorText>
          ) : null}
          <div className="min-w-0 space-y-4">
            {draft.cancellationTiers.map((tier, index) => {
              const daysKey = `cancellationTiers.${tier.id}.daysBefore`
              const retainKey = `cancellationTiers.${tier.id}.retainPercent`
              const daysId = fieldId(daysKey)
              const retainId = fieldId(retainKey)
              const bandLabel = tierLabels.get(tier.id) ?? `Tier ${index + 1}`

              return (
                <fieldset
                  key={tier.id}
                  className="min-w-0 rounded-2xl border border-line bg-canvas/55 p-4 md:p-5"
                >
                  <legend className="max-w-full break-words px-2 text-sm font-semibold text-muted">
                    {bandLabel}
                  </legend>
                  <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor={daysId} required>Minimum days before</FieldLabel>
                      <TextInput
                        id={daysId}
                        value={tier.daysBefore}
                        onChange={(event) => updateTier(tier.id, 'daysBefore', event.target.value)}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        hasError={Boolean(errors[daysKey])}
                        aria-describedby={errors[daysKey] ? `${daysId}-error` : undefined}
                        required
                      />
                      {errors[daysKey] ? <ErrorText id={`${daysId}-error`}>{errors[daysKey]}</ErrorText> : null}
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={retainId} required>Retain total (%)</FieldLabel>
                      <TextInput
                        id={retainId}
                        value={tier.retainPercent}
                        onChange={(event) => updateTier(tier.id, 'retainPercent', event.target.value)}
                        inputMode="decimal"
                        hasError={Boolean(errors[retainKey])}
                        aria-describedby={errors[retainKey] ? `${retainId}-error` : undefined}
                        required
                      />
                      {tier.retainPercent === '0' ? (
                        <HelperText>Deposit only; no additional penalty.</HelperText>
                      ) : null}
                      {errors[retainKey] ? <ErrorText id={`${retainId}-error`}>{errors[retainKey]}</ErrorText> : null}
                    </Field>
                  </div>
                  <button
                    type="button"
                    className="mt-4 min-h-11 w-full rounded-xl border border-line px-4 text-sm font-semibold text-muted transition-colors hover:border-accent hover:text-accent sm:w-auto"
                    onClick={() => removeTier(tier.id, bandLabel)}
                  >
                    Remove tier
                  </button>
                </fieldset>
              )
            })}
          </div>
          <button
            type="button"
            className="mt-5 min-h-12 w-full rounded-xl border border-accent px-4 text-sm font-semibold text-accent transition-colors hover:bg-accent hover:text-paper sm:w-auto"
            onClick={addTier}
          >
            Add cancellation tier
          </button>
        </FormSection>

        <FormSection
          title="Recall templates"
          description="Templates stay on this device. Nothing sends automatically; later recalls open WhatsApp or email with the message prepared."
        >
          {draft.recallTemplates.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-sm leading-6 text-muted">
              No recall templates yet. Add one for each reminder she wants to prepare.
            </p>
          ) : null}
          <div className="min-w-0 space-y-4">
            {draft.recallTemplates.map((recall, index) => {
              const daysKey = `recallTemplates.${recall.id}.daysBefore`
              const messageKey = `recallTemplates.${recall.id}.messageTemplate`
              const daysId = fieldId(daysKey)
              const channelId = fieldId(`recallTemplates.${recall.id}.channel`)
              const messageId = fieldId(messageKey)
              const unknownFields = findUnknownMergeFields(recall.messageTemplate)

              return (
                <fieldset
                  key={recall.id}
                  className="min-w-0 rounded-2xl border border-line bg-canvas/55 p-4 md:p-5"
                >
                  <legend className="px-2 text-sm font-semibold text-muted">
                    Recall {index + 1}
                  </legend>
                  <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor={daysId} required>Days before</FieldLabel>
                      <TextInput
                        id={daysId}
                        value={recall.daysBefore}
                        onChange={(event) => updateRecall(recall.id, 'daysBefore', event.target.value)}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        hasError={Boolean(errors[daysKey])}
                        aria-describedby={errors[daysKey] ? `${daysId}-error` : undefined}
                        required
                      />
                      {errors[daysKey] ? <ErrorText id={`${daysId}-error`}>{errors[daysKey]}</ErrorText> : null}
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={channelId} required>Channel</FieldLabel>
                      <SelectInput
                        id={channelId}
                        value={recall.channel}
                        onChange={(event) => updateRecall(recall.id, 'channel', event.target.value)}
                        required
                      >
                        <option value="whatsapp">WhatsApp</option>
                        <option value="email">Email</option>
                      </SelectInput>
                    </Field>
                  </div>

                  <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(13rem,0.7fr)]">
                    <Field>
                      <FieldLabel htmlFor={messageId} required>Message template</FieldLabel>
                      <TextArea
                        id={messageId}
                        rows={6}
                        value={recall.messageTemplate}
                        onChange={(event) => updateRecall(recall.id, 'messageTemplate', event.target.value)}
                        hasError={Boolean(errors[messageKey])}
                        aria-describedby={
                          [
                            errors[messageKey] ? `${messageId}-error` : '',
                            unknownFields.length > 0 ? `${messageId}-warning` : '',
                          ].filter(Boolean).join(' ') || undefined
                        }
                        required
                      />
                      {errors[messageKey] ? <ErrorText id={`${messageId}-error`}>{errors[messageKey]}</ErrorText> : null}
                      {unknownFields.length > 0 ? (
                        <p id={`${messageId}-warning`} className="text-sm font-medium leading-5 text-warning-text" role="status">
                          Unknown {unknownFields.length === 1 ? 'field' : 'fields'}: {unknownFields.map((name) => `{${name}}`).join(', ')}. It will remain unchanged in the client message.
                        </p>
                      ) : null}
                    </Field>

                    <aside className="min-w-0 rounded-2xl border border-line bg-paper/75 p-4">
                      <p className="text-sm font-semibold text-ink">Details you can insert</p>
                      <p className="mt-1 text-sm leading-5 text-muted">Tap one to add it to the message.</p>
                      <div className="mt-3 flex min-w-0 flex-wrap gap-2">
                        {mergeFieldNames.map((name) => (
                          <button
                            key={name}
                            type="button"
                            className="min-h-11 max-w-full break-all rounded-xl border border-line bg-canvas px-3 py-2 text-left font-mono text-sm text-accent"
                            onClick={() => appendMergeField(recall.id, name)}
                          >
                            {`{${name}}`}
                          </button>
                        ))}
                      </div>
                    </aside>
                  </div>

                  <div className="mt-4 min-w-0 rounded-2xl border border-line bg-paper/75 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Message preview</p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink">
                      {recall.messageTemplate
                        ? substituteMergeFields(recall.messageTemplate, SAMPLE_MERGE_VALUES)
                        : 'Your preview will appear here.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="mt-4 min-h-11 w-full rounded-xl border border-line px-4 text-sm font-semibold text-muted transition-colors hover:border-accent hover:text-accent sm:w-auto"
                    onClick={() => removeRecall(recall.id, index)}
                  >
                    Remove recall
                  </button>
                </fieldset>
              )
            })}
          </div>
          <button
            type="button"
            className="mt-5 min-h-12 w-full rounded-xl border border-accent px-4 text-sm font-semibold text-accent transition-colors hover:bg-accent hover:text-paper sm:w-auto"
            onClick={addRecall}
          >
            Add recall template
          </button>
        </FormSection>

        <div className="border-t border-line pb-2 pt-6 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div className="min-h-11" aria-live="polite">
            {saveError ? <p className="text-sm font-semibold leading-6 text-danger-text">{saveError}</p> : null}
          </div>
          <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 sm:flex">
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
              {isSaving ? 'Saving…' : initialService ? 'Save changes' : 'Create service'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function ServiceDetail({
  service,
  onToggleActive,
}: {
  service: Service
  onToggleActive: () => Promise<void>
}) {
  const [isChangingActive, setIsChangingActive] = useState(false)
  const [statusError, setStatusError] = useState('')

  async function changeActiveStatus() {
    setIsChangingActive(true)
    setStatusError('')
    try {
      await onToggleActive()
    } catch {
      setStatusError('The service status could not be changed. Try again.')
    } finally {
      setIsChangingActive(false)
    }
  }

  return (
    <article className="mx-auto min-w-0 max-w-3xl">
      <PageHeader
        eyebrow="Service"
        title={service.name}
        subtitle={<span className="inline-flex rounded-full border border-line bg-paper px-3 py-1 text-sm font-semibold text-muted">{service.active ? 'Active' : 'Inactive'}</span>}
        bordered
        spacing="none"
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/services/${service.id}/edit`}
              className="inline-flex min-h-11 items-center rounded-xl border border-accent px-4 text-sm font-semibold text-accent"
            >
              Edit
            </Link>
            <button
              type="button"
              onClick={() => void changeActiveStatus()}
              className={`min-h-11 rounded-xl px-4 text-sm font-semibold ${
                service.active ? 'border border-line text-muted' : 'bg-accent text-paper'
              }`}
              disabled={isChangingActive}
            >
              {isChangingActive ? 'Saving…' : service.active ? 'Deactivate' : 'Reactivate'}
            </button>
          </div>
        }
      />
      {statusError ? (
        <p className="mt-3 text-sm font-semibold text-danger-text" role="status">
          {statusError}
        </p>
      ) : null}

      <section className="mt-6 min-w-0 rounded-3xl border border-line bg-paper/70 p-5 md:p-6">
        <h2 className="font-display text-2xl text-ink">Catalogue details</h2>
        <p className="mt-3 whitespace-pre-wrap break-words text-base leading-7 text-muted">{service.description}</p>
        <dl className="mt-5 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            ['Duration', `${service.durationMinutes} minutes`],
            ['Base price', formatEUR(service.basePrice)],
            ['Per-person price', service.perPersonPrice === undefined ? 'Not set' : formatEUR(service.perPersonPrice)],
            ['Travel per km', service.travelFeePerKm === undefined ? 'Not set' : formatEUR(service.travelFeePerKm)],
            ['Flat travel fee', service.travelFeeFlat === undefined ? 'Not set' : formatEUR(service.travelFeeFlat)],
            ['Default deposit', `${service.defaultDepositPercent}%`],
            ['Requires trial', service.requiresTrial ? 'Yes' : 'No'],
            ['Requires patch test', service.requiresPatchTest ? 'Yes' : 'No'],
            ['Contract wording', service.contractTemplateId],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0 border-b border-line pb-3">
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{label}</dt>
              <dd className="mt-1 break-words text-base text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-6 min-w-0 rounded-3xl border border-line bg-paper/70 p-5 md:p-6">
        <h2 className="font-display text-2xl text-ink">Cancellation ladder</h2>
        <p className="mt-2 text-sm leading-6 text-muted">The longest notice the client still meets is the one that applies.</p>
        <div className="mt-4 space-y-3">
          {service.cancellationTiers.map((tier) => (
            <div key={tier.daysBefore} className="min-w-0 rounded-2xl border border-line bg-canvas/55 px-4 py-3 sm:flex sm:items-center sm:justify-between sm:gap-4">
              <p className="text-sm font-semibold text-ink">At least {tier.daysBefore} days before</p>
              <p className="mt-1 text-sm text-muted sm:mt-0">
                {tier.retainPercent === 0 ? 'Deposit only' : `Retain ${tier.retainPercent}% of total`}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 min-w-0 rounded-3xl border border-line bg-paper/70 p-5 md:p-6">
        <h2 className="font-display text-2xl text-ink">Recall templates</h2>
        {service.recallTemplates.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No recall templates.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {service.recallTemplates.map((recall, index) => (
              <div key={`${recall.daysBefore}-${recall.channel}-${index}`} className="min-w-0 rounded-2xl border border-line bg-canvas/55 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  {recall.daysBefore} days before · {recall.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}
                </p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink">{recall.messageTemplate}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </article>
  )
}

function ServiceList({ services, onSeed }: { services: Service[] | undefined; onSeed: () => Promise<void> }) {
  const [isSeeding, setIsSeeding] = useState(false)
  const [seedError, setSeedError] = useState('')
  const active = services?.filter((service) => service.active) ?? []
  const inactive = services?.filter((service) => !service.active) ?? []

  async function seed() {
    setIsSeeding(true)
    setSeedError('')
    try {
      await onSeed()
    } catch {
      setSeedError('The starter services could not be added. Nothing was removed; try again.')
    } finally {
      setIsSeeding(false)
    }
  }

  function cards(items: Service[]) {
    return items.map((service) => (
      <Link
        key={service.id}
        to={`/services/${service.id}`}
        className="flex min-h-20 min-w-0 items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-4 py-3 transition-colors hover:border-accent"
      >
        <span className="min-w-0">
          <span className="block break-words text-base font-semibold text-ink">{service.name}</span>
          <span className="mt-1 block text-sm text-muted">{service.durationMinutes} min · {formatEUR(service.basePrice)}</span>
        </span>
        <span className="shrink-0 text-lg text-accent" aria-hidden="true">→</span>
      </Link>
    ))
  }

  return (
    <div className="mx-auto min-w-0 max-w-3xl">
      <PageHeader
        eyebrow="Catalogue"
        title="Services catalogue"
        subtitle="Prices, cancellation terms and client recall messages."
        subtitleClassName="md:text-base md:leading-7"
        action={<Link to="/services/new" className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-paper md:min-h-12 md:px-5 md:text-base">Add service</Link>}
      />

      {services === undefined ? (
        <p className="rounded-3xl border border-dashed border-line px-5 py-12 text-center text-sm text-muted" aria-busy="true">Loading services…</p>
      ) : services.length === 0 ? (
        <section className="rounded-3xl border border-line bg-paper/70 p-5 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Empty catalogue</p>
          <h2 className="mt-2 font-display text-3xl text-ink">Start from a small bridal set</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">Adds Bridal make-up, Bridal trial, Bridesmaid / guest make-up and Editorial. You can edit or deactivate every record afterwards. Nothing is added until you tap below.</p>
          <button type="button" className="mt-5 min-h-12 w-full rounded-xl border border-accent px-5 text-base font-semibold text-accent disabled:cursor-wait disabled:opacity-60 sm:w-auto" onClick={() => void seed()} disabled={isSeeding}>
            {isSeeding ? 'Adding starter services…' : 'Add starter services'}
          </button>
          {seedError ? <p className="mt-3 text-sm font-semibold text-danger-text" role="status">{seedError}</p> : null}
        </section>
      ) : (
        <div className="space-y-8">
          <section>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="font-display text-2xl text-ink">Active</h2>
              <p className="text-sm text-muted">{active.length}</p>
            </div>
            <div className="space-y-2">{active.length > 0 ? cards(active) : <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-sm text-muted">No active services.</p>}</div>
          </section>
          <section>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="font-display text-2xl text-ink">Inactive</h2>
              <p className="text-sm text-muted">{inactive.length}</p>
            </div>
            <p className="mb-3 text-sm leading-6 text-muted">Kept for existing records, hidden from future selection.</p>
            <div className="space-y-2">{inactive.length > 0 ? cards(inactive) : <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-sm text-muted">No inactive services.</p>}</div>
          </section>
        </div>
      )}
    </div>
  )
}

export function Services() {
  const location = useLocation()
  const navigate = useNavigate()
  const route = useMemo(() => parseServiceRoute(location.pathname), [location.pathname])
  const services = useLive(() => storage.services.list({ orderBy: 'name' }))
  const selectedState = useLive(
    async () => ({
      service: route.serviceId ? await storage.services.get(route.serviceId) : undefined,
    }),
    [route.serviceId],
  )
  const selectedService = selectedState?.service

  async function seedServices() {
    await storage.transaction(async (adapter) => {
      const current = await adapter.services.list({ includeDeleted: true })
      if (current.length > 0) return
      for (const service of SEEDED_SERVICE_INPUTS) {
        await adapter.services.create(service)
      }
    })
  }

  async function toggleActive() {
    if (!selectedService) return
    if (selectedService.active) {
      const confirmed = window.confirm(`Deactivate “${selectedService.name}”? It will be hidden from future booking selection but kept for existing records.`)
      if (!confirmed) return
    }
    await storage.services.put({ ...selectedService, active: !selectedService.active })
  }

  if (route.kind === 'list') {
    return <ServiceList services={services} onSeed={seedServices} />
  }

  return (
    <div className="min-w-0">
      <div className="mb-6">
        <button type="button" className="min-h-11 rounded-xl border border-line bg-paper px-4 text-sm font-semibold text-muted" onClick={() => navigate('/services')}>
          ← Back to services
        </button>
      </div>

      {route.kind === 'new' ? (
        <ServiceEditor
          key="new-service"
          onCancel={() => navigate('/services')}
          onSaved={(service) => navigate(`/services/${service.id}`, { replace: true })}
        />
      ) : route.kind === 'edit' && selectedService ? (
        <ServiceEditor
          key={selectedService.id}
          initialService={selectedService}
          onCancel={() => navigate(`/services/${selectedService.id}`)}
          onSaved={(service) => navigate(`/services/${service.id}`, { replace: true })}
        />
      ) : route.serviceId && selectedState === undefined ? (
        <p className="text-sm text-muted" aria-busy="true">Loading service…</p>
      ) : route.serviceId && !selectedService ? (
        <div className="rounded-3xl border border-dashed border-line px-6 py-8 text-left md:py-12">
          <PageHeader eyebrow="Catalogue" title="Service not found" subtitle="This service may have been removed." spacing="none" />
        </div>
      ) : selectedService ? (
        <ServiceDetail service={selectedService} onToggleActive={toggleActive} />
      ) : null}
    </div>
  )
}
