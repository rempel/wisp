import type { SoundName } from '../../shared/ipc'

/** Depois do último som, quanto tempo (ms) o áudio fica acordado antes de suspender. */
const SUSPEND_AFTER_MS = 2000
/** Suspenso por este tempo (ms), o contexto fecha e solta o dispositivo de áudio. */
const CLOSE_AFTER_MS = 60_000
/**
 * Ganho com o volume no máximo (1 na config). Com o volume padrão (0,5), o pico dos sons fica
 * perto de -16 dBFS: dá para ouvir sem chamar atenção demais.
 */
const MASTER = 1.8

/** Uma nota: oscilador com envelope, deslizando de `from` para `to` (Hz). */
interface Tone {
  type?: OscillatorType
  from: number
  to?: number
  /** Começo (s, a partir do início do som) e duração (s). */
  at: number
  dur: number
  gain: number
  attack?: number
  /** Vibrato: velocidade (Hz) e profundidade (Hz). */
  vibrato?: [rate: number, depth: number]
  /** Tremolo: velocidade (Hz) e profundidade (0 a 1). */
  tremolo?: [rate: number, depth: number]
}

/** Um sopro de ruído filtrado, deslizando a frequência do filtro. */
interface Noise {
  from: number
  to: number
  at: number
  dur: number
  gain: number
  q: number
}

type Part = Tone | (Noise & { noise: true })

function lfo(
  ctx: BaseAudioContext,
  rate: number,
  depth: number,
  target: AudioParam,
  t: number,
  end: number
): void {
  const osc = ctx.createOscillator()
  osc.frequency.value = rate
  const amount = ctx.createGain()
  amount.gain.value = depth
  osc.connect(amount).connect(target)
  osc.start(t)
  osc.stop(end)
}

function playTone(ctx: BaseAudioContext, out: AudioNode, t0: number, tone: Tone): void {
  const t = t0 + tone.at
  const end = t + tone.dur
  const osc = ctx.createOscillator()
  osc.type = tone.type ?? 'sine'
  osc.frequency.setValueAtTime(tone.from, t)
  if (tone.to) osc.frequency.exponentialRampToValueAtTime(tone.to, end)
  const env = ctx.createGain()
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(tone.gain, t + (tone.attack ?? 0.008))
  env.gain.exponentialRampToValueAtTime(0.0001, end)
  let last: AudioNode = osc.connect(env)
  if (tone.tremolo) {
    const [rate, depth] = tone.tremolo
    const trem = ctx.createGain()
    trem.gain.value = 1 - depth / 2
    lfo(ctx, rate, depth / 2, trem.gain, t, end)
    last = last.connect(trem)
  }
  last.connect(out)
  if (tone.vibrato) lfo(ctx, tone.vibrato[0], tone.vibrato[1], osc.frequency, t, end)
  osc.start(t)
  osc.stop(end + 0.02)
}

function playNoise(ctx: BaseAudioContext, out: AudioNode, t0: number, noise: Noise): void {
  const t = t0 + noise.at
  const end = t + noise.dur
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * noise.dur), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = noise.q
  filter.frequency.setValueAtTime(noise.from, t)
  filter.frequency.exponentialRampToValueAtTime(noise.to, end)
  const env = ctx.createGain()
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(noise.gain, t + 0.03)
  env.gain.exponentialRampToValueAtTime(0.0001, end)
  source.connect(filter).connect(env).connect(out)
  source.start(t)
  source.stop(end + 0.02)
}

/**
 * Os sons do Wisp, sintetizados: bipes de seno e triângulo, curtos e suaves, como um robozinho
 * de brinquedo. Cada um é uma lista de notas (e às vezes um sopro de ruído).
 */
