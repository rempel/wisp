// A ilha (Fase 14; aberta e interativa na Fase 37): a cápsula do topo da tela com o mascote em
// miniatura e a linha de estado; aberta, os cartões: a conversa ou sessão em foco com os passos, a
// música com os controles, os pedidos que esperam (Negar, Permitir, Sempre, as perguntas) e os
// ajustes. O main decide quando ela abre e recolhe (island-state.ts); aqui é só o desenho e os
// botões, que voltam para o main pelo window.wisp.mascot.island.

import { useEffect, useRef, useState } from 'react'
import type { DragEvent, JSX, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { ISLAND_AUTO_CLOSE, islandOpenHeight, MUSIC_ID } from '../../shared/ipc'
import type {
  IslandAction,
  IslandAlert,
  IslandMusic,
  IslandQuestion,
  IslandRepeat,
  IslandSettings,
  IslandTask,
  IslandTaskState,
  MascotIsland
} from '../../shared/ipc'
import { t } from '../../shared/i18n'

type Island = NonNullable<MascotIsland>

const act = (action: IslandAction): void => window.wisp.mascot.island(action)

// ---- Ícones (traço de 1,6 px, no tamanho da fonte) --------------------------------------------

const Svg = ({ children, size = 14 }: { children: ReactNode; size?: number }): JSX.Element => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {children}
  </svg>
)

const HomeIcon = (): JSX.Element => (
  <Svg>
    <path d="M2.5 7.5 8 3l5.5 4.5V13H10V9.5H6V13H2.5z" />
  </Svg>
)
const GearIcon = (): JSX.Element => (
  <Svg>
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M3.6 12.4l1.2-1.2M11.2 4.8l1.2-1.2" />
  </Svg>
)
const PanelIcon = (): JSX.Element => (
  <Svg>
    <rect x="2.5" y="3" width="11" height="10" rx="2" />
    <path d="M2.5 6h11" />
  </Svg>
)
const SoundIcon = ({ on }: { on: boolean }): JSX.Element => (
  <Svg>
    <path d="M3 6.2h2.2L8.4 3.5v9L5.2 9.8H3z" />
    {on ? (
      <path d="M10.6 5.6a3.4 3.4 0 0 1 0 4.8M12.4 4a5.6 5.6 0 0 1 0 8" />
    ) : (
      <path d="m11 6 3 3m0-3-3 3" />
    )}
  </Svg>
)
const FoldIcon = (): JSX.Element => (
  <Svg>
    <path d="m4 10 4-4 4 4" />
  </Svg>
)
const OpenIcon = (): JSX.Element => (
  <Svg size={12}>
    <path d="M6 3.5h6.5V10M12.5 3.5 4 12" />
  </Svg>
)
const NoteIcon = ({ size = 14 }: { size?: number }): JSX.Element => (
  <Svg size={size}>
    <path d="M6 12.2V3.6l7-1.4v8.6" />
    <circle cx="4.4" cy="12.2" r="1.7" />
    <circle cx="11.4" cy="10.8" r="1.7" />
  </Svg>
)
const PlayIcon = (): JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
    <path d="M5 3.2v9.6L12.8 8z" fill="currentColor" />
  </svg>
)
const PauseIcon = (): JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
    <path d="M4.5 3h2.4v10H4.5zM9.1 3h2.4v10H9.1z" fill="currentColor" />
  </svg>
)
const PrevIcon = (): JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
    <path d="M3.5 3h1.8v10H3.5zM13 3.2v9.6L6 8z" fill="currentColor" />
  </svg>
)
const NextIcon = (): JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
    <path d="M10.7 3h1.8v10h-1.8zM3 3.2v9.6L10 8z" fill="currentColor" />
  </svg>
)
const ShuffleIcon = (): JSX.Element => (
  <Svg>
    <path d="M2 4.5h2.4c2.6 0 4.2 7 7 7H14M2 11.5h2.4c1.2 0 2.1-1.4 2.9-3M14 4.5h-2.6c-1 0-1.8 1-2.5 2.3M12 2.5l2 2-2 2M12 9.5l2 2-2 2" />
  </Svg>
)
const RepeatIcon = ({ one }: { one: boolean }): JSX.Element => (
  <Svg>
    <path d="M3 7V6a2 2 0 0 1 2-2h8l-2-2M13 9v1a2 2 0 0 1-2 2H3l2 2" />
    {one && <path d="M7.4 7.2 8.4 6.6v3" strokeWidth="1.3" />}
  </Svg>
)

