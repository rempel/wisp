import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { Provider } from '../../shared/ipc'
import { CheckIcon, ChevronDownIcon, RouteIcon } from './icons'
import { t } from '../../shared/i18n'

const LABELS: Record<Provider, { title: string; hint: string }> = {
  subscription: { title: t('Assinatura'), hint: t('o seu Claude Code, com o plano do Claude') },
  openrouter: {
    title: 'OpenRouter',
    hint: t('a API da OpenRouter, com a sua chave e outros modelos')
  }
}

/**
 * Pílula do provedor, abaixo da caixa: por onde a conversa vai. Trocar recomeça a conversa (cada
 * lado tem as suas sessões); a atual fica no histórico.
 */
export function ProviderPill({
  provider,
  local,
  onPick
}: {
  provider: Provider
  /** O outro provedor é um servidor local (Fase 66), e não a OpenRouter. */
  local?: boolean
  onPick: (provider: Provider) => void
}): JSX.Element {
  const labels: typeof LABELS = local
    ? {
        ...LABELS,
        openrouter: { title: t('Local'), hint: t('o seu servidor de modelos (Ollama, LM Studio)') }
      }
    : LABELS
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div
      className="model provider"
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
        className={`model-pill provider-pill provider-${provider}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('Por onde a conversa vai (trocar começa uma conversa nova)')}
      >
        <RouteIcon />
        <span>{labels[provider].title}</span>
        {provider === 'openrouter' && <em className="experimental">exp.</em>}
        <ChevronDownIcon />
      </button>
      {open && (
        <div className="model-menu" role="menu">
          {(['subscription', 'openrouter'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={value === provider}
              className={`model-option${value === provider ? ' selected' : ''}`}
              onClick={() => {
                setOpen(false)
                if (value !== provider) onPick(value)
              }}
            >
              <span className="model-check">{value === provider && <CheckIcon />}</span>
              <span className="model-text">
                <strong>
                  {labels[value].title}
                  {value === 'openrouter' && <em className="experimental">experimental</em>}
                </strong>
                <small>{labels[value].hint}</small>
              </span>
            </button>
          ))}
          <p className="model-menu-note">
            {t('Trocar começa uma conversa nova; a atual fica no histórico.')}
          </p>
        </div>
      )}
    </div>
  )
}
