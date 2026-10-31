import type { JSX } from 'react'
import type { Accessory } from '../../shared/ipc'

/**
 * Os acessórios por data, desenhados no mesmo espaço (128 × 128) do mascote. O gorro de Natal
 * fica no alto da cabeça, no lugar da luz de cima; os óculos de sol, na testa, sem tapar os olhos.
 * A geleca, mais baixa, os desce pelo CSS (styles/avatars.css).
 */
export function AccessoryArt({ kind }: { kind: Accessory }): JSX.Element {
  if (kind === 'christmas') {
    return (
      <div className="accessory accessory-christmas" aria-hidden>
        <svg className="layer" viewBox="0 0 128 128">
          <defs>
            <linearGradient id="wisp-hat" x1="0" y1="0" x2="0.6" y2="1">
              <stop offset="0" stopColor="#f87171" />
              <stop offset="1" stopColor="#b91c1c" />
            </linearGradient>
          </defs>
          <path
            className="hat"
            d="M 53.5 38.5 C 54 29 58 21 66 17 C 72 14 79 16 82.5 23 C 78 22 74 25 72.5 30 C 72 33 73.5 36 74.5 38.5 Z"
            fill="url(#wisp-hat)"
          />
          <path className="hat-shine" d="M 57 34 C 57.5 28 60.5 23 65 20" />
          <rect className="hat-brim" x="50.5" y="36.5" width="27" height="7" rx="3.5" />
          <circle className="hat-pompom" cx="83.5" cy="24.5" r="3.7" />
        </svg>
      </div>
    )
  }
  return (
    <div className="accessory accessory-summer" aria-hidden>
      <svg className="layer" viewBox="0 0 128 128">
        <defs>
          <linearGradient id="wisp-lens" x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0" stopColor="#334155" />
            <stop offset="1" stopColor="#0f172a" />
          </linearGradient>
        </defs>
        <path className="shades-arm" d="M 49.8 53.5 L 46.5 55.5 M 78.2 53.5 L 81.5 55.5" />
        <rect className="shades-lens" x="49.8" y="50.8" width="12" height="7.2" rx="3" />
        <rect className="shades-lens" x="66.2" y="50.8" width="12" height="7.2" rx="3" />
        <path className="shades-bridge" d="M 61.8 53 Q 64 51.4 66.2 53" />
        <path className="shades-glint" d="M 52 53.5 L 54.5 51.8 M 68.4 53.5 L 70.9 51.8" />
      </svg>
    </div>
  )
}
