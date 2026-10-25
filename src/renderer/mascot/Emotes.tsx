import type { JSX } from 'react'
import { EMOTE_TOP, REUSED_EMOTES } from '../../shared/emotions'
import type { Emote } from '../../shared/emotions'
import { HEART } from './FaceArt'

/*
 * Os sinais no ar do kit (Fase 27): pintados, com contorno escuro para aparecerem em qualquer
 * papel de parede. Cada um é desenhado em volta de (0, 0) e posto pelo CSS (emotions.css): os de
 * cima da cabeça (a nuvem, a lâmpada, o vapor) no alto, os outros no canto de cima, do lado oposto
 * ao painel. Entram num pulo (passam do tamanho e voltam), e as partes que mexem (a chuva, as
 * gotas, as reticências) são camadas HTML, animadas só com transform e opacity. As estrelinhas,
 * os "z", os corações e a veia de bravo já existiam para as reações: o palco só os liga.
 */

const BANG = 'M -1.9 -8 L 1.9 -8 L 0.8 1.2 L -0.8 1.2 Z'
const QUEST = 'M -3.2 -4.4 Q -3 -8.4 0.4 -8.4 Q 3.8 -8.4 3.6 -5 Q 3.4 -2.6 0.6 -1.2 L 0.2 1.2'
const STAR4 = (r: number): string =>
  `M 0 ${-r} L ${r * 0.28} ${-r * 0.28} L ${r} 0 L ${r * 0.28} ${r * 0.28} L 0 ${r} ` +
  `L ${-r * 0.28} ${r * 0.28} L ${-r} 0 L ${-r * 0.28} ${-r * 0.28} Z`
const DROP =
  'M 0 -4.5 C 2.6 -1 3.2 0.6 3.2 1.8 A 3.2 3.2 0 0 1 -3.2 1.8 C -3.2 0.6 -2.6 -1 0 -4.5 Z'
const PUFF =
  'M -3.6 1.6 Q -5.4 0.2 -3.8 -1.6 Q -3.4 -4 -0.8 -3.6 Q 0.8 -5.4 2.8 -3.4 Q 5.4 -3 4.4 -0.4 ' +
  'Q 5.6 1.8 3.2 2.6 Q 1.6 4.2 -0.6 3.2 Q -2.8 4 -3.6 1.6 Z'
const CLOUD =
  'M -9.5 3.2 Q -12 3 -11.6 0.2 Q -11.4 -2.4 -8.4 -2.4 Q -8 -6.2 -4.2 -6 Q -2.4 -9 1.4 -8 ' +
  'Q 4.6 -9 6 -5.6 Q 9.8 -6 10 -2.4 Q 12.4 -1.6 11.8 1 Q 11.4 3.4 8.8 3.2 Z'
