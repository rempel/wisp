import { BrowserWindow, ipcMain, screen } from 'electron'
import type { IpcMainEvent, Rectangle } from 'electron'
import { getConfig, updateConfig } from './config'
import type { Point } from './config'
import { loadPage, PRELOAD, reloadOnCrash } from './page'
import { IPC } from '../shared/ipc'
import type { MascotView } from '../shared/ipc'

const MASCOT_SIZE = 128
const EDGE_MARGIN = 16
const DRAG_TICK_MS = 16

let mascotWin: BrowserWindow | null = null
/** O estado atual, reenviado quando a página (re)carrega. */
let view: MascotView = { state: 'idle', look: 'left' }
/** O usuário escondeu o mascote pelo menu da bandeja (só nesta execução). */
let hiddenByUser = false

/** Cria a janela do mascote e liga o arraste. `onClick` roda a cada clique sem arraste. */
export function setupMascot(onClick: () => void): void {
  ipcMain.on(IPC.mascotDragStart, onDragStart)
  ipcMain.on(IPC.mascotDragEnd, onDragEnd)
  ipcMain.on(IPC.mascotClick, (event) => {
    if (fromMascot(event)) onClick()
  })
  ipcMain.on(IPC.mascotReady, (event) => {
    if (fromMascot(event)) event.sender.send(IPC.mascotState, view)
  })

  screen.on('display-removed', keepMascotOnScreen)
  screen.on('display-metrics-changed', keepMascotOnScreen)

  mascotWin = createMascotWindow()
}

/** Onde o mascote está agora (para ancorar o chat ao lado dele). */
export function getMascotBounds(): Rectangle | null {
  return mascotWin?.getBounds() ?? null
}

/** Mostra um estado no mascote (seção 5.3). */
export function setMascotView(next: MascotView): void {
  if (next.state === view.state && next.look === view.look) return
  view = next
  mascotWin?.webContents.send(IPC.mascotState, view)
}

/** Faz o brilho pulsar uma vez (no ritmo do texto que chega). */
export function pulseMascot(): void {
  mascotWin?.webContents.send(IPC.mascotPulse)
}

/** Se o mascote deve aparecer (a janela pode ainda estar carregando). */
export function isMascotVisible(): boolean {
  return !hiddenByUser
}

/** Esconde ou mostra o mascote (menu da bandeja). Mostrar não rouba o foco. */
export function setMascotVisible(visible: boolean): void {
  hiddenByUser = !visible
  if (!mascotWin) return
  if (visible) mascotWin.showInactive()
  else {
    stopDrag()
    mascotWin.hide()
  }
}

function createMascotWindow(): BrowserWindow {
  const { x, y } = resolveMascotPosition(getConfig().mascotPosition)

  const win = new BrowserWindow({
    width: MASCOT_SIZE,
    height: MASCOT_SIZE,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    // Desde o Electron 43, janelas sem moldura no Linux ganham cantos arredondados.
    roundedCorners: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    // O Electron ignora skipTaskbar no Linux. Quem tira o mascote da barra de tarefas e do
    // Alt+Tab é o focusable: false: no X11 ele cria uma janela override-redirect, que o
    // gerenciador de janelas não controla. Ela fica acima das outras, aparece em todos os
    // workspaces e não rouba o foco do app em uso quando clicada.
    skipTaskbar: true,
    focusable: false,
    title: 'Wisp',
    webPreferences: {
      preload: PRELOAD,
      sandbox: true,
      spellcheck: false
    }
  })

  win.once('ready-to-show', () => {
    if (!hiddenByUser) win.showInactive()
  })
  win.on('closed', () => {
    stopDrag()
    mascotWin = null
  })
  // Sem o renderer ninguém avisa o fim do arraste; sem isso o mascote seguiria o cursor.
  win.webContents.on('render-process-gone', () => stopDrag())
  reloadOnCrash(win)

  // A janela só mostra conteúdo local: nada de abrir popups ou navegar para fora.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })

  loadPage(win, 'mascot')
  return win
}

// ---------------------------------------------------------------------------
// Posição

function clampToArea(p: Point, area: Rectangle): Point {
  return {
    x: Math.min(Math.max(p.x, area.x), area.x + area.width - MASCOT_SIZE),
    y: Math.min(Math.max(p.y, area.y), area.y + area.height - MASCOT_SIZE)
  }
}

function contains(area: Rectangle, p: Point): boolean {
  return p.x >= area.x && p.x < area.x + area.width && p.y >= area.y && p.y < area.y + area.height
}

/** Canto inferior direito da área útil do monitor principal (acima da barra/dock). */
function defaultMascotPosition(): Point {
  const { workArea } = screen.getPrimaryDisplay()
  return {
    x: workArea.x + workArea.width - MASCOT_SIZE - EDGE_MARGIN,
    y: workArea.y + workArea.height - MASCOT_SIZE - EDGE_MARGIN
  }
}

/**
 * Usa a posição pedida se o centro do mascote cair na área útil de algum monitor (ajustando
 * para ele ficar inteiro na tela). Senão, por exemplo quando o monitor foi desconectado,
 * volta para o canto padrão.
 */
function resolveMascotPosition(p: Point | null): Point {
  if (p) {
    const center = { x: p.x + MASCOT_SIZE / 2, y: p.y + MASCOT_SIZE / 2 }
    const display = screen.getAllDisplays().find((d) => contains(d.workArea, center))
    if (display) return clampToArea(p, display.workArea)
  }
  return defaultMascotPosition()
}

function moveMascot(p: Point): void {
  if (!mascotWin) return
  const [x, y] = mascotWin.getPosition()
  if (x !== p.x || y !== p.y) mascotWin.setPosition(p.x, p.y)
}

/** Quando os monitores mudam, traz o mascote de volta se ele ficou fora da tela. */
function keepMascotOnScreen(): void {
  if (!mascotWin || drag) return
  const [x, y] = mascotWin.getPosition()
  moveMascot(resolveMascotPosition({ x, y }))
}

// ---------------------------------------------------------------------------
// Arraste
//
// O renderer decide o que é clique e o que é arraste (limiar de 5 px) e avisa o início e o fim.
// Durante o arraste, o main segue o ponteiro lendo a posição global do cursor, em vez de usar as
// coordenadas dos eventos do renderer: elas são relativas a uma janela que está se movendo e
// fazem o mascote tremer.

let drag: { offset: Point; timer: NodeJS.Timeout } | null = null

function followCursor(): void {
  if (!drag) return
  const cursor = screen.getCursorScreenPoint()
  const target = {
    x: Math.round(cursor.x - drag.offset.x),
    y: Math.round(cursor.y - drag.offset.y)
  }
  moveMascot(clampToArea(target, screen.getDisplayNearestPoint(cursor).workArea))
}

function stopDrag(): void {
  if (!drag) return
  clearInterval(drag.timer)
  drag = null
}

function fromMascot(event: IpcMainEvent): boolean {
  return mascotWin !== null && event.sender === mascotWin.webContents
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function onDragStart(event: IpcMainEvent, offsetX: unknown, offsetY: unknown): void {
  if (!fromMascot(event) || !isFiniteNumber(offsetX) || !isFiniteNumber(offsetY)) return
  stopDrag()
  drag = { offset: { x: offsetX, y: offsetY }, timer: setInterval(followCursor, DRAG_TICK_MS) }
  followCursor()
}

function onDragEnd(event: IpcMainEvent): void {
  if (!fromMascot(event) || !drag || !mascotWin) return
  followCursor()
  stopDrag()
  const [x, y] = mascotWin.getPosition()
  updateConfig({ mascotPosition: { x, y } })
}
