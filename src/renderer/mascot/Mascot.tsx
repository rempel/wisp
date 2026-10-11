import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, DragEvent, JSX, PointerEvent } from 'react'
import type {
  Accessory,
  DroppedFile,
  MascotIsland,
  MascotState,
  MascotView,
  SoundName,
  VoiceStatus
} from '../../shared/ipc'
import { makeThumbnail } from '../common/thumbnail'
import { AccessoryArt } from './Accessory'
import { SoundPlayer } from './sounds'
import { VoiceCapture, VoiceSpeaker } from './voice'

/** Movimento (px) a partir do qual o gesto deixa de ser clique e vira arraste. */
const DRAG_THRESHOLD = 5
/** Cliques com menos que isso entre eles (ms) formam uma sequência: cutucadas. */
const QUICK_CLICK_MS = 600
/** Com o cursor em cima do mascote por este tempo (ms), vira carinho. */
const PET_MS = 2000
/** O arquivo solto voa para dentro da gota; o painel abre depois do gole (ms). */
const ABSORB_SEND_MS = 650

/** Silhueta da gota: base redonda e ponta para cima, onde a antena encaixa. */
const DROP_PATH =
  'M 64 30 C 69 41 89 56 89 79 C 89 92.8 77.8 104 64 104 ' +
  'C 50.2 104 39 92.8 39 79 C 39 56 59 41 64 30 Z'

/** O brilho extra que pisca a cada pedaço de texto da resposta. */
const PULSE_KEYFRAMES: Keyframe[] = [
  { opacity: 0, transform: 'scale(0.92)' },
  { opacity: 0.9, transform: 'scale(1.04)', offset: 0.3 },
  { opacity: 0, transform: 'scale(1.12)' }
]

/**
 * Reações a quem mexe com ele: o clique (cutucada), a segunda cutucada (irritado), a terceira
 * (tonto), o cursor parado em cima (carinho), a saudação ao abrir, o gole de um arquivo solto e
 * o susto ao acordar.
 */
type Reaction = 'poke' | 'annoyed' | 'dizzy' | 'petting' | 'greet' | 'absorb' | 'wake' | 'remind'

/** Quanto dura cada reação (ms). O carinho dura enquanto o cursor estiver em cima. */
const REACTION_MS: Record<Exclude<Reaction, 'petting'>, number> = {
  poke: 450,
  annoyed: 1100,
  dizzy: 2600,
  greet: 2400,
  absorb: 900,
  wake: 800,
  remind: 3600
}

/** O desenho dos olhos: LEDs, ^ ^, x x, fechados, > <, bravos ou espirais. */
type EyeShape = 'leds' | 'happy' | 'x' | 'closed' | 'squint' | 'angry' | 'spiral'

function eyesFor(state: MascotState, reaction: Reaction | null): EyeShape {
  switch (reaction) {
    case 'poke':
      return 'squint'
    case 'annoyed':
      return 'angry'
    case 'dizzy':
      return 'spiral'
    case 'petting':
      return 'happy'
    case 'greet':
    case 'absorb':
    case 'wake':
    case 'remind':
      return 'leds'
  }
  if (state === 'happy') return 'happy'
  if (state === 'error') return 'x'
  if (state === 'sleeping') return 'closed'
  return 'leds'
}

interface Press {
  pointerId: number
  x: number
  y: number
  dragging: boolean
}

/**
 * Uma espiral de olho tonto em volta de (cx, cy): quatro meias-voltas, cada uma com o raio maior
 * que a anterior (o centro de cada arco alterna entre dois pontos a 1,1 de distância).
 */
