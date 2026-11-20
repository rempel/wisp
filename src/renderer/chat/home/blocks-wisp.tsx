// Os blocos do Wisp (Fase 94): o batimento, o uso do plano, o agendado e os lembretes, as anotações
// (com o "+" que anota na memória), o que ele fez hoje (do diário) e a atividade, por dia e nas
// últimas semanas (do registro da Fase 13).
import { useEffect, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import { formatReset } from '../../../shared/format'
import type { ActivityDay, FeedLine } from '../../../shared/ipc'
import { BoltIcon, CheckIcon, PlusIcon } from '../icons'
import { MemoryIcon, SparkIcon } from '../icons-app'
import { ChartIcon, HeartbeatIcon, NoteIcon } from './icons-home'
import { useHome } from './context'
import { useTodos } from './hooks'
import { addDays, shortLeft, startOfDay, when } from './format'
import { BlockHead, Empty, Meter, Ring } from './ui'
import { openSettingsAt } from '../settings-categories'
import { dateLocale, t } from '../../../shared/i18n'

const isHeartbeat = (id: string): boolean => id.startsWith('batimento-')

export function HeartbeatBlock(): JSX.Element {
  const { snapshot, now, onView } = useHome()
  const next = snapshot?.tasks.find((task) => isHeartbeat(task.id))
  const settings = (): void => {
    openSettingsAt('assistente')
    onView('settings')
  }
  // O anel enche até o próximo, numa janela de três horas.
  const left = next ? next.at - now : 0
  return (
    <>
      <BlockHead icon={<HeartbeatIcon />} title={t('Batimento')} />
      {next ? (
        <div className="block-center">
          <Ring
            value={1 - Math.min(1, left / (3 * 60 * 60_000))}
            size={108}
            label={shortLeft(left)}
            sub={t('até o próximo')}
          />
          <small className="muted clamp-2">
            {snapshot?.heartbeat ?? t('O primeiro de hoje ainda não rodou.')}
          </small>
        </div>
      ) : (
        <Empty>
          {t('O batimento está desligado.')}{' '}
          <button type="button" className="link" onClick={settings}>
            {t('Ligar')}
          </button>
        </Empty>
      )}
    </>
  )
}

export function UsageBlock(): JSX.Element {
  const { usage, onView } = useHome()
  return (
    <>
      <BlockHead
        icon={<ChartIcon />}
        title={t('Uso do plano')}
        action={t('Detalhes')}
        onAction={() => onView('usage')}
      />
      {usage && (usage.session || usage.week) ? (
        <div className="usage-block">
          {usage.session && (
            <Ring
              value={usage.session.used}
              size={100}
              label={`${Math.round(usage.session.used * 100)}%`}
              sub={t('5 horas')}
            />
          )}
          <div className="usage-side">
            {usage.session?.resetsAt != null && (
              <div>
                <small className="muted">{t('Renova')}</small>
                <strong>{formatReset(usage.session.resetsAt)}</strong>
              </div>
            )}
            {usage.week && (
              <div>
                <small className="muted">
                  {t('Semana')} · {Math.round(usage.week.used * 100)}%
                </small>
                <Meter value={usage.week.used} label={t('Semana')} />
              </div>
            )}
          </div>
        </div>
      ) : (
        <Empty>{t('O uso aparece depois da primeira resposta do dia.')}</Empty>
      )}
    </>
  )
}

export function ScheduledBlock(): JSX.Element {
  const { snapshot, now, onView } = useHome()
  const items = snapshot
    ? [
        ...snapshot.reminders.map((item) => ({
          key: `r${item.at}`,
          at: item.at,
          text: item.text,
          sub: t('lembrete'),
          tone: 'tone-amber'
        })),
        ...snapshot.tasks.map((item) => ({
          key: item.id,
          at: item.at,
          text: item.name,
          sub: item.schedule,
          tone: isHeartbeat(item.id) ? 'tone-accent' : 'tone-violet'
        }))
      ].sort((a, b) => a.at - b.at)
    : []
  return (
    <>
      <BlockHead
        icon={<BoltIcon />}
        title={t('Agendado e lembretes')}
        action={t('Ver todos')}
        onAction={() => {
          openSettingsAt('assistente')
          onView('settings')
        }}
      />
      {items.length ? (
        <ul className="rows">
          {items.slice(0, 8).map((item) => (
            <li key={item.key}>
              <span className={`row-dot ${item.tone}`} />
              <span className="row-text">
                <strong>{item.text}</strong>
                <small>{item.sub}</small>
              </span>
              <span className="row-when">{when(item.at, now)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>
          {snapshot ? t('Nada agendado. Peça ao Wisp: "toda segunda às 8h…".') : t('Carregando…')}
        </Empty>
      )}
    </>
  )
}

export function NotesBlock(): JSX.Element {
  const { snapshot, onView, refresh } = useHome()
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (!text.trim()) return
    void window.wisp.home.note(text).then((result) => {
      if ('error' in result) {
        setError(result.error)
        return
      }
      setText('')
      setError('')
      setAdding(false)
      refresh()
    })
  }
  return (
    <>
      <BlockHead
        icon={<MemoryIcon />}
        title={t('Anotações')}
        action={t('Abrir')}
        onAction={() => onView('memory')}
      >
        <button
          type="button"
          className="icon-button small"
          aria-label={t('Anotar na memória')}
          aria-expanded={adding}
          onClick={() => setAdding(!adding)}
        >
          <PlusIcon />
        </button>
      </BlockHead>
      {adding && (
        <form className="inline-add" onSubmit={submit}>
          <input
            autoFocus
            value={text}
            placeholder={t('O Wisp vai lembrar disso…')}
            aria-label={t('Anotar na memória')}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => event.key === 'Escape' && setAdding(false)}
          />
          {error && <small className="error-text">{error}</small>}
        </form>
      )}
      {snapshot?.notes.length ? (
        <ul className="rows notes">
          {snapshot.notes.map((note) => (
            <li key={note.at}>
              <span className="block-icon">
                <NoteIcon />
              </span>
              <span className="row-text">{note.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        !adding && (
          <Empty>
            {snapshot
              ? t('Nada anotado ainda. Conte algo ao Wisp ("lembra que…").')
              : t('Carregando…')}
          </Empty>
        )
      )}
    </>
  )
}

/** O que o Wisp fez hoje: as linhas do diário (as tarefas que rodaram, o que anotou, o Telegram). */
export function FeedBlock(): JSX.Element {
  const { now } = useHome()
  const [lines, setLines] = useState<FeedLine[] | null>(null)
  useEffect(() => {
    let alive = true
    void window.wisp.home.feed().then((list) => {
      if (alive) setLines(list)
    })
    return () => {
      alive = false
    }
  }, [now])
  return (
    <>
      <BlockHead icon={<SparkIcon />} title={t('Hoje no Wisp')} />
      {lines?.length ? (
        <ol className="feed">
          {[...lines]
            .reverse()
            .slice(0, 12)
            .map((line, i) => (
              <li key={`${line.time}-${i}`}>
                <span className="feed-time">{line.time}</span>
                <span className="feed-text">{line.text}</span>
              </li>
            ))}
        </ol>
      ) : (
        <Empty>
          {lines ? t('Nada ainda hoje. O que o Wisp fizer aparece aqui.') : t('Carregando…')}
        </Empty>
      )}
    </>
  )
}

/** As contagens dos últimos dias (relidas a cada minuto). */
function useActivity(days: number): ActivityDay[] | null {
  const { now } = useHome()
  const [list, setList] = useState<ActivityDay[] | null>(null)
  useEffect(() => {
    let alive = true
    void window.wisp.home.activity(days).then((value) => {
      if (alive) setList(value)
    })
    return () => {
      alive = false
    }
  }, [days, now])
  return list
}

/** A semana do Wisp: por dia, se houve conversa, resposta do Claude e tarefa sua feita. */
export function WeekWispBlock(): JSX.Element {
  const { now } = useHome()
  const counted = useActivity(7)
  const todos = useTodos()
  const today = startOfDay(now)
  // A semana de segunda a domingo; os dias que ainda não chegaram ficam vazios.
  const monday = addDays(today, -((new Date(today).getDay() + 6) % 7))
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const ofDay = (day: number): ActivityDay =>
    counted?.find((item) => item.day === day) ?? {
      day,
      conversations: 0,
      turns: 0,
      edits: 0,
      reminders: 0
    }
  const doneOn = (day: number): number =>
    (todos ?? []).filter(
      (todo) => todo.doneAt !== null && todo.doneAt >= day && todo.doneAt < addDays(day, 1)
    ).length
  const rows: { name: string; tone: string; count: (day: ActivityDay) => number }[] = [
    { name: t('Conversas'), tone: 'tone-accent', count: (day) => day.conversations },
    { name: t('Respostas do Claude'), tone: 'tone-violet', count: (day) => day.turns },
    { name: t('Tarefas feitas'), tone: 'tone-green', count: (day) => doneOn(day.day) }
  ]
  return (
    <>
      <BlockHead icon={<SparkIcon />} title={t('A semana do Wisp')} />
      <div
        className="habit-grid"
        style={{ gridTemplateColumns: `minmax(110px, 1.4fr) repeat(7, 1fr)` }}
      >
        <span />
        {week.map((day) => (
          <span key={day} className={`habit-day${day === today ? ' today' : ''}`}>
            {new Date(day).toLocaleDateString(dateLocale(), { weekday: 'narrow' })}
          </span>
        ))}
        {rows.map((row) => (
          <HabitRow
            key={row.name}
            name={row.name}
            tone={row.tone}
            marks={week.map((day) => ({
              key: day,
              count: day > today ? 0 : row.count(ofDay(day))
            }))}
          />
        ))}
      </div>
    </>
  )
}

function HabitRow({
  name,
  tone,
  marks
}: {
  name: string
  tone: string
  marks: { key: number; count: number }[]
}): JSX.Element {
  return (
    <>
      <span className="habit-name">
        <span className={`row-dot ${tone}`} />
        {name}
      </span>
      {marks.map((mark) => (
        <span
          key={mark.key}
          className={`habit-mark${mark.count ? ' on' : ''}`}
          title={String(mark.count)}
          aria-label={`${new Date(mark.key).toLocaleDateString(dateLocale(), { weekday: 'long' })}: ${mark.count}`}
        >
          {mark.count ? <CheckIcon /> : null}
        </span>
      ))}
    </>
  )
}

/** Os quadradinhos das últimas nove semanas (conversas e respostas por dia) e os números. */
export function ActivityBlock(): JSX.Element {
  const days = useActivity(63)
  const list = days ?? []
  const score = (day: ActivityDay): number => day.conversations * 2 + day.turns
  const max = Math.max(1, ...list.map(score))
  const level = (day: ActivityDay): number => {
    const value = score(day)
    return value === 0 ? 0 : Math.min(4, Math.ceil((value / max) * 4))
  }
  // Começa numa segunda, para as linhas serem os dias da semana.
  const first = list.findIndex((day) => new Date(day.day).getDay() === 1)
  const shown = first >= 0 ? list.slice(first) : list
  const week = list.slice(-7)
  const sum = (key: keyof ActivityDay): number =>
    week.reduce((total, day) => total + (day[key] as number), 0)
  return (
    <>
      <BlockHead icon={<ChartIcon />} title={t('Atividade')} />
      <div className="activity-stats">
        <span>
          <strong>{sum('conversations')}</strong>
          <small>{t('conversas em 7 dias')}</small>
        </span>
        <span>
          <strong>{sum('turns')}</strong>
          <small>{t('respostas')}</small>
        </span>
        <span>
          <strong>{sum('edits')}</strong>
          <small>{t('edições')}</small>
        </span>
      </div>
      <div className="heat" aria-label={t('Atividade das últimas semanas')}>
        {shown.map((day) => (
          <i
            key={day.day}
            className={`l${level(day)}`}
            title={`${new Date(day.day).toLocaleDateString(dateLocale())}: ${day.conversations} · ${day.turns}`}
          />
        ))}
      </div>
    </>
  )
}
