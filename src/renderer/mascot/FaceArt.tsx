import type { JSX, ReactNode } from 'react'
import { MOUTHS } from '../../shared/emotions'

/*
 * Os olhos e as bocas do kit (Fase 27), no espaço de 128 × 128 do mascote. Todos ficam
 * desenhados, apagados; o data-eyes e o data-mouth do palco dizem qual aparece (styles/body.css
 * e styles/emotions-face.css). Assim a troca é só de opacidade, sem refazer o SVG. Os olhos são
 * desenhados em volta do esquerdo (55,5; 80) e espelhados para o direito; a boca, em volta de
 * (64; 86,8), logo abaixo dos olhos no visor do robô (no fantasminha, o CSS desce um pouco).
 */

/** O olho esquerdo, e o mesmo desenho espelhado no direito. */
function Both({ children }: { children: ReactNode }): JSX.Element {
  return (
    <>
      <g className="l">{children}</g>
      <g className="r" transform="matrix(-1 0 0 1 128 0)">
        {children}
      </g>
    </>
  )
}

/** Coração centrado em (0, 0), uns 8 de largura. */
export const HEART =
  'M 0 2.6 C -3.4 0 -4.2 -2.4 -2.4 -3.6 C -1.2 -4.4 0 -3.4 0 -2.2 ' +
  'C 0 -3.4 1.2 -4.4 2.4 -3.6 C 4.2 -2.4 3.4 0 0 2.6 Z'

/** Os olhos que a Fase 8 não tinha. Os de antes (LEDs, ^ ^, x x...) seguem no Mascot.tsx. */
export function KitEyes(): JSX.Element {
  return (
    <>
      <g className="eye-glyph-set eye-wide">
        <Both>
          <rect className="led" x="51.75" y="73.5" width="7.5" height="13" rx="3.75" />
        </Both>
      </g>
      <g className="eye-glyph-set eye-sleepy">
        <Both>
          <path
            className="led"
            d="M 52.5 80.6 L 58.5 80.6 L 58.5 82.2 Q 58.5 85 55.5 85 Q 52.5 85 52.5 82.2 Z"
          />
          <path className="lid" d="M 51.6 80.2 Q 55.5 79.2 59.4 80.6" />
        </Both>
      </g>
      <g className="eye-glyph-set eye-narrow">
        <Both>
          <rect className="led" x="52" y="79.4" width="7" height="3.6" rx="1.8" />
        </Both>
      </g>
      <g className="eye-glyph-set eye-determined">
        <Both>
          <path
            className="led"
            d="M 52.5 76.8 L 58.5 79.4 L 58.5 83 Q 58.5 85 56.5 85 L 54.5 85 Q 52.5 85 52.5 83 Z"
          />
        </Both>
      </g>
      <g className="eye-glyph-set eye-sad">
        <Both>
          <path
            className="led"
            d="M 52.5 79.4 L 58.5 76 L 58.5 83 Q 58.5 85 56.5 85 L 54.5 85 Q 52.5 85 52.5 83 Z"
          />
        </Both>
      </g>
      <g className="eye-glyph-set eye-teary">
        <Both>
          <path
            className="led"
            d="M 52.5 79.4 L 58.5 76 L 58.5 83 Q 58.5 85 56.5 85 L 54.5 85 Q 52.5 85 52.5 83 Z"
          />
          <ellipse className="tear" cx="55.5" cy="85.2" rx="4.4" ry="1.8" />
          <ellipse className="tear-glint" cx="54" cy="84.8" rx="1" ry="0.5" />
        </Both>
      </g>
      <g className="eye-glyph-set eye-cry">
        <Both>
          <path
            className="tear stream"
            d="M 54.4 82 Q 55.4 90 54.8 99 Q 56.6 100.6 58.2 99 Q 57.6 90 57.6 82 Z"
          />
          <path className="line" d="M 52 81.6 L 54 79.6 L 56.2 80.8 L 59 79" />
        </Both>
      </g>
      <g className="eye-glyph-set eye-shine">
        <Both>
          <ellipse className="shine-ball" cx="55.5" cy="80" rx="3.9" ry="5.4" />
          <circle className="glint" cx="54.1" cy="77.8" r="1.5" />
          <circle className="glint" cx="56.9" cy="82.4" r="0.75" />
        </Both>
      </g>
      <g className="eye-glyph-set eye-scared">
        <Both>
          <ellipse className="sclera" cx="55.5" cy="80" rx="4.3" ry="5.3" />
          <circle className="led pupil" cx="55.9" cy="80.6" r="1.5" />
        </Both>
      </g>
      <g className="eye-glyph-set eye-blank">
        <Both>
          <ellipse className="sclera" cx="55.5" cy="80" rx="3.8" ry="5" />
        </Both>
      </g>
      <g className="eye-glyph-set eye-spark">
        <Both>
          <path
            className="star-eye"
            d="M 55.5 73.6 L 57.1 78.4 L 61.8 80 L 57.1 81.6 L 55.5 86.4 L 53.9 81.6 L 49.2 80 L 53.9 78.4 Z"
          />
        </Both>
      </g>
      <g className="eye-glyph-set eye-red">
        <Both>
          <ellipse className="red-halo" cx="55.5" cy="81" rx="5.6" ry="5.2" />
          <path
            className="red-led"
            d="M 52.5 77.6 L 58.5 77.6 L 58.5 83 Q 58.5 85 56.5 85 L 54.5 85 Q 52.5 85 52.5 83 Z"
          />
        </Both>
      </g>
      <g className="eye-glyph-set eye-heart">
        <Both>
          <path className="heart-eye" d={HEART} transform="translate(55.5 80.4) scale(1.12)" />
        </Both>
      </g>
      <g className="eye-glyph-set eye-dot">
        <Both>
          <ellipse className="led" cx="55.5" cy="80.6" rx="1.9" ry="2.3" />
        </Both>
      </g>
      <g className="eye-glyph-set eye-shades">
        <path className="shades-rim" d="M 61 77.4 Q 64 75.9 67 77.4" />
        <Both>
          <path
            className="shades-glass"
            d="M 49 75.8 L 61 75.8 L 60.6 79.6 Q 59.6 84.6 55.5 84.9 Q 51.4 84.6 50.4 79.6 Z"
          />
          <path className="shades-glint" d="M 51.8 78.6 L 54 76.9 M 53.4 81.4 L 54.6 80.4" />
        </Both>
      </g>
      {/* A piscadela: o esquerdo sorri, o direito fica aberto. */}
      <g className="eye-glyph-set eye-wink">
        <path className="line" d="M 52 82.5 L 55.5 77.5 L 59 82.5" />
        <rect className="led" x="69.5" y="75" width="6" height="10" rx="3" />
      </g>
      {/* Confuso: um olho apertado, o outro arregalado. */}
      <g className="eye-glyph-set eye-narrow-wide">
        <rect className="led" x="52" y="79.4" width="7" height="3.6" rx="1.8" />
        <rect className="led" x="68.75" y="73.5" width="7.5" height="13" rx="3.75" />
      </g>
    </>
  )
}