// ---- Textos ----------------------------------------------------------------------------------

/** O estado de uma conversa ou sessão, numa palavra. */
function stateLabel(state: IslandTaskState): string {
  switch (state) {
    case 'working':
      return t('trabalhando')
    case 'waiting':
      return t('esperando você')
    case 'done':
      return t('pronto')
    case 'error':
      return t('deu erro')
    default:
      return t('parado')
  }
}

/** "3:07" (ou "1:02:03"). */
function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

/** Onde a música está agora: a posição lida, mais o tempo desde então (tocando). */
function positionNow(music: IslandMusic, now = Date.now()): number {
  const base = music.positionMs ?? 0
  const played = music.status === 'Playing' ? Math.max(0, now - music.at) : 0
  return Math.min(music.durationMs ?? Infinity, base + played)
}

const NEXT_REPEAT: Record<IslandRepeat, IslandRepeat> = {
  none: 'list',
  list: 'track',
  track: 'none'
}

/** Re-renderiza de tempos em tempos enquanto `on` (a barra da música, os botões armando). */
function useTick(on: boolean, ms: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    const timer = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(timer)
  }, [on, ms])
  return now
}

// ---- Cartões ---------------------------------------------------------------------------------

function TaskCard({ task }: { task: IslandTask }): JSX.Element {
  const steps = task.steps.slice(-3)
  const finished = task.state === 'done' || task.state === 'error' || task.state === 'idle'
  return (
    <section className={`island-card task state-${task.state}`} data-task={task.id}>
      <div className="card-head">
        <span className={`dot state-${task.state}`} />
        <strong>{task.title}</strong>
        <span className="muted">
          {task.kind === 'session' ? t('terminal') : t('conversa')} · {stateLabel(task.state)}
        </span>
        <button
          className="icon jump"
          title={
            task.kind === 'session' ? t('Trazer o terminal para a frente') : t('Abrir no painel')
          }
          aria-label={
            task.kind === 'session' ? t('Trazer o terminal para a frente') : t('Abrir no painel')
          }
          onClick={() => act({ type: 'show', task: task.id })}
        >
          <OpenIcon />
        </button>
      </div>
      {steps.length > 0 && (
        <ol className="steps">
          {steps.map((step) => (
            <li key={step.id} className={`step ${step.status}`}>
              <span className="mark" aria-hidden>
                {step.status === 'running' ? '›' : step.status === 'error' ? '×' : '✓'}
              </span>
              <span className="label">{step.label}</span>
              {step.added !== undefined && (
                <span className="counts">
                  <b className="add">+{step.added}</b> <b className="del">−{step.removed ?? 0}</b>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {finished && task.reply && <p className="reply">{task.reply}</p>}
      {!steps.length && !(finished && task.reply) && (
        <p className="reply muted">
          {task.state === 'working' ? t('pensando…') : stateLabel(task.state)}
        </p>
      )}
    </section>
  )
}

function Progress({ music }: { music: IslandMusic }): JSX.Element {
  const now = useTick(music.status === 'Playing' && music.durationMs !== undefined, 500)
  const [drag, setDrag] = useState<number | null>(null)
  const bar = useRef<HTMLDivElement>(null)
  const duration = music.durationMs ?? 0
  const position = drag ?? positionNow(music, now)
  const ratio = duration > 0 ? Math.min(1, position / duration) : 0
  const at = (e: ReactPointerEvent): number => {
    const box = bar.current?.getBoundingClientRect()
    if (!box || !box.width) return 0
    return Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)) * duration
  }
  return (
    <div className="music-progress">
      <span className="time">{duration ? clock(position) : ''}</span>
      <div
        ref={bar}
        className={`bar${music.canSeek ? ' seekable' : ''}`}
        role="slider"
        aria-label={t('Posição na música')}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration / 1000)}
        aria-valuenow={Math.round(position / 1000)}
        onPointerDown={(e) => {
          if (!music.canSeek) return
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            // Um ponteiro que já acabou: segue sem a captura.
          }
          setDrag(at(e))
        }}
        onPointerMove={(e) => {
          if (drag !== null) setDrag(at(e))
        }}
        onPointerUp={(e) => {
          if (drag === null) return
          act({ type: 'music', action: { type: 'seek', ms: at(e) } })
          setDrag(null)
        }}
      >
        <i className="fill" style={{ width: `${ratio * 100}%` }} />
        <i className="knob" style={{ left: `${ratio * 100}%` }} />
      </div>
      <span className="time">{duration ? `−${clock(duration - position)}` : ''}</span>
    </div>
  )
}

function Volume({ music }: { music: IslandMusic }): JSX.Element | null {
  const [level, setLevel] = useState<number | null>(null)
  const timer = useRef(0)
  if (music.volume === null) return null
  const shown = level ?? Math.round(music.volume * 100)
  return (
    <input
      className="volume"
      type="range"
      min={0}
      max={100}
      value={shown}
      title={music.volumeOf === 'system' ? t('Volume do sistema') : t('Volume do player')}
      aria-label={music.volumeOf === 'system' ? t('Volume do sistema') : t('Volume do player')}
      onChange={(e) => {
        const value = Number(e.target.value)
        setLevel(value)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => {
          act({ type: 'music', action: { type: 'volume', level: value / 100 } })
          window.setTimeout(() => setLevel(null), 1500)
        }, 150)
      }}
    />
  )
}

function MusicCard({ music }: { music: IslandMusic }): JSX.Element {
  const playing = music.status === 'Playing'
  const send = (action: Extract<IslandAction, { type: 'music' }>['action']) => () =>
    act({ type: 'music', action })
  return (
    <section className={`island-card music${playing ? ' playing' : ''}`} data-player={music.id}>
      <div className="art">
        {music.art ? <img src={music.art} alt="" /> : <NoteIcon size={26} />}
      </div>
      <div className="music-main">
        <div className="music-title">
          <strong>{music.title ?? music.app}</strong>
          <span className="muted">
            {[music.artist, music.title ? music.app : null].filter(Boolean).join(' · ')}
          </span>
        </div>
        <Progress music={music} />
        <div className="music-controls">
          <button
            className={`icon toggle${music.shuffle ? ' on' : ''}`}
            title={t('Aleatório')}
            aria-label={t('Aleatório')}
            aria-pressed={music.shuffle === true}
            disabled={music.shuffle === null}
            onClick={send({ type: 'shuffle', on: !music.shuffle })}
          >
            <ShuffleIcon />
          </button>
          <button
            className="icon"
            title={t('Anterior')}
            aria-label={t('Anterior')}
            disabled={!music.canPrevious}
            onClick={send({ type: 'previous' })}
          >
            <PrevIcon />
          </button>
          <button
            className="icon play"
            title={playing ? t('Pausar') : t('Tocar')}
            aria-label={playing ? t('Pausar') : t('Tocar')}
            disabled={!music.canControl}
            onClick={send({ type: 'toggle' })}
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            className="icon"
            title={t('Próxima')}
            aria-label={t('Próxima')}
            disabled={!music.canNext}
            onClick={send({ type: 'next' })}
          >
            <NextIcon />
          </button>
          <button
            className={`icon toggle${music.repeat && music.repeat !== 'none' ? ' on' : ''}`}
            title={
              music.repeat === 'track'
                ? t('Repetindo a música')
                : music.repeat === 'list'
                  ? t('Repetindo a lista')
                  : t('Repetir')
            }
            aria-label={t('Repetir')}
            aria-pressed={music.repeat !== null && music.repeat !== 'none'}
            disabled={music.repeat === null}
            onClick={send({ type: 'repeat', mode: NEXT_REPEAT[music.repeat ?? 'none'] })}
          >
            <RepeatIcon one={music.repeat === 'track'} />
          </button>
          <Volume key={music.id} music={music} />
        </div>
      </div>
    </section>
  )
}

function EmptyCard(): JSX.Element {
  return (
    <section className="island-card empty">
      <strong>{t('Tudo calmo por aqui.')}</strong>
      <span className="muted">
        {t('As conversas, as sessões do terminal e a música aparecem aqui.')}
      </span>
      <button className="island-button" onClick={() => act({ type: 'panel' })}>
        {t('Abrir o painel')}
      </button>
    </section>
  )
}

function Pills({
  tasks,
  music,
  focus
}: {
  tasks: IslandTask[]
  music: IslandMusic | null
  focus: string | null
}): JSX.Element {
  return (
    <div className="island-pills">
      {tasks.map((task) => (
        <button
          key={task.id}
          className={`pill state-${task.state}${focus === task.id ? ' on' : ''}`}
          data-task={task.id}
          onClick={() => act({ type: 'focus', id: task.id })}
        >
          <span className={`dot state-${task.state}`} />
          <span className="pill-title">{task.title}</span>
          <span className="pill-state">{stateLabel(task.state)}</span>
        </button>
      ))}
      {music && (
        <div className={`pill music${focus === MUSIC_ID ? ' on' : ''}`}>
          <button
            className="pill-main"
            onClick={() => act({ type: 'focus', id: MUSIC_ID })}
            title={music.title ?? music.app}
          >
            <NoteIcon size={12} />
            <span className="pill-title">{music.title ?? music.app}</span>
          </button>
          <button
            className="mini"
            aria-label={music.status === 'Playing' ? t('Pausar') : t('Tocar')}
            disabled={!music.canControl}
            onClick={() => act({ type: 'music', action: { type: 'toggle' } })}
          >
            {music.status === 'Playing' ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            className="mini"
            aria-label={t('Próxima')}
            disabled={!music.canNext}
            onClick={() => act({ type: 'music', action: { type: 'next' } })}
          >
            <NextIcon />
          </button>
        </div>
      )}
    </div>
  )
}

function Questions({
  alert,
  armed
}: {
  alert: IslandAlert & { questions: IslandQuestion[] }
  armed: boolean
}): JSX.Element {
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const done = alert.questions.every((q) => (picked[q.question] ?? []).length > 0)
  const toggle = (question: IslandQuestion, label: string): void => {
    const now = picked[question.question] ?? []
    const next = question.multiSelect
      ? now.includes(label)
        ? now.filter((item) => item !== label)
        : [...now, label]
      : [label]
    setPicked({ ...picked, [question.question]: next })
  }
  return (
    <div className="questions">
      {alert.questions.map((question) => (
        <div key={question.question} className="question">
          <span className="question-text">
            {question.header && <b>{question.header}</b>} {question.question}
          </span>
          <div className="options" role={question.multiSelect ? 'group' : 'radiogroup'}>
            {question.options.map((option) => {
              const on = (picked[question.question] ?? []).includes(option.label)
              return (
                <button
                  key={option.label}
                  className={`option${on ? ' on' : ''}`}
                  title={option.description}
                  aria-pressed={on}
                  onClick={() => toggle(question, option.label)}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <div className="alert-buttons">
        <button
          className="island-button primary"
          disabled={!done || !armed}
          onClick={() =>
            act({
              type: 'answer',
              id: alert.id,
              answers: Object.fromEntries(
                alert.questions.map((q) => [q.question, (picked[q.question] ?? []).join(', ')])
              )
            })
          }
        >
          {t('Responder')}
        </button>
        <button className="link" onClick={() => act({ type: 'alert-panel', id: alert.id })}>
          {t('Responder no painel')}
        </button>
      </div>
    </div>
  )
}

function AlertCard({ alert, count }: { alert: IslandAlert; count: number }): JSX.Element {
  // Os botões valem um instante depois do cartão aparecer (o clique podia ser em outra coisa).
  const [armed, setArmed] = useState(() => Date.now() >= alert.armedAt)
  useEffect(() => {
    if (armed) return
    const timer = window.setTimeout(
      () => setArmed(true),
      Math.max(0, alert.armedAt - Date.now()) + 20
    )
    return () => window.clearTimeout(timer)
  }, [armed, alert.armedAt])
  const decide = (decision: 'allow' | 'deny' | 'allow-always') => () =>
    act({ type: 'decide', id: alert.id, decision })
  return (
    <section className={`island-card alert kind-${alert.kind}`} data-alert={alert.id}>
      <div className="card-head">
        <span className="dot state-waiting" />
        <strong>{alert.who}</strong>
        <span className="muted">{alert.title}</span>
        {count > 1 && <span className="count">{t('mais {n} esperando', { n: count - 1 })}</span>}
      </div>
      {alert.kind === 'question' && alert.questions ? (
        <Questions key={alert.id} alert={{ ...alert, questions: alert.questions }} armed={armed} />
      ) : alert.kind === 'panel' ? (
        <>
          <p className="reply">{alert.detail}</p>
          <div className="alert-buttons">
            <button
              className="island-button primary"
              onClick={() => act({ type: 'alert-panel', id: alert.id })}
            >
              {t('Ver no painel')}
            </button>
          </div>
        </>
      ) : (
        <>
          <pre className="alert-detail">{alert.detail}</pre>
          <div className="alert-buttons">
            <button className="island-button deny" disabled={!armed} onClick={decide('deny')}>
              {t('Negar')}
            </button>
            <button className="island-button primary" disabled={!armed} onClick={decide('allow')}>
              {t('Permitir')}
            </button>
            {alert.always && (
              <button
                className="island-button"
                disabled={!armed}
                title={t('Libera {v1} nesta conversa.', { v1: alert.always })}
                onClick={decide('allow-always')}
              >
                {t('Sempre')}
              </button>
            )}
            <button className="link" onClick={() => act({ type: 'alert-panel', id: alert.id })}>
              {t('Ver no painel')}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function SettingsCard({ settings }: { settings: IslandSettings }): JSX.Element {
  const set = (patch: Extract<IslandAction, { type: 'settings' }>['patch']): void =>
    act({ type: 'settings', patch })
  return (
    <section className="island-card settings">
      <label className="row">
        <input
          type="checkbox"
          checked={settings.sound}
          onChange={(e) => set({ sound: e.target.checked })}
        />
        <span>{t('Sons')}</span>
        <input
          className="volume"
          type="range"
          min={0}
          max={100}
          value={Math.round(settings.volume * 100)}
          disabled={!settings.sound}
          aria-label={t('Volume dos sons')}
          onChange={(e) => set({ volume: Number(e.target.value) / 100 })}
        />
      </label>
      <div className="row">
        <span>{t('Recolher depois de')}</span>
        <div className="segments" role="radiogroup" aria-label={t('Recolher depois de')}>
          {ISLAND_AUTO_CLOSE.map((seconds) => (
            <button
              key={seconds}
              className={settings.autoClose === seconds ? 'on' : ''}
              aria-pressed={settings.autoClose === seconds}
              onClick={() => set({ autoClose: seconds })}
            >
              {seconds} s
            </button>
          ))}
        </div>
      </div>
      <label className="row">
        <input
          type="checkbox"
          checked={settings.hoverOpen}
          onChange={(e) => set({ hoverOpen: e.target.checked })}
        />
        <span>{t('Abrir ao passar o mouse')}</span>
      </label>
      {settings.coversOption && (
        <label className="row">
          <input
            type="checkbox"
            checked={settings.covers}
            onChange={(e) => set({ covers: e.target.checked })}
          />
          <span>{t('Capas das músicas pela internet (como as do Spotify)')}</span>
        </label>
      )}
      <button className="link" onClick={() => act({ type: 'more-settings' })}>
        {t('Mais configurações…')}
      </button>
    </section>
  )
}

function Countdown({ island }: { island: Island }): JSX.Element | null {
  if (!island.closesAt || island.closeMs <= 0) return null
  // A contagem começa quando a ilha manda o closesAt: a barrinha encolhe no tempo todo.
  return (
    <div
      key={island.closesAt}
      className="island-countdown"
      style={{ animationDuration: `${island.closeMs}ms` }}
    />
  )
}

function OpenIsland({ island, stage }: { island: Island; stage: JSX.Element }): JSX.Element {
  const { tasks, music } = island
  const items = tasks.length + (music ? 1 : 0)
  const task = tasks.find((item) => item.id === island.focus)
  const showMusic = music && (island.focus === MUSIC_ID || !task)
  let main: JSX.Element
  if (island.alert) {
    main = <AlertCard key={island.alert.id} alert={island.alert} count={island.alerts} />
  } else if (island.tab === 'settings') main = <SettingsCard settings={island.settings} />
  else if (task) main = <TaskCard task={task} />
  else if (showMusic && music) main = <MusicCard music={music} />
  else main = <EmptyCard />
  const pills = !island.alert && island.tab === 'home' && items > 1
  return (
    <div className="island-open">
      <header className="island-head">
        <div className="island-tabs" role="tablist">
          <button
            role="tab"
            className="island-tab"
            aria-selected={island.tab === 'home'}
            onClick={() => act({ type: 'tab', tab: 'home' })}
          >
            <HomeIcon /> {t('Início')}
          </button>
          <button
            role="tab"
            className="island-tab"
            aria-selected={island.tab === 'settings'}
            onClick={() => act({ type: 'tab', tab: 'settings' })}
          >
            <GearIcon /> {t('Ajustes')}
          </button>
        </div>
        <span className="island-status">{island.title}</span>
        <div className="island-actions">
          <button
            className="icon"
            title={t('Abrir o painel')}
            aria-label={t('Abrir o painel')}
            onClick={() => act({ type: 'panel' })}
          >
            <PanelIcon />
          </button>
          <button
            className="icon"
            title={island.settings.sound ? t('Desligar os sons') : t('Ligar os sons')}
            aria-label={island.settings.sound ? t('Desligar os sons') : t('Ligar os sons')}
            onClick={() => act({ type: 'settings', patch: { sound: !island.settings.sound } })}
          >
            <SoundIcon on={island.settings.sound} />
          </button>
          <button
            className="icon"
            title={t('Recolher')}
            aria-label={t('Recolher')}
            onClick={() => act({ type: 'close' })}
          >
            <FoldIcon />
          </button>
        </div>
      </header>
      <div className={`island-body${pills ? ' with-pills' : ''}`}>
        <div className="island-mascot">
          <div className="island-scale">{stage}</div>
        </div>
        <div className="island-main">{main}</div>
        {pills && <Pills tasks={tasks} music={music} focus={island.focus} />}
      </div>
      <Countdown island={island} />
    </div>
  )
}

/** As bolinhas da cápsula recolhida: um pedido, o que trabalha, a música tocando. */
function Dots({ island }: { island: Island }): JSX.Element | null {
  const dots = island.tasks
    .slice(0, 3)
    .map((task) => <span key={task.id} className={`dot state-${task.state}`} />)
  if (island.music?.status === 'Playing') {
    dots.push(
      <span key="music" className="dot music">
        <NoteIcon size={10} />
      </span>
    )
  }
  return dots.length ? <span className="island-dots">{dots}</span> : null
}

export interface IslandDrop {
  onDragEnter(e: DragEvent): void
  onDragOver(e: DragEvent): void
  onDragLeave(e: DragEvent): void
  onDrop(e: DragEvent): void
}

/** A ilha inteira: a cápsula, ou aberta. */
export function IslandView({
  island,
  stage,
  drop
}: {
  island: Island
  stage: JSX.Element
  drop: IslandDrop
}): JSX.Element {
  const open = island.mode === 'open'
  const root = useRef<HTMLDivElement>(null)
  // O cursor entrando e saindo, pelos eventos do navegador: o onPointerLeave do React se perde
  // depois que a barra da música captura o ponteiro.
  useEffect(() => {
    const element = root.current
    if (!element) return
    const enter = (): void => window.wisp.mascot.hover(true)
    const leave = (): void => window.wisp.mascot.hover(false)
    element.addEventListener('pointerenter', enter)
    element.addEventListener('pointerleave', leave)
    return () => {
      element.removeEventListener('pointerenter', enter)
      element.removeEventListener('pointerleave', leave)
    }
  }, [])
  return (
    <div
      ref={root}
      className={`island mode-${island.mode} tone-${island.tone}${island.mode !== 'compact' ? ' expanded' : ''}`}
      role={open ? 'dialog' : 'button'}
      aria-label={`Wisp: ${island.title}`}
      style={open ? { height: islandOpenHeight(island) } : undefined}
      onClick={open ? undefined : () => act({ type: 'open' })}
      onPointerDown={(e) => {
        // Um clique dentro da ilha aberta (fora dos botões) a segura aberta.
        if (open && !(e.target as Element).closest('button, input, [role="slider"]')) {
          act({ type: 'touch' })
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        window.wisp.mascot.menu()
      }}
      {...drop}
    >
      {open ? (
        <OpenIsland island={island} stage={stage} />
      ) : (
        <>
          <div className="island-mascot">
            <div className="island-scale">{stage}</div>
          </div>
          <div className="island-text">
            <strong>{island.title}</strong>
            {island.detail && <span>{island.detail}</span>}
          </div>
          <Dots island={island} />
        </>
      )}
    </div>
  )
}
