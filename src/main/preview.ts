// A pré-visualização (Fase 47): um HTML, um PDF, uma imagem ou o servidor local do projeto
// (localhost), para ver o resultado do que o Claude fez. Desde a Fase 55 ela é o navegador da
// bancada: cada página é uma WebContentsView dentro da janela do painel, no lugar que a página
// do painel diz. As vistas são isoladas: outra sessão do Electron (sem os cookies do painel),
// sem preload, no sandbox, sem permissões (câmera, notificações...), sem abrir janelas e sem
// baixar arquivos. Com as páginas da internet ligadas (`previewWeb`, Fase 58), sites abrem
// também. Desde a Fase 59 há abas (uma página por aba), dá para apontar um elemento da página
// (Fase 60), estreitar a página como num celular (Fase 61) e mandar os erros do console para a
// conversa (Fase 62). O Markdown abre no próprio painel (o renderer o desenha).

import { ipcMain, session, shell, WebContentsView } from 'electron'
import type { BrowserWindow, IpcMainInvokeEvent, NativeImage, WebContents } from 'electron'
import { existsSync, watch } from 'fs'
import type { FSWatcher } from 'fs'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { saveIncoming } from './attachments'
import { PICK_SCRIPT, pickedText, sanePick } from './preview-pick'
import type { Picked } from './preview-pick'
import { allowedNavigation, isLocalAddress, previewTarget } from './preview-target'
import type { PreviewTarget } from './preview-target'
import { thumbnailOf } from './screenshot'
import { IPC } from '../shared/ipc'
import type { DroppedFiles, PreviewResult, PreviewState, ViewBounds } from '../shared/ipc'
import { MAX_PREVIEW_TABS, previewWidth } from '../shared/ipc-workbench'
import { t } from '../shared/i18n'

// O que abre e para onde navega mora em preview-target.ts; quem importava daqui continua igual.
export {
  allowedNavigation,
  isLocalAddress,
  looksLikeSite,
  MARKDOWN_EXTENSIONS,
  PREVIEW_EXTENSIONS,
  previewTarget
} from './preview-target'
export type { PreviewTarget } from './preview-target'

const PARTITION = 'wisp-preview'

/** O que a pré-visualização pede a quem a hospeda (a bancada). */
export interface PreviewHost {
  /** O IPC veio da página do painel? */
  isSender(sender: WebContents): boolean
  /** A janela do painel (null: ainda não abriu). */
  window(): BrowserWindow | null
  /** Um print da página, para a conversa em foco. */
  attach(dropped: DroppedFiles): void
  /** Um texto para a caixa da conversa em foco (o elemento apontado, os erros do console). */
  compose(text: string): void
  /** Abriu uma página (a bancada aparece, na aba do navegador). `input`: o que foi pedido. */
  opened(input: string): void
  /** O Ctrl+Shift+B com o foco na página: a bancada fecha, como pelo painel. */
  toggle(): void
  /** As páginas da internet estão ligadas nas configurações (`previewWeb`, Fase 58)? */
  web(): boolean
}

const CLOSED: PreviewState = { open: false, display: '', kind: null }
/** Quantas linhas do console da página ficam guardadas. */
const MAX_LOGS = 200
/** Quanto esperar você apontar um elemento antes de desistir (ms). */
const PICK_TIMEOUT_MS = 60_000
/** Os níveis do console, como o Claude os lê (o Electron antigo os dava em números). */
const LOG_LEVELS: Record<string, string> = {
  '0': 'debug',
  '1': 'info',
  '2': 'aviso',
  '3': 'erro',
  warning: 'aviso',
  error: 'erro'
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** O lugar da vista na janela: o da página, vezes o zoom do painel, em pixels inteiros. */
export function viewRect(bounds: ViewBounds, zoom: number): ViewBounds {
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  return {
    x: Math.max(0, Math.round(bounds.x * scale)),
    y: Math.max(0, Math.round(bounds.y * scale)),
    width: Math.max(0, Math.round(bounds.width * scale)),
    height: Math.max(0, Math.round(bounds.height * scale))
  }
}

/**
 * O lugar com a página estreitada (Fase 61): `width` px de largura (antes do zoom), no meio do
 * lugar reservado. Sem largura, ou com uma maior que o lugar, o lugar inteiro.
 */
export function narrowed(bounds: ViewBounds, width: number | null): ViewBounds {
  if (!width || width >= bounds.width) return bounds
  return { ...bounds, x: bounds.x + (bounds.width - width) / 2, width }
}

/** O que a página mandou como lugar da vista vale? (Quatro números, de um tamanho razoável.) */
export function saneBounds(value: unknown): ViewBounds | null {
  if (!value || typeof value !== 'object') return null
  const { x, y, width, height } = value as Record<string, unknown>
  const numbers = [x, y, width, height]
  if (!numbers.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 20000)) {
    return null
  }
  if ((width as number) < 1 || (height as number) < 1) return null
  return { x: x as number, y: y as number, width: width as number, height: height as number }
}

