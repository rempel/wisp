// As emoções, os sinais e as danças dos avatares (Fase 27), trazidos do ClaudeAnimationBase (o kit
// de animação do Clawd, de John Heibel, licença MIT): https://github.com/JohnHeibel/ClaudeAnimationBase
// Lá cada emoção é um rosto (olhos e boca), uma cor, um sinal no ar (um "!", uma nuvem de chuva)
// e um jeito de mexer o corpo; e a troca de uma para outra é atuada: os olhos apertam, o corpo
// encolhe antes, o rosto troca, vem um susto do tamanho da emoção nova e o corpo assenta. Aqui
// fica a tabela (a mesma para o robô e para o fantasminha); o desenho fica no Mascot.tsx e no
// emotions.css, e o movimento, em CSS e em animações da página, só com transform e opacity.

import { t } from './i18n'

export const EMOTIONS = [
  'neutral',
  'happy',
  'excited',
  'laugh',
  'love',
  'shy',
  'proud',
  'smug',
  'relieved',
  'sad',
  'cry',
  'angry',
  'furious',
  'scared',
  'surprised',
  'confused',
  'thinking',
  'idea',
  'determined',
  'sleepy',
  'bored',
  'nervous',
  'suspicious',
  'disgusted',
  'dizzy',
  'cool',
  'starstruck',
  'ko',
  'playful',
  'mischief',
  'hopeful'
] as const
export type Emotion = (typeof EMOTIONS)[number]

/** Os olhos do kit. "normal" são os LEDs do robô (e os olhinhos escuros do fantasminha). */
export const EYES = [
  'normal',
  'look',
  'wide',
  'happy',
  'closed',
  'sleepy',
  'wink',
  'narrow',
  'angry',
  'determined',
  'sad',
  'teary',
  'cry',
  'squeeze',
  'shine',
  'scared',
  'blank',
  'spark',
  'red',
  'heart',
  'x',
  'swirl',
  'dot',
  'shades'
] as const
export type EyeShape = (typeof EYES)[number]

/** As bocas do kit. Sem boca (null), o rosto de sempre: só os olhos. */
export const MOUTHS = [
  'o',
  'O',
  'smile',
  'grin',
  'flat',
  'wobble',
  'cat',
  'frown',
  'smirk',
  'laugh',
  'open',
  'wail',
  'teeth',
  'tongue',
  'pout',
  'yawn'
] as const
export type MouthShape = (typeof MOUTHS)[number]

/** Os sinais no ar, perto da cabeça: pintados, nunca letras de uma fonte. */
export const EMOTES = [
  '!',
  '?',
  '!!',
  '!?',
  'zzz',
  'sweat',
  'spark',
  'heart',
  'hearts',
  'anger',
  'steam',
  'bulb',
  'dots',
  'scribble',
  'music',
  'swirl',
  'stars',
  'cloud'
] as const
export type Emote = (typeof EMOTES)[number]

/** Os sinais que reaproveitam as camadas das reações (as estrelinhas, os "z", os corações). */
export const REUSED_EMOTES: readonly Emote[] = ['stars', 'zzz', 'hearts', 'anger']

/** Os que ficam em cima da cabeça; os outros, no canto de cima, do lado oposto ao painel. */
export const EMOTE_TOP: readonly Emote[] = ['steam', 'stars', 'cloud', 'bulb', 'scribble']

/** As cores do kit, misturadas ao casco (o tintK diz quanto). */
export const TINTS = ['pale', 'flush', 'blue', 'rosy', 'green', 'gold'] as const
export type Tint = (typeof TINTS)[number]

export interface Feeling {
  /** Os olhos; dois nomes, um para cada olho (o esquerdo primeiro), como no "confuso". */
  eyes: EyeShape | readonly [EyeShape, EyeShape]
  mouth: MouthShape | null
  tint: Tint | null
  /** Quanto da cor entra no casco, de 0 a 1. */
  tintK: number
  /** As bochechas, de 0 a 1. */
  blush: number
  /** A sombra na testa (o desânimo), de 0 a 1. */
  gloom: number
  emote: Emote | null
  /** O tamanho do susto quando ele entra nesta emoção (0: troca sem susto). */
  take: number
  /** O sinal aparece uma vez e some (o "!" do susto), em vez de ficar. */
  fade?: boolean
  /** Para onde os olhos olham, de -1 a 1 (positivo: direita e baixo). */
  look?: readonly [number, number]
}

