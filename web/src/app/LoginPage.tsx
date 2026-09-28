import { CircleAlert, Info, Lock, ShieldCheck, User } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { ApiError } from '@/api/errors'
import { useSession } from '@/auth/session'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'
import { TextField } from '@/ui/Field'
import { BrandMark } from './Brand'
import { homePath } from './nav'

/** Only same-app paths are honoured as a post-login destination (no open redirects). */
function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null
  return next
}

export function LoginPage() {
  const { state, signIn } = useSession()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (state.status === 'signed-in') {
    return <Navigate to={safeNext(params.get('next')) ?? homePath(state.grants)} replace />
  }
  const notice = state.status === 'signed-out' ? state.notice : null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || !username.trim() || !password) return
    setBusy(true)
    setError(null)
    try {
      await signIn(username, password)
      setPassword('')
      navigate(safeNext(params.get('next')) ?? '/', { replace: true })
    } catch (err) {
      setPassword('')
      setError(err instanceof ApiError ? (err.kind === 'session-ended' ? 'Incorrect username or password.' : err.message) : 'Something unexpected happened. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const banner = error ?? notice
  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-2">
      <Hero />
      <div className="relative -mt-10 flex justify-center px-4 pb-10 lg:mt-0 lg:items-center lg:px-10">
        <div className="page-enter w-full max-w-[440px]">
          <form
            onSubmit={submit}
            noValidate
            className="rounded-[var(--radius-xl)] border border-line bg-surface p-7 shadow-float sm:p-9 lg:shadow-card"
          >
            <h1 className="t-page-title text-fg">Sign in</h1>
            <p className="t-support mt-1 text-fg2">Use your staff account to continue.</p>
            {banner && (
              <div role={error ? 'alert' : 'status'} className={cn('mt-5 flex items-center gap-2 rounded-[var(--radius-md)] p-3', error ? 'bg-danger-soft text-danger' : 'bg-info-soft text-info')}>
                {error ? <CircleAlert aria-hidden className="size-[18px] shrink-0" /> : <Info aria-hidden className="size-[18px] shrink-0" />}
                <span className="t-support">{banner}</span>
              </div>
            )}
            <div className="mt-6 flex flex-col gap-4">
              <TextField label="Username" icon={User} value={username} onChange={(e) => setUsername(e.target.value.slice(0, 40))} autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus required />
              <TextField label="Password" icon={Lock} type="password" value={password} onChange={(e) => setPassword(e.target.value.slice(0, 128))} autoComplete="current-password" required />
            </div>
            <Button type="submit" variant="accent" size="lg" className="mt-7 w-full" loading={busy} disabled={!username.trim() || !password}>
              Sign in
            </Button>
            <p className="t-meta mt-5 text-center text-fg3">Forgot your password? Ask a manager.</p>
          </form>
          <p className="t-meta mt-5 flex items-center justify-center gap-1.5 text-fg3">
            <ShieldCheck aria-hidden className="size-3.5" /> Encrypted connection · Bistro {__APP_VERSION__}
          </p>
        </div>
      </div>
    </div>
  )
}

/** The brand's one bold surface: deep and warm in every appearance. */
function Hero() {
  return (
    <div className="login-hero relative flex min-h-[340px] flex-col justify-center overflow-hidden px-8 pt-12 pb-20 text-[#FBF6EF] sm:px-12 lg:min-h-dvh lg:px-16 lg:pb-12">
      <div aria-hidden className="login-floorplan absolute inset-0" />
      <div aria-hidden className="login-glow absolute inset-0" />
      <div className="relative page-enter">
        <div className="flex items-center gap-4">
          <span className="inline-flex size-16 items-center justify-center rounded-[20px] border border-white/15 bg-white/[0.08]">
            <BrandMark size={56} framed={false} />
          </span>
          <span className="font-display text-[40px] leading-none font-extrabold tracking-[-0.03em]">Bistro</span>
        </div>
        <p className="mt-10 max-w-[560px] font-display text-[30px] leading-[1.2] font-bold tracking-[-0.02em] sm:text-[38px]">
          Run the floor,<br />the kitchen and the till.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {['Tables', 'Kitchen', 'Billing'].map((t) => (
            <span key={t} className="t-status rounded-full border border-white/15 bg-white/[0.08] px-3 py-1.5 text-[#F4D9C4]">{t}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