/** O que uma página pede às abas. */
interface PageHost {
  window(): BrowserWindow | null
  web(): boolean
  toggle(): void
  /** Algo mudou na página (o endereço, o título, os erros): o painel acompanha. */
  changed(): void
}

/** Uma página do navegador da bancada (uma aba) e o vigia da pasta do arquivo aberto. */
class PreviewPage {
  private view: WebContentsView | null = null
  private home: BrowserWindow | null = null
  private target: PreviewTarget | null = null
  private watcher: FSWatcher | null = null
  private reloadTimer: NodeJS.Timeout | null = null
  /** Onde a página do painel quer a vista (null: escondida). */
  private bounds: ViewBounds | null = null
  /** O último lugar que a vista teve (para um print com ela escondida). */
  private lastRect: ViewBounds | null = null
  /** O console da página e as falhas de carga, para o Claude (Fase 57): as últimas linhas. */
  private logs: string[] = []
  /** Os erros que ainda não foram para a conversa (Fase 62). */
  private fresh: string[] = []
  /** Você está apontando um elemento (Fase 60). */
  picking = false
  /** A página do painel recarregou: o lugar antigo não vale até ela mandar o novo. */
  private readonly forget = (): void => {
    this.bounds = null
    this.layout()
  }

  constructor(
    readonly id: number,
    private readonly host: PageHost
  ) {}

  get opened(): boolean {
    return this.view !== null
  }

  open(target: PreviewTarget): boolean {
    if (target.kind === 'markdown') return true
    const win = this.host.window()
    if (!win) return false
    this.target = target
    const view = this.view ?? this.create(win)
    void view.webContents.loadURL(target.url).catch(() => {
      // O servidor ainda não subiu (ou caiu): a vista mostra o erro do Chromium; Recarregar tenta de novo.
    })
    this.watch()
    this.layout()
    this.host.changed()
    return true
  }

  reload(): void {
    this.view?.webContents.reloadIgnoringCache()
  }

  go(step: -1 | 1): void {
    const history = this.view?.webContents.navigationHistory
    if (!history) return
    if (step < 0 && history.canGoBack()) history.goBack()
    else if (step > 0 && history.canGoForward()) history.goForward()
  }

  /** O que a vista mostra, no navegador (ou no programa) do sistema. */
  external(): void {
    const url = this.view?.webContents.getURL()
    if (!url || !this.target || !allowedNavigation(this.target, url, this.host.web())) return
    if (url.startsWith('file:')) void shell.openPath(fileURLToPath(url))
    else void shell.openExternal(url)
  }

  close(): void {
    const view = this.view
    if (!view) return
    this.view = null
    this.target = null
    this.logs = []
    this.fresh = []
    this.picking = false
    this.unwatch()
    if (this.home && !this.home.isDestroyed()) {
      this.home.webContents.off('did-start-loading', this.forget)
      this.home.contentView.removeChildView(view)
    }
    this.home = null
    if (!view.webContents.isDestroyed()) view.webContents.close()
  }

  /** A página do painel diz onde a vista fica (ou que ela some: outra aba, algo por cima). */
  place(bounds: ViewBounds | null): void {
    this.bounds = bounds
    this.layout()
  }

  /** A página à vista é da internet (e não desta máquina)? O que vem dela não é de confiança. */
  remote(): boolean {
    const url = this.view?.webContents.getURL()
    return !!url && !isLocalAddress(url)
  }

  /** O console da página (as últimas linhas, a mais nova no fim). */
  console(): string[] {
    return [...this.logs]
  }

  /** Os erros que ainda não foram para a conversa; lidos, deixam de contar. */
  takeErrors(): string[] {
    const errors = this.fresh.splice(0)
    if (errors.length) this.host.changed()
    return errors
  }

  /** Espera a página acabar de carregar (até `ms`). */
  private async settled(ms = 10_000): Promise<void> {
    const contents = this.view?.webContents
    if (!contents || contents.isDestroyed()) return
    const start = Date.now()
    while (contents.isLoading() && Date.now() - start < ms) await wait(100)
    // Um instante para a página pintar (e para o painel dizer onde ela fica).
    await wait(250)
  }

