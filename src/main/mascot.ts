import { BrowserWindow, ipcMain, screen } from 'electron'
import type { IpcMainEvent, Rectangle } from 'electron'
import { statSync } from 'fs'
import { basename, isAbsolute } from 'path'
import { isThumbnail } from './attachments'
import { getConfig, updateConfig } from './config'
import type { Point } from './config'
import { loadPage, PRELOAD, reloadOnCrash } from './page'
import { ATTACHMENT_LIMITS, IPC, SOUND_NAMES } from '../shared/ipc'
import type {
  Accessory,
  DroppedFile,
  DroppedFiles,
  Gaze,
  MascotReaction,
  MascotView,
  SoundName
} from '../shared/ipc'

const MASCOT_SIZE = 128
const EDGE_MARGIN = 16
const DRAG_TICK_MS = 16

let mascotWin: BrowserWindow | null = null
/** O estado atual, reenviado quando a página (re)carrega. */
let view: MascotView = { state: 'idle', look: 'left' }
/** O acessório do dia, reenviado quando a página (re)carrega. */
let accessory: Accessory | null = null
/** O usuário escondeu o mascote pelo menu da bandeja (só nesta execução). */
let hiddenByUser = false
/** A saudação sai uma vez só, quando a janela aparece pela primeira vez com a página pronta. */
const greeting = {
  shown: false,
  ready: false,
  done: false
}
let handlers: MascotHandlers | null = null

/** O que o mascote faz com o que acontece na janela dele. */
export interface MascotHandlers {
  /** Clique sem arraste. */
  click(): void
  /** O cursor entrou ou saiu de cima do mascote. */
  hover(inside: boolean): void
  /** O usuário mexeu com o mascote (cutucadas, carinho). */
  activity(): void
  /** Arquivos soltos no mascote, já conferidos. */
  drop(dropped: DroppedFiles): void
  /** Clique com o botão direito. */
  menu(): void
  /** A página pede um som de reação. */
  sound(name: SoundName): void
  /** A página (re)carregou: o estado já foi; o resto que ela precisa vai por aqui. */
  ready(): void
  /** O mascote apareceu ou mudou de lugar (a leitura do cursor recomeça). */
  moved(): void
}

/** Cria a janela do mascote e liga o arraste, os cliques e o resto do que vem da página. */
export function setupMascot(options: MascotHandlers): void {
  handlers = options
  ipcMain.on(IPC.mascotDragStart, onDragStart)
  ipcMain.on(IPC.mascotDragEnd, onDragEnd)
  ipcMain.on(IPC.mascotClick, (event) => {
    if (fromMascot(event)) options.click()
  })
  ipcMain.on(IPC.mascotReady, (event) => {
    if (!fromMascot(event)) return
    event.sender.send(IPC.mascotState, view)
    event.sender.send(IPC.mascotAccessory, accessory)
    options.ready()
    greeting.ready = true
    maybeGreet()
  })
  ipcMain.on(IPC.mascotHover, (event, inside: unknown) => {
    if (fromMascot(event) && typeof inside === 'boolean') options.hover(inside)
  })
  ipcMain.on(IPC.mascotActivity, (event) => {
    if (fromMascot(event)) options.activity()
  })
  ipcMain.on(IPC.mascotMenu, (event) => {
    if (fromMascot(event)) options.menu()
  })
  ipcMain.on(IPC.soundPlay, (event, name: unknown) => {
    if (fromMascot(event) && SOUND_NAMES.includes(name as SoundName))
      options.sound(name as SoundName)
  })
  ipcMain.on(IPC.mascotDrop, (event, dropped: unknown) => {
    if (!fromMascot(event)) return
    const checked = checkDropped(dropped)
    if (checked.files.length || checked.problems.length) options.drop(checked)
  })

  screen.on('display-removed', keepMascotOnScreen)
  screen.on('display-metrics-changed', keepMascotOnScreen)

  mascotWin = createMascotWindow()
}

/** A janela do mascote, para o menu dele aparecer junto. */
export function getMascotWindow(): BrowserWindow | null {
  return mascotWin
}

/** Onde o mascote está agora (para ancorar o chat ao lado dele). */
export function getMascotBounds(): Rectangle | null {
  return mascotWin?.getBounds() ?? null
}

