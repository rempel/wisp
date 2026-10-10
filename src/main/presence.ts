import type { Point, Rectangle } from 'electron'
import type { Gaze } from '../shared/ipc'

/** Onde ficam os olhos na janela do mascote (px). */
const EYES = { x: 64, y: 80 }
/** Até esta distância dos olhos (px), o cursor está perto: mexer nele acorda o mascote. */
const NEAR = 200
/** A esta distância (px), o olhar chega a 70% do máximo; mais longe, se aproxima dele. */
const GAZE_SOFTNESS = 110
/** Passos do olhar em cada lado (de 0 a 1): mudanças menores não viram mensagem. */
const GAZE_STEPS = 20
/** Com o cursor parado por este tempo (ms), o olhar volta para o centro. */
const GAZE_HOLD_MS = 6000
/**
 * De quanto em quanto tempo (ms) o cursor é lido: com ele se mexendo, rápido, para os olhos
 * acompanharem; parado, cada vez mais devagar, até o máximo; dormindo, só para ver se alguém
 * chegou perto. Cada leitura é uma consulta ao servidor X, de microssegundos.
 */
const POLL_FAST = 50
const POLL_SLOW = 400
const POLL_ASLEEP = 500
/** De quanto em quanto tempo (ms) confere se já é hora de cochilar. */
const SLEEP_CHECK_MS = 1000

export interface PresenceOptions {
  /** Onde está o mascote; null quando ele está escondido (aí a leitura para). */
  bounds(): Rectangle | null
  /** Onde está o cursor (px independentes de densidade, como os do Electron). */
  cursor(): Promise<Point>
  /** O olhar mudou (null: de volta ao centro). */
  gaze(gaze: Gaze | null): void
  /** Cochilou ou acordou. */
  sleep(asleep: boolean): void
  /** Nada acontece na conversa: sem turno, pedido nem o feliz ou o erro do fim de um turno. */
  canSleep(): boolean
  /** Depois de quanto tempo parado o mascote cochila (ms); 0 nunca. */
  sleepAfter(): number
}

/** Arredonda para o passo do olhar (sem -0, que viraria uma mensagem à toa). */
function step(value: number): number {
  return Math.round(value * GAZE_STEPS) / GAZE_STEPS + 0
}

/** O olhar na direção do cursor: perto, só um pouco; longe, quase no máximo. */
export function gazeTowards(dx: number, dy: number): Gaze {
  const distance = Math.hypot(dx, dy)
  if (distance === 0) return { x: 0, y: 0 }
  const reach = distance / Math.hypot(distance, GAZE_SOFTNESS)
  return { x: step((dx / distance) * reach), y: step((dy / distance) * reach) }
}

/**
 * A presença do usuário perto do mascote: lê o cursor para os olhos o seguirem e decide quando
 * o mascote cochila e acorda.
 *
 * Ele cochila depois de `sleepAfter` sem atividade: nenhum evento da conversa, nenhum clique e o
 * cursor sem se mexer perto dele. Conta o movimento, e não a posição: no Wayland, um app em
 * XWayland só sabe onde o cursor está quando ele passa pelas janelas X11, e a última posição
 * conhecida pode ficar parada ao lado do mascote para sempre.
 */
export class Presence {
  private timer: NodeJS.Timeout | null = null
  private last: Point | null = null
  private interval = POLL_SLOW
  private lastMove = 0
  private lastActivity = Date.now()
  private hovering = false
  private asleep = false
  private sentGaze: Gaze | null = null
  private lastSleepCheck = 0
  private running = false
  private disposed = false

  constructor(private readonly options: PresenceOptions) {}

  get isAsleep(): boolean {
    return this.asleep
  }

  /** Começa (ou recomeça) a ler o cursor: o mascote apareceu ou mudou de lugar. */
  start(): void {
    this.schedule(0)
  }

  /** Algo aconteceu: o mascote acorda e a contagem para o cochilo recomeça. */
  activity(): void {
    this.lastActivity = Date.now()
    if (!this.asleep) return
    this.asleep = false
    this.options.sleep(false)
    this.schedule(0)
  }

  /** O cursor está em cima do mascote (o próprio mascote avisa): ele não cochila. */
  setHover(hovering: boolean): void {
    this.hovering = hovering
    this.activity()
  }

  dispose(): void {
    this.disposed = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private schedule(ms: number): void {
    if (this.timer) clearTimeout(this.timer)
    if (this.disposed) return
    this.timer = setTimeout(() => void this.tick(), ms)
  }

  private sendGaze(gaze: Gaze | null): void {
    const same =
      gaze === this.sentGaze ||
      (gaze && this.sentGaze && gaze.x === this.sentGaze.x && gaze.y === this.sentGaze.y)
    if (same) return
    this.sentGaze = gaze
    this.options.gaze(gaze)
  }

  /** Uma leitura por vez: a pergunta pelo cursor é assíncrona. */
  private async tick(): Promise<void> {
    this.timer = null
    if (this.running) return
    this.running = true
    try {
      await this.step()
    } finally {
      this.running = false
    }
  }

  private async step(): Promise<void> {
    const cursor = await this.options.cursor()
    const bounds = this.options.bounds()
    // Escondido: nada a olhar nem a acordar. Volta a ler quando aparecer (start).
    if (!bounds || this.disposed) {
      this.sentGaze = null
      return
    }
    const now = Date.now()
    const moved = !this.last || cursor.x !== this.last.x || cursor.y !== this.last.y
    this.last = cursor
    const dx = cursor.x - (bounds.x + EYES.x)
    const dy = cursor.y - (bounds.y + EYES.y)

    if (moved) {
      this.lastMove = now
      if (Math.hypot(dx, dy) < NEAR) this.activity()
    }
    if (!this.asleep) {
      if (moved) this.sendGaze(gazeTowards(dx, dy))
      else if (now - this.lastMove > GAZE_HOLD_MS) this.sendGaze(null)

      if (now - this.lastSleepCheck >= SLEEP_CHECK_MS) {
        this.lastSleepCheck = now
        const after = this.options.sleepAfter()
        const idleFor = now - this.lastActivity
        if (after > 0 && !this.hovering && idleFor >= after && this.options.canSleep()) {
          this.asleep = true
          this.sendGaze(null)
          this.options.sleep(true)
        }
      }
    }

    this.interval = this.asleep
      ? POLL_ASLEEP
      : moved
        ? POLL_FAST
        : Math.min(POLL_SLOW, Math.round(this.interval * 1.5))
    this.schedule(this.interval)
  }
}
