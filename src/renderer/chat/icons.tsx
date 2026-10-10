import { useId } from 'react'
import type { JSX, SVGProps } from 'react'

// Ícones de traço simples (16×16, cor do texto) e o avatar do Wisp. Sem assets externos.

function Icon({ children, ...props }: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  )
}

export const CopyIcon = (): JSX.Element => (
  <Icon>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    <path d="M10.5 5.5V3.8A1.3 1.3 0 0 0 9.2 2.5H3.8a1.3 1.3 0 0 0-1.3 1.3v5.4a1.3 1.3 0 0 0 1.3 1.3h1.7" />
  </Icon>
)

export const CheckIcon = (): JSX.Element => (
  <Icon>
    <path d="m3.5 8.5 3 3 6-7" />
  </Icon>
)

export const PlusIcon = (): JSX.Element => (
  <Icon>
    <path d="M8 3v10M3 8h10" />
  </Icon>
)

export const CloseIcon = (): JSX.Element => (
  <Icon>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Icon>
)

export const SendIcon = (): JSX.Element => (
  <Icon>
    <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
  </Icon>
)

export const StopIcon = (): JSX.Element => (
  <Icon fill="currentColor" stroke="none">
    <rect x="4" y="4" width="8" height="8" rx="1.5" />
  </Icon>
)

export const ChevronIcon = ({ open }: { open: boolean }): JSX.Element => (
  <Icon className={`chevron${open ? ' open' : ''}`}>
    <path d="m6 4 4 4-4 4" />
  </Icon>
)

export const ErrorIcon = (): JSX.Element => (
  <Icon>
    <path d="m5 5 6 6M11 5l-6 6" />
  </Icon>
)

/** O Wisp em miniatura: a mesma gotinha robô do mascote, sem animação. */
export function Avatar({ size }: { size: number }): JSX.Element {
  // Os ids do useId têm caracteres que atrapalham o url(#...) do SVG.
  const id = 'avatar' + useId().replace(/[^\w-]/g, '')
  return (
    <svg className="avatar" viewBox="33 9 62 97" width={size * (62 / 97)} height={size} aria-hidden>
      <defs>
        <linearGradient id={`${id}-shell`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#99f6e4" />
          <stop offset="0.5" stopColor="#5eead4" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <line x1="64" y1="31" x2="64" y2="17.5" stroke="#0e7490" strokeWidth="2.4" />
      <circle cx="64" cy="15" r="4.2" fill="#67e8f9" />
      <path
        d="M 64 30 C 69 41 89 56 89 79 C 89 92.8 77.8 104 64 104 C 50.2 104 39 92.8 39 79 C 39 56 59 41 64 30 Z"
        fill={`url(#${id}-shell)`}
        stroke="#0e7490"
        strokeWidth="1.5"
      />
      <rect x="45" y="70" width="38" height="20" rx="10" fill="#0b1e26" />
      <rect x="52.5" y="75" width="6" height="10" rx="3" fill="#a5f3fc" />
      <rect x="69.5" y="75" width="6" height="10" rx="3" fill="#a5f3fc" />
      <circle cx="39.4" cy="80" r="3.6" fill="#0e7490" />
      <circle cx="88.6" cy="80" r="3.6" fill="#0e7490" />
    </svg>
  )
}
