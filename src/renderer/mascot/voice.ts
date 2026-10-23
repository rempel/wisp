import workletUrl from './voice-worklet.ts?worker&url'
import { EnergyVad, frameDb, VOICE_RATE } from '../../shared/vad'
import type { VadOptions } from '../../shared/vad'
import type { VoiceCaptureEvent, VoiceMode } from '../../shared/ipc'
import { t } from '../../shared/i18n'

// A voz na página do mascote, que está sempre carregada: a captura do microfone (aberto só
// enquanto o Wisp ouve) e a fala das respostas. O áudio fica na memória e vai para o main pelo
// IPC; nada é gravado em disco.

/** Quando a escuta acaba sozinha, em cada modo. */
const LIMITS: Record<VoiceMode, VadOptions> = {
  // Segurando o atalho, quem encerra é soltar a tecla; o silêncio de 3 s e o máximo são garantias
  // para o caso de o soltar se perder (um desktop que não avisa, uma conexão que caiu).
  hold: { endSilenceMs: 3000, noSpeechMs: 10_000, maxMs: 30_000 },
  // O botão do painel e um toque no atalho: acaba no silêncio depois da fala.
  auto: { endSilenceMs: 1200, noSpeechMs: 6000, maxMs: 30_000 },
  // O teste de voz das configurações: 3 s, com fala ou sem, e todo o áudio vai.
  test: { endSilenceMs: 0, noSpeechMs: 0, maxMs: 3000 }
}
/** A cada quantos quadros (de 20 ms) vai o volume para o painel e o mascote. */
const LEVEL_EVERY = 5

/** O volume de um quadro, de 0 a 1, para mostrar (de -60 a -10 dBFS). */
function levelOf(db: number): number {
  return Math.min(1, Math.max(0, (db + 60) / 50))
}

interface Listening {
  id: number
  mode: VoiceMode
  stream: MediaStream
  context: AudioContext
  vad: EnergyVad
  frames: number
}

function errorOf(id: number, err: unknown): VoiceCaptureEvent {
  const name = (err as { name?: string } | null)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return { type: 'error', id, reason: 'denied', message: t('o acesso ao microfone foi negado') }
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return { type: 'error', id, reason: 'no-device', message: t('não achei um microfone') }
  }
  if (name === 'NotReadableError') {
    return {
      type: 'error',
      id,
      reason: 'no-device',
      message: t('o microfone está ocupado ou não respondeu')
    }
  }
  return { type: 'error', id, reason: 'failed', message: (err as Error)?.message || String(err) }
}

export class VoiceCapture {
  /** A escuta em andamento, depois de o microfone abrir. */
  private current: Listening | null = null
  /** A escuta pedida, enquanto o microfone abre. */
  private opening: { id: number; mode: VoiceMode } | null = null

  constructor(
    private readonly emit: (event: VoiceCaptureEvent) => void,
    /** O volume (0 a 1) enquanto ouve; null quando para. */
    private readonly level: (level: number | null) => void
  ) {}

  async start(id: number, mode: VoiceMode): Promise<void> {
    this.close()
    const request = { id, mode }
    this.opening = request
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      })
    } catch (err) {
      if (this.opening === request) {
        this.opening = null
        this.emit(errorOf(id, err))
      }
      return
    }
    // Cancelada (ou trocada por outra) enquanto o microfone abria.
    if (this.opening !== request) {
      for (const track of stream.getTracks()) track.stop()
      return
    }
    // A 16 kHz, a taxa do whisper.cpp: o Chromium converte o que vem do microfone.
    let context: AudioContext | null = null
    try {
      context = new AudioContext({ sampleRate: VOICE_RATE, latencyHint: 'interactive' })
      await context.audioWorklet.addModule(workletUrl)
    } catch (err) {
      for (const track of stream.getTracks()) track.stop()
      void context?.close()
      if (this.opening === request) {
        this.opening = null
        this.emit(errorOf(id, err))
      }
      return
    }
    if (this.opening !== request) {
      for (const track of stream.getTracks()) track.stop()
      void context.close()
      return
    }
    this.opening = null
    const source = context.createMediaStreamSource(stream)
    const node = new AudioWorkletNode(context, 'wisp-voice', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
      channelCountMode: 'explicit'
    })
    const listening: Listening = {
      id,
      mode: request.mode,
      stream,
      context,
      vad: new EnergyVad(LIMITS[request.mode]),
      frames: 0
    }
    this.current = listening
    node.port.onmessage = (message: MessageEvent<Float32Array>) => {
      if (this.current !== listening) return
      const frame = message.data
      const event = listening.vad.push(frame)
      if (++listening.frames % LEVEL_EVERY === 0) {
        const level = levelOf(frameDb(frame))
        this.level(level)
        this.emit({ type: 'level', id, level })
      }
      if (event === 'speech') this.emit({ type: 'speech', id })
      else if (event === 'end') this.finish(id)
    }
    source.connect(node)
    this.emit({ type: 'open', id })
  }

  /** O atalho foi solto logo (um toque): a escuta segue até o silêncio. */
  setMode(id: number, mode: VoiceMode): void {
    if (this.opening?.id === id) this.opening.mode = mode
    if (this.current?.id === id) {
      this.current.mode = mode
      this.current.vad.setOptions(LIMITS[mode])
    }
  }

  /** Acabou: manda o que ouviu (ou que não houve fala). */
  finish(id: number): void {
    if (this.opening?.id === id) {
      this.opening = null
      this.emit({ type: 'empty', id })
      return
    }
    const listening = this.current
    if (!listening || listening.id !== id) return
    this.close()
    const pcm = listening.mode === 'test' ? listening.vad.all() : listening.vad.result()
    if (pcm) {
      const bytes = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) as ArrayBuffer
      this.emit({ type: 'audio', id, pcm: bytes })
    } else {
      this.emit({ type: 'empty', id })
    }
  }

  /** Desiste: o microfone fecha e o áudio é descartado. */
  cancel(id?: number): void {
    if (id !== undefined && this.opening?.id !== id && this.current?.id !== id) return
    this.close()
  }

  /** Fecha o microfone (o indicador de gravação do desktop apaga) e solta o áudio. */
  private close(): void {
    this.opening = null
    const listening = this.current
    this.current = null
    if (!listening) return
    for (const track of listening.stream.getTracks()) track.stop()
    void listening.context.close()
    this.level(null)
  }
}

/** A fala das respostas (Piper), tocada da memória. */
export class VoiceSpeaker {
  private playing: { id: number; context: AudioContext } | null = null

  constructor(private readonly done: (id: number) => void) {}

  say(id: number, pcm: Uint8Array, rate: number): void {
    this.hush()
    const samples = new Int16Array(
      pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + (pcm.byteLength & ~1))
    )
    if (!samples.length) {
      this.done(id)
      return
    }
    const context = new AudioContext({ latencyHint: 'playback' })
    const buffer = context.createBuffer(1, samples.length, rate)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 0x8000
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    const playing = { id, context }
    this.playing = playing
    source.onended = () => {
      if (this.playing !== playing) return
      this.playing = null
      void context.close()
      this.done(id)
    }
    source.start()
  }

  hush(): void {
    const playing = this.playing
    this.playing = null
    if (!playing) return
    void playing.context.close()
    this.done(playing.id)
  }
}
