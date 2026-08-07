import type { ReactNode } from 'react'

interface PageHeaderProps {
  eyebrow: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  footer?: ReactNode
  bordered?: boolean
  compactAtRail?: boolean
  subtitleClassName?: string
  tone?: 'accent' | 'muted'
  spacing?: 'default' | 'none'
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
  footer,
  bordered = false,
  compactAtRail = false,
  subtitleClassName = '',
  tone = 'accent',
  spacing = 'default',
}: PageHeaderProps) {
  const spacingClass = spacing === 'none'
    ? bordered ? 'border-b border-line pb-4 md:pb-6' : ''
    : bordered
      ? 'mb-5 border-b border-line pb-4 md:mb-8 md:pb-6'
      : 'mb-5 md:mb-10'

  return (
    <header className={`min-w-0 ${spacingClass}`}>
      <p className={`text-[0.68rem] font-semibold uppercase tracking-[0.18em] md:text-xs md:tracking-[0.22em] ${tone === 'muted' ? 'text-muted' : 'text-accent'}`}>
        {eyebrow}
      </p>
      <div className="mt-1.5 flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-2 md:mt-3 md:items-end">
        <h1 className={`min-w-0 flex-1 break-words font-display text-[2rem] leading-[1.05] text-ink md:text-5xl md:leading-tight ${compactAtRail ? 'lg:text-4xl' : ''}`}>
          {title}
        </h1>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {subtitle ? (
        <p className={`mt-1.5 max-w-2xl text-sm leading-5 text-muted md:mt-3 md:leading-6 ${subtitleClassName}`}>
          {subtitle}
        </p>
      ) : null}
      {footer}
    </header>
  )
}
