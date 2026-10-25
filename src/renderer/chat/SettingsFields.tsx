// As peças da tela de configurações: a seção, a linha com a dica e o erro, a chave liga e desliga
// e os campos que gravam ao sair deles (texto, número, lista e atalho).

import { useRef, useState } from 'react'
import type { JSX, KeyboardEvent, ReactNode } from 'react'
import { acceleratorOf } from './accelerator'
import { t } from '../../shared/i18n'

export function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="settings-section">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

export function Row({
  label,
  hint,
  error,
  children
}: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
}): JSX.Element {
  return (
    <label className={`settings-row${error ? ' invalid' : ''}`}>
      <span className="settings-label">{label}</span>
      {children}
      {hint && <small className="settings-hint">{hint}</small>}
      {error && (
        <small className="settings-error" role="alert">
          {error}
        </small>
      )}
    </label>
  )
}

export function Toggle({
  label,
  hint,
  checked,
  error,
  onChange
}: {
  label: string
  hint?: string
  checked: boolean
  error?: string
  onChange: (checked: boolean) => void
}): JSX.Element {
  return (
    <div className={`settings-row settings-toggle${error ? ' invalid' : ''}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`switch${checked ? ' on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="settings-label">{label}</span>
        <span className="switch-track" aria-hidden>
          <span className="switch-thumb" />
        </span>
      </button>
      {hint && <small className="settings-hint">{hint}</small>}
      {error && (
        <small className="settings-error" role="alert">
          {error}
        </small>
      )}
    </div>
  )
}

/** Um campo de texto que grava ao sair dele ou no Enter; Esc desfaz. */
export function TextInput({
  value,
  placeholder,
  onCommit
}: {
  value: string
  placeholder?: string
  onCommit: (value: string) => Promise<unknown>
}): JSX.Element {
  const [draft, setDraft] = useState(value)
  // Mudou por fora (no arquivo, por outra tela): o campo acompanha.
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setDraft(value)
  }
  const commit = (): void => {
    const next = draft.trim()
    if (next !== value) void onCommit(next)
  }
  return (
    <input
      type="text"
      value={draft}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit()
        if (event.key === 'Escape') {
          event.stopPropagation()
          setDraft(value)
        }
      }}
    />
  )
}

export function NumberInput({
  value,
  onCommit
}: {
  value: number
  onCommit: (value: number) => Promise<unknown>
}): JSX.Element {
  const [draft, setDraft] = useState(String(value))
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setDraft(String(value))
  }
  const commit = (): void => {
    const next = Number(draft.replace(',', '.'))
    if (draft.trim() !== '' && next !== value) void onCommit(next)
    else setDraft(String(value))
  }
  return (
    <input
      type="text"
      inputMode="decimal"
      className="settings-number"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit()
      }}
    />
  )
}

/** Uma lista, uma linha por item; linhas vazias saem. */
export function ListInput({
  value,
  placeholder,
  onCommit
}: {
  value: string[]
  placeholder?: string
  onCommit: (value: string[]) => Promise<unknown>
}): JSX.Element {
  const text = value.join('\n')
  const [draft, setDraft] = useState(text)
  const [seen, setSeen] = useState(text)
  if (text !== seen) {
    setSeen(text)
    setDraft(text)
  }
  const commit = (): void => {
    const next = draft
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    if (next.join('\n') !== text) void onCommit(next)
  }
  return (
    <textarea
      rows={Math.min(5, Math.max(2, value.length + 1))}
      value={draft}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
    />
  )
}

/** Grava o atalho apertado (no formato do Electron); Backspace ou Delete desligam. */
export function ShortcutInput({
  value,
  onCommit
}: {
  value: string | null
  onCommit: (value: string | null) => Promise<unknown>
}): JSX.Element {
  const [listening, setListening] = useState(false)
  const field = useRef<HTMLButtonElement>(null)
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (!listening) return
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') return setListening(false)
    if ((event.key === 'Backspace' || event.key === 'Delete') && !event.ctrlKey) {
      setListening(false)
      void onCommit(null)
      return
    }
    const accelerator = acceleratorOf(event)
    if (!accelerator) return
    setListening(false)
    if (accelerator !== value) void onCommit(accelerator)
  }
  return (
    <button
      ref={field}
      type="button"
      className={`shortcut-input${listening ? ' listening' : ''}`}
      onClick={() => setListening((current) => !current)}
      onBlur={() => setListening(false)}
      onKeyDown={onKeyDown}
      aria-label={
        value
          ? t('Atalho: {value}. Clique para trocar.', { value })
          : t('Sem atalho. Clique para definir.')
      }
    >
      {listening ? t('Aperte o atalho…') : (value ?? t('Desligado'))}
    </button>
  )
}
