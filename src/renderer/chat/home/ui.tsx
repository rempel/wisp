// As peças dos blocos do Início: o cabeçalho (o ícone, o título e o link), o anel, a barra e o
// texto de vazio.
import { useId } from 'react'
import type { JSX, ReactNode } from 'react'

export function BlockHead({
  icon,
  title,
  action,
  onAction,
  children
}: {
  icon: ReactNode
  title: string
  action?: string
  onAction?: () => void
  /** O que vai à direita, antes do link (um botão, um seletor). */
  children?: ReactNode
}): JSX.Element {
  return (
    <header className="block-head">
      <h3>
        <span className="block-icon">{icon}</span>
        {title}
      </h3>
      <span className="block-tools">
        {children}
        {action && onAction && (
          <button type="button" className="link" onClick={onAction}>
            {action}
          </button>
        )}
      </span>
    </header>
  )
}

export function Empty({ children }: { children: ReactNode }): JSX.Element {
  return <p className="block-empty">{children}</p>
}

/** Um anel de progresso (0 a 1), com o texto no meio. */
export function Ring({
  value,
  size = 96,
  stroke = 9,
  label,
  sub
}: {
  value: number
  size?: number
  stroke?: number
  label: string
  sub?: string
}): JSX.Element {
  const id = 'ring' + useId().replace(/[^\w-]/g, '')
  const r = (size - stroke) / 2
  const length = 2 * Math.PI * r
  const part = Math.max(0, Math.min(1, value))
  return (
    <div
      className="ring"
      style={{ width: size, height: size }}
      role="img"
      aria-label={sub ? `${label} ${sub}` : label}
    >
      <svg width={size} height={size} aria-hidden>
        <defs>
          <linearGradient id={id}>
            <stop offset="0" stopColor="var(--accent)" />
            <stop offset="1" stopColor="var(--accent-2)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={stroke} />
        {part > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`url(#${id})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${length * part} ${length}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      <span className="ring-text">
        <strong style={{ fontSize: size / 4.6 }}>{label}</strong>
        {sub && <small>{sub}</small>}
      </span>
    </div>
  )
}

export function Meter({ value, label }: { value: number; label: string }): JSX.Element {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div
      className="meter"
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${percent}%` }} />
    </div>
  )
}