/** O rabisco da frustração: o laço do kit, fixo (sem o tremido do pincel, o CSS treme). */
const SCRIBBLE = (() => {
  let d = ''
  for (let i = 0; i < 30; i++) {
    const a = i * 0.95
    const r = 1.1 + 0.5 * Math.sin(i * 1.7)
    const x = Math.cos(a) * r * 4.4
    const y = Math.sin(a) * r * 2.4
    d += `${i ? ' L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }
  return d
})()
const SPIRAL = (() => {
  let d = ''
  for (let i = 0; i < 22; i++) {
    const a = i * 0.6
    const r = i * 0.32
    d += `${i ? ' L' : 'M'} ${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`
  }
  return d
})()

/**
 * Uma parte do sinal: um ponto (sem tamanho) em `x`, de onde ela gira, cresce e se move, com o
 * desenho centrado nele.
 */
function Part({
  className,
  box = 24,
  x = 0,
  children
}: {
  className: string
  box?: number
  x?: number
  children: JSX.Element | JSX.Element[]
}): JSX.Element {
  const half = box / 2
  return (
    <span className={`part ${className}`} style={x ? { left: x } : undefined}>
      <svg
        viewBox={`${-half} ${-half} ${box} ${box}`}
        width={box}
        height={box}
        style={{ left: -half, top: -half }}
      >
        {children}
      </svg>
    </span>
  )
}

/** Uma nota musical (a cabeça, a haste e, na maior, a bandeirinha), com contorno escuro. */
function Note({ x, y, s, flag }: { x: number; y: number; s: number; flag?: boolean }): JSX.Element {
  const stem = flag ? 'M 0.4 3.2 L 0.4 -5.6 L 3.6 -3.6' : 'M 0.4 3.2 L 0.4 -5.6'
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path className="note-stem-ink" d={stem} />
      <path className="note-stem" d={stem} />
      <ellipse
        className="note-head"
        cx="-1.4"
        cy="3.6"
        rx="2.1"
        ry="1.5"
        transform="rotate(-20 -1.4 3.6)"
      />
    </g>
  )
}

function Bang({ x = 0, s = 1 }: { x?: number; s?: number }): JSX.Element {
  return (
    <g transform={`translate(${x} 0) scale(${s})`}>
      <path className="bang" d={BANG} />
      <circle className="bang" cy="4.4" r="1.6" />
    </g>
  )
}

function Quest({ x = 0, s = 1 }: { x?: number; s?: number }): JSX.Element {
  return (
    <g transform={`translate(${x} 0) scale(${s})`}>
      <path className="quest-ink" d={QUEST} />
      <path className="quest" d={QUEST} />
      <circle className="quest-dot" cy="4.4" r="1.6" />
    </g>
  )
}

function art(emote: Emote): JSX.Element | null {
  switch (emote) {
    case '!':
      return (
        <Part className="wiggle">
          <Bang />
        </Part>
      )
    case '?':
      return (
        <Part className="wiggle">
          <Quest />
        </Part>
      )
    case '!!':
      return (
        <Part className="wiggle">
          <Bang x={-2.8} s={0.85} />
          <Bang x={3} s={0.85} />
        </Part>
      )
    case '!?':
      return (
        <Part className="wiggle">
          <Bang x={-3.4} s={0.85} />
          <Quest x={3.6} s={0.8} />
        </Part>
      )
    case 'sweat':
      return (
        <>
          <Part className="drip d1">
            <path className="sweat" d={DROP} />
            <path className="sweat-glint" d="M -1.2 0.4 Q -1.4 1.8 -0.2 2.4" />
          </Part>
          <Part className="drip d2">
            <path className="sweat" d={DROP} transform="translate(4.2 4.6) scale(0.6)" />
          </Part>
        </>
      )
    case 'spark':
      return (
        <>
          <Part className="twinkle">
            <path className="spark-big" d={STAR4(6)} />
          </Part>
          <Part className="twinkle t2">
            <path className="spark-small" d={STAR4(3)} transform="translate(6.4 -5)" />
          </Part>
        </>
      )
    case 'heart':
      return (
        <Part className="beat">
          <path className="heart-emote" d={HEART} transform="scale(1.5)" />
        </Part>
      )
    case 'steam':
      return (
        <>
          {[1, 2, 3, 4].map((n) => (
            <Part key={n} className={`puff p${n}`}>
              <path className="puff-art" d={PUFF} />
            </Part>
          ))}
        </>
      )
    case 'bulb':
      return (
        <>
          <Part className="bulb-glow" box={32}>
            <circle className="bulb-halo" r="11" />
          </Part>
          <Part className="bulb-rays" box={32}>
            <path
              className="ray"
              d={[0, 1, 2, 3, 4, 5, 6]
                .map((i) => {
                  const a = -Math.PI / 2 + (i - 3) * 0.45
                  const p = (r: number): string =>
                    `${(Math.cos(a) * r).toFixed(2)} ${(-1.4 + Math.sin(a) * r).toFixed(2)}`
                  return `M ${p(6)} L ${p(8.6)}`
                })
                .join(' ')}
            />
          </Part>
          <Part className="bulb-art">
            <ellipse className="bulb-glass" cy="-1.4" rx="4.2" ry="4.5" />
            <path className="bulb-shine" d="M -2.2 -2.6 Q -1.8 -4.4 -0.2 -4.8" />
            <rect className="bulb-base" x="-1.9" y="2.6" width="3.8" height="3.4" rx="0.6" />
            <path className="bulb-screw" d="M -1.9 3.8 L 1.9 3.8 M -1.9 5 L 1.9 5" />
          </Part>
        </>
      )
    case 'dots':
      return (
        <>
          {[-4.6, 0, 4.6].map((x, i) => (
            <Part key={x} className={`dot-pop k${i + 1}`} x={x}>
              <circle className="dot" r="1.6" />
            </Part>
          ))}
        </>
      )
    case 'scribble':
      return (
        <Part className="scrawl">
          <path className="scribble-under" d={SCRIBBLE} />
          <path className="scribble" d={SCRIBBLE} />
        </Part>
      )
    case 'music':
      return (
        <>
          <Part className="bob">
            <Note x={-3} y={0} s={1.35} flag />
          </Part>
          <Part className="bob b2">
            <Note x={5.5} y={4} s={1} />
          </Part>
        </>
      )
    case 'swirl':
      return (
        <Part className="twirl">
          <path className="swirl-art" d={SPIRAL} />
        </Part>
      )
    case 'cloud':
      return (
        <>
          {[-7, -3.5, 0, 3.5, 7].map((x, i) => (
            <Part key={x} className={`rain r${i + 1}`} box={32}>
              <path className="raindrop" d={`M ${x} 4.5 L ${x - 0.5} 7.5`} />
            </Part>
          ))}
          <Part className="cloud-bob" box={32}>
            <path className="cloud-art" d={CLOUD} />
            <path className="cloud-shine" d="M -6 -2.2 Q -4.8 -4.4 -2.4 -4.2" />
          </Part>
        </>
      )
    default:
      return null
  }
}

/** O sinal de agora, entrando num pulo; os de uma vez só (o "!" do susto) somem depois. */
export function EmoteArt({ emote, fade }: { emote: Emote; fade: boolean }): JSX.Element | null {
  if (REUSED_EMOTES.includes(emote)) return null
  const content = art(emote)
  if (!content) return null
  const place = EMOTE_TOP.includes(emote) ? 'top' : 'side'
  return (
    <div className={`emote ${place}${fade ? ' fade' : ''}`} data-emote={emote} aria-hidden>
      <div className="emote-pop">{content}</div>
    </div>
  )
}
