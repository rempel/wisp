// A pré-visualização (Fase 47), do lado do painel: a barra da janela aberta (recarregar, mostrar
// ao Claude, fechar), o Markdown desenhado no próprio painel e o que os cards oferecem abrir (um
// arquivo que dá para ver, um localhost na saída de um comando).
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { Markdown } from './Markdown'
import { closeMarkdown, openPreview, useMarkdown } from './preview-store'
import type { PreviewState } from '../../shared/ipc'
import { t } from '../../shared/i18n'

/** O Markdown no painel, relido de 1,5 em 1,5 s enquanto aberto (o Claude pode estar editando). */
function MarkdownView({ path }: { path: string }): JSX.Element {
  const [text, setText] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    const read = (): void => {
      void window.wisp.files.view(path).then((file) => {
        if (!alive) return
        if (file.ok) {
          setText(file.text)
          setProblem(null)
        } else setProblem(file.message)
      })
    }
    read()
    const timer = window.setInterval(read, 1500)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [path])
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      closeMarkdown()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  const name = path.split(/[\\/]/).pop() ?? path
  return (
    <div className="file-viewer markdown-preview" role="dialog" aria-modal="true" aria-label={name}>
      <div className="file-viewer-head">
        <strong>{name}</strong>
        <span className="file-viewer-path" title={path}>
          {path}
        </span>
        <span className="file-viewer-note">{t('pré-visualização')}</span>
        <button type="button" className="file-viewer-close" onClick={closeMarkdown}>
          {t('Fechar')}
        </button>
      </div>
      {problem && <div className="file-viewer-message">{problem}</div>}
      {text !== null && !problem && (
        <div className="markdown-preview-body msg assistant">
          <Markdown text={text} />
        </div>
      )}
    </div>
  )
}

/** O Markdown aberto, por cima do painel. */
export function MarkdownPreview(): JSX.Element | null {
  const path = useMarkdown()
  return path ? <MarkdownView key={path} path={path} /> : null
}

/** A barra da janela da pré-visualização, quando ela está aberta. */
export function PreviewBar(): JSX.Element | null {
  const [state, setState] = useState<PreviewState>({ open: false, display: '', kind: null })
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => {
    void window.wisp.preview.get().then(setState)
    return window.wisp.preview.onState((next) => {
      setState(next)
      setNote(null)
    })
  }, [])
  if (!state.open) return null
  return (
    <div className="preview-bar" role="region" aria-label={t('Pré-visualização')}>
      <span className="preview-what" title={state.display}>
        {t('Pré-visualização:')} <code>{state.display}</code>
      </span>
      <button
        type="button"
        className="settings-button"
        onClick={() => window.wisp.preview.reload()}
      >
        {t('Recarregar')}
      </button>
      <button
        type="button"
        className="settings-button"
        title={t('Um print da pré-visualização vai como anexo para a conversa em foco')}
        onClick={() =>
          void window.wisp.preview.capture().then((ok) => {
            if (!ok) setNote(t('Não deu para tirar o print da pré-visualização.'))
          })
        }
      >
        {t('Mostrar ao Claude')}
      </button>
      <button type="button" className="link" onClick={() => window.wisp.preview.close()}>
        {t('Fechar')}
      </button>
      {note && (
        <small className="settings-error" role="alert">
          {note}
        </small>
      )}
    </div>
  )
}

/** O botão de um card: abre o arquivo ou o endereço na pré-visualização. */
export function PreviewButton({ target, label }: { target: string; label: string }): JSX.Element {
  const [problem, setProblem] = useState<string | null>(null)
  return (
    <>
      <button
        type="button"
        className="tool-open-file"
        onClick={() => void openPreview(target, null).then(setProblem)}
      >
        {label}
      </button>
      {problem && <small className="settings-error">{problem}</small>}
    </>
  )
}