const feeling = (patch: Partial<Feeling> & Pick<Feeling, 'eyes'>): Feeling => ({
  mouth: null,
  tint: null,
  tintK: 1,
  blush: 0,
  gloom: 0,
  emote: null,
  take: 0.6,
  ...patch
})

/** A tabela do kit (EMO, em src/clawd.js), com os mesmos rostos, cores, sinais e sustos. */
export const FEELINGS: Record<Emotion, Feeling> = {
  neutral: feeling({ eyes: 'normal', take: 0.3 }),
  happy: feeling({ eyes: 'happy', mouth: 'smile', blush: 0.3, take: 0.6 }),
  excited: feeling({ eyes: 'wide', mouth: 'open', emote: 'spark', take: 1 }),
  laugh: feeling({ eyes: 'squeeze', mouth: 'laugh', blush: 0.45, take: 0.8 }),
  love: feeling({
    eyes: 'heart',
    mouth: 'cat',
    blush: 0.8,
    tint: 'rosy',
    tintK: 0.5,
    emote: 'hearts',
    take: 0.7
  }),
  shy: feeling({ eyes: 'look', mouth: 'wobble', blush: 1, take: 0.3, look: [-0.7, 0.8] }),
  proud: feeling({
    eyes: 'closed',
    mouth: 'smile',
    tint: 'gold',
    tintK: 0.3,
    emote: 'spark',
    take: 0.5
  }),
  smug: feeling({ eyes: 'narrow', mouth: 'smirk', take: 0.4, look: [0.4, 0] }),
  relieved: feeling({ eyes: 'closed', mouth: 'smile', emote: 'sweat', take: 0.4 }),
  sad: feeling({
    eyes: 'sad',
    mouth: 'frown',
    tint: 'blue',
    tintK: 0.35,
    gloom: 0.35,
    emote: 'cloud',
    take: 0.3,
    look: [0, 0.5]
  }),
  cry: feeling({ eyes: 'cry', mouth: 'wail', tint: 'blue', tintK: 0.2, take: 0.8 }),
  angry: feeling({
    eyes: 'angry',
    mouth: 'teeth',
    tint: 'flush',
    tintK: 0.45,
    emote: 'anger',
    take: 0.8
  }),
  furious: feeling({ eyes: 'red', tint: 'flush', tintK: 0.85, emote: 'steam', take: 1.2 }),
  scared: feeling({
    eyes: 'scared',
    mouth: 'wobble',
    tint: 'pale',
    tintK: 0.6,
    emote: 'sweat',
    take: 1.1
  }),
  surprised: feeling({ eyes: 'wide', mouth: 'O', emote: '!', fade: true, take: 1.3 }),
  confused: feeling({ eyes: ['narrow', 'wide'], mouth: 'wobble', emote: '?', take: 0.6 }),
  thinking: feeling({ eyes: 'look', mouth: 'flat', emote: 'dots', take: 0.4, look: [0.5, -0.8] }),
  idea: feeling({ eyes: 'shine', mouth: 'grin', emote: 'bulb', take: 1.1 }),
  determined: feeling({ eyes: 'determined', mouth: 'flat', take: 0.7 }),
  sleepy: feeling({ eyes: 'sleepy', mouth: 'o', emote: 'zzz', take: 0.2 }),
  bored: feeling({ eyes: 'narrow', mouth: 'flat', take: 0.2, look: [-0.3, 0.4] }),
  nervous: feeling({
    eyes: 'look',
    mouth: 'wobble',
    tint: 'pale',
    tintK: 0.2,
    emote: 'sweat',
    take: 0.5
  }),
  suspicious: feeling({ eyes: 'narrow', mouth: 'flat', take: 0.4 }),
  disgusted: feeling({ eyes: 'squeeze', mouth: 'wobble', tint: 'green', tintK: 0.5, take: 0.8 }),
  dizzy: feeling({ eyes: 'swirl', mouth: 'wobble', emote: 'stars', take: 0.7 }),
  cool: feeling({ eyes: 'shades', mouth: 'smirk', emote: 'music', take: 0.4 }),
  starstruck: feeling({ eyes: 'spark', mouth: 'open', tint: 'gold', tintK: 0.3, take: 1 }),
  ko: feeling({ eyes: 'x', mouth: 'wobble', tint: 'pale', tintK: 0.3, emote: 'stars', take: 1 }),
  playful: feeling({ eyes: 'wink', mouth: 'tongue', take: 0.6 }),
  mischief: feeling({ eyes: 'narrow', mouth: 'grin', gloom: 0.3, take: 0.5, look: [0.3, 0] }),
  hopeful: feeling({ eyes: 'shine', mouth: 'cat', blush: 0.35, take: 0.5, look: [0, -0.4] })
}

