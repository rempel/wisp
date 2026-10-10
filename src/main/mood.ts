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
 * O humor do mascote (seção 5.3 da especificação): traduz os eventos da conversa num estado.
 * Vale o primeiro que se aplicar:
 * 1. pedindo permissão, enquanto houver um card esperando;
 * 2. feliz ou erro, por alguns segundos depois que o turno acaba;
 * 3. falando, enquanto o texto chega, ou trabalhando, no resto do turno;
 * 4. ocioso.
 */
export class MascotMood {
  private busy = false
  private talking = false
  private flash: 'happy' | 'error' | null = null
  private readonly pending = new Set<string>()
  private current: MascotState = 'idle'
  private talkTimer: NodeJS.Timeout | null = null
  private flashTimer: NodeJS.Timeout | null = null
  private lastPulse = 0

  constructor(private readonly output: MoodOutput) {}

  get state(): MascotState {
    return this.current
  }

  onEvent(event: ChatEvent): void {
    switch (event.type) {
      case 'busy':
        this.busy = event.busy
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
        this.pending.add(event.id)
        break
      case 'permission-resolved':
        this.pending.delete(event.id)
        break
      case 'turn-end':
        this.pending.clear()
        this.setTalking(false)
        if (event.outcome === 'done') this.setFlash('happy', HAPPY_MS)
        else if (event.outcome === 'error') this.setFlash('error', ERROR_MS)
        break
      case 'notice':
        if (event.level === 'error') this.setFlash('error', ERROR_MS)
        break
      case 'reset':
        this.busy = false
        this.pending.clear()
        this.setTalking(false)
        this.setFlash(null)
        break
    }
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
      this.pending.size > 0
        ? 'permission'
        : (this.flash ?? (this.busy ? (this.talking ? 'talking' : 'working') : 'idle'))
    if (next === this.current) return
    this.current = next
    this.output.state(next)
  }
}
