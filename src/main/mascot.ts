import { BrowserWindow, ipcMain, screen } from 'electron'
import type { IpcMainEvent, Rectangle } from 'electron'
import { statSync } from 'fs'
import { basename, isAbsolute } from 'path'
import { isThumbnail } from './attachments'
import { getConfig, updateConfig } from './config'
import type { Point } from './config'
import { dockedPosition, FULL_SHAPE, nearestEdge, SLIDE_MS, tabShape } from './dock'
import type { DockEdge } from './dock'
import { loadPage, PRELOAD, reloadOnCrash } from './page'
import { ATTACHMENT_LIMITS, IPC, SOUND_NAMES } from '../shared/ipc'
import type {
  Accessory,
  DroppedFile,
  DroppedFiles,
  Gaze,
  MascotDock,
  MascotReaction,
  MascotView,
  SoundName,
  VoiceCaptureEvent,
  VoiceCommand,
  VoiceStatus
} from '../shared/ipc'

const MASCOT_SIZE = 128
const EDGE_MARGIN = 16
const DRAG_TICK_MS = 16
/** No compacto: o cursor saiu de cima, e ele se esconde depois disto (ms). */
const HOVER_TUCK_MS = 1200
/** No compacto: o que o fazia espiar acabou (o painel fechou, o pedido foi respondido) (ms). */
const TUCK_MS = 700
/** No compacto: ao abrir o app ou ligar o modo, ele aparece um pouco antes de se esconder (ms). */
const FIRST_TUCK_MS = 3000
/** No compacto: quanto ele espia com uma resposta pronta, um erro ou um lembrete (ms). */
const MOMENT_MS: Record<'happy' | 'greet' | 'remind', number> = {
  happy: 3000,
  greet: 2600,
  remind: 4000
}

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
  /** O que a captura de voz (que roda na página do mascote) contou, já conferido. */
  voice(event: VoiceCaptureEvent): void
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
    event.sender.send(IPC.mascotDock, dockView())
    options.ready()
    greeting.ready = true
    maybeGreet()
  })
  ipcMain.on(IPC.mascotHover, (event, inside: unknown) => {
    if (!fromMascot(event) || typeof inside !== 'boolean') return
    holdPeek('hover', inside)
    options.hover(inside)
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
  ipcMain.on(IPC.voiceEvent, (event, sent: unknown) => {
    if (!fromMascot(event)) return
    const checked = checkVoiceEvent(sent)
    if (checked) options.voice(checked)
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
  if (next.state === 'happy' && view.state !== 'happy') peekFor(MOMENT_MS.happy)
  view = next
  // Um pedido de permissão ou um erro: ele sai da borda até isso passar.
  holdPeek('attention', next.state === 'permission' || next.state === 'error')
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
  peekFor(MOMENT_MS[reaction])
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

/** A captura e a fala de voz, na página do mascote. */
export function sendVoiceCommand(command: VoiceCommand): void {
  mascotWin?.webContents.send(IPC.voiceCommand, command)
}

/** Em que pé está a voz (o mascote mostra que ouve, transcreve ou fala). */
export function setMascotVoice(status: VoiceStatus): void {
  holdPeek('voice', status.state !== 'idle')
  mascotWin?.webContents.send(IPC.voiceStatus, status)
}

/** Até 30 s de áudio a 16 kHz, com folga. */
const MAX_VOICE_BYTES = 40 * 16_000 * 2

/** Um evento da captura de voz, conferido campo a campo (o áudio vira um ArrayBuffer só dele). */
function checkVoiceEvent(value: unknown): VoiceCaptureEvent | null {
  const event = (value ?? {}) as Record<string, unknown>
  const id = event.id
  if (typeof id !== 'number' || !Number.isInteger(id)) return null
  switch (event.type) {
    case 'open':
    case 'speech':
    case 'empty':
    case 'said':
      return { type: event.type, id }
    case 'level':
      return typeof event.level === 'number' && Number.isFinite(event.level)
        ? { type: 'level', id, level: Math.min(1, Math.max(0, event.level)) }
        : null
    case 'error': {
      const reason = event.reason
      if (reason !== 'denied' && reason !== 'no-device' && reason !== 'failed') return null
      const message = typeof event.message === 'string' ? event.message.slice(0, 300) : ''
      return { type: 'error', id, reason, message }
    }
    case 'audio': {
      const pcm = event.pcm
      const bytes =
        pcm instanceof ArrayBuffer
          ? new Uint8Array(pcm)
          : ArrayBuffer.isView(pcm)
            ? new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
            : null
      // Um áudio estragado vira um erro, para a escuta não ficar esperando.
      if (!bytes || bytes.byteLength < 2 || bytes.byteLength > MAX_VOICE_BYTES) {
        return { type: 'error', id, reason: 'failed', message: 'o áudio chegou estragado' }
      }
      // Uma cópia com tamanho par: amostras de 16 bits inteiras.
      const copy = bytes.slice(0, bytes.byteLength & ~1)
      return { type: 'audio', id, pcm: copy.buffer }
    }
  }
  return null
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
  let { x, y } = resolveMascotPosition(getConfig().mascotPosition)
  if (getConfig().compact) {
    const area = screen.getDisplayMatching({
      x,
      y,
      width: MASCOT_SIZE,
      height: MASCOT_SIZE
    }).workArea
    const edge = nearestEdge({ x, y, width: MASCOT_SIZE, height: MASCOT_SIZE }, area)
    ;({ x, y } = dockedPosition(edge, y, area))
    dock = newDock(edge)
  }

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
    if (dock) {
      clearTimeout(dock.timer ?? undefined)
      clearTimeout(dock.moment ?? undefined)
    }
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
  const p = resolveMascotPosition({ x, y })
  if (dock) {
    // No compacto, continua encostado na borda dele (o monitor pode ter mudado de tamanho).
    redock({ ...p, width: MASCOT_SIZE, height: MASCOT_SIZE }, false)
  } else {
    moveMascot(p)
  }
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
  holdPeek('drag', true)
  drag = { offset: { x: offsetX, y: offsetY }, timer: setInterval(followCursor, DRAG_TICK_MS) }
  followCursor()
}

function onDragEnd(event: IpcMainEvent): void {
  if (!fromMascot(event) || !drag || !mascotWin) return
  followCursor()
  stopDrag()
  if (dock) {
    // No compacto, encosta na borda mais perto de onde foi solto.
    redock(mascotWin.getBounds(), true)
    holdPeek('drag', false)
  } else {
    const [x, y] = mascotWin.getPosition()
    updateConfig({ mascotPosition: { x, y } })
  }
  handlers?.moved()
}

// ---------------------------------------------------------------------------
// Modo compacto
//
// O mascote mora encostado na borda esquerda ou direita, guardado: a página escorrega o desenho
// para fora da janela (só um olho e a antena ficam à vista), e a forma da janela encolhe para essa
// aba, então o resto da borda continua recebendo os cliques de quem está atrás. Ele espia (sai
// inteiro) enquanto houver um motivo: o cursor na aba, o painel aberto, um pedido de permissão ou
// um erro, a voz, o arraste, ou um momento (resposta pronta, lembrete, saudação). Sem motivo
// nenhum, volta a se guardar depois de um tempo.

type PeekReason = 'hover' | 'panel' | 'attention' | 'voice' | 'drag' | 'moment'

interface Dock {
  edge: DockEdge
  tucked: boolean
  reasons: Set<PeekReason>
  timer: NodeJS.Timeout | null
  moment: NodeJS.Timeout | null
}

let dock: Dock | null = null

function newDock(edge: DockEdge): Dock {
  const created: Dock = { edge, tucked: false, reasons: new Set(), timer: null, moment: null }
  created.timer = setTimeout(() => tuckLater(0), FIRST_TUCK_MS)
  return created
}

function dockView(): MascotDock {
  return dock ? { edge: dock.edge, tucked: dock.tucked } : null
}

function sendDock(): void {
  mascotWin?.webContents.send(IPC.mascotDock, dockView())
}

/** Liga ou desliga o modo compacto (o config.json, o menu, a tela de configurações). */
export function setCompact(enabled: boolean): void {
  if (enabled === (dock !== null) || !mascotWin) return
  const bounds = mascotWin.getBounds()
  const area = screen.getDisplayMatching(bounds).workArea
  if (enabled) {
    dock = newDock(nearestEdge(bounds, area))
    redock(bounds, true)
  } else {
    const edge = dock?.edge ?? nearestEdge(bounds, area)
    if (dock) {
      clearTimeout(dock.timer ?? undefined)
      clearTimeout(dock.moment ?? undefined)
    }
    dock = null
    mascotWin.setShape([FULL_SHAPE])
    // Sai da borda: volta a flutuar um pouco para dentro, na mesma altura.
    const p = {
      x: edge === 'left' ? area.x + EDGE_MARGIN : area.x + area.width - MASCOT_SIZE - EDGE_MARGIN,
      y: bounds.y
    }
    moveMascot(p)
    updateConfig({ mascotPosition: p })
    sendDock()
  }
  handlers?.moved()
}

/** Encosta o mascote na borda mais perto de `bounds`, no monitor dele. */
function redock(bounds: Rectangle, save: boolean): void {
  if (!dock || !mascotWin) return
  const area = screen.getDisplayMatching(bounds).workArea
  dock.edge = nearestEdge(bounds, area)
  const p = dockedPosition(dock.edge, bounds.y, area)
  moveMascot(p)
  if (save) updateConfig({ mascotPosition: p })
  if (dock.tucked) mascotWin.setShape([tabShape(dock.edge)])
  sendDock()
}

/** Um motivo para espiar começou ou acabou. Sem motivo nenhum, ele volta para a borda. */
export function holdPeek(reason: PeekReason, on: boolean): void {
  if (!dock) return
  if (on) {
    dock.reasons.add(reason)
    peek()
  } else if (dock.reasons.delete(reason) && dock.reasons.size === 0) {
    tuckLater(reason === 'hover' ? HOVER_TUCK_MS : TUCK_MS)
  }
}

/** Espia por um momento (uma resposta pronta, um lembrete), e volta se nada mais o segurar. */
function peekFor(ms: number): void {
  if (!dock) return
  clearTimeout(dock.moment ?? undefined)
  holdPeek('moment', true)
  dock.moment = setTimeout(() => holdPeek('moment', false), ms)
}

function peek(): void {
  if (!dock || !mascotWin) return
  clearTimeout(dock.timer ?? undefined)
  dock.timer = null
  if (!dock.tucked) return
  dock.tucked = false
  // A janela volta inteira antes do desenho sair, senão ele apareceria cortado.
  mascotWin.setShape([FULL_SHAPE])
  sendDock()
}

function tuckLater(ms: number): void {
  if (!dock) return
  clearTimeout(dock.timer ?? undefined)
  dock.timer = setTimeout(() => {
    if (!dock || !mascotWin || dock.reasons.size > 0 || drag) return
    dock.tucked = true
    sendDock()
    // A forma encolhe só depois da animação de se guardar.
    dock.timer = setTimeout(() => {
      if (dock?.tucked) mascotWin?.setShape([tabShape(dock.edge)])
    }, SLIDE_MS + 40)
  }, ms)
}