function spiral(cx: number, cy: number): string {
  const x = cx - 0.55
  return (
    `M ${x} ${cy} A 1.1 1.1 0 0 1 ${x + 2.2} ${cy} A 2.2 2.2 0 0 1 ${x - 2.2} ${cy} ` +
    `A 3.3 3.3 0 0 1 ${x + 4.4} ${cy} A 4.4 4.4 0 0 1 ${x - 4.4} ${cy}`
  )
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

/** Bits que saltam do corpo quando ele fica feliz: direção (px) e atraso (s) de cada um. */
const BURST = [
  { x: -34, y: -26, delay: 0 },
  { x: 34, y: -24, delay: 0.05 },
  { x: -42, y: 4, delay: 0.1 },
  { x: 42, y: 6, delay: 0.03 },
  { x: -20, y: -40, delay: 0.08 },
  { x: 22, y: -42, delay: 0.12 }
]

/** Coraçãozinho do carinho, centrado em (0, 0). */
const HEART =
  'M 0 2.6 C -3.4 0 -4.2 -2.4 -2.4 -3.6 C -1.2 -4.4 0 -3.4 0 -2.2 ' +
  'C 0 -3.4 1.2 -4.4 2.4 -3.6 C 4.2 -2.4 3.4 0 0 2.6 Z'

/** Estrelinha de quatro pontas, das que rodam na cabeça de quem está tonto. */
const STAR = 'M 0 -3.2 L 0.9 -0.9 L 3.2 0 L 0.9 0.9 L 0 3.2 L -0.9 0.9 L -3.2 0 L -0.9 -0.9 Z'

/** Pede um som de reação: o main confere se os sons estão ligados e devolve o som. */
function sound(name: SoundName): void {
  window.wisp.mascot.playSound(name)
}

function hasFiles(event: DragEvent<HTMLElement>): boolean {
  return event.dataTransfer.types.includes('Files')
}

/** Os arquivos de um arraste solto no mascote (lidos durante o evento) e o que ficou de fora. */
function collectDropped(data: DataTransfer): {
  files: File[]
  paths: string[]
  problems: string[]
} {
  const files: File[] = []
  const paths: string[] = []
  const problems: string[] = []
  for (const item of Array.from(data.items)) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (item.webkitGetAsEntry()?.isDirectory) {
      problems.push(`"${file?.name ?? 'pasta'}" é uma pasta: anexe os arquivos dela.`)
      continue
    }
    if (!file) continue
    let path = ''
    try {
      path = window.wisp.mascot.pathForFile(file)
    } catch {
      // Sem caminho: não veio de uma pasta do computador.
    }
    if (!path) {
      problems.push(`"${file.name}" não veio de uma pasta do computador.`)
      continue
    }
    files.push(file)
    paths.push(path)
  }
  return { files, paths, problems }
}

