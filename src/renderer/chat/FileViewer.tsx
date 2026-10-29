import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { closeFileView, useFileTarget } from './fileView'
import type { FileTarget } from './fileView'
import { loadMonaco } from './monaco/load'
import { t } from '../../shared/i18n'

/** O nome do arquivo, sem a pasta. */
const nameOf = (path: string): string => path.split(/[\\/]/).pop() ?? path

/** O arquivo, só para ler, no editor do VS Code; Esc ou Fechar voltam para a conversa. */
function Viewer({ target }: { target: FileTarget }): JSX.Element {
  const container = useRef<HTMLDivElement>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let disposed = false
    let view: { dispose(): void } | null = null
    void Promise.all([window.wisp.files.view(target.path), loadMonaco()])
      .then(([file, monaco]) => {
        if (disposed) return
        setLoading(false)
        if (!file.ok) return setProblem(file.message)
        if (!container.current) return
        view = monaco.createView(
          container.current,
          file.text,
          target.path,
          target.line,
          target.changed
        )
      })
      .catch((err: unknown) => {
        if (disposed) return
        setLoading(false)
        setProblem(t('O editor não carregou ({message}).', { message: String(err) }))
      })
    return () => {
      disposed = true
      view?.dispose()
    }
  }, [target])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      // Com a busca do editor aberta, o Esc é dela (fecha só a busca).
      if (document.querySelector('.file-viewer .find-widget.visible')) return
      event.preventDefault()
      event.stopPropagation()
      closeFileView()
    }
    // Na captura: o Esc fecha o arquivo antes de chegar ao painel (que se esconderia).
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  useEffect(() => {
    if (problem) closeButton.current?.focus()
  }, [problem])

  return (
    <div className="file-viewer" role="dialog" aria-modal="true" aria-label={nameOf(target.path)}>
      <div className="file-viewer-head">
        <strong>{nameOf(target.path)}</strong>
        <span className="file-viewer-path" title={target.path}>
          {target.path}
        </span>
        <span className="file-viewer-note">{t('só para ler')}</span>
        <button
          ref={closeButton}
          type="button"
          className="file-viewer-close"
          onClick={closeFileView}
        >
          {t('Fechar')}
        </button>
      </div>
      {loading && <div className="file-viewer-message">{t('Abrindo…')}</div>}
      {problem && <div className="file-viewer-message">{problem}</div>}
      <div ref={container} className="file-viewer-editor" hidden={!!problem} />
    </div>
  )
}

/** O visualizador de arquivos do painel, quando um card abre um. */
export function FileViewer(): JSX.Element | null {
  const target = useFileTarget()
  if (!target) return null
  return <Viewer key={`${target.path}:${target.line}`} target={target} />
}
