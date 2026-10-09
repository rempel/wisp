import { useRef, useState } from 'react'
import type { JSX, PointerEvent } from 'react'

/** Movimento (px) a partir do qual o gesto deixa de ser clique e vira arraste. */
const DRAG_THRESHOLD = 5

/** Silhueta da chama: base redonda e a ponta curvada para cima. */
const FLAME_PATH =
  'M 64 100 C 77.25 100 88 89.25 88 76 C 88 64 82 56 78 49 C 73 41 75 20 72 20 ' +
  'C 69 20 59 44.4 55 50 C 50 57 40 63 40 76 C 40 89.25 50.75 100 64 100 Z'

interface Press {
  pointerId: number
  x: number
  y: number
  dragging: boolean
}

/**
 * Faíscas em órbita. São desenhadas duas vezes: a cópia de trás fica atrás da chama e só
 * aparece na metade de cima da órbita; a da frente fica na frente e só aparece na metade de
 * baixo. Assim a faísca "passa por trás" sem precisar trocar z-index durante a animação.
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
      <div className="float">
        <div
          className={`wisp${booping ? ' boop' : ''}`}
          onAnimationEnd={(e) => {
            if (e.animationName === 'boop') setBooping(false)
          }}
        >
          <div className="glow" />
          <Sparks layer="back" />

          {/* A chama é cortada em três faixas (base, língua e ponta), cada uma numa camada
              própria, para a ponta ondular só com transform, sem redesenhar o SVG. */}
          <div className="flame" aria-hidden>
            <svg className="layer" viewBox="0 0 128 128">
              <defs>
                <radialGradient
                  id="wisp-fill"
                  cx="64"
                  cy="80"
                  r="40"
                  fx="58"
                  fy="70"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop className="fill-core" offset="0" />
                  <stop className="fill-mid" offset="0.35" />
                  <stop className="fill-edge" offset="1" />
                </radialGradient>
                <path id="wisp-shape" d={FLAME_PATH} />
                <clipPath id="wisp-clip-base">
                  <rect x="0" y="45" width="128" height="83" />
                </clipPath>
                <clipPath id="wisp-clip-tongue">
                  <rect x="0" y="30.4" width="128" height="16.6" />
                </clipPath>
                <clipPath id="wisp-clip-tip">
                  <rect x="0" y="0" width="128" height="31.6" />
                </clipPath>
              </defs>
              <use href="#wisp-shape" fill="url(#wisp-fill)" clipPath="url(#wisp-clip-base)" />
              <ellipse
                className="gloss"
                cx="51.5"
                cy="66"
                rx="5.5"
                ry="3.4"
                transform="rotate(-35 51.5 66)"
              />
            </svg>
            <div className="tongue">
              <svg className="layer" viewBox="0 0 128 128">
                <use href="#wisp-shape" fill="url(#wisp-fill)" clipPath="url(#wisp-clip-tongue)" />
              </svg>
              <div className="tip">
                <svg className="layer" viewBox="0 0 128 128">
                  <use href="#wisp-shape" fill="url(#wisp-fill)" clipPath="url(#wisp-clip-tip)" />
                </svg>
              </div>
            </div>
            <div className="eyes">
              <svg className="layer" viewBox="0 0 128 128">
                <ellipse className="pupil" cx="56" cy="78.5" rx="4.1" ry="5.6" />
                <ellipse className="pupil" cx="72" cy="78.5" rx="4.1" ry="5.6" />
                <circle className="shine" cx="57.5" cy="76.2" r="1.4" />
                <circle className="shine" cx="73.5" cy="76.2" r="1.4" />
              </svg>
            </div>
          </div>

          <Sparks layer="front" />
        </div>
      </div>
    </div>
  )
}
