import { BrowserWindow, ipcMain, screen } from 'electron'
import type { IpcMainEvent, Rectangle } from 'electron'
import { statSync } from 'fs'
import { basename, isAbsolute } from 'path'
import { isThumbnail } from './attachments'
import { getConfig, updateConfig } from './config'
import type { Point } from './config'
import { ISLAND_ANIMATION_MS, islandBounds, islandRect, islandShape } from './island'
import { loadPage, PRELOAD, reloadOnCrash } from './page'
import { ATTACHMENT_LIMITS, IPC, SOUND_NAMES } from '../shared/ipc'
import type { AvatarName } from '../shared/avatars'
import type { Dance, MascotAct } from '../shared/emotions'
import type {
  Accessory,
  DroppedFile,
  DroppedFiles,
  Gaze,
  MascotIsland,
  MascotReaction,
  MascotView,
  SoundName,
  VoiceCaptureEvent,
  VoiceCommand,
  VoiceStatus
} from '../shared/ipc'
import { t } from '../shared/i18n'

const MASCOT_SIZE = 128
const EDGE_MARGIN = 16
const DRAG_TICK_MS = 16
/** Na ilha: o cursor saiu de cima, e ela recolhe depois disto (ms). */
const HOVER_CLOSE_MS = 700
/** Na ilha: o que a abria acabou (o pedido foi respondido) (ms). */
const CLOSE_MS = 400
/** Na ilha: quanto ela fica aberta numa resposta pronta e na saudação (ms). */
const MOMENT_MS: Record<'happy' | 'greet', number> = { happy: 3000, greet: 2600 }

