import { KeyRound, LogOut, MonitorSmartphone } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { ApiError } from '@/api/errors'
import { useMe, useSession } from '@/auth/session'
import { Button } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { TextField } from '@/ui/Field'
import { ConfirmDialog } from '@/ui/Overlay'
import { PageHeader } from '@/ui/Page'
import { useToast } from '@/ui/Toast'
import { AppearancePicker } from './AppearancePicker'
import { PASSWORD_HINT, passwordErrors, type PasswordForm } from './password'
import { ProfileCard } from './ProfileCard'

export default function AccountPage() {
  const { me } = useMe()
  const appearanceId = useId()
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-8">
      <PageHeader eyebrow={me.restaurant_name} title="Account" subtitle="Your profile, appearance and sign-in" className="pb-0" />
      <ProfileCard />

      <section aria-labelledby={appearanceId} className="flex flex-col gap-3">
        <div>
          <h2 id={appearanceId} className="t-section text-fg">Appearance</h2>
          <p className="t-support text-fg2">Applies to this device</p>
        </div>
        <AppearancePicker labelledBy={appearanceId} />
      </section>

      <ChangePassword />
      <Sessions />
    </div>
  )
}

const EMPTY: PasswordForm = { current: '', next: '', confirm: '' }

function ChangePassword() {
  const { changePassword } = useSession()
  const toast = useToast()
  const headingId = useId()
  const [form, setForm] = useState<PasswordForm>(EMPTY)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [server, setServer] = useState<{ current?: string; next?: string; form?: string }>({})
  const local = passwordErrors(form, submitted)

  const set = (key: keyof PasswordForm) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value.slice(0, 128) }))
    setServer({})
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    const errs = passwordErrors(form, true)
    if (errs.current || errs.next || errs.confirm) return
    setBusy(true)
    setServer({})
    try {
      await changePassword(form.current, form.next)
      toast.success('Password updated')
      setForm(EMPTY)
      setSubmitted(false)
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError('unexpected', 'Something unexpected happened. Try again.')
      const current = apiErr.fields.current_password
      const next = apiErr.fields.new_password
      if (current || next) setServer({ current, next })
      else setServer({ form: apiErr.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div>
        <h2 id={headingId} className="t-section text-fg">Change password</h2>
        <p className="t-support text-fg2">Other devices will be signed out.</p>
      </div>
      <Card className="p-5">
        <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
          {/* Lets password managers pair the new password with this account. */}
          <UsernameHint />
          <TextField label="Current password" type="password" autoComplete="current-password" icon={KeyRound}
            value={form.current} onChange={(e) => set('current')(e.target.value)} error={server.current ?? local.current} disabled={busy} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="New password" type="password" autoComplete="new-password"
              value={form.next} onChange={(e) => set('next')(e.target.value)} error={server.next ?? local.next} hint={PASSWORD_HINT} disabled={busy} />
            <TextField label="Confirm new password" type="password" autoComplete="new-password"
              value={form.confirm} onChange={(e) => set('confirm')(e.target.value)} error={local.confirm} disabled={busy} />
          </div>
          {server.form && <p role="alert" className="t-support rounded-[var(--radius-md)] bg-danger-soft px-3 py-2 text-danger">{server.form}</p>}
          <div className="flex justify-end">
            <Button type="submit" loading={busy}>Update password</Button>
          </div>
        </form>
      </Card>
    </section>
  )
}

function UsernameHint() {
  const { me } = useMe()
  return <input type="text" name="username" autoComplete="username" value={me.username} readOnly hidden />
}

function Sessions() {
  const { signOut, signOutEverywhere } = useSession()
  const toast = useToast()
  const headingId = useId()
  const [confirm, setConfirm] = useState<'one' | 'all' | null>(null)
  const [busy, setBusy] = useState(false)

  const everywhere = async () => {
    setBusy(true)
    try {
      await signOutEverywhere()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something unexpected happened. Try again.')
      setBusy(false)
      setConfirm(null)
    }
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="t-section text-fg">Signing out</h2>
      <Card className="divide-y divide-line">
        <div className="flex flex-wrap items-center gap-4 p-5">
          <span aria-hidden className="flex size-10 items-center justify-center rounded-[var(--radius-sm)] bg-sunken text-fg2"><LogOut className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="t-body-strong text-fg">Sign out of this browser</p>
            <p className="t-support text-fg2">Your other devices stay signed in.</p>
          </div>
          <Button variant="secondary" onClick={() => setConfirm('one')}>Sign out</Button>
        </div>
        <div className="flex flex-wrap items-center gap-4 p-5">
          <span aria-hidden className="flex size-10 items-center justify-center rounded-[var(--radius-sm)] bg-danger-soft text-danger"><MonitorSmartphone className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="t-body-strong text-fg">Sign out everywhere</p>
            <p className="t-support text-fg2">Every browser and phone signed in as you, including this one.</p>
          </div>
          <Button variant="danger" onClick={() => setConfirm('all')}>Sign out everywhere</Button>
        </div>
      </Card>

      <ConfirmDialog
        open={confirm === 'one'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Sign out?"
        message="You'll need your password to sign back in on this device."
        confirmLabel="Sign out"
        destructive
        onConfirm={() => {
          setConfirm(null)
          void signOut()
        }}
      />
      <ConfirmDialog
        open={confirm === 'all'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Sign out everywhere?"
        message="Signs out every browser and phone signed in as you."
        confirmLabel="Sign out everywhere"
        destructive
        loading={busy}
        onConfirm={() => void everywhere()}
      />
    </section>
  )
}