/** Mostra um estado no mascote (seção 5.3). */
export function setMascotView(next: MascotView): void {
  if (
    next.state === view.state &&
    next.look === view.look &&
    Boolean(next.music) === Boolean(view.music)
  )
    return
  view = next
  mascotWin?.webContents.send(IPC.mascotState, view)
}

/** Faz o brilho pulsar uma vez (no ritmo do texto que chega). */
export function pulseMascot(): void {
  mascotWin?.webContents.send(IPC.mascotPulse)
}

/** Para onde os olhos olham (null: de volta ao centro). */
export function setMascotGaze(gaze: Gaze | null): void {
  mascotWin?.webContents.send(IPC.mascotGaze, gaze)
}

/** Uma reação que vem de fora da página. */
export function reactMascot(reaction: MascotReaction): void {
  mascotWin?.webContents.send(IPC.mascotReact, reaction)
}

/** O acessório do dia (null: nenhum). */
export function setMascotAccessory(next: Accessory | null): void {
  if (next === accessory) return
  accessory = next
  mascotWin?.webContents.send(IPC.mascotAccessory, accessory)
}

/** Toca um som na página do mascote, onde fica o WebAudio. */
export function playMascotSound(name: SoundName, volume: number): void {
  mascotWin?.webContents.send(IPC.mascotSound, name, volume)
}

/** Um som da pasta do usuário (bytes) ou a volta do sintetizado (null). */
export function sendMascotCustomSound(name: SoundName, data: Buffer | null): void {
  mascotWin?.webContents.send(IPC.mascotCustomSound, name, data)
}

/** Se o mascote deve aparecer (a janela pode ainda estar carregando). */
export function isMascotVisible(): boolean {
  return !hiddenByUser
}

/** Esconde ou mostra o mascote (menu da bandeja). Mostrar não rouba o foco. */
export function setMascotVisible(visible: boolean): void {
  hiddenByUser = !visible
  if (!mascotWin) return
  if (visible) {
    mascotWin.showInactive()
    handlers?.moved()
  } else {
    stopDrag()
    mascotWin.hide()
  }
}

/** Onde está o mascote, se ele está à vista (para os olhos e o cochilo). */
export function getVisibleMascotBounds(): Rectangle | null {
  return mascotWin && !hiddenByUser && mascotWin.isVisible() ? mascotWin.getBounds() : null
}

function maybeGreet(): void {
  if (greeting.done || !greeting.shown || !greeting.ready) return
  greeting.done = true
  reactMascot('greet')
}

/**
 * Os arquivos soltos no mascote, conferidos: caminhos absolutos de arquivos comuns, dentro do
 * limite de tamanho; o resto vira um problema para o painel mostrar.
 */
function checkDropped(value: unknown): DroppedFiles {
  const input = (value ?? {}) as { files?: unknown; problems?: unknown }
  const files: DroppedFile[] = []
  const problems: string[] = []
  const list = Array.isArray(input.files)
    ? input.files.slice(0, ATTACHMENT_LIMITS.maxFiles * 2)
    : []
  for (const item of list as { path?: unknown; thumbnail?: unknown }[]) {
    const path = item?.path
    if (typeof path !== 'string' || !isAbsolute(path)) continue
    const name = basename(path)
    try {
      const info = statSync(path)
      if (!info.isFile()) {
        problems.push(`"${name}" não é um arquivo.`)
      } else if (info.size > ATTACHMENT_LIMITS.maxBytes) {
        problems.push(`"${name}" passa de ${ATTACHMENT_LIMITS.maxBytes / 1024 / 1024} MB.`)
      } else {
        const thumbnail = isThumbnail(item.thumbnail) ? item.thumbnail : undefined
        files.push({ path, name, size: info.size, ...(thumbnail ? { thumbnail } : {}) })
      }
    } catch {
      problems.push(`Não consegui ler "${name}".`)
    }
  }
  if (Array.isArray(input.problems)) {
    for (const problem of input.problems.slice(0, 10)) {
      if (typeof problem === 'string' && problem.length <= 300) problems.push(problem)
    }
  }
  return { files, problems }
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
      spellcheck: false,
      // Os sons do Wisp tocam aqui, e quase nunca depois de um clique nesta janela.
      autoplayPolicy: 'no-user-gesture-required'
    }
  })

  win.once('ready-to-show', () => {
    if (hiddenByUser) return
    win.showInactive()
    greeting.shown = true
    maybeGreet()
    handlers?.moved()
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
  handlers?.moved()
}
