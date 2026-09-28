import { ChevronsLeft, ChevronsRight, LogOut, Moon, MoreHorizontal, Sun, SunMoon, UserRound } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { useState, type ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { useMe, useSession } from '@/auth/session'
import { APPEARANCES, APPEARANCE_LABEL, setAppearance, useAppearance, type Appearance } from '@/lib/appearance'
import { cn } from '@/ui/cn'
import { ConfirmDialog } from '@/ui/Overlay'
import { BrandMark } from './Brand'
import { MANAGE, OPERATIONS, visible, type NavItem } from './nav'

const RAIL_KEY = 'bistro.sidebar.collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) === '1'
  } catch {
    return false
  }
}

export function Shell() {
  const { grants, me } = useMe()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const ops = visible(OPERATIONS, grants)
  const manage = visible(MANAGE, grants)
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(RAIL_KEY, c ? '0' : '1')
      } catch {
        // preference only
      }
      return !c
    })
  }
  const primary = ops.filter((i) => i.primary)

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only z-50 rounded-md bg-ink px-3 py-2 text-on-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface md:flex',
          'transition-[width] duration-200 ease-[var(--ease-standard)]',
          collapsed ? 'w-[76px]' : 'w-[76px] xl:w-[248px]',
        )}
      >
        <div className={cn('flex h-16 items-center gap-2.5 px-4', !collapsed && 'xl:px-5')}>
          <BrandMark size={36} />
          <span className={cn('t-section hidden font-extrabold tracking-tight text-fg', !collapsed && 'xl:inline')}>Bistro</span>
        </div>
        <nav aria-label="Main navigation" className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 py-3">
          <NavGroup label="Operations" items={ops} collapsed={collapsed} />
          {manage.length > 0 && <NavGroup label="Manage" items={manage} collapsed={collapsed} />}
        </nav>
        <div className="hidden border-t border-line p-3 xl:block">
          <button
            onClick={toggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex h-10 w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 text-fg3 hover:bg-[var(--hover-overlay)] hover:text-fg"
          >
            {collapsed ? <ChevronsRight aria-hidden className="size-5" /> : <ChevronsLeft aria-hidden className="size-5" />}
            {!collapsed && <span className="t-meta">Collapse</span>}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar locationName={me.location.name} />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 pt-2 pb-24 outline-none md:px-8 md:pb-10">
          <Outlet />
        </main>
      </div>

      {/* Narrow screens: the Android bottom tabs. */}
      <nav aria-label="Main navigation" className="fixed right-0 bottom-0 left-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {primary.map((item) => <BottomTab key={item.to} item={item} />)}
        <BottomTab item={{ to: '/more', label: 'More', icon: MoreHorizontal, any: [] }} />
      </nav>
    </div>
  )
}

function NavGroup({ label, items, collapsed }: { label: string; items: NavItem[]; collapsed: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <p className={cn('t-status px-3 pb-1 text-fg3', collapsed ? 'sr-only' : 'sr-only xl:not-sr-only')}>{label}</p>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          title={item.label}
          className={({ isActive }) =>
            cn(
              'group flex h-11 items-center gap-3 rounded-[var(--radius-md)] px-3 transition-colors duration-150',
              isActive ? 'bg-ink text-on-ink' : 'text-fg2 hover:bg-[var(--hover-overlay)] hover:text-fg',
            )
          }
        >
          <item.icon aria-hidden className="size-5 shrink-0" />
          <span className={cn('t-body-strong truncate text-[14px]', collapsed ? 'sr-only' : 'sr-only xl:not-sr-only')}>{item.label}</span>
        </NavLink>
      ))}
    </div>
  )
}