const SYNTHS: Record<SoundName, Part[]> = {
  // Duas notas subindo.
  abrir: [
    { from: 520, to: 780, at: 0, dur: 0.09, gain: 0.18 },
    { from: 780, to: 1170, at: 0.07, dur: 0.13, gain: 0.16 },
    { type: 'triangle', from: 1560, at: 0.08, dur: 0.1, gain: 0.025 }
  ],
  // As mesmas, descendo.
  fechar: [
    { from: 1040, to: 700, at: 0, dur: 0.09, gain: 0.16 },
    { from: 700, to: 470, at: 0.07, dur: 0.13, gain: 0.15 }
  ],
  // Um "fiu" para cima, com um sopro.
  enviar: [
    { from: 380, to: 1200, at: 0, dur: 0.14, gain: 0.13, attack: 0.012 },
    { noise: true, from: 800, to: 4200, at: 0, dur: 0.16, gain: 0.05, q: 1.2 }
  ],
  // Um sininho de duas notas (com um harmônico baixinho em cada).
  pronto: [
    { from: 1047, at: 0, dur: 0.35, gain: 0.14 },
    { from: 2094, at: 0, dur: 0.18, gain: 0.025 },
    { from: 1568, at: 0.11, dur: 0.5, gain: 0.13 },
    { from: 3136, at: 0.11, dur: 0.22, gain: 0.02 }
  ],
  // "Plim-plom" subindo: pede atenção sem assustar.
  pedido: [
    { from: 880, at: 0, dur: 0.17, gain: 0.15 },
    { type: 'triangle', from: 880, at: 0, dur: 0.12, gain: 0.04 },
    { from: 1175, at: 0.19, dur: 0.26, gain: 0.14 },
    { type: 'triangle', from: 1175, at: 0.19, dur: 0.15, gain: 0.035 }
  ],
  // Duas notas graves descendo.
  erro: [
    { type: 'triangle', from: 330, to: 220, at: 0, dur: 0.22, gain: 0.17 },
    { type: 'triangle', from: 247, to: 165, at: 0.2, dur: 0.32, gain: 0.16 }
  ],
  // Um apito de brinquedo de borracha.
  cutucada: [
    { from: 700, to: 1400, at: 0, dur: 0.07, gain: 0.14 },
    { from: 1400, to: 900, at: 0.06, dur: 0.1, gain: 0.12 }
  ],
  // Um "uóóóu" descendo e tremendo.
  tonto: [
    { from: 1000, to: 320, at: 0, dur: 0.7, gain: 0.13, vibrato: [9, 70] },
    { from: 1500, to: 480, at: 0.04, dur: 0.6, gain: 0.025, vibrato: [9, 100] }
  ],
  // Um ronronar grave e um "hm-hm" contente.
  carinho: [
    { type: 'triangle', from: 196, at: 0, dur: 0.55, gain: 0.08, attack: 0.05, tremolo: [24, 0.8] },
    { from: 660, to: 990, at: 0.06, dur: 0.17, gain: 0.09 },
    { from: 990, to: 1320, at: 0.22, dur: 0.2, gain: 0.08 }
  ],
  // "O-i!": duas sílabas subindo, a segunda com um tremidinho.
  oi: [
    { from: 600, to: 900, at: 0, dur: 0.11, gain: 0.14 },
    { from: 900, to: 1350, at: 0.13, dur: 0.17, gain: 0.14, vibrato: [7, 15] },
    { type: 'triangle', from: 2700, at: 0.14, dur: 0.1, gain: 0.018 }
  ],
  // Um sininho de três notas, duas vezes (a segunda mais baixa), para o lembrete.
  lembrete: [
    { from: 1319, at: 0, dur: 0.22, gain: 0.13 },
    { from: 2638, at: 0, dur: 0.12, gain: 0.02 },
    { from: 1568, at: 0.12, dur: 0.22, gain: 0.13 },
    { from: 3136, at: 0.12, dur: 0.12, gain: 0.02 },
    { from: 2093, at: 0.24, dur: 0.42, gain: 0.12 },
    { from: 4186, at: 0.24, dur: 0.2, gain: 0.015 },
    { from: 1319, at: 0.72, dur: 0.2, gain: 0.08 },
    { from: 1568, at: 0.84, dur: 0.2, gain: 0.08 },
    { from: 2093, at: 0.96, dur: 0.4, gain: 0.075 }
  ],
  // Um gole: desce rápido e faz "plop".
  absorver: [
    { from: 520, to: 160, at: 0, dur: 0.16, gain: 0.17 },
    { from: 260, to: 520, at: 0.17, dur: 0.08, gain: 0.11 }
  ]
}

