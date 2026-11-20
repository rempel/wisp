// As listas do Início (Fases 95 e 96): as suas tarefas (tarefas.json) e os seus hábitos
// (habitos.json), nos dados do Wisp, só deste computador (0600). As tarefas o Wisp também lê e
// muda, pelas ferramentas todo_* do servidor `desktop`.

import { randomUUID } from 'crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { DATA_DIR } from './paths'
import type { Habit, HabitChange, Todo, TodoChange } from '../shared/ipc'

export const TODOS_FILE = join(DATA_DIR, 'tarefas.json')
export const HABITS_FILE = join(DATA_DIR, 'habitos.json')

const MAX_TODOS = 500
const MAX_TEXT = 300
const MAX_HABITS = 20
/** Quanto dos dias de cada hábito fica guardado (mais de um ano não serve ao bloco). */
const MAX_DAYS = 400
/** As feitas há mais tempo que isso saem da lista sozinhas. */
const KEEP_DONE_MS = 30 * 24 * 60 * 60_000
export const TONES = ['ciano', 'violeta', 'ambar', 'verde', 'rosa']

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as unknown
  } catch {
    return null
  }
}

function writeJson(file: string, value: unknown): void {
  try {
    mkdirSync(dirname(file), { recursive: true })
    const temp = `${file}.tmp`
    writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 })
    renameSync(temp, file)
  } catch (err) {
    console.warn(`[wisp] não deu para gravar ${file}:`, err)
  }
}

const clean = (text: string): string => text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)

function validTodo(value: unknown): value is Todo {
  const todo = value as Record<string, unknown> | null
  return (
    !!todo &&
    typeof todo.id === 'string' &&
    typeof todo.text === 'string' &&
    typeof todo.createdAt === 'number' &&
    (todo.due === null || typeof todo.due === 'number') &&
    (todo.doneAt === null || typeof todo.doneAt === 'number')
  )
}

/** As suas tarefas. */
export class Todos {
  private items: Todo[]
  private readonly listeners = new Set<(todos: Todo[]) => void>()

  constructor(
    private readonly file = TODOS_FILE,
    private readonly now = Date.now
  ) {
    const parsed = readJson(file)
    this.items = (Array.isArray(parsed) ? parsed.filter(validTodo) : [])
      .map((todo) => ({ ...todo, star: !!todo.star, by: todo.by === 'wisp' ? 'wisp' : 'voce' }))
      .slice(0, MAX_TODOS) as Todo[]
  }

  /** As abertas primeiro (as com estrela e as de prazo mais perto na frente); depois, as feitas. */
  list(): Todo[] {
    const cutoff = this.now() - KEEP_DONE_MS
    return this.items
      .filter((todo) => todo.doneAt === null || todo.doneAt >= cutoff)
      .sort((a, b) => {
        if ((a.doneAt === null) !== (b.doneAt === null)) return a.doneAt === null ? -1 : 1
        if (a.doneAt !== null && b.doneAt !== null) return b.doneAt - a.doneAt
        if (a.star !== b.star) return a.star ? -1 : 1
        const due = (a.due ?? Infinity) - (b.due ?? Infinity)
        return due || a.createdAt - b.createdAt
      })
      .map((todo) => ({ ...todo }))
  }

  onChange(listener: (todos: Todo[]) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Aplica a mudança; devolve a tarefa mexida, ou o motivo de não ter mexido. */
  change(change: TodoChange, by: Todo['by'] = 'voce'): Todo | { error: string } | null {
    if (change.kind === 'clearDone') {
      this.items = this.items.filter((todo) => todo.doneAt === null)
      this.save()
      return null
    }
    if (change.kind === 'add') {
      const text = clean(change.text)
      if (!text) return { error: 'a tarefa está vazia' }
      if (this.items.length >= MAX_TODOS) return { error: 'a lista está cheia' }
      const todo: Todo = {
        id: randomUUID(),
        text,
        due: typeof change.due === 'number' ? change.due : null,
        star: !!change.star,
        doneAt: null,
        createdAt: this.now(),
        by
      }
      this.items.push(todo)
      this.save()
      return { ...todo }
    }
    const todo = this.items.find((item) => item.id === change.id)
    if (!todo) return { error: 'essa tarefa não existe mais' }
    if (change.kind === 'remove') this.items = this.items.filter((item) => item !== todo)
    if (change.kind === 'done') todo.doneAt = change.done ? this.now() : null
    if (change.kind === 'star') todo.star = change.star
    if (change.kind === 'edit') {
      if (change.text !== undefined) {
        const text = clean(change.text)
        if (!text) return { error: 'a tarefa está vazia' }
        todo.text = text
      }
      if (change.due !== undefined) todo.due = change.due
    }
    this.save()
    return { ...todo }
  }

  /** Acha uma tarefa aberta pelo id ou por um pedaço do texto (sem acento nem caixa). */
  find(query: string): Todo[] {
    const fold = (text: string): string =>
      text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    const wanted = fold(query.trim())
    if (!wanted) return []
    const exact = this.items.find((todo) => todo.id === query.trim())
    if (exact) return [{ ...exact }]
    return this.items
      .filter((todo) => fold(todo.text).includes(wanted))
      .map((todo) => ({ ...todo }))
  }

  private save(): void {
    writeJson(this.file, this.items)
    const list = this.list()
    for (const listener of this.listeners) listener(list)
  }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Os seus hábitos, com os dias marcados. */
export class Habits {
  private items: Habit[]

  constructor(private readonly file = HABITS_FILE) {
    const parsed = readJson(file)
    this.items = (Array.isArray(parsed) ? parsed : [])
      .filter(
        (habit): habit is Habit =>
          !!habit &&
          typeof habit.id === 'string' &&
          typeof habit.name === 'string' &&
          Array.isArray(habit.days)
      )
      .map((habit) => ({
        id: habit.id,
        name: habit.name,
        tone: TONES.includes(habit.tone) ? habit.tone : 'ciano',
        days: habit.days.filter((day) => typeof day === 'string' && DAY.test(day))
      }))
      .slice(0, MAX_HABITS)
  }

  list(): Habit[] {
    return this.items.map((habit) => ({ ...habit, days: [...habit.days] }))
  }

  change(change: HabitChange): Habit[] {
    if (change.kind === 'add') {
      const name = clean(change.name).slice(0, 40)
      if (name && this.items.length < MAX_HABITS) {
        const tone =
          change.tone && TONES.includes(change.tone)
            ? change.tone
            : TONES[this.items.length % TONES.length]
        this.items.push({ id: randomUUID(), name, tone, days: [] })
      }
    } else {
      const habit = this.items.find((item) => item.id === change.id)
      if (habit && change.kind === 'remove') this.items = this.items.filter((h) => h !== habit)
      if (habit && change.kind === 'rename' && clean(change.name)) {
        habit.name = clean(change.name).slice(0, 40)
      }
      if (habit && change.kind === 'toggle' && DAY.test(change.day)) {
        habit.days = habit.days.includes(change.day)
          ? habit.days.filter((day) => day !== change.day)
          : [...habit.days, change.day].sort().slice(-MAX_DAYS)
      }
    }
    writeJson(this.file, this.items)
    return this.list()
  }
}