function BottomTab({ item }: { item: NavItem }) {
  return (
    <NavLink to={item.to} className="flex flex-1 flex-col items-center gap-1 py-2">
      {({ isActive }) => (
        <>
          <span className={cn('flex h-8 w-14 items-center justify-center rounded-full transition-colors', isActive ? 'bg-ink text-on-ink' : 'text-fg3')}>
            <item.icon aria-hidden className="size-5" />
          </span>
          <span className={cn('t-meta', isActive ? 'text-fg' : 'text-fg3')}>{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

function TopBar({ locationName }: { locationName: string }) {
  return (
    <div className="sticky top-0 z-20 flex h-16 items-center gap-3 bg-bg/90 px-4 backdrop-blur md:px-8">
      <span className="flex items-center gap-2 md:hidden">
        <BrandMark size={30} />
        <span className="t-card-title font-extrabold text-fg">Bistro</span>
      </span>
      <span className="t-meta ml-auto hidden text-fg3 sm:inline">{locationName}</span>
      <AppearanceMenu />
      <UserMenu />
    </div>
  )
}

const APPEARANCE_ICON: Record<Appearance, typeof Sun> = { light: Sun, dark: Moon, black: SunMoon }

function menuItemClass() {
  return 'flex h-10 cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-3 text-[14px] text-fg outline-none data-[highlighted]:bg-[var(--hover-overlay)]'
}

function AppearanceMenu() {
  const appearance = useAppearance()
  const Icon = APPEARANCE_ICON[appearance]
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger aria-label={`Appearance: ${APPEARANCE_LABEL[appearance]}`} className="inline-flex size-10 items-center justify-center rounded-full text-fg hover:bg-[var(--hover-overlay)]">
        <Icon aria-hidden className="size-5" />
      </DropdownMenu.Trigger>
      <MenuContent>
        <DropdownMenu.Label className="t-status px-3 pt-1 pb-2 text-fg3">Appearance</DropdownMenu.Label>
        <DropdownMenu.RadioGroup value={appearance} onValueChange={(v) => setAppearance(v as Appearance)}>
          {APPEARANCES.map((a) => {
            const I = APPEARANCE_ICON[a]
            return (
              <DropdownMenu.RadioItem key={a} value={a} className={menuItemClass()}>
                <I aria-hidden className="size-4 text-fg2" />
                <span className="flex-1">{APPEARANCE_LABEL[a]}</span>
                <DropdownMenu.ItemIndicator className="size-2 rounded-full bg-accent" />
              </DropdownMenu.RadioItem>
            )
          })}
        </DropdownMenu.RadioGroup>
      </MenuContent>
    </DropdownMenu.Root>
  )
}

function UserMenu() {
  const { me } = useMe()
  const { signOut } = useSession()
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState(false)
  const initials = me.full_name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger aria-label={`Account: ${me.full_name}`} className="inline-flex size-10 items-center justify-center rounded-full bg-accent-soft font-display text-[14px] font-bold text-accent transition-transform active:scale-95">
          {initials}
        </DropdownMenu.Trigger>
        <MenuContent>
          <div className="px-3 pt-1 pb-3">
            <div className="t-body-strong text-fg">{me.full_name}</div>
            <div className="t-meta text-fg3">@{me.username} · {me.roles.map((r) => r.name).join(', ')}</div>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item className={menuItemClass()} onSelect={() => navigate('/account')}>
            <UserRound aria-hidden className="size-4 text-fg2" /> Account & appearance
          </DropdownMenu.Item>
          <DropdownMenu.Item className={cn(menuItemClass(), 'text-danger')} onSelect={() => setConfirm(true)}>
            <LogOut aria-hidden className="size-4" /> Sign out
          </DropdownMenu.Item>
        </MenuContent>
      </DropdownMenu.Root>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Sign out?"
        message="You'll need your password to sign back in on this browser. Other open Bistro tabs will sign out too."
        confirmLabel="Sign out"
        destructive
        onConfirm={() => {
          setConfirm(false)
          void signOut()
        }}
      />
    </>
  )
}

function MenuContent({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align="end"
        sideOffset={8}
        className="z-50 min-w-[220px] rounded-[var(--radius-md)] border border-line bg-raised p-1.5 shadow-float data-[state=open]:animate-[menu-in_140ms_var(--ease-decel)]"
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  )
}
