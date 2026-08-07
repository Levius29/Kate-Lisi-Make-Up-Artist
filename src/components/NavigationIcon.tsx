export type NavigationIconName = 'today' | 'calendar' | 'clients' | 'money' | 'settings'

export function NavigationIcon({ name, className = '' }: { name: NavigationIconName; className?: string }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className={className}
      {...common}
    >
      {name === 'today' ? (
        <>
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
        </>
      ) : name === 'calendar' ? (
        <>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
          <path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01" />
        </>
      ) : name === 'clients' ? (
        <>
          <circle cx="9" cy="8.5" r="3" />
          <path d="M3.5 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6M15 6.2a3 3 0 0 1 0 5.6M15.8 14.3c2.8.5 4.3 2.4 4.7 5.7" />
        </>
      ) : name === 'money' ? (
        <>
          <rect x="3" y="6" width="18" height="13" rx="2.5" />
          <path d="M3 10h18M16 14.5h2" />
          <circle cx="9" cy="14.5" r="2.2" />
        </>
      ) : (
        <>
          <path d="M4 6h7M15 6h5M4 12h3M11 12h9M4 18h9M17 18h3" />
          <circle cx="13" cy="6" r="2" />
          <circle cx="9" cy="12" r="2" />
          <circle cx="15" cy="18" r="2" />
        </>
      )}
    </svg>
  )
}
