// Quando a ilha recolhe, espia e abre (Fase 37). Recolhida, ela é a cápsula do topo; espiando (o
// cursor em cima, a voz, uma resposta pronta), a linha de estado cresce; aberta (um clique, um
// pedido de permissão, ou o cursor com "abrir ao passar o mouse"), ela mostra os cartões. Aberta,
// fica enquanto o cursor está nela; quando ele sai, recolhe depois do tempo dos ajustes (com a
// barrinha da contagem). Um pedido esperando segura a ilha aberta até a resposta, a não ser que você
// a recolha (o pedido continua esperando, no painel e na cápsula).

import { ISLAND_AUTO_CLOSE, islandOpenHeight, MUSIC_ID } from '../shared/ipc-island'
import type {
  IslandAction,
  IslandAlert,
  IslandMode,
  IslandMusic,
  IslandMusicAction,
  IslandSettings,
  IslandTab,
  IslandTask,
  MascotIsland
} from '../shared/ipc-island'
import { ISLAND_ANIMATION_MS, islandShape } from './island'

/** O cursor saiu de uma ilha que só espiava (ou que abriu sozinha com ele) (ms). */
export const HOVER_CLOSE_MS = 700
/** O que a abria acabou (o pedido foi respondido) (ms). */
export const CLOSE_MS = 400

/** Por que a ilha espia (a linha de estado maior). */
export type PeekReason = 'hover' | 'attention' | 'voice' | 'moment'

/** O que a ilha mostra, vindo do resto do Wisp. */
export interface IslandContent {
  tasks: IslandTask[]
  alerts: IslandAlert[]
  music: IslandMusic | null
  settings: IslandSettings
}

/** A linha de estado da cápsula. */
export interface IslandStatus {
  title: string
  detail: string
  tone: NonNullable<MascotIsland>['tone']
}

export interface IslandDeps {
  /** Recorta a janela: só a cápsula pega o cursor. */
  shape(area: { x: number; y: number; width: number; height: number }): void
  /** Manda a ilha para a página. */
  send(island: MascotIsland): void
  content(): IslandContent
  status(): IslandStatus
  /** Um pedido novo pode abrir a ilha sozinho (com o painel à vista, o card já está lá). */
  autoOpen(): boolean
  now?(): number
}

type Timer = ReturnType<typeof setTimeout>

export class IslandController {
  private mode: IslandMode = 'compact'
  private tab: IslandTab = 'home'
  private focus: string | null = null
  private readonly reasons = new Set<PeekReason>()
  private openBy: 'click' | 'hover' | 'alert' | null = null
  private inside = false
  /** Um clique dentro: aberta pelo cursor, ela passa a esperar o tempo dos ajustes. */
  private touched = false
  private closesAt: number | null = null
  private closeMs = 0
  /** Os pedidos que você recolheu sem responder: não abrem a ilha de novo. */
  private readonly folded = new Set<string>()
  /** Os pedidos que já abriram a ilha uma vez. */
  private readonly seen = new Set<string>()
  private alertId: string | null = null
  private closeTimer: Timer | null = null
  private shapeTimer: Timer | null = null
  private momentTimer: Timer | null = null
  private height = 0
  private readonly now: () => number

  constructor(private readonly deps: IslandDeps) {
    this.now = deps.now ?? Date.now
  }

  get current(): IslandMode {
    return this.mode
  }

  /** O que a página mostra agora. */
  view(): MascotIsland {
    const content = this.deps.content()
    const alert = this.visibleAlert(content.alerts)
    const status = this.deps.status()
    const focus = this.focusIn(content.tasks, content.music)
    return {
      mode: this.mode,
      ...status,
      tab: this.tab,
      tasks: content.tasks,
      music: content.music,
      alert,
      alerts: content.alerts.length,
      focus,
      closesAt: this.closesAt,
      closeMs: this.closeMs,
      settings: content.settings
    }
  }

  /** Algo mudou (as conversas, um pedido, a música, os ajustes): a página recebe de novo. */
  refresh(): void {
    const content = this.deps.content()
    const ids = new Set(content.alerts.map((alert) => alert.id))
    for (const id of this.folded) if (!ids.has(id)) this.folded.delete(id)
    for (const id of this.seen) if (!ids.has(id)) this.seen.delete(id)
    // Um pedido novo abre a ilha; um que chegou com o painel à vista, quando ele sair da frente.
    const fresh = content.alerts.find(
      (alert) => !this.seen.has(alert.id) && !this.folded.has(alert.id)
    )
    if (fresh && (this.mode === 'open' || this.deps.autoOpen())) {
      this.seen.add(fresh.id)
      if (this.mode !== 'open') this.open('alert')
    }
    const alert = this.visibleAlert(content.alerts)
    if (this.alertId && !alert) {
      // O pedido foi respondido: aberta só por ele, e sem o cursor, a ilha recolhe.
      if (this.mode === 'open' && this.openBy === 'alert' && !this.inside && !this.touched) {
        this.scheduleClose(CLOSE_MS)
      } else if (this.mode === 'open' && !this.inside) {
        this.scheduleClose(content.settings.autoClose * 1000)
      }
    }
    this.alertId = alert?.id ?? null
    if (alert && this.mode === 'open') this.cancelClose()
    this.push()
  }

