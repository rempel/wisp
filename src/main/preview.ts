// A pré-visualização (Fase 47): um HTML, um PDF, uma imagem ou o servidor local do projeto
// (localhost) numa janela ao lado do painel, para ver o resultado do que o Claude fez. A janela é
// isolada: outra sessão do Electron (sem os cookies do painel), sem preload, no sandbox, sem
// permissões (câmera, notificações...), sem abrir janelas e sem sair do lugar (um link para
// outro site não navega). Só endereços desta máquina: nada da internet entra por aqui. O
// Markdown abre no próprio painel (o renderer o desenha). Um arquivo recarrega sozinho quando a
// pasta dele muda; "Mostrar ao Claude" anexa um print da janela na conversa.

import { BrowserWindow, ipcMain, screen, session } from 'electron'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { existsSync, statSync, watch } from 'fs'
import type { FSWatcher } from 'fs'
import { dirname, extname, isAbsolute, resolve } from 'path'
import { pathToFileURL } from 'url'
import { saveIncoming } from './attachments'
import { isSensitivePath } from './claude-settings'
import { expandHome } from './paths'
import { thumbnailOf } from './screenshot'
import { IPC } from '../shared/ipc'
import type { DroppedFiles, PreviewResult, PreviewState } from '../shared/ipc'
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
  home?: string
): PreviewTarget | string {
  const raw = input.trim()
  if (!raw) return t('Diga o endereço (localhost) ou o arquivo.')
  const port = /^(?:localhost)?:(\d{2,5})(\/.*)?$/.exec(raw) ?? /^(\d{2,5})$/.exec(raw)
  if (port) return localUrl(`http://localhost:${port[1]}${port[2] ?? '/'}`)
  if (/^localhost(:\d+)?(\/|$)/.test(raw)) return localUrl(`http://${raw}`)
  if (/^https?:\/\//i.test(raw)) return localUrl(raw)
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw))
    return t('Só arquivos e endereços desta máquina (localhost).')
  const expanded = expandHome(raw.replace(/^file:\/\//, ''))
  const root = base ? expandHome(base) : null
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

function localUrl(raw: string): PreviewTarget | string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return t('Esse endereço não é válido.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return t('Só arquivos e endereços desta máquina (localhost).')
  }
  if (!LOCAL_HOSTS.has(url.hostname)) return t('Só arquivos e endereços desta máquina (localhost).')
  // O 0.0.0.0 de um servidor de desenvolvimento quer dizer "todas as interfaces": abre por aqui.
  if (url.hostname === '0.0.0.0') url.hostname = 'localhost'
  return { kind: 'url', url: url.href, display: url.href }
}

/** Uma navegação dentro da janela vale? (Mesmo servidor; num arquivo, outro arquivo da pasta.) */
export function allowedNavigation(target: PreviewTarget, next: string): boolean {
  let url: URL
  try {
    url = new URL(next)
  } catch {
    return false
  }
  if (target.kind === 'url') return url.origin === new URL(target.url).origin
  if (target.kind !== 'file' || url.protocol !== 'file:') return false
  const folder = pathToFileURL(dirname(target.path) + '/').href
  return url.href.startsWith(folder)
}

/** A janela da pré-visualização (uma por vez) e o vigia da pasta do arquivo aberto. */
class PreviewWindow {
  private win: BrowserWindow | null = null
  private target: PreviewTarget | null = null
  private watcher: FSWatcher | null = null
  private reloadTimer: NodeJS.Timeout | null = null
  private owner: WebContents | null = null

  open(target: PreviewTarget, owner: WebContents): void {
    if (target.kind === 'markdown') return
    this.target = target
    this.owner = owner
    const win = this.win ?? this.create(owner)
    void win.loadURL(target.url).catch(() => {
      // O servidor ainda não subiu (ou caiu): a janela mostra o erro do Chromium; Recarregar tenta de novo.
    })
    win.setTitle(t('Pré-visualização: {what}', { what: target.display }))
    win.show()
    this.watch()
    this.notify()
  }

  reload(): void {
    this.win?.webContents.reloadIgnoringCache()
  }

  close(): void {
    this.win?.close()
  }

  /** Um print da janela, salvo como anexo. */
  async capture(): Promise<DroppedFiles> {
    if (!this.win) return { files: [], problems: [t('A pré-visualização está fechada.')] }
    try {
      const image = await this.win.webContents.capturePage()
      if (image.isEmpty()) return { files: [], problems: [t('A página ainda não apareceu.')] }
      const saved = await saveIncoming(image.toPNG(), 'preview', 'png')
      const thumbnail = thumbnailOf(image)
      return { files: [{ ...saved, ...(thumbnail ? { thumbnail } : {}) }], problems: [] }
    } catch (err) {
      return { files: [], problems: [(err as Error).message] }
    }
  }

  state(): PreviewState {
    return this.win && this.target
      ? { open: true, display: this.target.display, kind: this.target.kind }
      : { open: false, display: '', kind: null }
  }

  private create(owner: WebContents): BrowserWindow {
    const parent = BrowserWindow.fromWebContents(owner)
    const area = screen.getDisplayMatching(
      parent?.getBounds() ?? screen.getPrimaryDisplay().bounds
    ).workArea
    const at = parent?.getBounds()
    const width = Math.min(960, Math.round(area.width * 0.5))
    const height = at ? at.height : Math.round(area.height * 0.8)
    // Do lado do painel que tem mais espaço.
    const x = at
      ? at.x - area.x > area.x + area.width - (at.x + at.width)
        ? Math.max(area.x, at.x - width)
        : Math.min(area.x + area.width - width, at.x + at.width)
      : area.x + Math.round((area.width - width) / 2)
    const y = at ? at.y : area.y + Math.round((area.height - height) / 2)
    const win = new BrowserWindow({
      x,
      y,
      width,
      height,
      show: false,
      autoHideMenuBar: true,
      title: t('Pré-visualização'),
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
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    const guard = (event: { preventDefault(): void }, url: string): void => {
      if (this.target && !allowedNavigation(this.target, url)) event.preventDefault()
    }
    win.webContents.on('will-navigate', guard)
    win.webContents.on('will-redirect', guard)
    win.webContents.on('before-input-event', (event, input) => {
      if (
        input.type === 'keyDown' &&
        (input.key === 'F5' || (input.control && input.key === 'r'))
      ) {
        event.preventDefault()
        this.reload()
      }
    })
    win.on('closed', () => {
      this.win = null
      this.target = null
      this.unwatch()
      this.notify()
    })
    this.win = win
    return win
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
    if (this.owner && !this.owner.isDestroyed()) this.owner.send(IPC.previewState, this.state())
  }
}

/** O IPC da pré-visualização: só o painel pede. */
export function setupPreview(
  isSender: (sender: WebContents) => boolean,
  attach: (dropped: DroppedFiles) => void
): void {
  const preview = new PreviewWindow()
  const from = (event: IpcMainInvokeEvent): boolean => isSender(event.sender)
  ipcMain.handle(IPC.previewOpen, (event, input: unknown, base: unknown): PreviewResult => {
    if (!from(event) || typeof input !== 'string')
      return { ok: false, message: t('pedido inválido') }
    const target = previewTarget(input.slice(0, 4096), typeof base === 'string' ? base : null)
    if (typeof target === 'string') return { ok: false, message: target }
    if (target.kind === 'markdown') return { ok: true, kind: 'markdown', path: target.path }
    preview.open(target, event.sender)
    return { ok: true, kind: target.kind }
  })
  ipcMain.handle(IPC.previewCapture, async (event): Promise<boolean> => {
    if (!from(event)) return false
    const dropped = await preview.capture()
    attach(dropped)
    return dropped.files.length > 0
  })
  ipcMain.on(IPC.previewReload, (event) => {
    if (isSender(event.sender)) preview.reload()
  })
  ipcMain.on(IPC.previewClose, (event) => {
    if (isSender(event.sender)) preview.close()
  })
  ipcMain.handle(IPC.previewGet, (event): PreviewState =>
    from(event) ? preview.state() : { open: false, display: '', kind: null }
  )
}
