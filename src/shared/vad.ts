// O detector de voz por energia da captura (Fase 10). Recebe o áudio em quadros de 20 ms, a 16
// kHz, e diz quando a fala começou e acabou. O que vai para a transcrição começa 500 ms antes da
// fala, para não cortar a primeira sílaba, e termina um pouco depois dela.

/** Taxa de amostragem da captura: a que o whisper.cpp usa. */
export const VOICE_RATE = 16_000
/** Um quadro: 20 ms. */
export const FRAME = VOICE_RATE / 50

const FRAME_MS = 20
/** Folga antes da fala. */
const PRE_ROLL_FRAMES = 500 / FRAME_MS
/** Folga depois da fala. */
const TAIL_FRAMES = 300 / FRAME_MS
/** Quadros seguidos acima do limiar para contar como fala (ruídos curtos não contam). */
const START_FRAMES = 3
/** Quadros iniciais usados para medir o ruído de fundo. */
const CALIBRATION_FRAMES = 10
/** Acima do ruído de fundo, em dB, para começar a fala; e para continuar nela. */
const START_DB = 12
const KEEP_DB = 6
/** Nunca menos que isso (dBFS) para contar como fala: em silêncio total, o limiar não cai a zero. */
const MIN_SPEECH_DB = -50

export interface VadOptions {
  /** Silêncio (ms) depois da fala que encerra a escuta; 0 nunca encerra sozinho. */
  endSilenceMs: number
  /** Sem fala até aqui (ms), a escuta encerra sem nada. */
  noSpeechMs: number
  /** Escuta máxima (ms). */
  maxMs: number
}

export type VadEvent = 'speech' | 'end' | null

/** O nível de um quadro em dBFS (-100 para silêncio digital). */
export function frameDb(frame: Float32Array): number {
  let sum = 0
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i]
  const rms = Math.sqrt(sum / Math.max(1, frame.length))
  return rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100
}

export class EnergyVad {
  private readonly frames: Float32Array[] = []
  private floor = -60
  private run = 0
  private quiet = 0
  /** Primeiro e último quadro com fala (índices em `frames`). */
  private speechStart = -1
  private lastSpeech = -1
  private ended = false

  constructor(private options: VadOptions) {}

  /** Troca os limites no meio da escuta (o atalho solto logo: a escuta segue até o silêncio). */
  setOptions(options: VadOptions): void {
    this.options = options
  }

  get speaking(): boolean {
    return this.speechStart >= 0
  }

  get durationMs(): number {
    return this.frames.length * FRAME_MS
  }

  /** Um quadro novo (FRAME amostras). Devolve 'speech' quando a fala começa e 'end' no fim. */
  push(frame: Float32Array): VadEvent {
    if (this.ended) return null
    const index = this.frames.length
    this.frames.push(frame)
    const db = frameDb(frame)
    if (index < CALIBRATION_FRAMES) {
      // O ruído de fundo: a média dos primeiros quadros (a fala quase nunca começa tão cedo).
      this.floor = index === 0 ? db : (this.floor * index + db) / (index + 1)
    }
    let event: VadEvent = null
    const startAt = Math.max(MIN_SPEECH_DB, this.floor + START_DB)
    const keepAt = Math.max(MIN_SPEECH_DB, this.floor + KEEP_DB)
    if (this.speechStart < 0) {
      this.run = db > startAt ? this.run + 1 : 0
      if (this.run >= START_FRAMES) {
        this.speechStart = index - START_FRAMES + 1
        this.lastSpeech = index
        event = 'speech'
      } else if (index >= CALIBRATION_FRAMES) {
        // Fora da fala, o piso acompanha devagar o ruído (um ventilador que liga, por exemplo).
        this.floor = this.floor * 0.98 + db * 0.02
      }
    } else if (db > keepAt) {
      this.lastSpeech = index
      this.quiet = 0
    } else {
      this.quiet++
    }
    const ms = this.durationMs
    const { endSilenceMs, noSpeechMs, maxMs } = this.options
    if (
      ms >= maxMs ||
      (this.speechStart < 0 && noSpeechMs > 0 && ms >= noSpeechMs) ||
      (this.speechStart >= 0 && endSilenceMs > 0 && this.quiet * FRAME_MS >= endSilenceMs)
    ) {
      this.ended = true
      return 'end'
    }
    return event
  }

  /**
   * O áudio para a transcrição: de 500 ms antes da fala até um pouco depois dela, em PCM de 16
   * bits. null se não houve fala.
   */
  result(): Int16Array | null {
    if (this.speechStart < 0) return null
    const first = Math.max(0, this.speechStart - PRE_ROLL_FRAMES)
    const last = Math.min(this.frames.length - 1, this.lastSpeech + TAIL_FRAMES)
    const out = new Int16Array((last - first + 1) * FRAME)
    let offset = 0
    for (let i = first; i <= last; i++) {
      const frame = this.frames[i]
      for (let j = 0; j < frame.length; j++) {
        const sample = Math.max(-1, Math.min(1, frame[j]))
        out[offset++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
      }
    }
    return out.subarray(0, offset)
  }
}
