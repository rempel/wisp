// Os blocos seus (Fases 95 e 96): a lista de tarefas (que o Wisp também mexe), os hábitos marcados
// por dia e o foco (o modo foco da Fase 45, com o anel do que falta).
import { useEffect, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import type { FocusState, Habit, Todo } from '../../../shared/ipc'
import { dayKey, streak } from '../../../shared/home-days'
import { CheckIcon, CloseIcon, FocusIcon, PlusIcon } from '../icons'
import { Avatar } from '../icons'
import { HabitIcon, StarIcon } from './icons-home'
import { useHome } from './context'
import { useTodos } from './hooks'
import { addDays, dueText, startOfDay } from './format'
import { BlockHead, Empty, Ring } from './ui'
import { dateLocale, t } from '../../../shared/i18n'

type Filter = 'all' | 'today' | 'star' | 'done'

/** "2026-11-27" do campo de data → o começo do dia; vazio → null. */
function fromDateInput(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? new Date(+match[1], +match[2] - 1, +match[3]).getTime() : null
}

export function TodosBlock(): JSX.Element {
  const { now } = useHome()
  const todos = useTodos()
  const [filter, setFilter] = useState<Filter>('all')
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [due, setDue] = useState('')
  const change = (value: Parameters<typeof window.wisp.home.changeTodo>[0]): void => {
    void window.wisp.home.changeTodo(value)
  }
  const endOfToday = addDays(startOfDay(now), 1)
  const shown = (todos ?? []).filter((todo) =>
    filter === 'done'
      ? todo.doneAt !== null
      : todo.doneAt === null &&
        (filter === 'all' ||
          (filter === 'today' && todo.due !== null && todo.due < endOfToday) ||
          (filter === 'star' && todo.star))
  )
  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (!text.trim()) return
    change({ kind: 'add', text, due: fromDateInput(due) })
    setText('')
    setDue('')
  }
  const filters: [Filter, string][] = [
    ['all', t('Todas')],
    ['today', t('Hoje')],
    ['star', t('Importantes')],
    ['done', t('Feitas')]
  ]
  return (
    <>
      <BlockHead icon={<CheckIcon />} title={t('Minhas tarefas')}>
        <button
          type="button"
          className="btn primary small"
          aria-expanded={adding}
          onClick={() => setAdding(!adding)}
        >
          <PlusIcon />
          {t('Nova')}
        </button>
      </BlockHead>
      <div className="segmented" role="tablist" aria-label={t('Filtro das tarefas')}>
        {filters.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            className={filter === id ? 'on' : ''}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {adding && (
        <form className="inline-add" onSubmit={submit}>
          <input
            autoFocus
            value={text}
            placeholder={t('O que fazer?')}
            aria-label={t('Nova tarefa')}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => event.key === 'Escape' && setAdding(false)}
          />
          <input
            type="date"
            value={due}
            aria-label={t('Prazo')}
            onChange={(event) => setDue(event.target.value)}
          />
        </form>
      )}
      {shown.length ? (
        <ul className="todos">
          {shown.map((todo) => (
            <TodoRow key={todo.id} todo={todo} now={now} onChange={change} />
          ))}
        </ul>
      ) : (
        <Empty>
          {!todos
            ? t('Carregando…')
            : filter === 'done'
              ? t('Nada feito nos últimos 30 dias.')
              : t('Nada aqui. Use o Nova, ou peça ao Wisp: "põe na minha lista…".')}
        </Empty>
      )}
    </>
  )
}

