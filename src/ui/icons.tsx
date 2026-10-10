// Small stroke icons in the logo's style (24×24, currentColor).

import type { ReactNode, SVGProps } from 'react'

function Icon({ children, size = 20, ...rest }: { children: ReactNode; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  )
}

type P = { size?: number; className?: string }

export const LockIcon = (p: P) => (
  <Icon {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Icon>
)
export const UnlockIcon = (p: P) => (
  <Icon {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 7.5-2" />
  </Icon>
)
export const SearchIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
)
export const ArrowIcon = (p: P) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
)
export const CheckIcon = (p: P) => (
  <Icon {...p}>
    <path d="m5 12 5 5 9-10" />
  </Icon>
)
export const AlertIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 3 2 20h20L12 3Z" />
    <path d="M12 10v4M12 17.5v.01" />
  </Icon>
)
export const GraphIcon = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="4" width="6" height="5" rx="1.5" />
    <rect x="3" y="15" width="6" height="5" rx="1.5" />
    <rect x="15" y="9.5" width="6" height="5" rx="1.5" />
    <path d="M9 6.5c3 0 3 5.5 6 5.5M9 17.5c3 0 3-5.5 6-5.5" />
  </Icon>
)
export const ReportIcon = (p: P) => (
  <Icon {...p}>
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M9 13h6M9 17h4M9 9h3" />
  </Icon>
)
export const HashIcon = (p: P) => (
  <Icon {...p}>
    <path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16" />
  </Icon>
)
export const PulseIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3 12h4l2.5-6 5 12 2.5-6H21" />
  </Icon>
)
export const ShieldIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3Z" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </Icon>
)