  /** O cursor entrou ou saiu da janela da ilha. */
  hover(inside: boolean): void {
    this.inside = inside
    const settings = this.deps.content().settings
    if (inside) {
      if (this.mode === 'open') {
        this.cancelClose()
        this.push()
      } else if (settings.hoverOpen) {
        this.open('hover')
      } else {
        this.hold('hover', true)
      }
      return
    }
    if (this.mode === 'open') {
      // O cursor que a fazia espiar antes do clique também saiu.
      this.reasons.delete('hover')
      if (this.pinned()) return
      this.scheduleClose(
        this.openBy === 'hover' && !this.touched ? HOVER_CLOSE_MS : settings.autoClose * 1000
      )
      this.push()
    } else {
      this.hold('hover', false)
    }
  }

  /** Abre a ilha inteira. */
  open(by: 'click' | 'hover' | 'alert'): void {
    this.cancelClose()
    if (this.mode === 'open') {
      if (by === 'click') this.touched = true
      return this.push()
    }
    this.openBy = by
    this.touched = by === 'click'
    this.tab = 'home'
    // Aberta por você, ela mostra de novo um pedido que você tinha recolhido.
    if (by === 'click') this.folded.clear()
    this.setMode('open')
  }

  /** Recolhe (o ⌃, o painel que abriu): um pedido esperando fica para depois. */
  close(): void {
    const alert = this.visibleAlert(this.deps.content().alerts)
    if (alert) this.folded.add(alert.id)
    this.cancelClose()
    this.openBy = null
    this.touched = false
    this.setMode(this.reasons.size ? 'peek' : 'compact')
  }

  /** Um clique dentro da ilha aberta. */
  touch(): void {
    this.touched = true
    if (this.inside) this.cancelClose()
    this.push()
  }

  setTab(tab: IslandTab): void {
    this.tab = tab
    this.touch()
  }

  setFocus(id: string): void {
    this.focus = id
    this.touch()
  }

  /** Um motivo para espiar começou ou acabou. Sem motivo nenhum, ela recolhe. */
  hold(reason: PeekReason, on: boolean): void {
    if (on) {
      this.reasons.add(reason)
      if (this.mode === 'compact') {
        this.cancelClose()
        this.setMode('peek')
      } else if (this.mode === 'peek') this.cancelClose()
      return
    }
    if (!this.reasons.delete(reason) || this.reasons.size || this.mode !== 'peek') return
    this.scheduleClose(reason === 'hover' ? HOVER_CLOSE_MS : CLOSE_MS)
  }

  /** Espia por um momento (uma resposta pronta, a saudação, uma mensagem). */
  moment(ms: number, done?: () => void): void {
    if (this.momentTimer) clearTimeout(this.momentTimer)
    this.hold('moment', true)
    this.push()
    this.momentTimer = setTimeout(() => {
      this.momentTimer = null
      done?.()
      this.hold('moment', false)
      this.push()
    }, ms)
  }

  /** Para os timers (a janela fechou, a ilha foi desligada). */
  dispose(): void {
    this.cancelClose()
    if (this.shapeTimer) clearTimeout(this.shapeTimer)
    if (this.momentTimer) clearTimeout(this.momentTimer)
    this.shapeTimer = null
    this.momentTimer = null
  }

  /** O recorte da janela agora (a janela acabou de aparecer). */
  applyShape(): void {
    this.deps.shape(islandShape(this.mode, this.openHeight()))
  }

  private pinned(): boolean {
    return this.visibleAlert(this.deps.content().alerts) !== null
  }

  /** O pedido que a ilha mostra: o mais antigo que você não recolheu (aberta: qualquer um). */
  private visibleAlert(alerts: IslandAlert[]): IslandAlert | null {
    return alerts.find((alert) => !this.folded.has(alert.id)) ?? null
  }

  private focusIn(tasks: IslandTask[], music: IslandMusic | null): string | null {
    const ids = [...tasks.map((task) => task.id), ...(music ? [MUSIC_ID] : [])]
    if (this.focus && ids.includes(this.focus)) return this.focus
    // Sem escolha: o que pede você, o que trabalha, a música tocando, o resto.
    const busy = tasks.find((task) => task.state === 'waiting' || task.state === 'working')
    if (busy) return busy.id
    if (music?.status === 'Playing') return MUSIC_ID
    return ids[0] ?? null
  }

  private openHeight(): number {
    const view = this.view()
    return view ? islandOpenHeight(view) : 0
  }

  private setMode(mode: IslandMode): void {
    const before = this.mode
    this.mode = mode
    const grows =
      (mode === 'open' && before !== 'open') || (mode === 'peek' && before === 'compact')
    if (this.shapeTimer) clearTimeout(this.shapeTimer)
    this.shapeTimer = null
    if (grows) {
      // A forma cresce antes da cápsula, senão ela apareceria cortada.
      this.applyShape()
    } else {
      // E encolhe só depois da animação.
      this.shapeTimer = setTimeout(() => {
        this.shapeTimer = null
        this.applyShape()
      }, ISLAND_ANIMATION_MS + 40)
    }
    if (mode !== 'open') this.focus = null
    this.push()
  }

