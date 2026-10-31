import type { JSX } from 'react'
import {
  AVATAR_PATHS,
  BLOB_PATH,
  FLAME_CORE_PATH,
  FLAME_PATH,
  GHOST_PATH
} from '../../shared/avatars'
import type { AvatarName } from '../../shared/avatars'

/**
 * O corpo de cada avatar (Fase 19), no espaço de 128 × 128 do mascote. Os olhos, as bochechas,
 * a luz de cima e as reações são as mesmas camadas para todos (Mascot.tsx); as cores vêm do
 * styles/body.css e do styles/avatars.css.
 */
export function Body({ avatar }: { avatar: AvatarName }): JSX.Element {
  if (avatar === 'fantasma') {
    return (
      <>
        <svg className="layer" viewBox="0 0 128 128">
          <path className="shell" d={GHOST_PATH} />
          <path className="gloss" d="M 46.5 62 Q 48 51 56.5 46" />
          <circle className="gloss-dot" cx="45.2" cy="67.5" r="1.3" />
        </svg>
        {/* Os bracinhos, um de cada lado, em camadas próprias: as emoções e as danças (Fase 27)
          os levantam e balançam a partir do ombro. */}
        <div className="arm arm-l">
          <div className="arm-move">
            <svg className="layer" viewBox="0 0 128 128">
              <path className="ghost-arm" d="M 40 80 Q 34 82 33.5 88 Q 37.5 87 40 85" />
            </svg>
          </div>
        </div>
        <div className="arm arm-r">
          <div className="arm-move">
            <svg className="layer" viewBox="0 0 128 128">
              <path className="ghost-arm" d="M 88 80 Q 94 82 94.5 88 Q 90.5 87 88 85" />
            </svg>
          </div>
        </div>
      </>
    )
  }
  if (avatar === 'geleca') {
    return (
      <svg className="layer" viewBox="0 0 128 128">
        <ellipse className="jelly-puddle" cx="64" cy="102.6" rx="31" ry="3.2" />
        <path className="shell" d={BLOB_PATH} />
        <ellipse className="shell" cx="94" cy="102.4" rx="3.2" ry="2.1" />
        <path className="gloss" d="M 43 76 Q 47 63 58 59" />
        <circle className="gloss-dot" cx="42" cy="81" r="1.5" />
        <circle className="jelly-bubble" cx="80" cy="94" r="2.1" />
        <circle className="jelly-bubble" cx="85.5" cy="88" r="1.3" />
        <circle className="jelly-bubble" cx="47" cy="95" r="1.5" />
      </svg>
    )
  }
  // O fogo-fátuo: a chama, o miolo claro (onde fica o rosto) e um brilho na ponta da esquerda.
  return (
    <svg className="layer" viewBox="0 0 128 128">
      <path className="shell" d={FLAME_PATH} />
      <path className="flame-core" d={FLAME_CORE_PATH} />
      <path className="gloss" d="M 46.5 66 Q 47.5 59 51 54" />
    </svg>
  )
}

/** As linhas de desânimo na testa de cada avatar (a sombra das emoções tristes). */
const GLOOM_LINES: Record<AvatarName, string> = {
  fogo: 'M 57 52 L 57 61 M 64 48 L 64 62 M 71 52 L 71 61',
  geleca: 'M 56 62 L 56 70 M 64 59 L 64 71 M 72 62 L 72 70',
  fantasma: 'M 56 46 L 56 57 M 64 44 L 64 59 M 72 46 L 72 57'
}

/**
 * A sombra na testa (Fase 27): o casco escurecendo de cima para baixo, com as linhas de desânimo
 * dos desenhos animados. A força (de 0 a 1) é a opacidade da camada.
 */
export function Gloom({ avatar }: { avatar: AvatarName }): JSX.Element {
  return (
    <svg className="layer" viewBox="0 0 128 128">
      <path className="gloom-shade" d={AVATAR_PATHS[avatar]} />
      <path className="gloom-lines" d={GLOOM_LINES[avatar]} />
    </svg>
  )
}
