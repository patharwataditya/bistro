import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { Info, Lock, Plus, Trash2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Controller, useFieldArray, useForm, useWatch, type FieldPath } from 'react-hook-form'
import type { ApiError } from '@/api/errors'
import { keys } from '@/api/queries'
import type { RestaurantSettings } from '@/api/types'
import { ALL_PERMISSIONS, P } from '@/auth/permissions'
import { useMe, useSession } from '@/auth/session'
import { useAction } from '@/features/common/useAction'
import { cleanMessage, Notice, SaveBar, useUnsavedGuard } from '@/features/staff/manage-kit'
import { IconButton } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { cn } from '@/ui/cn'
import { Segmented, Switch, ToggleRow } from '@/ui/Controls'
import { TextArea, TextField } from '@/ui/Field'
import { PageHeader } from '@/ui/Page'
import { ErrorState, Skeleton, StaleBanner } from '@/ui/States'
import { useToast } from '@/ui/Toast'
import { patchSettings, putTaxRates, useSettingsLive } from './api'
import { PaymentMethodsSection } from './PaymentMethods'
import { adoptsFreshData, PartialSave, saveFailureMessage, saveSettings } from './saveSettings'
import {
  acceptPercent, AFTER_PAYMENT, affectsProfile, formFieldFor, formFromSettings, isDirty, MAX_TAXES,
  ROUNDING_OPTIONS, settingsSchema, type SettingsValues, type TaxDraft,
} from './settingsForm'

const EMPTY: SettingsValues = {
  restaurant_name: '', location_name: '', address: '', timezone: '', currency_code: '', service_charge_percent: '',
  service_charge_taxable: false, rounding_increment: '0.01', bill_prefix: '', status_after_payment: 'AVAILABLE', taxes: [],
}

function timeZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return []
  }
}