/** Agenda as notas de um som sintetizado a partir de `t`; devolve quanto ele dura (s). */
export function synthesize(
  ctx: BaseAudioContext,
  out: AudioNode,
  t: number,
  name: SoundName
): number {
  const parts = SYNTHS[name]
  for (const part of parts) {
    if ('noise' in part) playNoise(ctx, out, t, part)
    else playTone(ctx, out, t, part)
  }
  return Math.max(...parts.map((part) => part.at + part.dur))
}

/**
 * Toca os sons com WebAudio. O contexto de áudio nasce no primeiro som, suspende logo depois do
 * último (o Chromium para de processar áudio) e fecha depois de um tempo sem som, soltando o
 * dispositivo. Os arquivos da pasta de sons do usuário tomam o lugar dos sintetizados.
 */
export class SoundPlayer {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private readonly custom = new Map<SoundName, ArrayBuffer>()
  private readonly decoded = new Map<SoundName, AudioBuffer>()
  private endsAt = 0
  private suspendTimer = 0
  private closeTimer = 0

  async play(name: SoundName, volume: number): Promise<void> {
    window.clearTimeout(this.suspendTimer)
    window.clearTimeout(this.closeTimer)
    const ctx = this.context()
    const master = this.master!
    if (ctx.state === 'suspended') await ctx.resume()
    master.gain.value = Math.min(1, Math.max(0, volume)) * MASTER
    const buffer = await this.customBuffer(ctx, name)
    const t = ctx.currentTime + 0.01
    let duration: number
    if (buffer) {
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(master)
      source.start(t)
      duration = buffer.duration
    } else {
      duration = synthesize(ctx, master, t, name)
    }
    this.endsAt = Math.max(this.endsAt, t + duration)
    this.scheduleSuspend(ctx)
  }

  /** Um som da pasta do usuário (bytes do arquivo), ou null para voltar ao sintetizado. */
  setCustom(name: SoundName, data: ArrayBuffer | null): void {
    this.decoded.delete(name)
    if (data) this.custom.set(name, data)
    else this.custom.delete(name)
  }

  private context(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext({ latencyHint: 'interactive' })
      this.master = this.ctx.createGain()
      this.master.connect(this.ctx.destination)
      this.endsAt = 0
    }
    return this.ctx
  }

  /** O arquivo do usuário decodificado (uma vez só); null se não houver ou não decodificar. */
  private async customBuffer(ctx: AudioContext, name: SoundName): Promise<AudioBuffer | null> {
    const cached = this.decoded.get(name)
    if (cached) return cached
    const data = this.custom.get(name)
    if (!data) return null
    try {
      // O decodeAudioData consome o ArrayBuffer: vai uma cópia.
      const buffer = await ctx.decodeAudioData(data.slice(0))
      this.decoded.set(name, buffer)
      return buffer
    } catch {
      console.warn(`[wisp] o arquivo do som "${name}" não decodificou; usando o do Wisp.`)
      this.custom.delete(name)
      return null
    }
  }

  private scheduleSuspend(ctx: AudioContext): void {
    window.clearTimeout(this.suspendTimer)
    const remaining = Math.max(0, this.endsAt - ctx.currentTime) * 1000
    this.suspendTimer = window.setTimeout(() => {
      void ctx.suspend()
      this.closeTimer = window.setTimeout(() => {
        void ctx.close()
        if (this.ctx === ctx) this.ctx = null
      }, CLOSE_AFTER_MS)
    }, remaining + SUSPEND_AFTER_MS)
  }
}
