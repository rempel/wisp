import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, DragEvent, JSX, PointerEvent } from 'react'
import type {
  Accessory,
  DroppedFile,
  MascotIsland,
  MascotView,
  SoundName,
  VoiceStatus
} from '../../shared/ipc'
import { reducedMotion, setAppearance } from '../common/appearance'
import { makeThumbnail } from '../common/thumbnail'
import { DEFAULT_AVATAR } from '../../shared/avatars'
import type { AvatarName } from '../../shared/avatars'
import { AccessoryArt } from './Accessory'
import { Body, Gloom } from './Bodies'
import { EmoteArt } from './Emotes'
import { HEART, KitEyes, Mouths } from './FaceArt'
import { BLINKING_EYES, faceFor, faceKey, takeOf } from './face'
import type { Face, Reaction } from './face'
import { SoundPlayer } from './sounds'
import { VoiceCapture, VoiceSpeaker } from './voice'
import {
  ANTICIPATION_MS,
  MIX,
  MIX_MS,
  REUSED_EMOTES,
  TAKE_MS,
  takeFrames
} from '../../shared/emotions'
import type { Dance, Emotion, MascotAct } from '../../shared/emotions'
import { t } from '../../shared/i18n'
import { IslandView } from './Island'

/** Movimento (px) a partir do qual o gesto deixa de ser clique e vira arraste. */
const DRAG_THRESHOLD = 5
/** Cliques com menos que isso entre eles (ms) formam uma sequência: cutucadas. */
const QUICK_CLICK_MS = 600
/** Com o cursor em cima do mascote por este tempo (ms), vira carinho. */
const PET_MS = 2000
/** O arquivo solto voa para dentro do Wisp; o painel abre depois do gole (ms). */
const ABSORB_SEND_MS = 650

/** O brilho extra que pisca a cada pedaço de texto da resposta. */
const PULSE_KEYFRAMES: Keyframe[] = [
  { opacity: 0, transform: 'scale(0.92)' },
  { opacity: 0.9, transform: 'scale(1.04)', offset: 0.3 },
  { opacity: 0, transform: 'scale(1.12)' }
]

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

