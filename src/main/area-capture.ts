// Recortar uma área da tela (Fase 41): o print de sempre (o painel sai da frente), mostrado numa
// camada em tela cheia na tela do cursor, onde você arrasta um retângulo; o recorte vai para a
// conversa como anexo. Funciona igual no X11, no Wayland (o print do portal, recortado aqui) e no
// Windows, sem programa de fora. Esc, um clique sem arrastar ou 2 minutos sem nada: desiste.

import { BrowserWindow, ipcMain, screen } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent, NativeImage, Rectangle } from 'electron'
import { saveIncoming } from './attachments'
import { loadPage, PRELOAD } from './page'
import { CaptureError, thumbnailOf } from './screenshot'
import type { ScreenImage } from './screenshot'
import { IPC } from '../shared/ipc'
import type { AreaImage, AreaRect, DroppedFiles } from '../shared/ipc'
import { t } from '../shared/i18n'

/** Quanto a camada espera pelo recorte. */
const PICK_TIMEOUT_MS = 2 * 60_000
/** Um recorte menor que isto (em pixels da imagem) é um clique, não uma área. */
const MIN_SIDE = 4

/** O print da tela em que está o cursor (no Wayland, o único que o portal dá). */
export function shotUnderCursor(
  shots: ScreenImage[],
  cursorDisplay: number | null
): ScreenImage | null {
  if (!shots.length) return null
  return shots.find((shot) => shot.displayId === cursorDisplay) ?? shots[0]
}

/**
 * O retângulo pedido pela página, conferido contra o tamanho da imagem: inteiro, dentro dela e
 * com os lados de pelo menos MIN_SIDE. null se não serve.
 */
export function clampArea(
  rect: unknown,
  size: { width: number; height: number }
): Rectangle | null {
  if (!rect || typeof rect !== 'object') return null
  const { x, y, width, height } = rect as Record<string, unknown>
  if (![x, y, width, height].every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  const left = Math.max(0, Math.min(size.width, Math.round(x as number)))
  const top = Math.max(0, Math.min(size.height, Math.round(y as number)))
  const right = Math.max(0, Math.min(size.width, Math.round((x as number) + (width as number))))
  const bottom = Math.max(0, Math.min(size.height, Math.round((y as number) + (height as number))))
  const area = {
    x: Math.min(left, right),
    y: Math.min(top, bottom),
    width: Math.abs(right - left),
    height: Math.abs(bottom - top)
  }
  return area.width >= MIN_SIDE && area.height >= MIN_SIDE ? area : null
}

let picking: Promise<NativeImage | null> | null = null

/**
 * Mostra o print numa camada em tela cheia e espera o retângulo. Devolve o recorte, ou null se
 * a pessoa desistiu. Um pedido por vez: um segundo, com a camada aberta, espera o mesmo.
 */
export function pickArea(shot: ScreenImage): Promise<NativeImage | null> {
  if (picking) return picking
  picking = new Promise<NativeImage | null>((resolve) => {
    const cursor = screen.getCursorScreenPoint()
    const display =
      screen.getAllDisplays().find((item) => item.id === shot.displayId) ??
      screen.getDisplayNearestPoint(cursor)
    const win = new BrowserWindow({
      ...display.bounds,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      backgroundColor: '#000000',
      title: t('Recortar uma área'),
      webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true }
    })
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setMenuBarVisibility(false)
    const size = shot.image.getSize()
    let done = false
    const finish = (image: NativeImage | null): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      ipcMain.removeHandler(IPC.areaImage)
      ipcMain.removeListener(IPC.areaDone, onDone)
      if (!win.isDestroyed()) win.destroy()
      picking = null
      resolve(image)
    }
    const timer = setTimeout(() => finish(null), PICK_TIMEOUT_MS)
    const mine = (event: IpcMainEvent | IpcMainInvokeEvent): boolean =>
      !win.isDestroyed() && event.sender === win.webContents
    ipcMain.handle(IPC.areaImage, (event): AreaImage | null =>
      mine(event) ? { url: shot.image.toDataURL(), width: size.width, height: size.height } : null
    )
    const onDone = (event: IpcMainEvent, rect: AreaRect | null): void => {
      if (!mine(event)) return
      const area = clampArea(rect, size)
      finish(area ? shot.image.crop(area) : null)
    }
    ipcMain.on(IPC.areaDone, onDone)
    win.on('closed', () => finish(null))
    win.on('blur', () => {
      // Outra janela tomou a frente (um atalho do sistema): a camada não fica esquecida por trás.
      if (!win.isDestroyed()) win.focus()
    })
    win.once('ready-to-show', () => {
      win.show()
      win.focus()
    })
    loadPage(win, 'area')
  })
  return picking
}

/**
 * O recorte inteiro: o print (pelo `capture`, que tira o painel da frente), a camada, e o
 * recorte salvo como anexo. Desistir devolve nada (sem aviso).
 */
export async function captureArea(capture: () => Promise<ScreenImage[]>): Promise<DroppedFiles> {
  try {
    const shots = await capture()
    const cursor = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id
    const shot = shotUnderCursor(shots, cursor)
    if (!shot) throw new CaptureError(t('não consegui ler a tela'))
    const image = await pickArea(shot)
    if (!image) return { files: [], problems: [] }
    const saved = await saveIncoming(image.toPNG(), 'recorte', 'png')
    const thumbnail = thumbnailOf(image)
    return { files: [{ ...saved, ...(thumbnail ? { thumbnail } : {}) }], problems: [] }
  } catch (err) {
    const reason = err instanceof CaptureError ? err.message : (err as Error).message
    return { files: [], problems: [t('Não consegui recortar a tela: {reason}.', { reason })] }
  }
}
