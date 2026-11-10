// A pré-visualização (Fase 47): um HTML, um PDF, uma imagem ou o servidor local do projeto
// (localhost), para ver o resultado do que o Claude fez. Desde a Fase 55 ela é o navegador da
// bancada: uma WebContentsView dentro da janela do painel, no lugar que a página diz. A vista é
// isolada: outra sessão do Electron (sem os cookies do painel), sem preload, no sandbox, sem
// permissões (câmera, notificações...), sem abrir janelas, sem baixar arquivos e sem sair do
// lugar (com as páginas da internet desligadas, um link para outro site não navega). Desde a
// Fase 58, as páginas da internet abrem também, se a opção `previewWeb` estiver ligada (o
// padrão). O Markdown abre no próprio painel (o renderer o desenha). Um arquivo recarrega
// sozinho quando a pasta dele muda; "Mostrar ao Claude" anexa um print da página na conversa.

import { ipcMain, session, shell, WebContentsView } from 'electron'
import type { BrowserWindow, IpcMainInvokeEvent, NativeImage, WebContents } from 'electron'
import { existsSync, statSync, watch } from 'fs'
import type { FSWatcher } from 'fs'
import { dirname, extname, isAbsolute, resolve } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { saveIncoming } from './attachments'
import { isSensitivePath } from './claude-settings'
import { expandHome } from './paths'
import { thumbnailOf } from './screenshot'
import { IPC } from '../shared/ipc'
import type { DroppedFiles, PreviewResult, PreviewState, ViewBounds } from '../shared/ipc'
import { t } from '../shared/i18n'

/** As extensões que a janela mostra (o Markdown vai para o painel). */
export const PREVIEW_EXTENSIONS = [
  '.html',
  '.htm',
  '.pdf',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp'
]
export const MARKDOWN_EXTENSIONS = ['.md', '.markdown']
/** Os nomes desta máquina. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0'])
const PARTITION = 'wisp-preview'

export type PreviewTarget =
  | { kind: 'url'; url: string; display: string }
  | { kind: 'file'; path: string; url: string; display: string }
  | { kind: 'markdown'; path: string; display: string }

/**
 * O que abrir, a partir do que a pessoa (ou um card) deu: um endereço desta máquina
 * (http://localhost:5173, localhost:3000, :8080), ou um arquivo (absoluto, com ~ ou relativo à
 * pasta da conversa). Devolve uma string com o motivo quando não dá.
 */