  /**
   * A imagem da página (ou de um pedaço dela), depois de carregada. Com a vista escondida (a
   * bancada fechada, outra aba), ela aparece só durante o print, no último lugar que teve.
   * Devolve o motivo se não der.
   */
  async image(rect?: ViewBounds): Promise<NativeImage | string> {
    const view = this.view
    if (!view) return t('A pré-visualização está fechada.')
    await this.settled()
    if (this.view !== view || view.webContents.isDestroyed()) {
      return t('A pré-visualização está fechada.')
    }
    const hidden = !this.bounds
    try {
      if (hidden) {
        view.setBounds(this.lastRect ?? { x: 0, y: 0, width: 1024, height: 720 })
        view.setVisible(true)
        await wait(150)
      }
      const image = await (rect
        ? view.webContents.capturePage(rect)
        : view.webContents.capturePage())
      return image.isEmpty() ? t('A página ainda não apareceu.') : image
    } catch (err) {
      return (err as Error).message
    } finally {
      if (hidden && this.view === view) this.layout()
    }
  }

  /**
   * Roda um trecho de JavaScript na página (ela é isolada: sem o Node, sem o painel) e devolve
   * o resultado em texto. A página carregada é esperada antes; um trecho que não volta em 10 s
   * é abandonado.
   */
  async evaluate(
    code: string
  ): Promise<{ ok: true; value: string } | { ok: false; message: string }> {
    const view = this.view
    if (!view) return { ok: false, message: t('A pré-visualização está fechada.') }
    await this.settled()
    if (this.view !== view || view.webContents.isDestroyed()) {
      return { ok: false, message: t('A pré-visualização está fechada.') }
    }
    try {
      const value: unknown = await Promise.race([
        view.webContents.executeJavaScript(code, true),
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error(t('a página não respondeu em 10 segundos'))), 10_000)
        )
      ])
      const shown = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
      return { ok: true, value: shown ?? 'undefined' }
    } catch (err) {
      return { ok: false, message: (err as Error).message }
    }
  }

  /**
   * Apontar um elemento (Fase 60): a página ganha uma mira; o clique devolve o seletor, o
   * texto, os estilos e o lugar dele, e o recorte vira um anexo. Esc (ou um minuto) desiste.
   */
  async pick(): Promise<{ picked: Picked; shot: DroppedFiles; url: string } | null> {
    const view = this.view
    if (!view || this.picking) return null
    this.picking = true
    this.host.changed()
    try {
      view.webContents.focus()
      const raw: unknown = await Promise.race([
        view.webContents.executeJavaScript(PICK_SCRIPT, true),
        wait(PICK_TIMEOUT_MS + 2000).then(() => null)
      ])
      const picked = sanePick(raw)
      if (!picked || this.view !== view) return null
      // A mira já saiu da página: um instante para ela pintar sem a moldura.
      await wait(80)
      const shot = await this.capture(picked.rect, 'elemento')
      return { picked, shot, url: view.webContents.getURL() }
    } catch {
      return null
    } finally {
      this.picking = false
      this.host.changed()
    }
  }

  /** Um print da página (ou de um pedaço), salvo como anexo. */
  async capture(rect?: ViewBounds, name = 'preview'): Promise<DroppedFiles> {
    if (!this.view) return { files: [], problems: [t('A pré-visualização está fechada.')] }
    try {
      const image = await (rect
        ? this.view.webContents.capturePage(viewRect(rect, 1))
        : this.view.webContents.capturePage())
      if (image.isEmpty()) return { files: [], problems: [t('A página ainda não apareceu.')] }
      const saved = await saveIncoming(image.toPNG(), name, 'png')
      const thumbnail = thumbnailOf(image)
      return { files: [{ ...saved, ...(thumbnail ? { thumbnail } : {}) }], problems: [] }
    } catch (err) {
      return { files: [], problems: [(err as Error).message] }
    }
  }

  state(): PreviewState {
    const contents = this.view?.webContents
    if (!contents || !this.target || this.target.kind === 'markdown') return CLOSED
    return {
      open: true,
      display: this.showing(contents.getURL()) ?? this.target.display,
      kind: this.target.kind,
      title: contents.getTitle(),
      loading: contents.isLoading(),
      canGoBack: contents.navigationHistory.canGoBack(),
      canGoForward: contents.navigationHistory.canGoForward(),
      errors: this.fresh.length,
      picking: this.picking
    }
  }

  /** O endereço (ou o arquivo) que a vista mostra agora, se ele é dos que ela pode mostrar. */
  private showing(url: string): string | null {
    if (!url || !this.target || !allowedNavigation(this.target, url, this.host.web())) return null
    if (!url.startsWith('file:')) return url
    try {
      return fileURLToPath(url)
    } catch {
      return null
    }
  }

  private layout(): void {
    const view = this.view
    if (!view || !this.home || this.home.isDestroyed()) return
    if (!this.bounds) return view.setVisible(false)
    this.lastRect = viewRect(this.bounds, this.home.webContents.getZoomFactor())
    view.setBounds(this.lastRect)
    view.setVisible(true)
  }

  private create(win: BrowserWindow): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        partition: PARTITION,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        plugins: true,
        spellcheck: false
      }
    })
    const isolated = session.fromPartition(PARTITION)
    isolated.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    isolated.setPermissionCheckHandler(() => false)
    isolated.removeAllListeners('will-download')
    isolated.on('will-download', (event) => event.preventDefault())
    const contents = view.webContents
    // Sem janelas novas: um link que abriria outra navega aqui mesmo, se puder.
    contents.setWindowOpenHandler(({ url }) => {
      if (this.target && allowedNavigation(this.target, url, this.host.web())) {
        void contents.loadURL(url).catch(() => undefined)
      }
      return { action: 'deny' }
    })
    const guard = (event: { preventDefault(): void }, url: string): void => {
      if (this.target && !allowedNavigation(this.target, url, this.host.web())) {
        event.preventDefault()
      }
    }
    contents.on('will-navigate', guard)
    contents.on('will-redirect', guard)
    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      if (input.key === 'F5' || (input.control && !input.shift && input.key === 'r')) {
        event.preventDefault()
        this.reload()
      } else if (input.control && input.shift && input.key.toLowerCase() === 'b') {
        event.preventDefault()
        this.host.toggle()
      }
    })
    // O console e as falhas de carga ficam guardados para o Claude ler (as últimas 200 linhas).
    const log = (line: string): void => {
      const short = line.slice(0, 2000)
      this.logs.push(short)
      if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS)
      if (!short.startsWith('[erro]')) return
      this.fresh.push(short)
      if (this.fresh.length > 50) this.fresh.shift()
      this.host.changed()
    }
    contents.on('console-message', (event, ...old: unknown[]) => {
      // O Electron novo entrega tudo no evento; o antigo, em argumentos soltos.
      const details = event as unknown as { level?: unknown; message?: unknown }
      const level = typeof details.level === 'string' ? details.level : String(old[0] ?? 'info')
      const message = typeof details.message === 'string' ? details.message : String(old[1] ?? '')
      // O aviso do próprio Electron (só fora do pacote) não é da página.
      if (message.startsWith('%cElectron Security Warning')) return
      log(`[${LOG_LEVELS[level] ?? level}] ${message}`)
    })
    contents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
      // -3 é uma carga interrompida (outra começou): não é uma falha.
      if (code !== -3)
        log(
          `[erro] ${isMainFrame ? 'a página' : 'um recurso'} não carregou: ${description} (${url})`
        )
    })
    contents.on('did-navigate', (_event, url) => {
      // Uma página nova: os erros da anterior não contam mais.
      this.fresh = []
      log(`[página] ${url}`)
    })
    contents.on('render-process-gone', (_event, details) =>
      log(`[erro] a página caiu (${details.reason})`)
    )
    const changed = (): void => this.host.changed()
    contents.on('did-start-loading', changed)
    contents.on('did-stop-loading', changed)
    contents.on('did-navigate', changed)
    contents.on('did-navigate-in-page', changed)
    contents.on('page-title-updated', changed)
    // Uma página sem fundo próprio (um SVG, um texto) fica legível nos dois temas.
    view.setBackgroundColor('#ffffff')
    view.setVisible(false)
    win.contentView.addChildView(view)
    win.webContents.on('did-start-loading', this.forget)
    win.once('closed', () => {
      if (this.view !== view) return
      this.view = null
      this.home = null
      this.target = null
      this.unwatch()
    })
    this.view = view
    this.home = win
    return view
  }

  /** Um arquivo recarrega quando a pasta dele muda (sem descer nas de dentro: um node_modules). */
  private watch(): void {
    this.unwatch()
    if (this.target?.kind !== 'file') return
    const folder = dirname(this.target.path)
    if (!existsSync(folder)) return
    try {
      this.watcher = watch(folder, () => {
        if (this.reloadTimer) clearTimeout(this.reloadTimer)
        this.reloadTimer = setTimeout(() => this.reload(), 300)
      })
      this.watcher.on('error', () => this.unwatch())
    } catch {
      // Sem o vigia: o Recarregar continua valendo.
    }
  }

  private unwatch(): void {
    this.watcher?.close()
    this.watcher = null
    if (this.reloadTimer) clearTimeout(this.reloadTimer)
    this.reloadTimer = null
  }
}

