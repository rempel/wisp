import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { formatReset } from '../../shared/format'
import type { PlanUsage, UsageWindow } from '../../shared/ipc'
import { t, dateLocale } from '../../shared/i18n'

const percent = (used: number): string => `${Math.round(used * 100)}%`

/** Verde até 50%, âmbar até 80%, vermelho acima (ou no limite). */
function level(used: number, limited: boolean): 'low' | 'mid' | 'high' {
  if (limited || used >= 0.8) return 'high'
  return used >= 0.5 ? 'mid' : 'low'
}

function Row({
  title,
  window,
  now
}: {
  title: string
  window: UsageWindow
  /** Quando o cartão abriu (ms), para saber se a janela já reiniciou. */
  now: number
}): JSX.Element {
  const passed = window.resetsAt !== null && window.resetsAt * 1000 <= now
  const reset =
    window.resetsAt === null
      ? ''
      : passed
        ? t('já reiniciou')
        : `reinicia ${formatReset(window.resetsAt)}`
  return (
    <div className={`usage-row usage-${level(window.used, false)}${passed ? ' passed' : ''}`}>
      <div className="usage-row-head">
        <span>{title}</span>
        <strong>{percent(window.used)}</strong>
      </div>
      <div
        className="usage-bar"
        role="progressbar"
        aria-label={title}
        aria-valuenow={Math.round(window.used * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: percent(window.used) }} />
      </div>
      {reset && <div className="usage-reset">{reset}</div>}
    </div>
  )
}

/**
 * Pílula do uso do plano, no cabeçalho: a maior das duas janelas (5 horas e 7 dias). Abre um
 * cartão com as duas barras e quando cada uma reinicia. Os números vêm do Claude Code, a cada
 * resposta.
 */
export function UsagePill({
  usage,
  onPanel
}: {
  usage: PlanUsage
  /** Abre o painel de uso (Fase 49). */
  onPanel?: () => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [openedAt, setOpenedAt] = useState(0)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const top = Math.max(usage.session?.used ?? 0, usage.week?.used ?? 0)
  const updated = new Date(usage.at).toLocaleTimeString(dateLocale(), {
    hour: '2-digit',
    minute: '2-digit'
  })

  return (
    <div
      className="usage"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          setOpen(false)
        }
      }}
    >
      <button
        type="button"
        className={`usage-pill usage-${level(top, usage.limited)}`}
        onClick={() => {
          setOpenedAt(Date.now())
          setOpen((value) => !value)
        }}
        aria-expanded={open}
        title={t('Uso do seu plano do Claude')}
      >
        <span className="usage-dot" />
        {percent(top)}
      </button>
      {open && (
        <div className="usage-card" role="dialog" aria-label={t('Uso do plano')}>
          <div className="usage-title">{t('Uso do plano')}</div>
          {usage.session && (
            <Row title={t('Sessão de 5 horas')} window={usage.session} now={openedAt} />
          )}
          {usage.week && <Row title={t('Semana')} window={usage.week} now={openedAt} />}
          <div className="usage-foot">
            {usage.limited ? t('Você chegou ao limite. ') : ''}
            {t('Atualizado às')} {updated}
            {t(', na última resposta.')}
          </div>
          {onPanel && (
            <button
              type="button"
              className="link"
              onClick={() => {
                setOpen(false)
                onPanel()
              }}
            >
              {t('Tokens e custo por dia, projeto e modelo')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
