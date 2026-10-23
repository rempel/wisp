import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import { priceLabel } from '../../shared/format'
import type { OpenRouterModelInfo } from '../../shared/ipc'
import { CheckIcon, ChevronDownIcon, ModelIcon } from './icons'
import { t } from '../../shared/i18n'

/** O mesmo formato que o main aceita (config.ts, MODEL_NAME). */
const MODEL_ID = /^[A-Za-z0-9~][\w.:/@[\]-]{0,99}$/
const SHOWN = 60

/** "anthropic/claude-x" → "claude-x" (o provedor aparece no menu). */
const shortName = (id: string): string => id.slice(id.indexOf('/') + 1)

/**
 * A pílula do modelo numa conversa pela OpenRouter: qualquer modelo de lá, buscando pelo nome,
 * com o preço por milhão de tokens. Um id que não está na lista também vale (digitado).
 */
export function OpenRouterModelPill({
  choice,
  onPick
}: {
  choice: string | null
  onPick: (model: string) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [models, setModels] = useState<OpenRouterModelInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // A lista vem do main (que guarda por uma hora) quando o menu abre pela primeira vez.
  useEffect(() => {
    if (!open || models) return
    let alive = true
    void window.wisp.openrouter.models().then((result) => {
      if (!alive) return
      if (Array.isArray(result)) setModels(result)
      else setError(result.error)
    })
    return () => {
      alive = false
    }
  }, [open, models])

  const typed = query.trim()
  const shown = useMemo(() => {
    const words = typed.toLowerCase().split(/\s+/).filter(Boolean)
    return (models ?? [])
      .filter((model) => {
        const text = `${model.id} ${model.name}`.toLowerCase()
        return words.every((word) => text.includes(word))
      })
      .slice(0, SHOWN)
  }, [models, typed])
  const custom = typed && MODEL_ID.test(typed) && !shown.some((model) => model.id === typed)

  const pick = (model: string): void => {
    setOpen(false)
    setQuery('')
    if (model !== choice) onPick(model)
  }

  return (
    <div
      className="model openrouter-model"
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
        className={`model-pill${choice ? '' : ' missing'}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={
          choice
            ? t('Modelo da OpenRouter: {choice}', { choice })
            : t('Escolha um modelo da OpenRouter')
        }
      >
        <ModelIcon />
        <span>{choice ? shortName(choice) : t('Escolher modelo')}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <div
          className="model-menu openrouter-menu"
          role="dialog"
          aria-label={t('Modelos da OpenRouter')}
        >
          <input
            type="text"
            className="openrouter-search"
            placeholder={t('Buscar ou digitar provedor/modelo')}
            value={query}
            autoFocus
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              if (shown.length === 1) pick(shown[0].id)
              else if (typed && MODEL_ID.test(typed)) pick(typed)
            }}
          />
          <div className="openrouter-list" role="listbox">
            {custom && (
              <button type="button" className="model-option" onClick={() => pick(typed)}>
                <span className="model-check" />
                <span className="model-text">
                  <strong>
                    {t('Usar')} {typed}
                  </strong>
                  <small>{t('um id que não está na lista')}</small>
                </span>
              </button>
            )}
            {shown.map((model) => {
              const selected = model.id === choice
              const price = priceLabel(model)
              return (
                <button
                  key={model.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`model-option${selected ? ' selected' : ''}`}
                  onClick={() => pick(model.id)}
                >
                  <span className="model-check">{selected && <CheckIcon />}</span>
                  <span className="model-text">
                    <strong>{model.name}</strong>
                    <small>
                      {model.id}
                      {price && ` · ${price}`}
                    </small>
                  </span>
                </button>
              )
            })}
            {!models && !error && <p className="model-menu-note">{t('Buscando os modelos…')}</p>}
            {error && (
              <p className="model-menu-note">
                {error} {t('Dá para digitar o id do modelo.')}
              </p>
            )}
            {models && !shown.length && !custom && (
              <p className="model-menu-note">{t('Nenhum modelo com esse nome.')}</p>
            )}
          </div>
          <p className="model-menu-note">
            {t(
              'Preços em dólares por milhão de tokens (entrada / saída). Os modelos precisam aceitar ferramentas.'
            )}
          </p>
        </div>
      )}
    </div>
  )
}