/**
 * As abas do navegador da bancada (Fase 59): uma página por aba, uma à vista. Só a que está à
 * vista ocupa o lugar na janela; as outras continuam carregadas, escondidas.
 */
class PreviewTabs {
  private pages: PreviewPage[] = []
  private active: PreviewPage | null = null
  private nextId = 1
  /** Onde a página do painel quer a vista, e a largura pedida (null: o lugar todo). */
  private bounds: ViewBounds | null = null
  private width: number | null = null

  constructor(private readonly host: PreviewHost) {}

  private readonly pageHost: PageHost = {
    window: () => this.host.window(),
    web: () => this.host.web(),
    toggle: () => this.host.toggle(),
    changed: () => this.notify()
  }

  /** A página à vista (null: nenhuma aba). */
  get page(): PreviewPage | null {
    return this.active
  }

  /** Abre numa aba nova (`fresh`, ou se não há nenhuma) ou na que está à vista. */
  open(target: PreviewTarget, fresh: boolean): boolean | string {
    if (target.kind === 'markdown') return true
    if (!this.host.window()) return false
    if (fresh || !this.active) {
      if (this.pages.length >= MAX_PREVIEW_TABS) {
        return t('O navegador da bancada tem no máximo {max} abas.', { max: MAX_PREVIEW_TABS })
      }
      const page = new PreviewPage(this.nextId++, this.pageHost)
      this.pages.push(page)
      this.active = page
    }
    const ok = this.active.open(target)
    this.layout()
    return ok
  }