let mascotWin: BrowserWindow | null = null
/** O estado atual, reenviado quando a página (re)carrega. */
let view: MascotView = { state: 'idle', look: 'left' }
/** O acessório do dia, reenviado quando a página (re)carrega. */
let accessory: Accessory | null = null
let avatar: AvatarName = 'robo'
/** A dança de quando toca música (Fase 27), reenviada quando a página (re)carrega. */
let danceStyle: Dance = 'mix'
let reduceMotion = false
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
    event.sender.send(IPC.mascotAvatar, avatar)
    event.sender.send(IPC.mascotAct, { kind: 'style', dance: danceStyle } satisfies MascotAct)
    event.sender.send(IPC.mascotMotion, reduceMotion)
    event.sender.send(IPC.mascotIsland, islandView())
    options.ready()
    greeting.ready = true
    maybeGreet()
  })
  ipcMain.on(IPC.mascotHover, (event, inside: unknown) => {
    if (!fromMascot(event) || typeof inside !== 'boolean') return
    holdIsland('hover', inside)
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
  // Na ilha, a cápsula aberta (o painel abre logo abaixo dela).
  return getIslandRect() ?? mascotWin?.getBounds() ?? null
}

/** Mostra um estado no mascote (seção 5.3). */
export function setMascotView(next: MascotView): void {
  if (
    next.state === view.state &&
    next.look === view.look &&
    Boolean(next.music) === Boolean(view.music)
  )
    return
  if (next.state === 'happy' && view.state !== 'happy') openFor(MOMENT_MS.happy)
  view = next
  // Um pedido de permissão ou um erro: a ilha abre até isso passar.
  holdIsland('attention', next.state === 'permission' || next.state === 'error')
  mascotWin?.webContents.send(IPC.mascotState, view)
  sendIsland()
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
  if (reaction === 'greet') openFor(MOMENT_MS.greet)
  mascotWin?.webContents.send(IPC.mascotReact, reaction)
}

/**
 * Uma emoção ou dança no mascote (Fase 27): pedida pelo Claude (a ferramenta express) ou na
 * galeria das configurações. Não abre a ilha nem acorda nada sozinha: quem pede já conta como
 * atividade.
 */
export function actMascot(act: Exclude<MascotAct, { kind: 'style' }>): void {
  mascotWin?.webContents.send(IPC.mascotAct, act)
}

/** A dança de quando toca música (as configurações). */
export function setMascotDanceStyle(next: Dance): void {
  if (next === danceStyle) return
  danceStyle = next
  mascotWin?.webContents.send(IPC.mascotAct, { kind: 'style', dance: next } satisfies MascotAct)
}

/** O acessório do dia (null: nenhum). */
/** O avatar escolhido (o config.json, o menu, a tela de configurações). */
export function setMascotAvatar(next: AvatarName): void {
  if (next === avatar) return
  avatar = next
  mascotWin?.webContents.send(IPC.mascotAvatar, avatar)
}

/** Menos movimento no mascote (as configurações; o do sistema o CSS já segue). */
export function setMascotMotion(reduce: boolean): void {
  if (reduce === reduceMotion) return
  reduceMotion = reduce
  mascotWin?.webContents.send(IPC.mascotMotion, reduce)
}

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
  voiceState = status.state
  holdIsland('voice', status.state !== 'idle')
  sendIsland()
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
        return { type: 'error', id, reason: 'failed', message: t('o áudio chegou estragado') }
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
        problems.push(t('"{name}" não é um arquivo.', { name }))
      } else if (info.size > ATTACHMENT_LIMITS.maxBytes) {
        problems.push(
          t('"{name}" passa de {v2} MB.', { name, v2: ATTACHMENT_LIMITS.maxBytes / 1024 / 1024 })
        )
      } else {
        const thumbnail = isThumbnail(item.thumbnail) ? item.thumbnail : undefined
        files.push({ path, name, size: info.size, ...(thumbnail ? { thumbnail } : {}) })
      }
    } catch {
      problems.push(t('Não consegui ler "{name}".', { name }))
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
  // Na ilha, a janela é a faixa do topo; senão, o mascote flutuando onde foi deixado.
  if (getConfig().compact) island = newIsland()
  const bounds = island
    ? islandBounds(screen.getPrimaryDisplay().workArea)
    : {
        ...resolveMascotPosition(getConfig().mascotPosition),
        width: MASCOT_SIZE,
        height: MASCOT_SIZE
      }

  const win = new BrowserWindow({
    ...bounds,
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
  win.once('show', () => {
    if (island) win.setShape([islandShape(island.expanded)])
  })
  win.on('closed', () => {
    stopDrag()
    mascotWin = null
    if (island) {
      clearTimeout(island.timer ?? undefined)
      clearTimeout(island.moment ?? undefined)
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
  if (island) {
    // Na ilha, continua no centro do topo (o monitor pode ter mudado de tamanho).
    mascotWin.setBounds(islandBounds(screen.getPrimaryDisplay().workArea))
  } else {
    moveMascot(resolveMascotPosition({ x, y }))
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
  // A ilha fica no topo: não se arrasta.
  if (island) return
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

// ---------------------------------------------------------------------------
// A ilha
//
// Com o modo compacto ligado (config.compact), o mascote vira uma cápsula no centro do topo da
// tela, com o Wisp inteiro em miniatura e uma linha de estado. A janela é uma faixa de tamanho
// fixo; a forma dela (setShape, XShape no X11) fica só na cápsula, recolhida ou aberta, e o resto
// da faixa deixa os cliques passarem. Ela abre enquanto houver um motivo (o cursor em cima, um
// pedido de permissão ou um erro, a voz, um momento como uma resposta pronta ou um lembrete) e
// recolhe sem nenhum.

type IslandReason = 'hover' | 'attention' | 'voice' | 'moment'

interface Island {
  expanded: boolean
  reasons: Set<IslandReason>
  timer: NodeJS.Timeout | null
  moment: NodeJS.Timeout | null
  /** Uma mensagem curta, enquanto o momento dura (um lembrete, um alerta). */
  message: { title: string; detail: string } | null
}

let island: Island | null = null
/** Em que pé está a voz (a ilha diz "ouvindo…"). */
let voiceState: VoiceStatus['state'] = 'idle'
/** A linha de baixo quando nada acontece: o próximo compromisso, por exemplo. */
let islandNote = ''

function newIsland(): Island {
  return { expanded: false, reasons: new Set(), timer: null, moment: null, message: null }
}

/** O texto da ilha: a mensagem do momento, a voz, ou o estado do mascote. */
function islandText(): { title: string; detail: string; tone: MascotIslandTone } {
  if (island?.message) return { ...island.message, tone: 'alert' }
  if (voiceState === 'listening')
    return { title: 'ouvindo…', detail: t('pode falar'), tone: 'busy' }
  if (voiceState === 'transcribing') {
    return { title: 'entendendo…', detail: t('transcrevendo o que você disse'), tone: 'busy' }
  }
  if (voiceState === 'speaking') return { title: 'falando…', detail: '', tone: 'busy' }
  switch (view.state) {
    case 'talking':
      return { title: 'respondendo…', detail: t('abra o painel para ver'), tone: 'busy' }
    case 'working':
      return { title: 'trabalhando…', detail: t('abra o painel para ver'), tone: 'busy' }
    case 'permission':
      return {
        title: t('esperando você'),
        detail: t('um pedido de permissão no painel'),
        tone: 'alert'
      }
    case 'happy':
      return { title: 'pronto!', detail: t('a resposta está no painel'), tone: 'happy' }
    case 'error':
      return { title: t('algo deu errado'), detail: t('veja no painel'), tone: 'alert' }
    case 'sleeping':
      return { title: 'cochilando…', detail: islandNote, tone: 'calm' }
    default:
      return { title: 'Wisp', detail: islandNote || t('clique para conversar'), tone: 'calm' }
  }
}

type MascotIslandTone = NonNullable<MascotIsland>['tone']

function islandView(): MascotIsland {
  return island ? { expanded: island.expanded, ...islandText() } : null
}

function sendIsland(): void {
  if (island) mascotWin?.webContents.send(IPC.mascotIsland, islandView())
}

/** A cápsula na tela, para o painel abrir logo abaixo dela (null: fora da ilha). */
export function getIslandRect(): Rectangle | null {
  return island && mascotWin ? islandRect(mascotWin.getBounds(), true) : null
}

/** Liga ou desliga a ilha (o config.json, o menu, a tela de configurações). */
export function setCompact(enabled: boolean): void {
  if (enabled === (island !== null) || !mascotWin) return
  if (enabled) {
    island = newIsland()
    mascotWin.setBounds(islandBounds(screen.getPrimaryDisplay().workArea))
    mascotWin.setShape([islandShape(false)])
    openFor(MOMENT_MS.greet)
  } else {
    clearTimeout(island?.timer ?? undefined)
    clearTimeout(island?.moment ?? undefined)
    island = null
    mascotWin.setShape([{ x: 0, y: 0, width: MASCOT_SIZE, height: MASCOT_SIZE }])
    // De volta ao lugar onde o mascote flutuava antes.
    mascotWin.setBounds({
      ...resolveMascotPosition(getConfig().mascotPosition),
      width: MASCOT_SIZE,
      height: MASCOT_SIZE
    })
    mascotWin.webContents.send(IPC.mascotIsland, null)
  }
  handlers?.moved()
}

/** A linha de baixo da ilha quando nada acontece (o próximo compromisso). */
export function setIslandNote(note: string): void {
  if (note === islandNote) return
  islandNote = note
  sendIsland()
}

/** Uma mensagem curta na ilha, aberta e pulsando por um tempo (um lembrete, um alerta). */
export function islandMessage(title: string, detail: string, ms = 5000): void {
  if (!island) return
  island.message = { title: title.slice(0, 80), detail: detail.slice(0, 160) }
  openFor(ms, () => {
    if (island) island.message = null
  })
}

/** Um motivo para a ilha ficar aberta começou ou acabou. Sem motivo nenhum, ela recolhe. */
export function holdIsland(reason: IslandReason, on: boolean): void {
  if (!island) return
  if (on) {
    island.reasons.add(reason)
    expand()
  } else if (island.reasons.delete(reason) && island.reasons.size === 0) {
    closeLater(reason === 'hover' ? HOVER_CLOSE_MS : CLOSE_MS)
  }
}

/** Abre por um momento (uma resposta pronta, a saudação), e recolhe se nada mais a segurar. */
function openFor(ms: number, done?: () => void): void {
  if (!island) return
  clearTimeout(island.moment ?? undefined)
  holdIsland('moment', true)
  sendIsland()
  island.moment = setTimeout(() => {
    done?.()
    holdIsland('moment', false)
    sendIsland()
  }, ms)
}

function expand(): void {
  if (!island || !mascotWin) return
  clearTimeout(island.timer ?? undefined)
  island.timer = null
  if (island.expanded) return
  island.expanded = true
  // A forma cresce antes da cápsula, senão ela apareceria cortada.
  mascotWin.setShape([islandShape(true)])
  sendIsland()
}

function closeLater(ms: number): void {
  if (!island) return
  clearTimeout(island.timer ?? undefined)
  island.timer = setTimeout(() => {
    if (!island || !mascotWin || island.reasons.size > 0) return
    island.expanded = false
    sendIsland()
    // A forma encolhe só depois da animação.
    island.timer = setTimeout(() => {
      if (island && !island.expanded) mascotWin?.setShape([islandShape(false)])
    }, ISLAND_ANIMATION_MS + 40)
  }, ms)
}