export default function SettingsPage() {
  const { can, grants } = useMe()
  const { reloadProfile } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const query = useSettingsLive()
  const canEdit = can(P.SETTINGS_UPDATE)
  // The restaurant spans every location: renaming it needs every permission (server rule).
  const fullAccess = ALL_PERMISSIONS.every((p) => grants.can(p))

  const form = useForm<SettingsValues>({ resolver: zodResolver(settingsSchema), defaultValues: EMPTY, mode: 'onTouched' })
  const taxes = useFieldArray({ control: form.control, name: 'taxes', keyName: 'fieldKey' })
  const values = useWatch({ control: form.control }) as SettingsValues

  /**
   * The snapshot (and version) the current edit started from. While there are unsaved edits,
   * background refetches don't move it — a save then diffs against what the person saw, and
   * if someone else saved meanwhile the server answers STALE instead of being overwritten.
   */
  const [base, setBase] = useState<RestaurantSettings | null>(null)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const keepTaxes = useRef<TaxDraft[] | null>(null)
  const dirty = base !== null && isDirty(base, { ...EMPTY, ...values, taxes: values.taxes ?? [] })

  const save = useAction(({ start, v }: { start: RestaurantSettings; v: SettingsValues }) =>
    saveSettings(start, v, { patch: patchSettings, putTaxes: putTaxRates }), { toastError: false })
  // Save failures are shown once, inline above the form; bring that into view.
  const errorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (generalError) errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [generalError])

  // Adopt fresh server data as the baseline whenever nothing is being edited.
  if (adoptsFreshData(query.data, base, dirty, save.isPending)) setBase(query.data)

  useLayoutEffect(() => {
    if (!base) return
    const next = formFromSettings(base)
    if (keepTaxes.current) {
      next.taxes = keepTaxes.current
      keepTaxes.current = null
    }
    form.reset(next)
  }, [base, form])

  const guard = useUnsavedGuard(dirty && canEdit)

  const adopt = (s: RestaurantSettings) => {
    queryClient.setQueryData(keys.settings, s)
    setBase(s)
  }

  const placeErrors = (err: ApiError): string | null => {
    let placed = false
    const rest: string[] = []
    for (const [field, msg] of Object.entries(err.fields)) {
      const target = formFieldFor(field)
      if (target) {
        form.setError(target as FieldPath<SettingsValues>, { type: 'server', message: cleanMessage(msg) }, { shouldFocus: !placed })
        placed = true
      } else rest.push(cleanMessage(msg))
    }
    if (placed && rest.length === 0) return null
    return rest.length ? rest.join(' ') : err.message
  }

  const submitValid = (v: SettingsValues) => {
    if (!base || save.isPending || !isDirty(base, v)) return
    const start = base
    setGeneralError(null)
    save.mutate({ start, v }, {
      onSuccess: (saved) => {
        adopt(saved)
        toast.success('Settings saved')
        if (affectsProfile(start, saved)) void reloadProfile()
      },
      onError: (e) => {
        const err = e instanceof PartialSave ? e.error : e
        if (e instanceof PartialSave) {
          // The general settings landed; keep the unsaved tax rows on top of the new baseline.
          keepTaxes.current = v.taxes
          adopt(e.saved)
          if (affectsProfile(start, e.saved)) void reloadProfile()
        }
        if (err.kind === 'stale') {
          setGeneralError(saveFailureMessage(e, null))
          void query.refetch().then((r) => r.data && setBase(r.data))
          return
        }
        setGeneralError(saveFailureMessage(e, placeErrors(err)))
      },
    })
  }
  // Built inside the handler (not during render) so the ref it touches is only read on submit.
  const onSave = (e?: FormEvent) => {
    e?.preventDefault()
    void form.handleSubmit(submitValid, () => setGeneralError(null))()
  }

  const discard = () => {
    if (!base) return
    setGeneralError(null)
    form.reset(formFromSettings(base))
  }

  const zones = useMemo(() => timeZones(), [])
  const errors = form.formState.errors
  const hasErrors = Object.keys(errors).length > 0
  // View-only people get read-only (legible) fields; `disabled` is for real locks and saving.
  const readOnly = !canEdit
  const disabled = readOnly || save.isPending
  const text = { readOnly, disabled: save.isPending, 'aria-readonly': readOnly || undefined }
  const roClass = readOnly ? 'border-line bg-transparent focus:border-line' : undefined

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <PageHeader title="Restaurant settings" subtitle="Taxes, billing, payment methods" />
      {query.isPending && !base ? (
        <SettingsSkeleton />
      ) : !base ? (
        query.error ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : <SettingsSkeleton />
      ) : (
        <form onSubmit={onSave} noValidate className="flex flex-col gap-5">
          <StaleBanner error={query.isError ? query.error : null} />
          {!canEdit && (
            <Notice icon={Lock} tone="info">You can view settings but not change them. Ask a manager with settings access.</Notice>
          )}
          {generalError && <div ref={errorRef} className="scroll-mt-24"><Notice tone="danger" icon={Info} live>{generalError}</Notice></div>}

          <SettingsCard title="Restaurant" subtitle="Name, place and money">
            <TextField
              label="Restaurant name"
              maxLength={120}
              {...text}
              disabled={save.isPending || (canEdit && !fullAccess)}
              className={roClass}
              error={errors.restaurant_name?.message}
              hint={canEdit && !fullAccess ? <span className="inline-flex items-center gap-1"><Lock aria-hidden className="size-3" />Renaming the restaurant needs full access</span> : 'Shown on every location and bill'}
              {...form.register('restaurant_name')}
            />
            <TextField label="Location name" maxLength={120} {...text} className={roClass} error={errors.location_name?.message} {...form.register('location_name')} />
            <TextArea label="Address" rows={2} maxLength={300} {...text} className={roClass} error={errors.address?.message} hint="Optional. Leave empty to remove it." {...form.register('address')} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_140px]">
              <TextField
                label="Time zone"
                list="bistro-time-zones"
                autoComplete="off"
                spellCheck={false}
                {...text}
                className={roClass}
                error={errors.timezone?.message}
                hint="Sets the business day for reports and “Paid today”"
                {...form.register('timezone')}
              />
              <Controller
                control={form.control}
                name="currency_code"
                render={({ field, fieldState }) => (
                  <TextField
                    label="Currency"
                    maxLength={3}
                    autoComplete="off"
                    spellCheck={false}
                    {...text}
                    className={cn('uppercase tabular-nums', roClass)}
                    error={fieldState.error?.message}
                    hint="e.g. USD"
                    name={field.name}
                    ref={field.ref}
                    value={field.value}
                    onBlur={field.onBlur}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                  />
                )}
              />
            </div>
            <datalist id="bistro-time-zones">
              {zones.map((z) => <option key={z} value={z} />)}
            </datalist>
          </SettingsCard>

          <SettingsCard title="Billing" subtitle="How bills are calculated and numbered">
            <Controller
              control={form.control}
              name="service_charge_percent"
              render={({ field, fieldState }) => (
                <TextField
                  label="Service charge %"
                  wrapperClassName="max-w-[240px]"
                  inputMode="decimal"
                  autoComplete="off"
                  {...text}
                  className={roClass}
                  error={fieldState.error?.message}
                  hint="0 for none. Up to 2 decimals."
                  name={field.name}
                  ref={field.ref}
                  value={field.value}
                  onBlur={field.onBlur}
                  onChange={(e) => {
                    const t = e.target.value.replace(',', '.')
                    if (acceptPercent(t, 2)) field.onChange(t)
                  }}
                />
              )}
            />
            <Controller
              control={form.control}
              name="service_charge_taxable"
              render={({ field }) => (
                <ToggleRow title="Tax the service charge" subtitle="Apply taxes on top of the service charge" checked={field.value} onChange={field.onChange} disabled={disabled} />
              )}
            />
            <Controller
              control={form.control}
              name="rounding_increment"
              render={({ field }) => (
                <FieldGroup label="Round totals to" hint="The difference shows on the bill as round-off.">
                  <Segmented
                    ariaLabel="Round totals to"
                    options={ROUNDING_OPTIONS}
                    value={field.value}
                    onChange={(v) => !disabled && field.onChange(v)}
                    label={(v) => v}
                    className={cn('tabular-nums', disabled && 'pointer-events-none opacity-60')}
                  />
                </FieldGroup>
              )}
            />
            <Controller
              control={form.control}
              name="bill_prefix"
              render={({ field, fieldState }) => (
                <TextField
                  label="Bill number prefix"
                  wrapperClassName="max-w-[360px]"
                  maxLength={12}
                  autoComplete="off"
                  spellCheck={false}
                  {...text}
                  className={roClass}
                  error={fieldState.error?.message}
                  hint={`Printed before each bill number, e.g. ${field.value || 'B'}-000123`}
                  name={field.name}
                  ref={field.ref}
                  value={field.value}
                  onBlur={field.onBlur}
                  onChange={(e) => field.onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
                />
              )}
            />
            <Controller
              control={form.control}
              name="status_after_payment"
              render={({ field }) => (
                <FieldGroup label="After a bill is paid, the table is">
                  <Segmented
                    ariaLabel="After a bill is paid, the table is"
                    options={AFTER_PAYMENT}
                    value={field.value}
                    onChange={(v) => !disabled && field.onChange(v)}
                    label={(v) => (v === 'AVAILABLE' ? 'Available' : 'Cleaning')}
                    className={cn('max-w-[360px]', disabled && 'pointer-events-none opacity-60')}
                  />
                </FieldGroup>
              )}
            />
          </SettingsCard>

          <SettingsCard title="Taxes" subtitle="Applied to every new bill. Issued bills keep the rates they had.">
            {taxes.fields.length === 0 ? (
              <p className="t-support text-fg2">No taxes. Bills won't include tax.</p>
            ) : (
              <ul className="flex flex-col gap-3" aria-label="Tax rates">
                {taxes.fields.map((row, index) => {
                  const current = values.taxes?.[index]
                  const name = current?.name?.trim() || 'Tax'
                  const rowErrors = errors.taxes?.[index]
                  return (
                    <li key={row.fieldKey} className={cn(canEdit ? 'grid-cols-[1fr_112px_auto_auto]' : 'grid-cols-[1fr_112px_auto]', 'grid items-start gap-3 rounded-[var(--radius-md)] border border-line p-3')}>
                      <TextField label="Tax name" maxLength={60} {...text} className={roClass} error={rowErrors?.name?.message} placeholder="e.g. VAT" {...form.register(`taxes.${index}.name`)} />
                      <Controller
                        control={form.control}
                        name={`taxes.${index}.rate`}
                        render={({ field, fieldState }) => (
                          <TextField
                            label="Rate %"
                            inputMode="decimal"
                            autoComplete="off"
                            {...text}
                            error={fieldState.error?.message}
                            className={cn('tabular-nums', roClass)}
                            name={field.name}
                            ref={field.ref}
                            value={field.value}
                            onBlur={field.onBlur}
                            onChange={(e) => {
                              const t = e.target.value.replace(',', '.')
                              if (acceptPercent(t, 3)) field.onChange(t)
                            }}
                          />
                        )}
                      />
                      <Controller
                        control={form.control}
                        name={`taxes.${index}.active`}
                        render={({ field }) => (
                          <div className="flex flex-col items-center gap-1.5 pt-0.5">
                            <span aria-hidden className="t-meta text-fg2">{field.value ? 'Active' : 'Off'}</span>
                            <div className="flex h-12 items-center">
                              <Switch checked={field.value} onChange={field.onChange} disabled={disabled} label={`${name} charged on new bills`} />
                            </div>
                          </div>
                        )}
                      />
                      {canEdit && (
                        <div className="pt-[26px]">
                          <IconButton icon={Trash2} tone="danger" label={`Remove ${name}`} disabled={disabled} onClick={() => taxes.remove(index)} className="size-12" />
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            {errors.taxes?.message && <p role="alert" className="t-meta text-danger">{errors.taxes.message}</p>}
            {canEdit && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={disabled || taxes.fields.length >= MAX_TAXES}
                  onClick={() => taxes.append({ key: `n-${crypto.randomUUID()}`, id: null, name: '', rate: '', active: true }, { shouldFocus: true })}
                  className="t-button inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-md)] border border-line-strong bg-surface px-3.5 text-[13px] text-fg hover:bg-[var(--hover-overlay)] disabled:border-transparent disabled:bg-sunken disabled:text-fg-disabled"
                >
                  <Plus aria-hidden className="size-4" /> Add tax
                </button>
                {taxes.fields.length >= MAX_TAXES && <span className="t-meta text-fg3">Up to {MAX_TAXES} taxes.</span>}
              </div>
            )}
          </SettingsCard>

          <SettingsCard title="Payment methods" subtitle="What cashiers can take. Changes apply right away.">
            {/* Live data, not the edit snapshot: these save on their own. */}
            <PaymentMethodsSection methods={query.data?.payment_methods ?? base.payment_methods} canEdit={canEdit} />
          </SettingsCard>

          {canEdit && (
            <SaveBar
              dirty={dirty}
              saving={save.isPending}
              onSave={() => onSave()}
              onDiscard={discard}
              message={hasErrors ? 'Fix the highlighted fields' : 'Unsaved changes'}
            />
          )}
        </form>
      )}
      {guard}
    </div>
  )
}

function SettingsCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const id = `settings-${title.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <Card className="p-5 sm:p-6">
      <section aria-labelledby={id} className="flex flex-col gap-4">
        <header>
          <h2 id={id} className="t-section text-fg">{title}</h2>
          <p className="t-support mt-0.5 text-fg2">{subtitle}</p>
        </header>
        {children}
      </section>
    </Card>
  )
}

/** A labelled group for controls that aren't a single input (segmented controls). */
function FieldGroup({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      <span className="t-meta text-fg2">{label}</span>
      {children}
      {hint && <span className="t-meta text-fg3">{hint}</span>}
    </div>
  )
}

function SettingsSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-5">
      {[5, 4, 2].map((rows, i) => (
        <div key={i} className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-2 h-3.5 w-56" />
          {Array.from({ length: rows }, (_, r) => <Skeleton key={r} className="mt-4 h-12 w-full" />)}
        </div>
      ))}
    </div>
  )
}

