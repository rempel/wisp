// O mascote e a voz: o que o main manda à página do mascote (o estado, a ilha, os sons, a
// captura do microfone) e o que ela devolve.

/**
 * Estados do mascote, ligados aos eventos da conversa (seção 5.3 da especificação). 'sleeping' é
 * o cochilo: nada acontece há um tempo e o cursor está longe.
 */
export type MascotState =
  'idle' | 'talking' | 'working' | 'permission' | 'happy' | 'error' | 'sleeping'

/** O que o mascote mostra: o estado, para que lado fica o painel de chat e se há música. */
export interface MascotView {
  state: MascotState
  look: 'left' | 'right'
  /** Algum player está tocando: ocioso e acordado, ele dança. */
  music?: boolean
}

/**
 * Para onde os olhos do mascote olham: de -1 a 1 em cada eixo (o máximo é o canto do visor).
 * Positivo é para a direita e para baixo.
 */
export interface Gaze {
  x: number
  y: number
}

/** Reações que o main pede ao mascote: a saudação, quando o app abre, e o toque de um lembrete. */
export type MascotReaction = 'greet' | 'remind'

/**
 * Como a escuta termina: 'hold', quando o atalho for solto (o silêncio longo só por garantia);
 * 'auto', no silêncio depois da fala; 'test', depois de 3 s, com todo o áudio (o teste de voz).
 */
export type VoiceMode = 'hold' | 'auto' | 'test'

/** main → mascote: a captura do microfone e a fala do Wisp, que rodam na página do mascote. */
export type VoiceCommand =
  | { type: 'start'; id: number; mode: VoiceMode }
  /** O atalho foi solto logo (um toque): a escuta segue até o silêncio. */
  | { type: 'mode'; id: number; mode: VoiceMode }
  /** Acabou (o atalho foi solto): manda o que ouviu. */
  | { type: 'stop'; id: number }
  /** Desiste: o microfone fecha e o áudio é descartado. */
  | { type: 'cancel'; id: number }
  /** Fala uma resposta: PCM de 16 bits, mono, nesta taxa. */
  | { type: 'say'; id: number; pcm: Uint8Array; rate: number }
  /** Para de falar. */
  | { type: 'hush' }

/** mascote → main: o que aconteceu na captura (e na fala). */
export type VoiceCaptureEvent =
  /** O microfone abriu. */
  | { type: 'open'; id: number }
  /** Começou a fala (o detector de voz ouviu alguém). */
  | { type: 'speech'; id: number }
  /** O áudio da fala, de 500 ms antes dela até o fim: PCM de 16 bits a 16 kHz. */
  | { type: 'audio'; id: number; pcm: ArrayBuffer }
  /** Acabou sem fala. */
  | { type: 'empty'; id: number }
  | { type: 'error'; id: number; reason: 'denied' | 'no-device' | 'failed'; message: string }
  /** Acabou de falar a resposta. */
  | { type: 'said'; id: number }
  /** O volume do microfone (0 a 1), a cada 100 ms. */
  | { type: 'level'; id: number; level: number }

/** O resultado do "Testar voz" das configurações: 3 s gravados e transcritos. */
export interface VoiceTestResult {
  ok: boolean
  /** O que o whisper.cpp entendeu (pode ser vazio). */
  text: string
  /** Por que não deu (o microfone, o whisper.cpp). */
  error?: string
  /** O áudio gravado: segundos e pico em dBFS. */
  seconds?: number
  peakDb?: number
  /** Quanto a transcrição demorou (ms). */
  ms?: number
  /** O que fazer, se algo parece errado. */
  hint?: string
}

/** Em que pé está a voz, para o painel e o mascote. */
export interface VoiceStatus {
  state: 'idle' | 'listening' | 'transcribing' | 'speaking'
  /** De onde veio a escuta: o botão do painel, o atalho ou o teste das configurações. */
  source?: 'panel' | 'shortcut' | 'test' | 'island' | 'dictation'
  /** Segurando o atalho (a escuta acaba quando ele for solto). */
  holding?: boolean
  /** Já ouviu fala nesta escuta. */
  heard?: boolean
}

/** Acessórios por data: gorro no Natal, óculos no verão. */
export type Accessory = 'christmas' | 'summer'

/**
 * Os sons do Wisp. O main toca os da conversa (abrir, fechar, enviar, pronto, pedido, erro); o
 * mascote, os das reações. Cada um pode ser trocado por um arquivo na pasta de sons.
 */
export const SOUND_NAMES = [
  'abrir',
  'fechar',
  'enviar',
  'pronto',
  'pedido',
  'erro',
  'cutucada',
  'tonto',
  'carinho',
  'oi',
  'absorver',
  'lembrete'
] as const

export type SoundName = (typeof SOUND_NAMES)[number]

export interface SoundSettings {
  enabled: boolean
  /** De 0 a 1. */
  volume: number
}

/** Um arquivo solto no mascote, a caminho dos anexos do painel. */
export interface DroppedFile {
  path: string
  name: string
  size: number
  /** Miniatura (data URL) quando é uma imagem. */
  thumbnail?: string
}

/** O que foi solto no mascote: os arquivos e o que ficou de fora (uma pasta, por exemplo). */
export interface DroppedFiles {
  files: DroppedFile[]
  problems: string[]
}
