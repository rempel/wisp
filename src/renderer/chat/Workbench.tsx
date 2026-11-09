// A bancada (Fase 55): o navegador e o terminal ao lado da conversa, na mesma janela, como o
// painel de preview e o terminal do Claude Desktop. O navegador é a pré-visualização da Fase 47
// (só arquivos e endereços desta máquina): a página fica numa vista isolada que o main põe por
// cima do lugar que esta página reserva. O terminal é o seu shell, na pasta da conversa em foco.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent, JSX, PointerEvent as ReactPointerEvent } from 'react'
import type { Terminal } from '@xterm/xterm'
import { useFileTarget } from './fileView'
import {
  BackIcon,
  CloseIcon,
  ExternalIcon,
  ForwardIcon,
  GlobeIcon,
  PlusIcon,
  ReloadIcon,
  ScreenshotIcon,
  TerminalIcon
} from './icons'
import { lastLocalhost, openPreview, useMarkdown } from './preview-store'
import { TerminalView } from './TerminalView'
import type { TerminalLink } from './TerminalView'
import { askedForWorkbench, wasAsked } from './workbench-store'
import { draggedWidth, MAX_SHELLS, WORKBENCH_WIDTH } from '../../shared/ipc'
import type { PreviewState, ShellInfo, WorkbenchState, WorkbenchTab } from '../../shared/ipc'
import { t } from '../../shared/i18n'

const CLOSED_PREVIEW: PreviewState = { open: false, display: '', kind: null }

/** O terminal da bancada fala com um shell (o do modo terminal, com o Claude Code da conversa). */
const SHELL_LINK: TerminalLink = {
  attach: (id) => window.wisp.shell.attach(id),
  input: (id, data) => window.wisp.shell.input(id, data),
  resize: (id, cols, rows) => window.wisp.shell.resize(id, cols, rows),
  onData: (listener) => window.wisp.shell.onData(listener)
}

/** Quanto do fim da saída de um terminal fica guardado para achar o localhost (caracteres). */
const SERVED_TAIL = 400