export default function Mascot(): JSX.Element {
  const stage = useRef<HTMLDivElement>(null)
  const press = useRef<Press | null>(null)
  const pulse = useRef<HTMLDivElement>(null)
  const player = useRef<SoundPlayer | null>(null)
  const [dragging, setDragging] = useState(false)
  const [booping, setBooping] = useState(false)
  const [view, setView] = useState<MascotView>({ state: 'idle', look: 'left' })
  const [reaction, setReaction] = useState<Reaction | null>(null)
  const [gazing, setGazing] = useState(false)
  const [dropOver, setDropOver] = useState(false)
  const [absorbing, setAbsorbing] = useState<{ x: number; y: number; key: number } | null>(null)
  const [accessory, setAccessory] = useState<Accessory | null>(null)
  const [voice, setVoice] = useState<VoiceStatus>({ state: 'idle' })
  const [island, setIsland] = useState<MascotIsland>(null)

  // Para os timers e eventos, que não esperam o render.
  const viewRef = useRef(view)
  const reactionRef = useRef<Reaction | null>(null)
  const reactTimer = useRef(0)
  const petTimer = useRef(0)
  const clicks = useRef({ count: 0, last: 0 })
  const dragDepth = useRef(0)
  const soundCount = useRef(0)

  const react = useCallback((next: Reaction | null): void => {
    window.clearTimeout(reactTimer.current)
    reactionRef.current = next
    setReaction(next)
    if (!next || next === 'petting') return
    reactTimer.current = window.setTimeout(() => {
      reactionRef.current = null
      setReaction(null)
    }, REACTION_MS[next])
  }, [])

  // Estado vindo do main (seção 5.3), o pulso do brilho, o olhar, as reações pedidas pelo main,
  // o acessório do dia e os sons.
  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const offState = window.wisp.mascot.onState((next) => {
      // Acordou: um susto, os olhos abrem e a antena se endireita.
      if (viewRef.current.state === 'sleeping' && next.state !== 'sleeping') react('wake')
      // O carinho é só quando nada mais está acontecendo.
      if (next.state !== 'idle' && reactionRef.current === 'petting') react(null)
      viewRef.current = next
      setView(next)
    })
    const offPulse = window.wisp.mascot.onPulse(() => {
      if (!reducedMotion.matches) {
        pulse.current?.animate(PULSE_KEYFRAMES, { duration: 460, easing: 'ease-out' })
      }
    })
    const offGaze = window.wisp.mascot.onGaze((gaze) => {
      const style = stage.current?.style
      style?.setProperty('--gx', String(gaze?.x ?? 0))
      style?.setProperty('--gy', String(gaze?.y ?? 0))
      setGazing(gaze !== null)
    })
    const offReact = window.wisp.mascot.onReact((name) => {
      if (name === 'greet') {
        react('greet')
        sound('oi')
      } else if (name === 'remind') {
        // O som do lembrete vem do main, junto com a notificação.
        react('remind')
      }
    })
    const offAccessory = window.wisp.mascot.onAccessory(setAccessory)
    const offIsland = window.wisp.mascot.onIsland(setIsland)
    const offSound = window.wisp.mascot.onSound((name, volume) => {
      player.current ??= new SoundPlayer()
      // O último som e quantos já tocaram, para depurar (e para os testes) sem ouvir.
      stage.current?.setAttribute('data-last-sound', `${name}#${++soundCount.current}`)
      player.current.play(name, volume).catch((err: unknown) => {
        console.warn(`[wisp] não consegui tocar o som "${name}":`, err)
      })
    })
    const offCustom = window.wisp.mascot.onCustomSound((name, data) => {
      player.current ??= new SoundPlayer()
      player.current.setCustom(name, data)
    })
    // A voz: o microfone abre só quando o main pede, e o volume do que ele ouve mexe nas ondas
    // da antena (direto no estilo, sem render).
    const capture = new VoiceCapture(
      (event) => window.wisp.mascot.voiceEvent(event),
      (level) => stage.current?.style.setProperty('--vl', String(level ?? 0))
    )
    const speaker = new VoiceSpeaker((id) => window.wisp.mascot.voiceEvent({ type: 'said', id }))
    const offVoice = window.wisp.mascot.onVoice((command) => {
      switch (command.type) {
        case 'start':
          void capture.start(command.id, command.mode)
          break
        case 'mode':
          capture.setMode(command.id, command.mode)
          break
        case 'stop':
          capture.finish(command.id)
          break
        case 'cancel':
          capture.cancel(command.id)
          break
        case 'say':
          speaker.say(command.id, command.pcm, command.rate)
          break
        case 'hush':
          speaker.hush()
          break
      }
    })
    const offVoiceStatus = window.wisp.mascot.onVoiceStatus(setVoice)
    window.wisp.mascot.ready()
    return () => {
      offState()
      offPulse()
      offGaze()
      offReact()
      offAccessory()
      offIsland()
      offSound()
      offCustom()
      offVoice()
      offVoiceStatus()
      capture.cancel()
      speaker.hush()
      window.clearTimeout(reactTimer.current)
      window.clearTimeout(petTimer.current)
    }
  }, [react])

  // ---- Cliques e arraste ----------------------------------------------------

  /**
   * O primeiro clique abre ou fecha o painel (e ele aperta os olhos, como quem leva uma
   * cutucada). Os seguintes, em sequência, são cutucadas: no segundo ele fica irritado, a partir
   * do terceiro, tonto. Eles não mexem no painel, que fica como o primeiro clique deixou.
   */
  function onClick(): void {
    const now = performance.now()
    const streak = clicks.current
    streak.count = now - streak.last < QUICK_CLICK_MS ? streak.count + 1 : 1
    streak.last = now
    setBooping(true)
    if (streak.count === 1) {
      window.wisp.mascot.click()
      react('poke')
      return
    }
    window.wisp.mascot.activity()
    if (streak.count === 2) {
      react('annoyed')
      sound('cutucada')
    } else {
      react('dizzy')
      if (streak.count === 3) sound('tonto')
    }
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>): void {
    window.clearTimeout(petTimer.current)
    if (reactionRef.current === 'petting') react(null)
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
      onClick()
    }
  }

  // ---- Cursor em cima: carinho -----------------------------------------------

  function onPointerEnter(): void {
    window.wisp.mascot.hover(true)
    window.clearTimeout(petTimer.current)
    petTimer.current = window.setTimeout(() => {
      // Só quando nada mais acontece (nem um botão apertado, nem outra reação).
      if (viewRef.current.state !== 'idle' || press.current || reactionRef.current) return
      react('petting')
      sound('carinho')
      window.wisp.mascot.activity()
    }, PET_MS)
  }

  function onPointerLeave(): void {
    window.wisp.mascot.hover(false)
    window.clearTimeout(petTimer.current)
    if (reactionRef.current === 'petting') react(null)
  }

  // ---- Arquivo solto: a gota absorve e o painel abre com ele anexado --------

  function onDragEnter(e: DragEvent<HTMLDivElement>): void {
    if (!hasFiles(e)) return
    e.preventDefault()
    if (dragDepth.current++ === 0) {
      setDropOver(true)
      window.wisp.mascot.activity()
      // No modo compacto, um arquivo trazido até a aba faz ele sair da borda para receber.
      window.wisp.mascot.hover(true)
    }
  }

  function onDragOver(e: DragEvent<HTMLDivElement>): void {
    if (!hasFiles(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>): void {
    if (!hasFiles(e)) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) {
      setDropOver(false)
      window.wisp.mascot.hover(false)
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>): void {
    dragDepth.current = 0
    setDropOver(false)
    window.wisp.mascot.hover(false)
    if (!hasFiles(e)) return
    e.preventDefault()
    const { files, paths, problems } = collectDropped(e.dataTransfer)
    if (files.length) {
      setAbsorbing({ x: e.clientX, y: e.clientY, key: performance.now() })
      react('absorb')
      sound('absorver')
    }
    // As miniaturas ficam prontas enquanto a gota engole; o painel abre depois do gole.
    const thumbnails = Promise.all(files.map((file) => makeThumbnail(file)))
    const swallow = new Promise((resolve) =>
      window.setTimeout(resolve, files.length ? ABSORB_SEND_MS : 0)
    )
    void Promise.all([thumbnails, swallow]).then(([thumbs]) => {
      const dropped: DroppedFile[] = files.map((file, index) => ({
        path: paths[index],
        name: file.name,
        size: file.size,
        ...(thumbs[index] ? { thumbnail: thumbs[index] } : {})
      }))
      window.wisp.mascot.drop({ files: dropped, problems })
    })
  }

  const eyes = eyesFor(view.state, reaction)
  const classes = [
    'stage',
    `state-${view.state}`,
    `look-${view.look}`,
    reaction && `react-${reaction}`,
    dragging && 'dragging',
    gazing && 'gazing',
    dropOver && 'drop-over',
    accessory && `acc-${accessory}`,
    view.music && 'music',
    voice.state !== 'idle' && `voice-${voice.state}`,
    voice.heard && 'voice-heard',
    island && 'in-island'
  ]

  const stageElement = (
    <div
      ref={stage}
      className={classes.filter(Boolean).join(' ')}
      data-eyes={eyes}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endPress(e, true)}
      onPointerCancel={(e) => endPress(e, false)}
      onLostPointerCapture={(e) => endPress(e, false)}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onContextMenu={(e) => {
        e.preventDefault()
        window.wisp.mascot.menu()
      }}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
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
        {/* Pulos e tremidas dos estados ficam no .mood; os das reações, no .react; o amassado
          do clique, no .wisp. */}
        <div className="mood">
          {/* A dança, quando algum player está tocando: por fora das reações, que se somam. */}
          <div className="groove">
            <div className="react">
              <div
                className={`wisp${booping ? ' boop' : ''}`}
                onAnimationEnd={(e) => {
                  if (e.animationName === 'boop') setBooping(false)
                }}
              >
                <div className="glow-pose">
                  <div className="glow" />
                </div>
                <div className="pulse" ref={pulse} />
                <Sparks layer="back" />

                {/* Antena: balança a partir da base, escondida atrás do encaixe na ponta. A pose
                (caída no cochilo, em pé no susto) fica por fora do balanço. */}
                <div className="antenna-pose" aria-hidden>
                  <div className="antenna">
                    <svg className="layer" viewBox="0 0 128 128">
                      <line className="antenna-rod" x1="64" y1="31" x2="64" y2="17.5" />
                      <circle className="led" cx="64" cy="15" r="3.3" />
                    </svg>
                    <div className="antenna-glow">
                      <svg className="layer" viewBox="0 0 128 128">
                        <circle className="led-halo" cx="64" cy="15" r="5.5" />
                      </svg>
                    </div>
                    {/* Ondas de rádio saindo da antena, enquanto ele ouve: crescem com a voz. */}
                    <div className="waves">
                      <div className="wave w1">
                        <svg className="layer" viewBox="0 0 128 128">
                          <path d="M 57.5 10 Q 55 15 57.5 20 M 70.5 10 Q 73 15 70.5 20" />
                        </svg>
                      </div>
                      <div className="wave w2">
                        <svg className="layer" viewBox="0 0 128 128">
                          <path d="M 53 6.5 Q 49 15 53 23.5 M 75 6.5 Q 79 15 75 23.5" />
                        </svg>
                      </div>
                    </div>
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
                    <rect
                      className="collar-light"
                      x="61.3"
                      y="29.6"
                      width="5.4"
                      height="1.1"
                      rx="0.5"
                    />
                  </svg>
                </div>

                {/* Bochechas de LED, no carinho. */}
                <div className="blush" aria-hidden>
                  <svg className="layer" viewBox="0 0 128 128">
                    <ellipse cx="51.5" cy="87" rx="2.8" ry="1.4" />
                    <ellipse cx="76.5" cy="87" rx="2.8" ry="1.4" />
                  </svg>
                </div>

                {/* Olhos de LED. De fora para dentro: o olhar do estado (de lado, varrendo), o que
                segue o cursor, o das reações (arregalado) e a piscada. */}
                <div className="eyes" aria-hidden>
                  <div className="gaze">
                    <div className="eyes-react">
                      <div className="eyes-blink">
                        <svg className="layer" viewBox="0 0 128 128">
                          <g className="eye-leds">
                            <rect className="led" x="52.5" y="75" width="6" height="10" rx="3" />
                            <rect className="led" x="69.5" y="75" width="6" height="10" rx="3" />
                          </g>
                          <g className="eye-glyph eye-happy">
                            <path d="M 52 82.5 L 55.5 77.5 L 59 82.5" />
                            <path d="M 69 82.5 L 72.5 77.5 L 76 82.5" />
                          </g>
                          <g className="eye-glyph eye-x">
                            <path d="M 52.5 76.5 L 58.5 83.5 M 58.5 76.5 L 52.5 83.5" />
                            <path d="M 69.5 76.5 L 75.5 83.5 M 75.5 76.5 L 69.5 83.5" />
                          </g>
                          <g className="eye-glyph eye-closed">
                            <path d="M 52 80 Q 55.5 83.6 59 80" />
                            <path d="M 69 80 Q 72.5 83.6 76 80" />
                          </g>
                          <g className="eye-glyph eye-squint">
                            <path d="M 52.5 76.5 L 58 80 L 52.5 83.5" />
                            <path d="M 75.5 76.5 L 70 80 L 75.5 83.5" />
                          </g>
                          <g className="eye-angry">
                            <path
                              className="led"
                              d="M 52.5 75.8 L 58.5 80.4 L 58.5 83 Q 58.5 85 56.5 85 L 54.5 85 Q 52.5 85 52.5 83 Z"
                            />
                            <path
                              className="led"
                              d="M 75.5 75.8 L 69.5 80.4 L 69.5 83 Q 69.5 85 71.5 85 L 73.5 85 Q 75.5 85 75.5 83 Z"
                            />
                          </g>
                          <g className="eye-glyph eye-spiral">
                            <path className="spin" d={spiral(55.5, 80)} />
                            <path className="spin" d={spiral(72.5, 80)} />
                          </g>
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                {accessory && <AccessoryArt kind={accessory} />}

                <Sparks layer="front" />

                <div className="burst" aria-hidden>
                  {BURST.map((bit, index) => (
                    <i
                      key={index}
                      style={
                        {
                          '--bx': `${bit.x}px`,
                          '--by': `${bit.y}px`,
                          '--bd': `${bit.delay}s`
                        } as CSSProperties
                      }
                    />
                  ))}
                </div>
              </div>

              {/* Corações do carinho. */}
              <svg className="layer hearts" viewBox="0 0 128 128" aria-hidden>
                <path className="heart h1" d={HEART} />
                <path className="heart h2" d={HEART} />
                <path className="heart h3" d={HEART} />
              </svg>

              {/* A veia de bravo, das cutucadas. */}
              <svg className="layer anger" viewBox="0 0 128 128" aria-hidden>
                <g className="anger-mark">
                  <path d="M -4 -1.3 Q -1.3 -1.3 -1.3 -4 M 1.3 -4 Q 1.3 -1.3 4 -1.3 M 4 1.3 Q 1.3 1.3 1.3 4 M -1.3 4 Q -1.3 1.3 -4 1.3" />
                </g>
              </svg>

              {/* Estrelinhas rodando na cabeça, quando ele fica tonto. */}
              <div className="stars" aria-hidden>
                {[1, 2, 3].map((n) => (
                  <span key={n} className={`star t${n}`}>
                    <svg viewBox="-4 -4 8 8">
                      <path d={STAR} />
                    </svg>
                  </span>
                ))}
              </div>

              {/* Os "z" do cochilo: sobem um tempo e depois fica um só, parado. */}
              <div className="zzz" aria-hidden>
                <span className="z z1">z</span>
                <span className="z z2">z</span>
                <span className="z z3">z</span>
                <span className="z z-deep">z</span>
              </div>

              {/* O sininho de um lembrete. */}
              <svg className="layer bell" viewBox="0 0 128 128" aria-hidden>
                <g className="bell-body">
                  <circle cx="28" cy="20.2" r="1.5" />
                  <path d="M 28 21 C 23 21 21 25 21 30 L 21 34 L 19 37 L 37 37 L 35 34 L 35 30 C 35 25 33 21 28 21 Z" />
                  <circle className="bell-clapper" cx="28" cy="39" r="1.9" />
                </g>
              </svg>

              {/* "oi!" da saudação. */}
              <div className="bubble" aria-hidden>
                oi!
              </div>

              {/* O arquivo solto voando para dentro da gota. */}
              {absorbing && (
                <div
                  key={absorbing.key}
                  className="absorb"
                  style={
                    {
                      '--ax': `${absorbing.x - 64}px`,
                      '--ay': `${absorbing.y - 78}px`
                    } as CSSProperties
                  }
                  onAnimationEnd={() => setAbsorbing(null)}
                  aria-hidden
                >
                  <svg viewBox="0 0 14 18">
                    <path
                      className="doc"
                      d="M 2 0.5 H 9 L 13.5 5 V 16 Q 13.5 17.5 12 17.5 H 2 Q 0.5 17.5 0.5 16 V 2 Q 0.5 0.5 2 0.5 Z"
                    />
                    <path className="doc-fold" d="M 9 0.5 V 5 H 13.5" />
                    <path
                      className="doc-lines"
                      d="M 3.5 8.5 H 10.5 M 3.5 11 H 10.5 M 3.5 13.5 H 8"
                    />
                  </svg>
                </div>
              )}
            </div>

            {/* Notinhas da dança. */}
            <div className="notes" aria-hidden>
              <span className="note n1">♪</span>
              <span className="note n2">♫</span>
            </div>
          </div>

          {/* "?" do pedido de permissão, do lado em que o painel está. */}
          <div className="ask" aria-hidden>
            ?
          </div>
        </div>
      </div>
    </div>
  )

  if (!island) return stageElement
  // A ilha: a cápsula no topo da tela, com o mascote em miniatura e a linha de estado. O clique
  // abre o painel; o mascote dentro dela só se mostra (não se arrasta nem leva cutucadas).
  return (
    <div
      className={`island tone-${island.tone}${island.expanded ? ' expanded' : ''}`}
      role="button"
      aria-label={`Wisp: ${island.title}`}
      onClick={() => window.wisp.mascot.click()}
      onPointerEnter={() => window.wisp.mascot.hover(true)}
      onPointerLeave={() => window.wisp.mascot.hover(false)}
      onContextMenu={(e) => {
        e.preventDefault()
        window.wisp.mascot.menu()
      }}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="island-mascot">
        <div className="island-scale">{stageElement}</div>
      </div>
      <div className="island-text">
        <strong>{island.title}</strong>
        {island.detail && <span>{island.detail}</span>}
      </div>
    </div>
  )
}