const MOUTH_ART: Record<(typeof MOUTHS)[number], JSX.Element> = {
  o: <ellipse className="fill" rx="1.5" ry="1.7" />,
  O: <ellipse className="fill" rx="2.5" ry="2.9" />,
  smile: <path className="line" d="M -3 -0.8 Q 0 2 3 -0.8" />,
  grin: (
    <>
      <path className="fill" d="M -4.2 -1.5 L 4.2 -1.5 Q 3.6 2.4 0 2.4 Q -3.6 2.4 -4.2 -1.5 Z" />
      <path className="teeth-line" d="M -3.6 -0.4 L 3.6 -0.4" />
    </>
  ),
  flat: <path className="line" d="M -2.6 0 L 2.6 0" />,
  wobble: <path className="line" d="M -3.6 0.2 Q -2.7 -1.2 -1.8 0.2 T 0 0.2 T 1.8 0.2 T 3.6 0.2" />,
  cat: <path className="line" d="M -3.4 -0.6 Q -1.7 2.2 0 -0.2 Q 1.7 2.2 3.4 -0.6" />,
  frown: <path className="line" d="M -3 1.2 Q 0 -1.6 3 1.2" />,
  smirk: <path className="line" d="M -2.8 0.5 Q 0.6 1 3 -1.4" />,
  laugh: (
    <>
      <path className="fill" d="M -4.4 -1.8 L 4.4 -1.8 Q 4 3.2 0 3.2 Q -4 3.2 -4.4 -1.8 Z" />
      <ellipse className="tongue" cy="2" rx="2.2" ry="0.9" />
    </>
  ),
  open: (
    <>
      <ellipse className="fill" rx="2.8" ry="2.2" />
      <ellipse className="tongue" cy="1.1" rx="1.6" ry="0.7" />
    </>
  ),
  wail: (
    <>
      <path
        className="fill"
        d="M -4.6 -0.8 Q -2 -2.4 0 -2.2 Q 2 -2.4 4.6 -0.8 L 3.8 3 L -3.8 3 Z"
      />
      <ellipse className="tongue" cy="2.2" rx="2.4" ry="0.7" />
    </>
  ),
  teeth: (
    <>
      <rect className="teeth" x="-4.3" y="-1.6" width="8.6" height="3.2" rx="0.8" />
      <path
        className="teeth-line"
        d="M -4.1 0 L 4.1 0 M -1.5 -1.4 L -1.5 1.4 M 1.5 -1.4 L 1.5 1.4"
      />
    </>
  ),
  tongue: (
    <>
      <path className="tongue" d="M 0.2 0.5 L 2.7 0.1 Q 2.9 2.7 1.5 2.9 Q 0.2 2.7 0.2 0.5 Z" />
      <path className="line" d="M -3 -0.8 Q 0 1.6 3 -0.4" />
    </>
  ),
  pout: (
    <>
      <path className="line" d="M -1.6 0 Q 0 -1 1.6 0" />
      <path className="line thin" d="M -0.9 1.2 Q 0 1.7 0.9 1.2" />
    </>
  ),
  yawn: (
    <>
      <ellipse className="fill" rx="2.1" ry="3.2" />
      <ellipse className="tongue" cy="1.9" rx="1.3" ry="0.7" />
    </>
  )
}

/** As bocas, todas apagadas: o data-mouth acende uma. */
export function Mouths(): JSX.Element {
  return (
    <svg className="layer" viewBox="0 0 128 128">
      <g transform="translate(64 86.8)">
        {MOUTHS.map((mouth) => (
          <g key={mouth} className={`mouth-glyph m-${mouth}`} data-m={mouth}>
            {MOUTH_ART[mouth]}
          </g>
        ))}
      </g>
    </svg>
  )
}