  select(id: number): boolean {
    const page = this.pages.find((item) => item.id === id)
    if (!page) return false
    this.active = page
    this.layout()
    this.notify()
    return true
  }

  /** Fecha uma aba (sem o id, a que está à vista); a vizinha passa a ser a da vista. */
  close(id?: number): void {
    const page = id === undefined ? this.active : this.pages.find((item) => item.id === id)
    if (!page) return
    const index = this.pages.indexOf(page)
    this.pages.splice(index, 1)
    page.close()
    if (this.active === page) this.active = this.pages[index] ?? this.pages[index - 1] ?? null
    this.layout()
    this.notify()
  }

  place(bounds: ViewBounds | null): void {
    this.bounds = bounds
    this.layout()
  }

  /** A largura da página (Fase 61): um celular, um tablet, ou o lugar todo (null). */
  resize(width: number | null): void {
    this.width = width
    this.layout()
    this.notify()
  }

  private layout(): void {
    for (const page of this.pages) {
      page.place(page === this.active && this.bounds ? narrowed(this.bounds, this.width) : null)
    }
  }

  state(): PreviewState {
    const current = this.active?.state() ?? CLOSED
    if (!current.open) return CLOSED
    return {
      ...current,
      width: this.width,
      tabs: this.pages.map((page) => {
        const state = page.state()
        return {
          id: page.id,
          title: state.title || state.display,
          active: page === this.active,
          errors: state.errors ?? 0
        }
      })
    }
  }

  private notify(): void {
    const win = this.host.window()
    if (win && !win.isDestroyed()) win.webContents.send(IPC.previewState, this.state())
  }
}

/** O que o resto do main (as ferramentas do Claude, Fase 57) faz com a pré-visualização. */
export interface PreviewControl {
  /**
   * Abre um endereço ou um arquivo (`base`: a pasta para um caminho relativo), na aba à vista
   * ou, com `fresh`, numa nova.
   */
  open(input: string, base: string | null, fresh?: boolean): PreviewResult
  state(): PreviewState
  /** A página à vista é da internet (o conteúdo dela não é de confiança). */
  remote(): boolean
  image(): Promise<NativeImage | string>
  evaluate(code: string): Promise<{ ok: true; value: string } | { ok: false; message: string }>
  console(): string[]
  /** Passa para uma aba, ou fecha uma (pelo id que o `state().tabs` dá). */
  selectTab(id: number): boolean
  closeTab(id: number): void
  /** A largura da página: um número de pixels, ou null para o lugar todo. */
  resize(width: number | null): void
}