/** O nome de cada emoção, na galeria das configurações. */
export function emotionLabel(emotion: Emotion): string {
  const labels: Record<Emotion, string> = {
    neutral: t('neutro'),
    happy: t('feliz'),
    excited: t('animado'),
    laugh: t('rindo'),
    love: t('apaixonado'),
    shy: t('tímido'),
    proud: t('orgulhoso'),
    smug: t('convencido'),
    relieved: t('aliviado'),
    sad: t('triste'),
    cry: t('chorando'),
    angry: t('bravo'),
    furious: t('furioso'),
    scared: t('com medo'),
    surprised: t('surpreso'),
    confused: t('confuso'),
    thinking: t('pensando'),
    idea: t('com uma ideia'),
    determined: t('decidido'),
    sleepy: t('com sono'),
    bored: t('entediado'),
    nervous: t('nervoso'),
    suspicious: t('desconfiado'),
    disgusted: t('com nojo'),
    dizzy: t('tonto'),
    cool: t('descolado'),
    starstruck: t('deslumbrado'),
    ko: t('nocauteado'),
    playful: t('brincalhão'),
    mischief: t('aprontando'),
    hopeful: t('esperançoso')
  }
  return labels[emotion]
}

// ---- As danças ---------------------------------------------------------------------------

/** As danças do kit (move, em src/clawd.js). "mix" troca de dança a cada dois compassos. */
export const DANCES = [
  'mix',
  'bounce',
  'hop',
  'roof',
  'sway',
  'spin',
  'wave',
  'walk',
  'run',
  'idle',
  'stomp',
  'shimmy'
] as const
export type Dance = (typeof DANCES)[number]

/** A ordem do "mix", como no kit. */
export const MIX: readonly Dance[] = ['bounce', 'roof', 'sway', 'spin', 'hop', 'wave']

/** O tempo de uma batida (ms): 114 batidas por minuto, o ritmo de sempre da dança do Wisp. */
export const BEAT_MS = Math.round(60_000 / 114)
/** O "mix" troca de dança a cada dois compassos (oito batidas). */
export const MIX_MS = BEAT_MS * 8

export function danceLabel(dance: Dance): string {
  const labels: Record<Dance, string> = {
    mix: t('de tudo um pouco'),
    bounce: t('quicar'),
    hop: t('pular'),
    roof: t('mãos para o alto'),
    sway: t('balançar'),
    spin: t('girar'),
    wave: t('acenar'),
    walk: t('andar'),
    run: t('correr'),
    idle: t('de leve'),
    stomp: t('pisar forte'),
    shimmy: t('requebrar')
  }
  return labels[dance]
}

/** A dança do "mix" num instante (ms desde que começou). */
export function mixDance(elapsed: number): Dance {
  const step = Math.floor(Math.max(0, elapsed) / MIX_MS)
  return MIX[step % MIX.length]
}

// ---- Quanto tempo cada coisa fica --------------------------------------------------------

