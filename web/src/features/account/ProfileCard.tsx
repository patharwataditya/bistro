import { useMe } from '@/auth/session'
import { Card } from '@/ui/Card'
import { cn } from '@/ui/cn'

export function initials(fullName: string): string {
  return fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

export function ProfileCard({ className }: { className?: string }) {
  const { me } = useMe()
  return (
    <Card className={cn('flex items-center gap-4 p-5', className)}>
      <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent-soft font-display text-[18px] font-bold text-accent">
        {initials(me.full_name)}
      </span>
      <div className="min-w-0">
        <p className="t-card-title truncate text-fg">{me.full_name}</p>
        <p className="t-support truncate text-fg2">@{me.username} · {me.roles.map((r) => r.name).join(', ') || 'No role'}</p>
        <p className="t-meta truncate text-fg3">{me.restaurant_name} · {me.location.name}</p>
      </div>
    </Card>
  )
}
