import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { PaperclipIcon, PlusIcon, ScreenshotIcon } from './icons'
import { t } from '../../shared/i18n'

/**
 * O "+" da caixa de texto: anexar arquivos e anexar um print da tela, num menu, para sobrar
 * espaço para escrever. Arrastar arquivos para o painel e colar uma imagem continuam valendo.
 */
export function ComposerMenu({
  onAttach,
  onCapture,
  onCaptureArea,
  onAside,
  onPreview,
  capturing
}: {
  onAttach: () => void
  onCapture: () => void
  /** Recortar uma área da tela (Fase 41). */
  onCaptureArea: () => void
  /** A pergunta lateral (Fase 46). */
  onAside?: () => void
  /** Pré-visualizar um arquivo ou o localhost (Fase 47). */
  onPreview?: () => void
  capturing: boolean
}): JSX.Element {
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

  const pick = (action: () => void) => () => {
    setOpen(false)
    action()
  }

  return (
    <div
      className="composer-menu"
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
        className="icon-button attach composer-plus"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('Anexar arquivos ou um print da tela')}
        aria-label={t('Anexar')}
      >
        {capturing ? <span className="spinner" /> : <PlusIcon />}
      </button>
      {open && (
        <div className="model-menu composer-plus-menu" role="menu">
          <button type="button" role="menuitem" className="model-option" onClick={pick(onAttach)}>
            <span className="model-check">
              <PaperclipIcon />
            </span>
            <span className="model-text">
              <strong>{t('Anexar arquivos')}</strong>
              <small>{t('ou arraste para o painel, ou cole uma imagem')}</small>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="model-option"
            disabled={capturing}
            onClick={pick(onCapture)}
          >
            <span className="model-check">
              <ScreenshotIcon />
            </span>
            <span className="model-text">
              <strong>{t('Print da tela')}</strong>
              <small>{t('o painel sai da frente por um instante')}</small>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="model-option"
            disabled={capturing}
            onClick={pick(onCaptureArea)}
          >
            <span className="model-check">
              <ScreenshotIcon />
            </span>
            <span className="model-text">
              <strong>{t('Recortar uma área')}</strong>
              <small>{t('arraste um retângulo na tela; Esc desiste')}</small>
            </span>
          </button>
          {onPreview && (
            <button
              type="button"
              role="menuitem"
              className="model-option"
              onClick={pick(onPreview)}
            >
              <span className="model-check">▸</span>
              <span className="model-text">
                <strong>{t('Pré-visualizar')}</strong>
                <small>{t('um HTML, PDF, imagem, Markdown ou o localhost (/preview)')}</small>
              </span>
            </button>
          )}
          {onAside && (
            <button type="button" role="menuitem" className="model-option" onClick={pick(onAside)}>
              <span className="model-check">?</span>
              <span className="model-text">
                <strong>{t('Pergunta lateral')}</strong>
                <small>{t('uma dúvida rápida, sem entrar na conversa (/btw)')}</small>
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