/** O IPC da pré-visualização (só o painel pede) e o controle dela para o resto do main. */
export function setupPreview(host: PreviewHost): PreviewControl {
  const tabs = new PreviewTabs(host)
  const from = (event: IpcMainInvokeEvent): boolean => host.isSender(event.sender)
  const open = (input: string, base: string | null, fresh = false): PreviewResult => {
    const target = previewTarget(input.slice(0, 4096), base, undefined, host.web())
    if (typeof target === 'string') return { ok: false, message: target }
    if (target.kind === 'markdown') return { ok: true, kind: 'markdown', path: target.path }
    const opened = tabs.open(target, fresh)
    if (typeof opened === 'string') return { ok: false, message: opened }
    if (!opened) return { ok: false, message: t('O painel do Wisp está fechado.') }
    host.opened(target.display)
    return { ok: true, kind: target.kind }
  }
  ipcMain.handle(
    IPC.previewOpen,
    (event, input: unknown, base: unknown, fresh: unknown): PreviewResult => {
      if (!from(event) || typeof input !== 'string')
        return { ok: false, message: t('pedido inválido') }
      return open(input, typeof base === 'string' ? base : null, fresh === true)
    }
  )
  ipcMain.handle(IPC.previewCapture, async (event): Promise<boolean> => {
    if (!from(event)) return false
    const dropped = (await tabs.page?.capture()) ?? {
      files: [],
      problems: [t('A pré-visualização está fechada.')]
    }
    host.attach(dropped)
    return dropped.files.length > 0
  })
  // Apontar um elemento (Fase 60): o recorte vai como anexo e a descrição, para a caixa.
  ipcMain.handle(IPC.previewPick, async (event): Promise<boolean> => {
    if (!from(event)) return false
    const result = await tabs.page?.pick()
    if (!result) return false
    if (result.shot.files.length) host.attach(result.shot)
    host.compose(pickedText(result.picked, result.url))
    return true
  })
  // Os erros do console que ainda não foram para a conversa (Fase 62): vão para a caixa.
  ipcMain.handle(IPC.previewErrors, (event): boolean => {
    if (!from(event)) return false
    const page = tabs.page
    const errors = page?.takeErrors() ?? []
    if (!page || !errors.length) return false
    host.compose(
      t('A página {url} mostrou estes erros no console:', { url: page.state().display }) +
        '\n```\n' +
        errors.join('\n').slice(0, 6000) +
        '\n```\n'
    )
    return true
  })
  ipcMain.on(IPC.previewReload, (event) => {
    if (host.isSender(event.sender)) tabs.page?.reload()
  })
  ipcMain.on(IPC.previewClose, (event) => {
    if (host.isSender(event.sender)) tabs.close()
  })
  ipcMain.on(IPC.previewGo, (event, step: unknown) => {
    if (host.isSender(event.sender) && (step === -1 || step === 1)) tabs.page?.go(step)
  })
  ipcMain.on(IPC.previewExternal, (event) => {
    if (host.isSender(event.sender)) tabs.page?.external()
  })
  ipcMain.on(IPC.previewBounds, (event, bounds: unknown) => {
    if (host.isSender(event.sender)) tabs.place(saneBounds(bounds))
  })
  ipcMain.on(IPC.previewTab, (event, id: unknown, close: unknown) => {
    if (!host.isSender(event.sender) || typeof id !== 'number') return
    if (close === true) tabs.close(id)
    else tabs.select(id)
  })
  ipcMain.on(IPC.previewWidth, (event, width: unknown) => {
    if (host.isSender(event.sender)) tabs.resize(previewWidth(width))
  })
  ipcMain.handle(IPC.previewGet, (event): PreviewState => (from(event) ? tabs.state() : CLOSED))
  return {
    open,
    state: () => tabs.state(),
    remote: () => tabs.page?.remote() ?? false,
    image: async () => (await tabs.page?.image()) ?? t('A pré-visualização está fechada.'),
    evaluate: async (code) =>
      (await tabs.page?.evaluate(code)) ?? {
        ok: false,
        message: t('A pré-visualização está fechada.')
      },
    console: () => tabs.page?.console() ?? [],
    selectTab: (id) => tabs.select(id),
    closeTab: (id) => tabs.close(id),
    resize: (width) => tabs.resize(width)
  }
}
