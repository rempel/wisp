import type { JSX } from 'react'
import { DROP_PATH, GHOST_PATH } from '../../shared/avatars'
import type { AvatarName } from '../../shared/avatars'

/**
 * O corpo de cada avatar (Fase 19), no espaço de 128 × 128 do mascote. Os olhos, as bochechas,
 * a luz de cima e as reações são as mesmas camadas para todos (Mascot.tsx); as cores vêm do
 * mascot.css e do avatars.css.
 */
export function Body({ avatar }: { avatar: AvatarName }): JSX.Element {
  if (avatar === 'fantasma') {
    return (
      <svg className="layer" viewBox="0 0 128 128">
        <path className="shell" d={GHOST_PATH} />
        <path className="gloss" d="M 46.5 62 Q 48 51 56.5 46" />
        <circle className="gloss-dot" cx="45.2" cy="67.5" r="1.3" />
        {/* Os bracinhos, um de cada lado. */}
        <path className="ghost-arm" d="M 40 80 Q 34 82 33.5 88 Q 37.5 87 40 85" />
        <path className="ghost-arm" d="M 88 80 Q 94 82 94.5 88 Q 90.5 87 88 85" />
      </svg>
    )
  }
  return (
    <svg className="layer" viewBox="0 0 128 128">
      <path className="shell" d={DROP_PATH} />
      <path className="gloss" d="M 47 60 Q 50 52 57 49" />
      <circle className="gloss-dot" cx="45.6" cy="65" r="1.3" />
      <path className="seam" d="M 45.5 63 Q 64 67.5 82.5 63" />
      <path className="seam-light" d="M 45.5 64.2 Q 64 68.7 82.5 64.2" />
      <rect className="visor" x="45" y="70" width="38" height="20" rx="10" />
      <path className="visor-glare" d="M 50 73 L 57 73" />
      <circle className="bolt" cx="39.4" cy="80" r="3.6" />
      <circle className="bolt-cap" cx="39.4" cy="80" r="1.6" />
      <circle className="bolt" cx="88.6" cy="80" r="3.6" />
      <circle className="bolt-cap" cx="88.6" cy="80" r="1.6" />
      <rect className="collar" x="60.5" y="29" width="7" height="3.6" rx="1.6" />
      <rect className="collar-light" x="61.3" y="29.6" width="5.4" height="1.1" rx="0.5" />
    </svg>
  )
}
