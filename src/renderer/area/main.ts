// A camada de recortar uma área (Fase 41): mostra o print que o main tirou, ajustado à janela, e
// manda o retângulo arrastado em pixels da imagem. Esc ou o botão direito desistem.
import { t } from '../../shared/i18n'
import './area.css'

const shot = document.getElementById('shot') as HTMLImageElement
const box = document.getElementById('box') as HTMLDivElement
const hint = document.getElementById('hint') as HTMLParagraphElement
hint.textContent = t('Arraste para recortar uma área. Esc desiste.')

/** Onde a imagem ficou na janela: o deslocamento e a escala (ela cabe inteira, sem distorcer). */
let view = { left: 0, top: 0, scale: 1, width: 1, height: 1 }
let start: { x: number; y: number } | null = null
let sent = false

function layout(): void {
  if (!shot.naturalWidth) return
  const scale = Math.min(
    window.innerWidth / shot.naturalWidth,
    window.innerHeight / shot.naturalHeight
  )
  const width = shot.naturalWidth * scale
  const height = shot.naturalHeight * scale
  view = {
    left: (window.innerWidth - width) / 2,
    top: (window.innerHeight - height) / 2,
    scale,
    width: shot.naturalWidth,
    height: shot.naturalHeight
  }
  Object.assign(shot.style, {
    left: `${view.left}px`,
    top: `${view.top}px`,
    width: `${width}px`,
    height: `${height}px`
  })
}

function finish(rect: { x: number; y: number; width: number; height: number } | null): void {
  if (sent) return
  sent = true
  window.wisp.area.done(rect)
}

/** Um ponto da janela em pixels da imagem. */
const toImage = (x: number, y: number): { x: number; y: number } => ({
  x: (x - view.left) / view.scale,
  y: (y - view.top) / view.scale
})

window.addEventListener('resize', layout)
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') finish(null)
})
window.addEventListener('contextmenu', (event) => {
  event.preventDefault()
  finish(null)
})
window.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return
  start = { x: event.clientX, y: event.clientY }
  document.body.classList.add('dragging')
  box.hidden = false
  Object.assign(box.style, { left: `${start.x}px`, top: `${start.y}px`, width: '0', height: '0' })
  document.body.setPointerCapture(event.pointerId)
})
window.addEventListener('pointermove', (event) => {
  if (!start) return
  Object.assign(box.style, {
    left: `${Math.min(start.x, event.clientX)}px`,
    top: `${Math.min(start.y, event.clientY)}px`,
    width: `${Math.abs(event.clientX - start.x)}px`,
    height: `${Math.abs(event.clientY - start.y)}px`
  })
})
window.addEventListener('pointerup', (event) => {
  if (!start) return
  const a = toImage(start.x, start.y)
  const b = toImage(event.clientX, event.clientY)
  start = null
  // Um clique sem arrastar é desistir (o main também recusa um recorte de poucos pixels).
  finish({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y)
  })
})

void window.wisp.area.image().then((image) => {
  if (!image) return finish(null)
  shot.onload = layout
  shot.src = image.url
})
