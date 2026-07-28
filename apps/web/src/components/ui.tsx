import type { ReactNode } from 'react'

export function Panel({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title: string
  subtitle?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    // min-w-0: a grid/flex child defaults to min-width:auto and refuses to
    // shrink below its content, which pushes the page into horizontal scroll on
    // narrow viewports. Wide content scrolls inside its own container instead.
    <section className={`min-w-0 rounded-xl border border-line bg-surface-raised ${className}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-wide text-ink">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs leading-relaxed text-ink-dim">{subtitle}</p> : null}
        </div>
        {action}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

/** A single number that carries a section. Used sparingly — see dataviz. */
export function Hero({
  value,
  label,
  caption,
  tone = 'default',
}: {
  value: string
  label: string
  caption?: ReactNode
  tone?: 'default' | 'danger' | 'good'
}) {
  const color = tone === 'danger' ? 'text-danger' : tone === 'good' ? 'text-good' : 'text-ink'
  return (
    <div>
      <div className="text-xs font-medium tracking-wide text-ink-dim uppercase">{label}</div>
      <div className={`tabular mt-1 text-4xl leading-none font-semibold sm:text-5xl ${color}`}>{value}</div>
      {caption ? <p className="mt-2 max-w-prose text-xs leading-relaxed text-ink-dim">{caption}</p> : null}
    </div>
  )
}

export function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'danger' | 'warn' | 'good'
}) {
  const color =
    tone === 'danger'
      ? 'text-danger'
      : tone === 'warn'
        ? 'text-warn'
        : tone === 'good'
          ? 'text-good'
          : 'text-ink'
  return (
    <div className="rounded-lg bg-surface-sunken px-3 py-2.5">
      <div className="text-[11px] leading-tight text-ink-mute">{label}</div>
      <div className={`tabular mt-1 text-lg leading-none font-semibold ${color}`}>{value}</div>
      {hint ? <div className="mt-1 text-[11px] leading-tight text-ink-mute">{hint}</div> : null}
    </div>
  )
}

export function Tag({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'danger' | 'warn' | 'good' | 'accent' }) {
  const map = {
    default: 'border-line text-ink-dim',
    danger: 'border-danger/40 text-danger',
    warn: 'border-warn/40 text-warn',
    good: 'border-good/40 text-good',
    accent: 'border-accent/40 text-accent',
  } as const
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-tight ${map[tone]}`}>
      {children}
    </span>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-ink-mute">{children}</p>
}

export function fmt(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return n.toLocaleString(undefined, { maximumFractionDigits: digits })
}

/** Compact form for large DPS values, keeping three significant figures. */
export function fmtCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 10_000) return `${(n / 1000).toFixed(1)}k`
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}
