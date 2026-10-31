// Os cartões da ilha aberta (Fases 37 e 38): a conversa ou sessão com os passos, o diff, a música,
// o Perguntar, o uso do plano, o GitHub, a agenda, a versão nova, os pedidos e os ajustes.

import { useEffect, useRef, useState } from 'react'
import type { JSX, PointerEvent as ReactPointerEvent } from 'react'
import { ISLAND_AUTO_CLOSE, MUSIC_ID } from '../../../shared/ipc'
import { t } from '../../../shared/i18n'
import type {
  IslandAction,
  IslandAlert,
  IslandDiff,
  IslandDiffLine,
  IslandEvent,
  IslandGithub,
  IslandMusic,
  IslandQuestion,
  IslandSettings,
  IslandTask,
  IslandUpdate,
  IslandUsage
} from '../../../shared/ipc'
import {
  MicIcon,
  FileIcon,
  BackIcon,
  OpenIcon,
  NoteIcon,
  PlayIcon,
  PauseIcon,
  PrevIcon,
  NextIcon,
  ShuffleIcon,
  RepeatIcon
} from './icons'
import { act, clock, NEXT_REPEAT, positionNow, stateLabel, useTick } from './util'
import type { Island } from './util'

export function TaskCard({
  task,
  compact = false
}: {
  task: IslandTask
  compact?: boolean
}): JSX.Element {
  const steps = task.steps.slice(compact ? -2 : -3)
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
              {step.added !== undefined ? (
                // Uma edição: o clique abre o diff dela na ilha (Fase 38).
                <button
                  className="label diff-link"
                  title={t('Ver o que mudou')}
                  onClick={() => act({ type: 'diff', task: task.id, step: step.id })}
                >
                  {step.label}
                </button>
              ) : (
                <span className="label">{step.label}</span>
              )}
              {step.added !== undefined && (
                <span className="counts">
                  <b className="add">+{step.added}</b> <b className="del">−{step.removed ?? 0}</b>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {!finished && task.live && <p className="reply live">{task.live}</p>}
      {finished && task.reply && <p className="reply">{task.reply}</p>}
      {!steps.length && !(finished && task.reply) && !(!finished && task.live) && (
        <p className="reply muted">
          {task.state === 'working' ? t('pensando…') : stateLabel(task.state)}
        </p>
      )}
    </section>
  )
}

export function DiffCard({ diff }: { diff: IslandDiff }): JSX.Element {
  return (
    <section className="island-card diff" data-diff={diff.step}>
      <div className="card-head">
        <button
          className="icon"
          title={t('Voltar')}
          aria-label={t('Voltar')}
          onClick={() => act({ type: 'diff', task: diff.task, step: null })}
        >
          <BackIcon />
        </button>
        <strong>{diff.label}</strong>
        <span className="counts">
          <b className="add">+{diff.added}</b> <b className="del">−{diff.removed}</b>
        </span>
      </div>
      <pre className="diff-lines">
        {diff.lines.map((line, index) => (
          <span key={index} className={`line kind-${DIFF_KIND[line.kind]}`}>
            {line.kind === '@' ? line.text : `${line.kind} ${line.text}`}
          </span>
        ))}
        {diff.truncated && <span className="line kind-more">{t('… e mais (veja no painel)')}</span>}
      </pre>
    </section>
  )
}

const DIFF_KIND: Record<IslandDiffLine['kind'], string> = {
  '+': 'add',
  '-': 'del',
  ' ': 'ctx',
  '@': 'hunk'
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

export function MusicCard({ music }: { music: IslandMusic }): JSX.Element {
  const playing = music.status === 'Playing'
  const send = (action: Extract<IslandAction, { type: 'music' }>['action']) => () =>
    act({ type: 'music', action })
  return (
    <section
      className={`island-card music${playing ? ' playing' : ''}`}
      data-player={music.id}
      data-status={music.status}
    >
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

export function AskCard({ island }: { island: Island }): JSX.Element {
  const [text, setText] = useState('')
  const asked = island.tasks.find((task) => task.id === island.asked)
  const send = (): void => {
    if (!text.trim() && !island.attachments.length) return
    act({ type: 'ask', text })
    setText('')
  }
  return (
    <section className="island-card ask-card">
      {island.attachments.length > 0 && (
        <div className="chips">
          {island.attachments.map((file, index) => (
            <span key={`${file.name}-${index}`} className="chip" title={file.name}>
              {file.thumbnail ? <img src={file.thumbnail} alt="" /> : <FileIcon />}
              <span className="chip-name">{file.name}</span>
              <button
                className="chip-x"
                aria-label={t('Tirar {name}', { name: file.name })}
                onClick={() => act({ type: 'unattach', index })}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {island.keyboard ? (
        <div className="ask-row">
          <textarea
            className="ask-input"
            rows={2}
            autoFocus
            value={text}
            placeholder={t('Pergunte ao Claude… (os arquivos soltos na ilha vão junto)')}
            aria-label={t('Pergunta')}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send()
              }
            }}
          />
          <div className="ask-buttons">
            <button
              className="icon"
              title={t('Falar')}
              aria-label={t('Falar')}
              onClick={() => act({ type: 'voice' })}
            >
              <MicIcon />
            </button>
            <button
              className="island-button primary"
              disabled={!text.trim() && !island.attachments.length}
              onClick={send}
            >
              {t('Mandar')}
            </button>
          </div>
        </div>
      ) : (
        <div className="ask-row no-keyboard">
          <span className="muted">
            {t('Aqui a ilha não recebe o teclado: fale, ou escreva no painel.')}
          </span>
          <button className="island-button primary" onClick={() => act({ type: 'voice' })}>
            <MicIcon /> {t('Falar')}
          </button>
          <button className="island-button" onClick={() => act({ type: 'panel' })}>
            {t('Escrever no painel')}
          </button>
        </div>
      )}
      {asked ? (
        <TaskCard task={asked} compact />
      ) : (
        <p className="reply muted">
          {t('A resposta aparece aqui. Solte arquivos na ilha para mandá-los junto.')}
        </p>
      )}
    </section>
  )
}

export function UsageCard({ usage }: { usage: IslandUsage }): JSX.Element {
  const row = (label: string, window: IslandUsage['session']): JSX.Element | null =>
    window ? (
      <div className="usage-row">
        <span>{label}</span>
        <div className="usage-bar">
          <i style={{ width: `${Math.min(100, window.used * 100)}%` }} />
        </div>
        <b>{Math.round(window.used * 100)}%</b>
        {window.resetsAt && (
          <span className="muted">
            {t('volta {when}', {
              when: new Date(window.resetsAt * 1000).toLocaleString(undefined, {
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit'
              })
            })}
          </span>
        )}
      </div>
    ) : null
  return (
    <section className={`island-card usage${usage.limited ? ' limited' : ''}`}>
      <div className="card-head">
        <strong>{t('Plano do Claude')}</strong>
        {usage.limited && <span className="count">{t('no limite')}</span>}
      </div>
      {row(t('5 horas'), usage.session)}
      {row(t('Semana'), usage.week)}
    </section>
  )
}

const CI_MARK: Record<IslandGithub['mine'][number]['ci'], string> = {
  success: '✓',
  failure: '×',
  pending: '…',
  none: '·'
}

export function GithubCard({ github }: { github: IslandGithub }): JSX.Element {
  return (
    <section className="island-card github">
      <div className="card-head">
        <strong>GitHub</strong>
        <span className="muted">@{github.login}</span>
      </div>
      <ul className="rows">
        {github.reviews.map((review) => (
          <li key={review.url}>
            <button className="row" onClick={() => act({ type: 'open-url', url: review.url })}>
              <span className="ci pending">◉</span>
              <span className="row-title">
                {review.repo}#{review.number} {review.title}
              </span>
              <span className="muted">{t('revisar · {author}', { author: review.author })}</span>
            </button>
          </li>
        ))}
        {github.mine.map((pr) => (
          <li key={pr.url}>
            <button className="row" onClick={() => act({ type: 'open-url', url: pr.url })}>
              <span className={`ci ${pr.ci}`} title={`CI: ${pr.ci}`}>
                {CI_MARK[pr.ci]}
              </span>
              <span className="row-title">
                {pr.repo}#{pr.number} {pr.title}
              </span>
              {pr.decision === 'APPROVED' && <span className="muted">{t('aprovado')}</span>}
              {pr.decision === 'CHANGES_REQUESTED' && (
                <span className="muted">{t('pedem mudanças')}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function AgendaCard({ events }: { events: IslandEvent[] }): JSX.Element {
  const when = (event: IslandEvent): string =>
    event.allDay
      ? t('o dia todo')
      : new Date(event.start).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return (
    <section className="island-card agenda">
      <div className="card-head">
        <strong>{t('Agenda')}</strong>
        <span className="muted">{t('próximas 24 horas')}</span>
      </div>
      <ul className="rows">
        {events.map((event) => (
          <li key={`${event.title}-${event.start}`} className="row static">
            <b className="time">{when(event)}</b>
            <span className="row-title">{event.title}</span>
            {event.location && <span className="muted">{event.location}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function UpdateCard({ update }: { update: IslandUpdate }): JSX.Element {
  return (
    <section className="island-card update">
      <div className="card-head">
        <strong>{t('O Wisp {version} saiu', { version: update.version })}</strong>
      </div>
      <p className="reply muted">
        {update.ready
          ? t('Baixado e conferido: reinicie para usar a versão nova.')
          : update.canInstall
            ? t('O Wisp baixa, confere a assinatura e instala. As conversas continuam.')
            : t('Veja o que mudou e baixe no GitHub.')}
      </p>
      <div className="alert-buttons">
        {update.ready ? (
          <button className="island-button primary" onClick={() => act({ type: 'restart' })}>
            {t('Reiniciar o Wisp')}
          </button>
        ) : (
          <button className="island-button primary" onClick={() => act({ type: 'update' })}>
            {update.canInstall ? t('Atualizar') : t('Ver a versão nova')}
          </button>
        )}
      </div>
    </section>
  )
}

export function EmptyCard(): JSX.Element {
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

export function Pills({
  tasks,
  music,
  focus,
  extra
}: {
  tasks: IslandTask[]
  music: IslandMusic | null
  focus: string | null
  extra: [string, string, string][]
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
      {extra.map(([id, label, detail]) => (
        <button
          key={id}
          className={`pill extra${focus === id ? ' on' : ''}`}
          data-pill={id}
          onClick={() => act({ type: 'focus', id })}
        >
          <span className="pill-title">{label}</span>
          <span className="pill-state">{detail}</span>
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

export function AlertCard({ alert, count }: { alert: IslandAlert; count: number }): JSX.Element {
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

export function SettingsCard({ settings }: { settings: IslandSettings }): JSX.Element {
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