/** Uma emoção pedida (pelo Claude, ou na galeria) fica isso, se ninguém disser quanto (ms). */
export const FEEL_MS = 4500
/** Uma dança pedida (sem música) fica isso (ms). */
export const DANCE_MS = MIX_MS * 2
/** O máximo que dá para pedir, de uma emoção ou de uma dança (ms). */
export const MAX_ACT_MS = 15_000

/** Quanto uma emoção ou dança pedida fica: o padrão, ou o pedido (em segundos) dentro do limite. */
export function holdMs(seconds: number | undefined, fallback: number): number {
  if (seconds === undefined || !Number.isFinite(seconds)) return fallback
  return Math.min(MAX_ACT_MS, Math.max(1000, Math.round(seconds * 1000)))
}

// ---- A troca atuada ----------------------------------------------------------------------

/** Antes da troca, os olhos apertam e o corpo encolhe por isso (ms); o rosto troca no fim. */
export const ANTICIPATION_MS = 100
/** O susto depois da troca (ms). */
export const TAKE_MS = 650

/**
 * O susto da troca, quadro a quadro, como o take() do kit: um amassado antes (a antecipação),
 * e depois um esticar que balança e assenta, com um pulinho. `amount` é o take da emoção nova.
 * Devolve os quadros (do começo da antecipação ao fim do susto) para uma animação da página, só
 * com transform. 1 unidade do kit vale 5 px no mascote.
 */
export function takeFrames(amount: number, steps = 18): Keyframe[] {
  const total = ANTICIPATION_MS + TAKE_MS
  const frames: Keyframe[] = []
  const frame = (ms: number, squash: number, dy: number): void => {
    const sx = 1 + squash
    const sy = 1 - squash
    frames.push({
      offset: Math.round((ms / total) * 1000) / 1000,
      transform: `translateY(${round(dy)}px) scale(${round(sx)}, ${round(sy)})`
    })
  }
  // A antecipação: o corpo encolhe (12% do take), com uma entrada suave.
  for (let i = 0; i <= 3; i++) {
    const k = i / 3
    frame((ANTICIPATION_MS * i) / 3, 0.12 * amount * (k * k * (3 - 2 * k)), 0)
  }
  // O susto: estica, balança e assenta (a mola do kit), com um pulinho para cima.
  for (let i = 1; i <= steps; i++) {
    const a = ((TAKE_MS / 1000) * i) / steps
    const squash = -0.26 * amount * Math.exp(-6 * a) * Math.cos(16 * a)
    const dy = -1.2 * amount * Math.exp(-7 * a) * Math.max(0, Math.cos(9 * a)) * 5
    frame(ANTICIPATION_MS + (TAKE_MS * i) / steps, i === steps ? 0 : squash, i === steps ? 0 : dy)
  }
  return frames
}

const round = (value: number): number => Math.round(value * 1000) / 1000 || 0

// ---- Pedidos de fora (o Claude, a galeria) -----------------------------------------------

/**
 * Uma emoção ou dança pedida ao mascote (o main manda, a página atua), ou a dança de quando toca
 * música (a das configurações).
 */
export type MascotAct =
  | { kind: 'feel'; emotion: Emotion; ms: number }
  | { kind: 'dance'; dance: Dance; ms: number }
  | { kind: 'style'; dance: Dance }

/** O que a galeria das configurações pede para ver: uma emoção ou uma dança. */
export type MascotPreview = { emotion: Emotion } | { dance: Dance }

export const isEmotion = (value: unknown): value is Emotion =>
  typeof value === 'string' && (EMOTIONS as readonly string[]).includes(value)

export const isDance = (value: unknown): value is Dance =>
  typeof value === 'string' && (DANCES as readonly string[]).includes(value)

/** Os olhos de cada lado (o esquerdo, o direito), para as emoções com um olho diferente do outro. */
export function eyePair(eyes: Feeling['eyes']): [EyeShape, EyeShape] {
  if (typeof eyes !== 'string') return [eyes[0], eyes[1]]
  // A piscadela: o esquerdo sorri (^), o direito fica aberto.
  if (eyes === 'wink') return ['happy', 'normal']
  return [eyes, eyes]
}
