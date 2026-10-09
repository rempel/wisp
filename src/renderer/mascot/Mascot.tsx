import { useRef, useState } from 'react'
import type { JSX, PointerEvent } from 'react'

/** Movimento (px) a partir do qual o gesto deixa de ser clique e vira arraste. */
const DRAG_THRESHOLD = 5

/** Silhueta da gota: base redonda e ponta para cima, onde a antena encaixa. */
const DROP_PATH =
  'M 64 30 C 69 41 89 56 89 79 C 89 92.8 77.8 104 64 104 ' +
  'C 50.2 104 39 92.8 39 79 C 39 56 59 41 64 30 Z'

interface Press {
  pointerId: number
  x: number
  y: number
  dragging: boolean
}

/**
 * "Bits" em órbita. São desenhados duas vezes: a cópia de trás fica atrás do corpo e só
 * aparece na metade de cima da órbita; a da frente fica na frente e só aparece na metade de
 * baixo. Assim o bit "passa por trás" sem precisar trocar z-index durante a animação.
 */
function Sparks({ layer }: { layer: 'back' | 'front' }): JSX.Element {
  return (
    <div className={`sparks ${layer}`}>
      <span className="spark s1">
        <i />
      </span>
      <span className="spark s2">
        <i />
      </span>
      <span className="spark s3">
        <i />
      </span>
    </div>
  )
}

export default function Mascot(): JSX.Element {
  const press = useRef<Press | null>(null)
  const [dragging, setDragging] = useState(false)
  const [booping, setBooping] = useState(false)

  function onPointerDown(e: PointerEvent<HTMLDivElement>): void {
    if (e.button !== 0 || press.current) return
    // Com a captura, os eventos continuam chegando mesmo se o ponteiro sair da janela.
    e.currentTarget.setPointerCapture(e.pointerId)
    press.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, dragging: false }
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>): void {
    const p = press.current
    if (!p || p.dragging || e.pointerId !== p.pointerId) return
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > DRAG_THRESHOLD) {
      p.dragging = true
      setDragging(true)
      // A partir daqui o main move a janela seguindo o cursor.
      window.wisp.mascot.dragStart(p.x, p.y)
    }
  }

  function endPress(e: PointerEvent<HTMLDivElement>, released: boolean): void {
    const p = press.current
    if (!p || e.pointerId !== p.pointerId) return
    press.current = null
    if (p.dragging) {
      setDragging(false)
      window.wisp.mascot.dragEnd()
    } else if (released) {
      window.wisp.mascot.click()
      setBooping(true)
    }
  }

  return (
    <div
      className={`stage idle${dragging ? ' dragging' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endPress(e, true)}
      onPointerCancel={(e) => endPress(e, false)}
      onLostPointerCapture={(e) => endPress(e, false)}
    >
      {/* Gradientes e filtros compartilhados pelas camadas. As cores vêm do CSS. */}
      <svg className="defs" aria-hidden>
        <defs>
          <radialGradient
            id="wisp-shell"
            cx="64"
            cy="76"
            r="34"
            fx="54"
            fy="62"
            gradientUnits="userSpaceOnUse"
          >
            <stop className="shell-0" offset="0" />
            <stop className="shell-1" offset="0.42" />
            <stop className="shell-2" offset="0.85" />
            <stop className="shell-3" offset="1" />
          </radialGradient>
          <linearGradient id="wisp-visor" x1="0" y1="0" x2="0" y2="1">
            <stop className="visor-0" offset="0" />
            <stop className="visor-1" offset="1" />
          </linearGradient>
          <radialGradient id="wisp-led" cx="0.5" cy="0.5" r="0.5">
            <stop className="led-0" offset="0" />
            <stop className="led-1" offset="0.55" />
            <stop className="led-2" offset="1" />
          </radialGradient>
          <filter id="wisp-blur" x="-1" y="-1" width="3" height="3">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
          <filter id="wisp-led-glow" x="-1" y="-1" width="3" height="3">
            <feGaussianBlur stdDeviation="1.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      <div className="float">
        <div
          className={`wisp${booping ? ' boop' : ''}`}
          onAnimationEnd={(e) => {
            if (e.animationName === 'boop') setBooping(false)
          }}
        >
          <div className="glow" />
          <Sparks layer="back" />

          {/* Antena: balança a partir da base, que fica escondida atrás do encaixe na ponta. */}
          <div className="antenna" aria-hidden>
            <svg className="layer" viewBox="0 0 128 128">
              <line className="antenna-rod" x1="64" y1="31" x2="64" y2="17.5" />
              <circle className="led" cx="64" cy="15" r="3.3" />
            </svg>
            <div className="antenna-glow">
              <svg className="layer" viewBox="0 0 128 128">
                <circle className="led-halo" cx="64" cy="15" r="5.5" />
              </svg>
            </div>
          </div>

          {/* Corpo: casco, junta, visor, parafusos e encaixe da antena. É estático, então é
              desenhado uma vez só. */}
          <div className="body" aria-hidden>
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
          </div>

          {/* Olhos de LED: a camada de fora olha para os lados, a de dentro pisca. */}
          <div className="eyes" aria-hidden>
            <div className="eyes-blink">
              <svg className="layer" viewBox="0 0 128 128">
                <g className="eye-leds">
                  <rect className="led" x="52.5" y="75" width="6" height="10" rx="3" />
                  <rect className="led" x="69.5" y="75" width="6" height="10" rx="3" />
                </g>
              </svg>
            </div>
          </div>

          <Sparks layer="front" />
        </div>
      </div>
    </div>
  )
}