/** O navegador: a barra (voltar, avançar, recarregar, o endereço) e o lugar da página. */
function BrowserTab({
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
  const editing = useRef(false)
  const place = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void window.wisp.preview.get().then(setPreview)
    return window.wisp.preview.onState(setPreview)
  }, [])
  // O endereço acompanha a página, menos enquanto você escreve nele.
  useEffect(() => {
    if (!editing.current) setAddress(preview.display)
  }, [preview.display])

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

  const open = (target: string): void => {
    editing.current = false
    void openPreview(target, folder).then(setNote)
  }
  const submit = (event: FormEvent): void => {
    event.preventDefault()
    open(address)
  }

  return (
    <div className="workbench-body" role="tabpanel" aria-label={t('Navegador')}>
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
          className="workbench-address"
          value={address}
          spellCheck={false}
          placeholder={t('localhost:5173 ou um arquivo (HTML, PDF, imagem)')}
          aria-label={t('Endereço desta máquina ou arquivo')}
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
            setAddress(preview.display)
            event.currentTarget.blur()
          }}
        />
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
              'Abra o servidor do projeto (localhost) ou um arquivo: HTML, PDF ou imagem. Só desta máquina: nada da internet entra por aqui.'
            )}
          </span>
          {recent.length > 0 && (
            <div className="workbench-recent" role="group" aria-label={t('Abertos por último')}>
              {recent.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="workbench-chip"
                  onClick={() => open(item)}
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

/** Os terminais: o seu shell, na pasta da conversa em foco. */
function TerminalTab({
  terminals,
  folder,
  onCompose
}: {
  terminals: ShellInfo[]
  folder: string | null
  onCompose: (text: string) => void
}): JSX.Element {
  const [picked, setPicked] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  /** O localhost que cada terminal mostrou por último (o "Local: http://localhost:5173"). */
  const [served, setServed] = useState<Record<string, string>>({})
  const term = useRef<Terminal | null>(null)
  const started = useRef(false)
  const [focus, setFocus] = useState(wasAsked)
  const active = terminals.find((item) => item.id === picked) ?? terminals[terminals.length - 1]

  const create = useCallback((): void => {
    setNote(null)
    void window.wisp.shell.create(folder).then((result) => {
      if (typeof result === 'string') setPicked(result)
      else setNote(result.error)
    })
  }, [folder])
  // Sem nenhum, o primeiro abre sozinho (uma vez: fechar o último deixa a aba vazia).
  useEffect(() => {
    if (terminals.length || started.current) return
    started.current = true
    create()
  }, [terminals.length, create])
  useEffect(() => {
    // O fim do que cada terminal mostrou: um endereço pode chegar partido em dois pedaços.
    const tails = new Map<string, string>()
    return window.wisp.shell.onData((id, data) => {
      const text = ((tails.get(id) ?? '') + data).slice(-SERVED_TAIL)
      tails.set(id, text)
      const url = lastLocalhost(text)
      if (url) setServed((current) => (current[id] === url ? current : { ...current, [id]: url }))
    })
  }, [])
  const onTerminal = useCallback((terminal: Terminal | null) => {
    term.current = terminal
  }, [])

  const local = active ? served[active.id] : undefined
  return (
    <div className="workbench-body" role="tabpanel" aria-label={t('Terminal')}>
      <div className="workbench-bar workbench-shells">
        <div className="workbench-shell-list" role="tablist" aria-label={t('Terminais')}>
          {terminals.map((item) => (
            <span
              key={item.id}
              className={`workbench-shell${item.id === active?.id ? ' active' : ''}${item.exited ? ' exited' : ''}${item.claude ? ' claude' : ''}`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={item.id === active?.id}
                title={
                  item.claude
                    ? t('O terminal do Claude nesta conversa: ele roda e lê aqui ({cwd})', {
                        cwd: item.cwd
                      })
                    : item.cwd
                }
                onClick={() => {
                  setFocus(true)
                  setPicked(item.id)
                }}
              >
                {item.title}
              </button>
              <button
                type="button"
                className="workbench-shell-close"
                onClick={() => window.wisp.shell.close(item.id)}
                title={t('Fechar este terminal (o que roda nele para)')}
                aria-label={t('Fechar o terminal {title}', { title: item.title })}
              >
                <CloseIcon />
              </button>
            </span>
          ))}
        </div>
        <button
          type="button"
          className="icon-button"
          disabled={terminals.length >= MAX_SHELLS}
          onClick={() => {
            setFocus(true)
            create()
          }}
          title={t('Terminal novo, na pasta da conversa em foco')}
          aria-label={t('Terminal novo')}
        >
          <PlusIcon />
        </button>
        <button
          type="button"
          className="settings-button"
          disabled={!active}
          title={t('O texto selecionado no terminal vai para a caixa da conversa em foco')}
          onClick={() => {
            const text = term.current?.getSelection().trim()
            if (text) onCompose('```\n' + text + '\n```\n')
            else setNote(t('Selecione no terminal o que mandar para a conversa.'))
          }}
        >
          {t('Seleção para a conversa')}
        </button>
      </div>
      {local && (
        <div className="workbench-served">
          <button
            type="button"
            className="workbench-chip"
            onClick={() => void openPreview(local, null)}
          >
            {t('Abrir {url} no navegador da bancada', { url: local })}
          </button>
        </div>
      )}
      {note && (
        <small className="settings-error workbench-note" role="alert">
          {note}
        </small>
      )}
      {active ? (
        <TerminalView
          key={active.id}
          conversation={active.id}
          focused={focus}
          link={SHELL_LINK}
          onTerminal={onTerminal}
        />
      ) : (
        <div className="workbench-empty">
          <TerminalIcon />
          <strong>{t('Nenhum terminal aberto')}</strong>
          <button type="button" className="settings-button" onClick={create}>
            {t('Terminal novo')}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * A bancada, à direita das conversas. `covered`: algo do painel está por cima da janela toda (a
 * paleta, um arraste), e a página do navegador sai da frente. `folder`: a pasta da conversa em
 * foco. `onCompose`: um texto para a caixa dela.
 */
export function Workbench({
  state,
  folder,
  covered,
  onCompose
}: {
  state: WorkbenchState
  folder: string | null
  covered: boolean
  onCompose: (text: string) => void
}): JSX.Element {
  const root = useRef<HTMLElement>(null)
  /** A largura durante o arraste da divisória (null: a guardada). */
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  // Um arquivo ou um Markdown aberto cobrem o painel inteiro.
  const file = useFileTarget()
  const markdown = useMarkdown()
  const overlay = file !== null || markdown !== null
  const width = dragWidth ?? state.width

  const onDivider = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const aside = root.current
    const total = aside?.parentElement?.clientWidth
    if (!aside || !total || event.button !== 0) return
    event.preventDefault()
    const right = aside.getBoundingClientRect().right
    let last = state.width
    const move = (ev: PointerEvent): void => {
      last = draggedWidth(right, ev.clientX, total)
      setDragWidth(last)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDragWidth(null)
      window.wisp.workbench.set({ width: last })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    setDragWidth(state.width)
  }

  const tabs: [WorkbenchTab, string, JSX.Element][] = [
    ['browser', t('Navegador'), <GlobeIcon key="browser" />],
    ['terminal', t('Terminal'), <TerminalIcon key="terminal" />]
  ]
  return (
    <aside
      className="workbench"
      ref={root}
      style={{ width }}
      aria-label={t('Bancada: navegador e terminal')}
    >
      <div
        className="workbench-divider"
        role="separator"
        aria-orientation="vertical"
        title={t('Arraste para ajustar (duplo clique volta ao tamanho de começo)')}
        onPointerDown={onDivider}
        onDoubleClick={() => window.wisp.workbench.set({ width: WORKBENCH_WIDTH.initial })}
      />
      <div className="workbench-head">
        <div className="view-toggle" role="tablist" aria-label={t('Bancada')}>
          {tabs.map(([tab, label, icon]) => (
            <button
              key={tab}
              type="button"
              role="tab"
              className={state.tab === tab ? 'active' : ''}
              aria-selected={state.tab === tab}
              onClick={() => {
                askedForWorkbench()
                window.wisp.workbench.set({ tab })
              }}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="icon-button workbench-close"
          onClick={() => window.wisp.workbench.set({ open: false })}
          title={t('Fechar a bancada (Ctrl+Shift+B); os terminais continuam rodando')}
          aria-label={t('Fechar a bancada')}
        >
          <CloseIcon />
        </button>
      </div>
      {state.tab === 'browser' ? (
        <BrowserTab
          folder={folder}
          hidden={covered || overlay || dragWidth !== null}
          recent={state.recent}
        />
      ) : (
        <TerminalTab terminals={state.terminals} folder={folder} onCompose={onCompose} />
      )}
    </aside>
  )
}