export function previewTarget(
  input: string,
  base: string | null,
  home?: string,
  web = false
): PreviewTarget | string {
  const raw = input.trim()
  if (!raw) return t('Diga o endereço ou o arquivo.')
  const port = /^(?:localhost)?:(\d{2,5})(\/.*)?$/.exec(raw) ?? /^(\d{2,5})$/.exec(raw)
  if (port) return localUrl(`http://localhost:${port[1]}${port[2] ?? '/'}`)
  if (/^localhost(:\d+)?(\/|$)/.test(raw)) return localUrl(`http://${raw}`)
  if (/^https?:\/\//i.test(raw)) return localUrl(raw, web)
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return t('Só endereços http e https, e arquivos.')
  const expanded = expandHome(raw.replace(/^file:\/\//, ''))
  const root = base ? expandHome(base) : null
  // Um site sem o https:// na frente ("exemplo.com/docs"), se não for um arquivo da pasta.
  if (web && looksLikeSite(raw) && !(root && existsSync(resolve(root, expanded)))) {
    return localUrl(`https://${raw}`, web)
  }
  if (!isAbsolute(expanded) && !root) return t('Use o caminho inteiro do arquivo.')
  const path = isAbsolute(expanded) ? expanded : resolve(root as string, expanded)
  if (isSensitivePath(path, home)) return t('Este arquivo guarda segredos: o painel não mostra.')
  let file: boolean
  try {
    file = statSync(path).isFile()
  } catch {
    return t('O arquivo não existe (ou não dá para ler).')
  }
  if (!file) return t('Não é um arquivo.')
  const ext = extname(path).toLowerCase()
  if (MARKDOWN_EXTENSIONS.includes(ext)) return { kind: 'markdown', path, display: path }
  if (!PREVIEW_EXTENSIONS.includes(ext)) {
    return t('A pré-visualização mostra HTML, PDF, imagens e Markdown.')
  }
  return { kind: 'file', path, url: pathToFileURL(path).href, display: path }
}

/** O aviso de quando as páginas da internet estão desligadas nas configurações. */
const WEB_OFF = (): string =>
  t(
    'Só arquivos e endereços desta máquina (localhost): as páginas da internet estão desligadas nas configurações.'
  )

/** Parece o endereço de um site ("exemplo.com", "docs.exemplo.com/guia"), e não um arquivo? */
export function looksLikeSite(raw: string): boolean {
  const match = /^((?:[a-z0-9-]+\.)+([a-z]{2,}))(?::\d+)?(?:[/?#].*)?$/i.exec(raw)
  if (!match) return false
  // "index.html" e "notas.md" têm cara de domínio, mas são arquivos.
  const ending = `.${match[2].toLowerCase()}`
  return !PREVIEW_EXTENSIONS.includes(ending) && !MARKDOWN_EXTENSIONS.includes(ending)
}

/** O endereço é desta máquina (localhost)? */
export function isLocalAddress(raw: string): boolean {
  try {
    const url = new URL(raw)
    return url.protocol === 'file:' || LOCAL_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

function localUrl(raw: string, web = false): PreviewTarget | string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return t('Esse endereço não é válido.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return t('Só endereços http e https, e arquivos.')
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    // Uma página da internet (Fase 58): só com a opção ligada nas configurações.
    return web ? { kind: 'url', url: url.href, display: url.href } : WEB_OFF()
  }
  // O 0.0.0.0 de um servidor de desenvolvimento quer dizer "todas as interfaces": abre por aqui.
  if (url.hostname === '0.0.0.0') url.hostname = 'localhost'
  return { kind: 'url', url: url.href, display: url.href }
}

/**
 * Uma navegação dentro da página vale? Com as páginas da internet ligadas (`web`), qualquer
 * endereço http ou https; sem elas, só o mesmo servidor. De um arquivo, outro arquivo da pasta
 * dele (e nunca de um endereço para um arquivo).
 */
export function allowedNavigation(target: PreviewTarget, next: string, web = false): boolean {
  let url: URL
  try {
    url = new URL(next)
  } catch {
    return false
  }
  if (web && (url.protocol === 'http:' || url.protocol === 'https:')) return true
  if (target.kind === 'url') return url.origin === new URL(target.url).origin
  if (target.kind !== 'file' || url.protocol !== 'file:') return false
  const folder = pathToFileURL(dirname(target.path) + '/').href
  return url.href.startsWith(folder)
}

/** O que a pré-visualização pede a quem a hospeda (a bancada). */
export interface PreviewHost {
  /** O IPC veio da página do painel? */
  isSender(sender: WebContents): boolean
  /** A janela do painel (null: ainda não abriu). */
  window(): BrowserWindow | null
  /** Um print da página, para a conversa em foco. */
  attach(dropped: DroppedFiles): void
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
/** Os níveis do console, como o Claude os lê (o Electron antigo os dava em números). */
const LOG_LEVELS: Record<string, string> = {
  '0': 'debug',
  '1': 'info',
  '2': 'aviso',
  '3': 'erro',
  warning: 'aviso',
  error: 'erro'
}

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

/** A página do navegador da bancada (uma por vez) e o vigia da pasta do arquivo aberto. */
class PreviewPane {
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
  /** A página do painel recarregou: o lugar antigo não vale até ela mandar o novo. */
  private readonly forget = (): void => {
    this.bounds = null
    this.layout()
  }

  constructor(private readonly host: PreviewHost) {}

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
    this.notify()
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
    this.unwatch()
    if (this.home && !this.home.isDestroyed()) {
      this.home.webContents.off('did-start-loading', this.forget)
      this.home.contentView.removeChildView(view)
    }
    this.home = null
    if (!view.webContents.isDestroyed()) view.webContents.close()
    this.notify()
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

  /** Espera a página acabar de carregar (até `ms`). */
  private async settled(ms = 10_000): Promise<void> {
    const contents = this.view?.webContents
    if (!contents || contents.isDestroyed()) return
    const start = Date.now()
    while (contents.isLoading() && Date.now() - start < ms) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    // Um instante para a página pintar (e para o painel dizer onde ela fica).
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  /**
   * A imagem da página, depois de carregada. Com a vista escondida (a bancada fechada, outra
   * aba), ela aparece só durante o print, no último lugar que teve. Devolve o motivo se não der.
   */
  async image(): Promise<NativeImage | string> {
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
        await new Promise((resolve) => setTimeout(resolve, 150))
      }
      const image = await view.webContents.capturePage()
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

  /** Um print da página, salvo como anexo. */
  async capture(): Promise<DroppedFiles> {
    if (!this.view) return { files: [], problems: [t('A pré-visualização está fechada.')] }
    try {
      const image = await this.view.webContents.capturePage()
      if (image.isEmpty()) return { files: [], problems: [t('A página ainda não apareceu.')] }
      const saved = await saveIncoming(image.toPNG(), 'preview', 'png')
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
      canGoForward: contents.navigationHistory.canGoForward()
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
      if (this.target && !allowedNavigation(this.target, url, this.host.web()))
        event.preventDefault()
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
      this.logs.push(line.slice(0, 2000))
      if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS)
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
    contents.on('did-navigate', (_event, url) => log(`[página] ${url}`))
    contents.on('render-process-gone', (_event, details) =>
      log(`[erro] a página caiu (${details.reason})`)
    )
    const changed = (): void => this.notify()
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

  private notify(): void {
    const win = this.host.window()
    if (win && !win.isDestroyed()) win.webContents.send(IPC.previewState, this.state())
  }
}

/** O que o resto do main (as ferramentas do Claude, Fase 57) faz com a pré-visualização. */
export interface PreviewControl {
  /** Abre um endereço desta máquina ou um arquivo (`base`: a pasta para um caminho relativo). */
  open(input: string, base: string | null): PreviewResult
  state(): PreviewState
  /** A página à vista é da internet (o conteúdo dela não é de confiança). */
  remote(): boolean
  image(): Promise<NativeImage | string>
  evaluate(code: string): Promise<{ ok: true; value: string } | { ok: false; message: string }>
  console(): string[]
}

/** O IPC da pré-visualização (só o painel pede) e o controle dela para o resto do main. */
export function setupPreview(host: PreviewHost): PreviewControl {
  const preview = new PreviewPane(host)
  const from = (event: IpcMainInvokeEvent): boolean => host.isSender(event.sender)
  const open = (input: string, base: string | null): PreviewResult => {
    const target = previewTarget(input.slice(0, 4096), base, undefined, host.web())
    if (typeof target === 'string') return { ok: false, message: target }
    if (target.kind === 'markdown') return { ok: true, kind: 'markdown', path: target.path }
    if (!preview.open(target)) return { ok: false, message: t('O painel do Wisp está fechado.') }
    host.opened(target.display)
    return { ok: true, kind: target.kind }
  }
  ipcMain.handle(IPC.previewOpen, (event, input: unknown, base: unknown): PreviewResult => {
    if (!from(event) || typeof input !== 'string')
      return { ok: false, message: t('pedido inválido') }
    return open(input, typeof base === 'string' ? base : null)
  })
  ipcMain.handle(IPC.previewCapture, async (event): Promise<boolean> => {
    if (!from(event)) return false
    const dropped = await preview.capture()
    host.attach(dropped)
    return dropped.files.length > 0
  })
  ipcMain.on(IPC.previewReload, (event) => {
    if (host.isSender(event.sender)) preview.reload()
  })
  ipcMain.on(IPC.previewClose, (event) => {
    if (host.isSender(event.sender)) preview.close()
  })
  ipcMain.on(IPC.previewGo, (event, step: unknown) => {
    if (host.isSender(event.sender) && (step === -1 || step === 1)) preview.go(step)
  })
  ipcMain.on(IPC.previewExternal, (event) => {
    if (host.isSender(event.sender)) preview.external()
  })
  ipcMain.on(IPC.previewBounds, (event, bounds: unknown) => {
    if (host.isSender(event.sender)) preview.place(saneBounds(bounds))
  })
  ipcMain.handle(IPC.previewGet, (event): PreviewState => (from(event) ? preview.state() : CLOSED))
  return {
    open,
    state: () => preview.state(),
    remote: () => preview.remote(),
    image: () => preview.image(),
    evaluate: (code) => preview.evaluate(code),
    console: () => preview.console()
  }
}
