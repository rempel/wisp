// O rosto do mascote num instante (Fase 27): os olhos, a boca, a cor, as bochechas, a sombra e o
// sinal no ar, juntando o estado da conversa, a reação a quem mexe com ele e a emoção pedida (pelo
// Claude ou na galeria das configurações). A reação ganha da emoção, e a emoção ganha do estado,
// menos num pedido de permissão, num erro ou no cochilo: esses são avisos, e ficam como são.

import { FEELINGS } from '../../shared/emotions'
import type { Emote, Emotion, EyeShape, MouthShape, Tint } from '../../shared/emotions'
import type { MascotState } from '../../shared/ipc'

/**
 * Reações a quem mexe com ele: o clique (cutucada), a segunda cutucada (irritado), a terceira
 * (tonto), o cursor parado em cima (carinho), a saudação ao abrir, o gole de um arquivo solto,
 * o susto ao acordar e o toque de um lembrete.
 */
export type Reaction =
  'poke' | 'annoyed' | 'dizzy' | 'petting' | 'greet' | 'absorb' | 'wake' | 'remind'

export interface Face {
  /** O desenho dos olhos (data-eyes): um nome do kit, ou "esquerdo-direito" ("narrow-wide"). */
  eyes: string
  mouth: MouthShape | null
  tint: Tint | null
  /** Quanto da cor entra no casco, de 0 a 1. */
  tintK: number
  blush: number
  gloom: number
  emote: Emote | null
  /** O sinal aparece uma vez e some. */
  fade: boolean
  /** Para onde os olhos olham, de -1 a 1. */
  look: readonly [number, number]
  /** O tamanho do susto ao entrar neste rosto (0: troca na hora, sem atuar). */
  take: number
  /** A emoção cuja pose e cujo movimento o corpo faz (data-feel); null: o do estado. */
  feel: Emotion | null
}

const NO_LOOK = [0, 0] as const

const plain = (eyes: EyeShape, mouth: MouthShape | null, patch: Partial<Face> = {}): Face => ({
  eyes,
  mouth,
  tint: null,
  tintK: 0,
  blush: 0,
  gloom: 0,
  emote: null,
  fade: false,
  look: NO_LOOK,
  take: 0,
  feel: null,
  ...patch
})

/**
 * O rosto das reações. Elas já têm o movimento e os sinais delas (a veia de bravo, as
 * estrelinhas, os corações): aqui entram os olhos e a boca, e a troca é na hora, sem atuar,
 * para o clique responder no ato.
 */
const REACTION_FACES: Record<Reaction, Face> = {
  poke: plain('squeeze', 'pout'),
  annoyed: plain('angry', 'teeth', { tint: 'flush', tintK: 0.45 }),
  dizzy: plain('swirl', 'wobble'),
  petting: plain('happy', 'cat', { blush: 1 }),
  greet: plain('normal', 'smile'),
  absorb: plain('normal', 'O'),
  wake: plain('wide', 'o'),
  remind: plain('wide', 'O')
}

/** O rosto de cada estado da conversa. Ocioso é o de sempre: só os olhos. */
const STATE_FACES: Record<MascotState, Face> = {
  idle: plain('normal', null),
  talking: plain('normal', 'open'),
  working: plain('normal', 'flat'),
  // Pedindo: olhos brilhando e a boquinha de gato, como quem diz "posso?".
  permission: plain('shine', 'cat'),
  happy: plain('happy', 'smile', { blush: 0.3 }),
  error: plain('x', 'wobble'),
  sleeping: plain('closed', 'o')
}

/** Estados que são avisos: a emoção pedida espera eles passarem. */
const NOTICE_STATES: readonly MascotState[] = ['permission', 'error', 'sleeping']

/** O rosto de uma emoção do kit, inteiro: olhos, boca, cor, sinal, olhar, susto e movimento. */
export function emotionFace(emotion: Emotion): Face {
  const feeling = FEELINGS[emotion]
  return {
    eyes: typeof feeling.eyes === 'string' ? feeling.eyes : feeling.eyes.join('-'),
    mouth: feeling.mouth,
    tint: feeling.tint,
    tintK: feeling.tint ? feeling.tintK : 0,
    blush: feeling.blush,
    gloom: feeling.gloom,
    emote: feeling.emote,
    fade: feeling.fade ?? false,
    look: feeling.look ?? NO_LOOK,
    take: feeling.take,
    feel: emotion === 'neutral' ? null : emotion
  }
}

/** O rosto de agora: a reação, senão a emoção pedida (fora dos avisos), senão o do estado. */
export function faceFor(
  state: MascotState,
  reaction: Reaction | null,
  expressed: Emotion | null
): Face {
  if (reaction) return REACTION_FACES[reaction]
  if (expressed && !NOTICE_STATES.includes(state)) return emotionFace(expressed)
  return STATE_FACES[state]
}

/** O que diz se dois rostos são o mesmo (para a troca atuada só acontecer quando muda). */
export const faceKey = (face: Face): string => JSON.stringify(face)

/** Olhos que piscam e olham para os lados sozinhos (os LEDs, como no kit). */
export const BLINKING_EYES: readonly string[] = ['normal', 'look', 'wide']

/** O tamanho do susto da troca: o do rosto novo; ao sair de uma emoção, o do neutro. */
export function takeOf(previous: Face | null, next: Face): number {
  if (next.take > 0) return next.take
  if (previous?.feel && !next.feel) return FEELINGS.neutral.take
  return 0
}
