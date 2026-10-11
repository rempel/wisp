import type { ChatEvent, MascotState } from '../shared/ipc'

/** Depois do último pedaço de texto, quanto tempo o mascote continua "falando". */
const TALK_HOLD_MS = 600
/** Intervalo mínimo entre dois pulsos do brilho: o texto chega em rajadas. */
const PULSE_MIN_MS = 140
/** Quanto duram os estados do fim do turno. */
const HAPPY_MS = 1800
const ERROR_MS = 5000

export interface MoodOutput {
  /** O estado mudou. */
  state(state: MascotState): void
  /** Chegou texto da resposta: o brilho pulsa. */
  pulse(): void
}

/**
 * O humor do mascote (seção 5.3 da especificação): traduz os eventos das conversas (uma por aba)
 * num estado. Basta uma conversa trabalhando para ele trabalhar, e um card esperando em qualquer
 * uma para ele pedir.
 * Vale o primeiro que se aplicar:
 * 1. pedindo permissão, enquanto houver um card esperando;
 * 2. feliz ou erro, por alguns segundos depois que o turno acaba;
 * 3. falando, enquanto o texto chega, ou trabalhando, no resto do turno;
 * 4. cochilando, se a presença (presence.ts) disse que ele dormiu;
 * 5. ocioso.
 */
export class MascotMood {
  /** As conversas com um turno em andamento. */
  private readonly busy = new Set<string>()
  private talking = false
  private flash: 'happy' | 'error' | null = null
  /** Cards esperando resposta → a conversa de cada um. */
  private readonly pending = new Map<string, string>()
  /** Pedidos de sessões do terminal esperando resposta. */
  private externalPending = 0
  private asleep = false
  private current: MascotState = 'idle'
  private talkTimer: NodeJS.Timeout | null = null
  private flashTimer: NodeJS.Timeout | null = null
  private lastPulse = 0

  constructor(private readonly output: MoodOutput) {}

  get state(): MascotState {
    return this.current
  }

  onEvent(event: ChatEvent, conversation = ''): void {
    switch (event.type) {
      case 'busy':
        if (event.busy) this.busy.add(conversation)
        else this.busy.delete(conversation)
        // Uma mensagem nova encerra o feliz ou o erro da anterior.
        if (event.busy) this.setFlash(null)
        else this.setTalking(false)
        break
      case 'text':
        this.setTalking(true)
        this.pulse()
        break
      case 'tool-start':
      case 'tool-input':
        this.setTalking(false)
        break
      case 'permission-request':
        this.pending.set(event.id, conversation)
        break
      case 'permission-resolved':
        this.pending.delete(event.id)
        break
      case 'turn-end':
        this.clearPending(conversation)
        this.setTalking(false)
        if (event.outcome === 'done') this.setFlash('happy', HAPPY_MS)
        else if (event.outcome === 'error') this.setFlash('error', ERROR_MS)
        break
      case 'notice':
        if (event.level === 'error') this.setFlash('error', ERROR_MS)
        break
      case 'reset':
        this.busy.delete(conversation)
        this.clearPending(conversation)
        this.setTalking(false)
        this.setFlash(null)
        break
    }
    this.update()
  }

  /** Uma conversa fechou (a aba saiu): nada dela segura o humor. */
  forget(conversation: string): void {
    this.busy.delete(conversation)
    this.clearPending(conversation)
    this.update()
  }

  private clearPending(conversation: string): void {
    for (const [id, owner] of this.pending) if (owner === conversation) this.pending.delete(id)
  }

  /** Quantos pedidos das sessões do terminal esperam resposta (o mascote pede atenção). */
  setExternalRequests(count: number): void {
    this.externalPending = count
    this.update()
  }

  /** O mascote cochilou ou acordou. Só aparece quando não há mais nada para mostrar. */
  setAsleep(asleep: boolean): void {
    this.asleep = asleep
    this.update()
  }

  /** Nada acontecendo: sem turno, pedido nem o feliz ou o erro do fim de um turno. */
  get quiet(): boolean {
    return (
      this.busy.size === 0 && !this.flash && this.pending.size === 0 && this.externalPending === 0
    )
  }

  /** Uma sessão do terminal terminou (feliz) ou deu erro. A conversa do chat tem a vez. */
  flashExternal(kind: 'happy' | 'error'): void {
    if (this.busy.size) return
    this.setFlash(kind, kind === 'happy' ? HAPPY_MS : ERROR_MS)
    this.update()
  }

  dispose(): void {
    if (this.talkTimer) clearTimeout(this.talkTimer)
    if (this.flashTimer) clearTimeout(this.flashTimer)
  }

  private setTalking(talking: boolean): void {
    if (this.talkTimer) clearTimeout(this.talkTimer)
    this.talkTimer = null
    this.talking = talking
    if (!talking) return
    this.talkTimer = setTimeout(() => {
      this.talkTimer = null
      this.talking = false
      this.update()
    }, TALK_HOLD_MS)
  }

  private setFlash(flash: 'happy' | 'error' | null, ms = 0): void {
    if (this.flashTimer) clearTimeout(this.flashTimer)
    this.flashTimer = null
    this.flash = flash
    if (!flash) return
    this.flashTimer = setTimeout(() => {
      this.flashTimer = null
      this.flash = null
      this.update()
    }, ms)
  }

  private pulse(): void {
    const now = Date.now()
    if (now - this.lastPulse < PULSE_MIN_MS) return
    this.lastPulse = now
    this.output.pulse()
  }

  private update(): void {
    const next: MascotState =
      this.pending.size > 0 || this.externalPending > 0
        ? 'permission'
        : (this.flash ??
          (this.busy.size
            ? this.talking
              ? 'talking'
              : 'working'
            : this.asleep
              ? 'sleeping'
              : 'idle'))
    if (next === this.current) return
    this.current = next
    this.output.state(next)
  }
}