  private push(): void {
    const view = this.view()
    // A ilha aberta muda de altura com o que mostra (uma pergunta pede mais).
    if (this.mode === 'open' && view) {
      const height = islandOpenHeight(view)
      if (height !== this.height) {
        this.height = height
        if (!this.shapeTimer) this.applyShape()
      }
    }
    this.deps.send(view)
  }

  private scheduleClose(ms: number): void {
    this.cancelClose()
    this.closeMs = ms
    this.closesAt = this.mode === 'open' ? this.now() + ms : null
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null
      this.closesAt = null
      if (this.mode === 'open') {
        if (this.inside || this.pinned()) return this.push()
        this.openBy = null
        this.touched = false
        return this.setMode(this.reasons.size ? 'peek' : 'compact')
      }
      if (this.mode === 'peek' && !this.reasons.size) this.setMode('compact')
    }, ms)
  }

  private cancelClose(): void {
    if (this.closeTimer) clearTimeout(this.closeTimer)
    this.closeTimer = null
    this.closesAt = null
  }
}

// ---------------------------------------------------------------------------
// Os botões que vêm da página

const ID = /^[\w:.\-!]{1,200}$/
const isId = (value: unknown): value is string => typeof value === 'string' && ID.test(value)
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

function parseMusic(value: unknown): IslandMusicAction | null {
  const action = (value ?? {}) as Record<string, unknown>
  switch (action.type) {
    case 'toggle':
    case 'next':
    case 'previous':
      return { type: action.type }
    case 'seek':
      return isNumber(action.ms) && action.ms >= 0
        ? { type: 'seek', ms: Math.round(action.ms) }
        : null
    case 'shuffle':
      return typeof action.on === 'boolean' ? { type: 'shuffle', on: action.on } : null
    case 'repeat':
      return action.mode === 'none' || action.mode === 'track' || action.mode === 'list'
        ? { type: 'repeat', mode: action.mode }
        : null
    case 'volume':
      return isNumber(action.level)
        ? { type: 'volume', level: Math.min(1, Math.max(0, action.level)) }
        : null
    default:
      return null
  }
}

function parseSettings(
  value: unknown
): Extract<IslandAction, { type: 'settings' }>['patch'] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const patch = value as Record<string, unknown>
  const out: Extract<IslandAction, { type: 'settings' }>['patch'] = {}
  for (const key of ['sound', 'hoverOpen', 'covers'] as const) {
    if (key in patch) {
      if (typeof patch[key] !== 'boolean') return null
      out[key] = patch[key]
    }
  }
  if ('volume' in patch) {
    if (!isNumber(patch.volume)) return null
    out.volume = Math.min(1, Math.max(0, patch.volume))
  }
  if ('autoClose' in patch) {
    if (!ISLAND_AUTO_CLOSE.includes(patch.autoClose as (typeof ISLAND_AUTO_CLOSE)[number]))
      return null
    out.autoClose = patch.autoClose as number
  }
  return Object.keys(out).length ? out : null
}

/** Confere um botão que veio da página da ilha; null se não for um que ela tem. */
export function parseIslandAction(value: unknown): IslandAction | null {
  if (!value || typeof value !== 'object') return null
  const action = value as Record<string, unknown>
  switch (action.type) {
    case 'open':
    case 'close':
    case 'touch':
    case 'panel':
    case 'more-settings':
      return { type: action.type }
    case 'tab':
      return action.tab === 'home' || action.tab === 'settings'
        ? { type: 'tab', tab: action.tab }
        : null
    case 'focus':
    case 'show':
      if (!isId(action.type === 'focus' ? action.id : action.task)) return null
      return action.type === 'focus'
        ? { type: 'focus', id: action.id as string }
        : { type: 'show', task: action.task as string }
    case 'alert-panel':
      return isId(action.id) ? { type: 'alert-panel', id: action.id } : null
    case 'decide':
      return isId(action.id) &&
        (action.decision === 'allow' ||
          action.decision === 'deny' ||
          action.decision === 'allow-always')
        ? { type: 'decide', id: action.id, decision: action.decision }
        : null
    case 'answer': {
      const answers = action.answers
      if (!isId(action.id) || !answers || typeof answers !== 'object' || Array.isArray(answers))
        return null
      const entries = Object.entries(answers as Record<string, unknown>)
      if (!entries.length || entries.length > 4) return null
      if (
        !entries.every(
          ([key, text]) => key.length <= 400 && typeof text === 'string' && text.length <= 2000
        )
      )
        return null
      return {
        type: 'answer',
        id: action.id,
        answers: Object.fromEntries(entries) as Record<string, string>
      }
    }
    case 'music': {
      const music = parseMusic(action.action)
      return music ? { type: 'music', action: music } : null
    }
    case 'settings': {
      const patch = parseSettings(action.patch)
      return patch ? { type: 'settings', patch } : null
    }
    default:
      return null
  }
}
