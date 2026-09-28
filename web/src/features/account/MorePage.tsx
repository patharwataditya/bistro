import { ChevronRight, LogOut, UserRound, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { MANAGE, OPERATIONS, visible } from '@/app/nav'
import { useMe, useSession } from '@/auth/session'
import { APPEARANCE_LABEL, useAppearance } from '@/lib/appearance'
import { Card } from '@/ui/Card'
import { cn } from '@/ui/cn'
import { ConfirmDialog } from '@/ui/Overlay'
import { PageHeader } from '@/ui/Page'
import { ProfileCard } from './ProfileCard'

/** Android's More-screen subtitles, keyed by route. */
const SUBTITLE: Record<string, string> = {
  '/orders': 'Active, closed and cancelled checks',
  '/menu': 'Items, prices, availability',
  '/tables': 'Floor layout',
  '/reports': 'Sales and operations',
  '/staff': 'Accounts and access',
  '/roles': 'What each role can do',
  '/settings': 'Taxes, billing, payment methods',
  '/audit': 'Who did what, when',
}

/** Narrow-screen hub: everything that isn't a bottom tab, then the account. */
export default function MorePage() {
  const { grants, me } = useMe()
  const { signOut } = useSession()
  const appearance = useAppearance()
  const [confirm, setConfirm] = useState(false)
  const links = [...visible(OPERATIONS, grants).filter((i) => !i.primary), ...visible(MANAGE, grants)]

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-5">
      <PageHeader title="More" eyebrow={me.restaurant_name} className="pb-0" />
      <ProfileCard />

      {links.length > 0 && (
        <nav aria-label="More pages">
          <Card flat className="py-1">
            <ul>
              {links.map((l) => (
                <li key={l.to} className="border-b border-line last:border-b-0">
                  <LinkRow to={l.to} icon={l.icon} title={l.label} subtitle={SUBTITLE[l.to] ?? ''} />
                </li>
              ))}
            </ul>
          </Card>
        </nav>
      )}

      <section aria-labelledby="more-account" className="flex flex-col gap-3">
        <h2 id="more-account" className="t-section text-fg">Account</h2>
        <Card flat className="py-1">
          <ul>
            <li className="border-b border-line">
              <LinkRow to="/account" icon={UserRound} title="Account & appearance" subtitle={`Change password · ${APPEARANCE_LABEL[appearance]} appearance`} />
            </li>
            <li>
              <button type="button" onClick={() => setConfirm(true)} className={rowClass}>
                <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-danger-soft text-danger">
                  <LogOut className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="t-body-strong block text-danger">Sign out</span>
                  <span className="t-meta block text-fg2">{me.username}</span>
                </span>
              </button>
            </li>
          </ul>
        </Card>
      </section>

      <p className="t-meta pb-4 text-center text-fg3">Bistro {__APP_VERSION__}</p>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Sign out?"
        message="You'll need your password to sign back in on this device."
        confirmLabel="Sign out"
        destructive
        onConfirm={() => {
          setConfirm(false)
          void signOut()
        }}
      />
    </div>
  )
}

const rowClass = cn(
  'flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left transition-colors',
  'hover:bg-[var(--hover-overlay)] active:bg-[var(--press-overlay)] focus-visible:rounded-none',
)

function LinkRow({ to, icon: Icon, title, subtitle }: { to: string; icon: LucideIcon; title: string; subtitle: string }) {
  return (
    <Link to={to} className={rowClass}>
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-sunken text-fg">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="t-body-strong block text-fg">{title}</span>
        {subtitle && <span className="t-meta block text-fg2">{subtitle}</span>}
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-fg3" />
    </Link>
  )
}