/** Antes da troca atuada, os olhos apertam até fechar; reabrem logo depois do rosto novo. */
const SQUINT_FRAMES: Keyframe[] = [
  { transform: 'scaleY(1)' },
  { transform: 'scaleY(0.08)', offset: 0.4 },
  { transform: 'scaleY(0.08)', offset: 0.55 },
  { transform: 'scaleY(1)' }
]

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
      problems.push(
        t('"{v1}" é uma pasta: anexe os arquivos dela.', { v1: file?.name ?? t('pasta') })
      )
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
      problems.push(t('"{name}" não veio de uma pasta do computador.', { name: file.name }))
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
  const [avatar, setAvatar] = useState<AvatarName>(DEFAULT_AVATAR)
  const [voice, setVoice] = useState<VoiceStatus>({ state: 'idle' })
  const [island, setIsland] = useState<MascotIsland>(null)
  // As emoções e as danças (Fase 27): a pedida (pelo Claude, na galeria), a dança da música e o
  // passo do "mix".
  const [expressed, setExpressed] = useState<Emotion | null>(null)
  const [requestedDance, setRequestedDance] = useState<Dance | null>(null)
  const [danceStyle, setDanceStyle] = useState<Dance>('mix')
  const [mixStep, setMixStep] = useState(0)
  const [shown, setShown] = useState<Face>(() => faceFor('idle', null, null))
  const act = useRef<HTMLDivElement>(null)
  const blink = useRef<HTMLDivElement>(null)
  const shownRef = useRef(shown)
  const swapTimer = useRef(0)
  const feelTimer = useRef(0)
  const danceTimer = useRef(0)

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
    const offState = window.wisp.mascot.onState((next) => {
      // Acordou: um susto, os olhos abrem e a luz de cima se endireita.
      if (viewRef.current.state === 'sleeping' && next.state !== 'sleeping') react('wake')
      // O carinho é só quando nada mais está acontecendo.
      if (next.state !== 'idle' && reactionRef.current === 'petting') react(null)
      viewRef.current = next
      setView(next)
    })
    const offPulse = window.wisp.mascot.onPulse(() => {
      if (!reducedMotion()) {
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
    const offAct = window.wisp.mascot.onAct((next: MascotAct) => {
      if (next.kind === 'style') {
        setDanceStyle(next.dance)
      } else if (next.kind === 'feel') {
        window.clearTimeout(feelTimer.current)
        setExpressed(next.emotion)
        feelTimer.current = window.setTimeout(() => setExpressed(null), next.ms)
      } else {
        window.clearTimeout(danceTimer.current)
        setRequestedDance(next.dance)
        danceTimer.current = window.setTimeout(() => setRequestedDance(null), next.ms)
      }
    })
    const offAccessory = window.wisp.mascot.onAccessory(setAccessory)
    const offIsland = window.wisp.mascot.onIsland(setIsland)
    const offAvatar = window.wisp.mascot.onAvatar(setAvatar)
    const offMotion = window.wisp.mascot.onMotion((reduce) =>
      setAppearance({ reduceMotion: reduce })
    )
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
    // da luz de cima (direto no estilo, sem render).
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
      offAct()
      offAccessory()
      offIsland()
      offAvatar()
      offMotion()
      offSound()
      offCustom()
      offVoice()
      offVoiceStatus()
      capture.cancel()
      speaker.hush()
      window.clearTimeout(reactTimer.current)
      window.clearTimeout(petTimer.current)
      window.clearTimeout(feelTimer.current)
      window.clearTimeout(danceTimer.current)
      window.clearTimeout(swapTimer.current)
    }
  }, [react])

  // ---- O rosto, com a troca atuada (Fase 27) --------------------------------

  /*
   * Quando o rosto muda para uma emoção, a troca é atuada, como no kit: os olhos apertam e o
   * corpo encolhe um instante antes (a antecipação), o rosto troca com os olhos fechados, e vem um
   * susto do tamanho da emoção nova, que balança e assenta. A cor, as bochechas e a sombra mudam
   * aos poucos (CSS). As reações trocam na hora, para o clique responder no ato.
   */
  useEffect(() => {
    // Lendo a resposta em voz alta (com a conversa já parada), a boca fala do mesmo jeito.
    const state = voice.state === 'speaking' && view.state === 'idle' ? 'talking' : view.state
    const target = faceFor(state, reaction, expressed)
    const previous = shownRef.current
    if (faceKey(previous) === faceKey(target)) {
      window.clearTimeout(swapTimer.current)
      return
    }
    window.clearTimeout(swapTimer.current)
    const swap = (): void => {
      shownRef.current = target
      setShown(target)
    }
    const amount = reaction ? 0 : takeOf(previous, target)
    if (amount <= 0 || reducedMotion()) {
      swap()
      return
    }
    act.current?.animate(takeFrames(amount), {
      duration: ANTICIPATION_MS + TAKE_MS,
      easing: 'linear'
    })
    blink.current?.animate(SQUINT_FRAMES, { duration: 260, easing: 'ease-in-out' })
    swapTimer.current = window.setTimeout(swap, ANTICIPATION_MS)
  }, [view.state, voice.state, reaction, expressed])

  // A dança: a pedida, ou a da música (ocioso e acordado). O "mix" troca a cada dois compassos.
  const dancing: Dance | null =
    view.state === 'sleeping' || view.state === 'permission' || view.state === 'error'
      ? null
      : (requestedDance ?? (view.state === 'idle' && view.music ? danceStyle : null))
  useEffect(() => {
    if (dancing !== 'mix') return
    const timer = window.setInterval(() => setMixStep((step) => step + 1), MIX_MS)
    return () => {
      window.clearInterval(timer)
      // A próxima vez começa do começo (quicar).
      setMixStep(0)
    }
  }, [dancing])
  const dance = dancing === 'mix' ? MIX[mixStep % MIX.length] : dancing

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

  // ---- Arquivo solto: o Wisp absorve e o painel abre com ele anexado --------

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
    // As miniaturas ficam prontas enquanto o Wisp engole; o painel abre depois do gole.
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

  const face = shown
  const reused = face.emote && REUSED_EMOTES.includes(face.emote) ? face.emote : null
  const classes = [
    'stage',
    `avatar-${avatar}`,
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
    island && 'in-island',
    reused && `emote-${reused}`
  ]
  // A força da cor, das bochechas, da sombra e o olhar da emoção, para o CSS.
  const faceStyle = {
    '--tk': face.tintK,
    '--blush': face.blush,
    '--gloom': face.gloom,
    '--lx': face.look[0],
    '--ly': face.look[1]
  } as CSSProperties

  const stageElement = (
    <div
      ref={stage}
      className={classes.filter(Boolean).join(' ')}
      style={faceStyle}
      data-eyes={face.eyes}
      data-blink={BLINKING_EYES.includes(face.eyes) ? '' : undefined}
      data-mouth={face.mouth ?? undefined}
      data-tint={face.tint ?? undefined}
      data-feel={face.feel ?? undefined}
      data-emote={face.emote ?? undefined}
      data-dance={dance ?? undefined}
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
          {/* A sombra na testa das emoções tristes: escura em cima, some no meio do corpo. */}
          <linearGradient id="wisp-gloom" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1e1b4b" stopOpacity="0.75" />
            <stop offset="0.55" stopColor="#1e1b4b" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      <div className="float">
        {/* Pulos e tremidas dos estados ficam no .mood; os das reações, no .react; o amassado
          do clique, no .wisp. */}
        <div className="mood">
          {/* A dança (Fase 27: as do kit), quando algum player está tocando ou quando pedem: por
            fora das emoções e das reações, que se somam. */}
          <div className="groove">
            {/* A emoção: a pose (que assenta com uma molinha), o movimento dela e o susto da
              troca atuada (animado pelo Mascot.tsx). */}
            <div className="pose">
              <div className="feel">
                <div className="act" ref={act}>
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

                      {/* A luz de cima (a faísca do fogo, a bolha da geleca, a chama do fantasminha):
                balança e flutua. A pose (caída no cochilo, em pé no susto) fica por fora. */}
                      <div className="antenna-pose" aria-hidden>
                        <div className="antenna">
                          <svg className="layer" viewBox="0 0 128 128">
                            <circle className="led" cx="64" cy="15" r="3.3" />
                          </svg>
                          <div className="antenna-glow">
                            <svg className="layer" viewBox="0 0 128 128">
                              <circle className="led-halo" cx="64" cy="15" r="5.5" />
                            </svg>
                          </div>
                          {/* Ondas saindo da luz de cima, enquanto ele ouve: crescem com a voz. */}
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

                      {/* O corpo de cada avatar (Bodies.tsx). É estático, então é desenhado uma vez só. */}
                      <div className="body" aria-hidden>
                        <Body avatar={avatar} />
                      </div>

                      {/* A sombra na testa das emoções tristes. */}
                      <div className="gloom" aria-hidden>
                        <Gloom avatar={avatar} />
                      </div>

                      {/* As bochechas, no carinho. */}
                      <div className="blush" aria-hidden>
                        <svg className="layer" viewBox="0 0 128 128">
                          <ellipse cx="51.5" cy="87" rx="2.8" ry="1.4" />
                          <ellipse cx="76.5" cy="87" rx="2.8" ry="1.4" />
                        </svg>
                      </div>

                      {/* Os olhos. De fora para dentro: o olhar do estado (de lado, varrendo), o que
                segue o cursor, o da emoção (parado e o que mexe), o das reações (arregalado) e a
                piscada. */}
                      <div className="eyes" aria-hidden>
                        <div className="gaze">
                          <div className="look">
                            <div className="look-move">
                              <div className="eyes-react">
                                <div className="eyes-blink" ref={blink}>
                                  <svg className="layer" viewBox="0 0 128 128">
                                    <g className="eye-leds">
                                      <rect
                                        className="led"
                                        x="52.5"
                                        y="75"
                                        width="6"
                                        height="10"
                                        rx="3"
                                      />
                                      <rect
                                        className="led"
                                        x="69.5"
                                        y="75"
                                        width="6"
                                        height="10"
                                        rx="3"
                                      />
                                      <circle className="eye-glint" cx="56.8" cy="77.4" r="1.2" />
                                      <circle className="eye-glint" cx="73.8" cy="77.4" r="1.2" />
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
                                    <g className="eye-glyph eye-squeeze">
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
                                    <g className="eye-glyph eye-swirl">
                                      <path className="spin" d={spiral(55.5, 80)} />
                                      <path className="spin" d={spiral(72.5, 80)} />
                                    </g>
                                    <KitEyes />
                                  </svg>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* A boca (Fase 27): logo abaixo dos olhos; sem emoção, nenhuma. */}
                      <div className="mouth" aria-hidden>
                        <div className="mouth-move">
                          <Mouths />
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
                      {t('oi!')}
                    </div>

                    {/* O arquivo solto voando para dentro do Wisp. */}
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

                    {/* O sinal no ar da emoção (os que as reações já tinham são ligados pela classe). */}
                    {face.emote && (
                      <EmoteArt key={face.emote} emote={face.emote} fade={face.fade} />
                    )}
                  </div>
                </div>
              </div>
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
  // A ilha: a cápsula no topo da tela, com o mascote em miniatura, a linha de estado e, aberta, os
  // cartões (Fase 37). O mascote dentro dela só se mostra (não se arrasta nem leva cutucadas).
  return (
    <IslandView
      island={island}
      stage={stageElement}
      drop={{ onDragEnter, onDragOver, onDragLeave, onDrop }}
    />
  )
}