function TodoRow({
  todo,
  now,
  onChange
}: {
  todo: Todo
  now: number
  onChange: (change: Parameters<typeof window.wisp.home.changeTodo>[0]) => void
}): JSX.Element {
  const done = todo.doneAt !== null
  const late = !done && todo.due !== null && todo.due < startOfDay(now)
  return (
    <li className={`todo${done ? ' done' : ''}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={todo.text}
        className="todo-check"
        onClick={() => onChange({ kind: 'done', id: todo.id, done: !done })}
      >
        {done && <CheckIcon />}
      </button>
      <span className="todo-text">
        {todo.text}
        {todo.by === 'wisp' && (
          <span className="todo-by" title={t('O Wisp pôs na lista')}>
            <Avatar size={11} />
          </span>
        )}
      </span>
      {todo.due !== null && (
        <span className={`todo-due${late ? ' late' : ''}`}>{dueText(todo.due, now)}</span>
      )}
      <button
        type="button"
        className={`todo-star${todo.star ? ' on' : ''}`}
        aria-pressed={todo.star}
        aria-label={t('Importante')}
        onClick={() => onChange({ kind: 'star', id: todo.id, star: !todo.star })}
      >
        <StarIcon filled={todo.star} />
      </button>
      <button
        type="button"
        className="todo-remove"
        aria-label={t('Apagar a tarefa')}
        onClick={() => onChange({ kind: 'remove', id: todo.id })}
      >
        <CloseIcon />
      </button>
    </li>
  )
}

/** Os seus hábitos na semana (de segunda a domingo), com os dias seguidos. */
export function HabitsBlock(): JSX.Element {
  const { now } = useHome()
  const [habits, setHabits] = useState<Habit[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  useEffect(() => {
    let alive = true
    void window.wisp.home.habits().then((list) => {
      if (alive) setHabits(list)
    })
    return () => {
      alive = false
    }
  }, [])
  const change = (value: Parameters<typeof window.wisp.home.changeHabit>[0]): void => {
    void window.wisp.home.changeHabit(value).then(setHabits)
  }
  const today = startOfDay(now)
  const monday = addDays(today, -((new Date(today).getDay() + 6) % 7))
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  return (
    <>
      <BlockHead icon={<HabitIcon />} title={t('Hábitos')}>
        <button
          type="button"
          className="icon-button small"
          aria-label={t('Novo hábito')}
          aria-expanded={adding}
          onClick={() => setAdding(!adding)}
        >
          <PlusIcon />
        </button>
      </BlockHead>
      {adding && (
        <form
          className="inline-add"
          onSubmit={(event) => {
            event.preventDefault()
            if (!name.trim()) return
            change({ kind: 'add', name })
            setName('')
            setAdding(false)
          }}
        >
          <input
            autoFocus
            value={name}
            placeholder={t('Exercício, leitura, água…')}
            aria-label={t('Novo hábito')}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === 'Escape' && setAdding(false)}
          />
        </form>
      )}
      {habits?.length ? (
        <div
          className="habit-grid"
          style={{ gridTemplateColumns: 'minmax(110px, 1.4fr) repeat(7, 1fr) auto' }}
        >
          <span />
          {days.map((day) => (
            <span key={day} className={`habit-day${day === today ? ' today' : ''}`}>
              {new Date(day).toLocaleDateString(dateLocale(), { weekday: 'narrow' })}
            </span>
          ))}
          <span />
          {habits.map((habit) => (
            <HabitLine
              key={habit.id}
              habit={habit}
              days={days}
              today={today}
              now={now}
              onChange={change}
            />
          ))}
        </div>
      ) : (
        !adding && (
          <Empty>{habits ? t('Nenhum hábito ainda. O + cria um.') : t('Carregando…')}</Empty>
        )
      )}
    </>
  )
}

function HabitLine({
  habit,
  days,
  today,
  now,
  onChange
}: {
  habit: Habit
  days: number[]
  today: number
  now: number
  onChange: (change: Parameters<typeof window.wisp.home.changeHabit>[0]) => void
}): JSX.Element {
  const run = streak(habit.days, now)
  return (
    <>
      <span className="habit-name">
        <span className={`row-dot tone-${habit.tone}`} />
        <span className="ellipsis">{habit.name}</span>
        <button
          type="button"
          className="habit-remove"
          aria-label={t('Apagar o hábito {name}', { name: habit.name })}
          onClick={() => onChange({ kind: 'remove', id: habit.id })}
        >
          <CloseIcon />
        </button>
      </span>
      {days.map((day) => {
        const key = dayKey(day)
        const on = habit.days.includes(key)
        return (
          <button
            key={day}
            type="button"
            className={`habit-mark tone-${habit.tone}${on ? ' on' : ''}`}
            disabled={day > today}
            aria-pressed={on}
            aria-label={`${habit.name}, ${new Date(day).toLocaleDateString(dateLocale(), { weekday: 'long' })}`}
            onClick={() => onChange({ kind: 'toggle', id: habit.id, day: key })}
          >
            {on && <CheckIcon />}
          </button>
        )
      })}
      <span className="habit-streak" title={t('dias seguidos')}>
        {run ? `${run}🔥` : ''}
      </span>
    </>
  )
}

const BLOCKS = [25, 50]

/** O foco: o anel do que falta, e os blocos de 25 e 50 minutos. Silencia os avisos enquanto conta. */
export function FocusBlock(): JSX.Element {
  const [state, setState] = useState<FocusState | null>(null)
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    let alive = true
    void window.wisp.home.focus().then((value) => {
      if (alive) setState(value)
    })
    const off = window.wisp.home.onFocus(setState)
    return () => {
      alive = false
      off()
    }
  }, [])
  const running = state?.endsAt != null
  // Só conta segundo a segundo enquanto o foco está ligado.
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [running])
  const left = running && state?.endsAt ? Math.max(0, state.endsAt - clock) : 0
  const total = (state?.minutes ?? 0) * 60_000
  const mm = Math.floor(left / 60_000)
  const ss = Math.floor((left % 60_000) / 1000)
  return (
    <>
      <BlockHead icon={<FocusIcon />} title={t('Foco')} />
      <div className="block-center">
        <Ring
          value={running && total ? 1 - left / total : 0}
          size={112}
          label={
            running ? `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : '25:00'
          }
          sub={running ? t('foco') : t('pronto')}
        />
        {running ? (
          <button
            type="button"
            className="btn"
            onClick={() => void window.wisp.home.focusAction({ kind: 'stop' }).then(setState)}
          >
            {t('Parar')}
          </button>
        ) : (
          <span className="row">
            {BLOCKS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                className={`btn${minutes === 25 ? ' primary' : ''}`}
                onClick={() =>
                  void window.wisp.home.focusAction({ kind: 'start', minutes }).then(setState)
                }
              >
                {t('{n} min', { n: minutes })}
              </button>
            ))}
          </span>
        )}
        <small className="muted">
          {state?.doneToday
            ? t('{n} focos hoje. Os avisos ficam quietos enquanto conta.', { n: state.doneToday })
            : t('Os avisos ficam quietos enquanto conta.')}
        </small>
      </div>
    </>
  )
}
