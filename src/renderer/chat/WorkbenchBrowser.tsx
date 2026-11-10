// O navegador da bancada (Fases 55 a 62): as abas, a barra (voltar, avançar, recarregar, o
// endereço), a mira de apontar um elemento, a largura da página, os erros do console e o lugar
// que a página ocupa (a vista isolada que o main põe por cima).
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import {
  BackIcon,
  CloseIcon,
  ExternalIcon,
  ForwardIcon,
  GlobeIcon,
  PhoneIcon,
  PlusIcon,
  ReloadIcon,
  ScreenshotIcon,
  TargetIcon
} from './icons'
import { LaunchRow } from './LaunchRow'
import { openPreview } from './preview-store'
import { MAX_PREVIEW_TABS, nextPreviewWidth } from '../../shared/ipc'
import type { PreviewState } from '../../shared/ipc'
import { t } from '../../shared/i18n'

const CLOSED_PREVIEW: PreviewState = { open: false, display: '', kind: null }

export function BrowserTab({
  folder,
  hidden,
  recent
}: {
  folder: string | null
  hidden: boolean
  recent: string[]
}): JSX.Element {
  const [preview, setPreview] = useState<PreviewState>(CLOSED_PREVIEW)
  const [address, setAddress] = useState('')
  const [note, setNote] = useState<string | null>(null)
  /** O próximo endereço abre numa aba nova (o + das abas). */
  const [fresh, setFresh] = useState(false)
  const editing = useRef(false)
  const place = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void window.wisp.preview.get().then(setPreview)
    return window.wisp.preview.onState(setPreview)
  }, [])
  // O endereço acompanha a página, menos enquanto você escreve nele (ou espera uma aba nova).
  useEffect(() => {
    if (!editing.current && !fresh) setAddress(preview.display)
  }, [preview.display, fresh])

  // O main põe a página em cima deste lugar: ele sabe onde fica sempre que muda (a janela, a
  // divisória, as abas) e some quando algo do painel passa por cima (a paleta, um arquivo).
  const shown = preview.open && !hidden
  useLayoutEffect(() => {
    const element = place.current
    if (!element || !shown) return
    let frame = 0
    const report = (): void => {
      frame = 0
      const rect = element.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return window.wisp.preview.bounds(null)
      window.wisp.preview.bounds({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      })
    }
    const queue = (): void => {
      frame ||= requestAnimationFrame(report)
    }
    const observer = new ResizeObserver(queue)
    observer.observe(element)
    window.addEventListener('resize', queue)
    report()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', queue)
      cancelAnimationFrame(frame)
      window.wisp.preview.bounds(null)
    }
  }, [shown])

  const open = (target: string, tab = fresh): void => {
    editing.current = false
    setFresh(false)
    void openPreview(target, folder, tab).then(setNote)
  }
  const submit = (event: FormEvent): void => {
    event.preventDefault()
    open(address)
  }
  const tabs = preview.tabs ?? []
  const width = preview.width ?? null
  const errors = preview.errors ?? 0

  return (
    <div className="workbench-body" role="tabpanel" aria-label={t('Navegador')}>
      {preview.open && (
        <div className="workbench-bar workbench-pages" role="tablist" aria-label={t('Páginas')}>
          <div className="workbench-shell-list">
            {tabs.map((tab) => (
              <span
                key={tab.id}
                className={`workbench-shell${tab.active && !fresh ? ' active' : ''}`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab.active}
                  title={tab.title}
                  onClick={() => {
                    setFresh(false)
                    window.wisp.preview.selectTab(tab.id)
                  }}
                >
                  {tab.errors > 0 && <span className="workbench-page-dot" aria-hidden />}
                  {tab.title}
                </button>
                <button
                  type="button"
                  className="workbench-shell-close"
                  onClick={() => window.wisp.preview.closeTab(tab.id)}
                  title={t('Fechar esta página')}
                  aria-label={t('Fechar a página {title}', { title: tab.title })}
                >
                  <CloseIcon />
                </button>
              </span>
            ))}
          </div>
          <button
            type="button"
            className="icon-button"
            disabled={tabs.length >= MAX_PREVIEW_TABS}
            onClick={() => {
              setFresh(true)
              setAddress('')
              field.current?.focus()
            }}
            title={t('Página nova: escreva o endereço e Enter')}
            aria-label={t('Página nova')}
          >
            <PlusIcon />
          </button>
        </div>
      )}
      <form className="workbench-bar" onSubmit={submit}>
        <button
          type="button"
          className="icon-button"
          disabled={!preview.canGoBack}
          onClick={() => window.wisp.preview.go(-1)}
          title={t('Voltar')}
          aria-label={t('Voltar')}
        >
          <BackIcon />
        </button>
        <button
          type="button"
          className="icon-button"
          disabled={!preview.canGoForward}
          onClick={() => window.wisp.preview.go(1)}
          title={t('Avançar')}
          aria-label={t('Avançar')}
        >
          <ForwardIcon />
        </button>
        <button
          type="button"
          className={`icon-button${preview.loading ? ' loading' : ''}`}
          disabled={!preview.open}
          onClick={() => window.wisp.preview.reload()}
          title={t('Recarregar (F5)')}
          aria-label={t('Recarregar')}
        >
          <ReloadIcon />
        </button>
        <input
          ref={field}
          className="workbench-address"
          value={address}
          spellCheck={false}
          placeholder={
            fresh ? t('O endereço da página nova') : t('localhost:5173, um site ou um arquivo')
          }
          aria-label={t('Endereço ou arquivo')}
          title={preview.title || undefined}
          onFocus={(event) => {
            editing.current = true
            event.currentTarget.select()
          }}
          onBlur={() => {
            editing.current = false
          }}
          onChange={(event) => {
            setAddress(event.currentTarget.value)
            setNote(null)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            event.stopPropagation()
            setFresh(false)
            setAddress(preview.display)
            event.currentTarget.blur()
          }}
        />
        <button
          type="button"
          className={`icon-button${preview.picking ? ' active' : ''}`}
          disabled={!preview.open || preview.picking}
          title={t(
            'Apontar um elemento: clique nele na página e ele vai para a conversa, com o recorte (Esc desiste)'
          )}
          aria-label={t('Apontar um elemento da página')}
          aria-pressed={!!preview.picking}
          onClick={() => void window.wisp.preview.pick()}
        >
          <TargetIcon />
        </button>
        <button
          type="button"
          className={`icon-button${width ? ' active' : ''}`}
          disabled={!preview.open}
          title={
            width
              ? t('A página está com {width} px de largura; clique para a próxima', { width })
              : t('Largura da página: ver como num celular ou num tablet')
          }
          aria-label={t('Largura da página')}
          onClick={() => window.wisp.preview.width(nextPreviewWidth(width))}
        >
          <PhoneIcon />
        </button>
        <button
          type="button"
          className="icon-button"
          disabled={!preview.open}
          title={t('Mostrar ao Claude: um print da página vai como anexo para a conversa em foco')}
          aria-label={t('Mostrar ao Claude')}
          onClick={() =>
            void window.wisp.preview.capture().then((ok) => {
              setNote(ok ? null : t('Não deu para tirar o print da pré-visualização.'))
            })
          }
        >
          <ScreenshotIcon />
        </button>
        <button
          type="button"
          className="icon-button"
          disabled={!preview.open}
          onClick={() => window.wisp.preview.external()}
          title={t('Abrir no navegador do sistema')}
          aria-label={t('Abrir no navegador do sistema')}
        >
          <ExternalIcon />
        </button>
        <button
          type="button"
          className="icon-button workbench-page-close"
          disabled={!preview.open}
          onClick={() => window.wisp.preview.close()}
          title={t('Fechar a página')}
          aria-label={t('Fechar a página')}
        >
          <CloseIcon />
        </button>
      </form>
      {preview.picking && (
        <div className="workbench-served" role="status">
          <small>{t('Clique num elemento da página (Esc desiste).')}</small>
        </div>
      )}
      {errors > 0 && (
        <div className="workbench-served workbench-errors">
          <button
            type="button"
            className="workbench-chip"
            onClick={() => void window.wisp.preview.sendErrors()}
            title={t('Os erros vão para a caixa da conversa em foco, para você completar e mandar')}
          >
            {errors === 1
              ? t('1 erro no console: mandar ao Claude')
              : t('{count} erros no console: mandar ao Claude', { count: errors })}
          </button>
        </div>
      )}
      {note && (
        <small className="settings-error workbench-note" role="alert">
          {note}
        </small>
      )}
      {preview.open ? (
        <div className="workbench-page" ref={place} aria-hidden />
      ) : (
        <div className="workbench-empty">
          <GlobeIcon />
          <strong>{t('O que o Claude fez, ao lado da conversa')}</strong>
          <span>
            {t(
              'Abra o servidor do projeto (localhost), um arquivo (HTML, PDF ou imagem) ou um site. O Claude também abre páginas aqui quando você pede.'
            )}
          </span>
          <LaunchRow folder={folder} />
          {recent.length > 0 && (
            <div className="workbench-recent" role="group" aria-label={t('Abertos por último')}>
              {recent.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="workbench-chip"
                  onClick={() => open(item, false)}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
