// O Início como painel de controle (Fases 92 a 97): os canais e os tipos dos blocos novos. A lista
// de tarefas, os hábitos, o foco, a música, o clima e os dados da agenda, da atividade e do diário
// que os blocos mostram.

import type { IslandMusic, IslandMusicAction } from './ipc-island'
import type { AgendaItem } from './ipc-settings'

export const IPC_HOME = {
  agenda: 'home:agenda',
  activity: 'home:activity',
  feed: 'home:feed',
  note: 'home:note',
  todos: 'home:todos',
  todoChange: 'home:todo-change',
  todosChanged: 'home:todos-changed',
  habits: 'home:habits',
  habitChange: 'home:habit-change',
  focus: 'home:focus',
  focusAction: 'home:focus-action',
  focusChanged: 'home:focus-changed',
  music: 'home:music',
  musicAction: 'home:music-action',
  weather: 'home:weather',
  weatherPlace: 'home:weather-place'
} as const

/** Um bloco do Início na arrumação guardada (Fase 93): a largura em colunas (de 12), a altura em
 * linhas, e se aparece. */
export interface HomeBlockLayout {
  id: string
  w: number
  h: number
  hidden: boolean
}

/** A cidade do clima (Fase 97). */
export interface WeatherPlace {
  place: string
  lat: number
  lon: number
}

/** Um compromisso num intervalo (o calendário do mês e a semana). */
export type HomeEvent = AgendaItem & { allDay: boolean }

/** O que o registro de atividade conta num dia (Fase 13). */
export interface ActivityDay {
  /** O começo do dia (0h, no fuso local). */
  day: number
  conversations: number
  turns: number
  edits: number
  reminders: number
}

/** Uma linha do diário de hoje: o que o Wisp fez (Fase 94). */
export interface FeedLine {
  time: string
  text: string
}

/** Uma tarefa da sua lista (Fase 95). */
export interface Todo {
  id: string
  text: string
  /** O prazo (o começo do dia, ou com a hora), ou null. */
  due: number | null
  star: boolean
  /** Quando foi feita, ou null. */
  doneAt: number | null
  createdAt: number
  /** Quem pôs na lista. */
  by: 'voce' | 'wisp'
}

export type TodoChange =
  | { kind: 'add'; text: string; due?: number | null; star?: boolean }
  | { kind: 'done'; id: string; done: boolean }
  | { kind: 'star'; id: string; star: boolean }
  | { kind: 'edit'; id: string; text?: string; due?: number | null }
  | { kind: 'remove'; id: string }
  | { kind: 'clearDone' }

/** Um hábito seu, e os dias marcados (Fase 96). */
export interface Habit {
  id: string
  name: string
  /** Um dos tons do Wisp (ciano, violeta, âmbar, verde, rosa). */
  tone: string
  /** Os dias feitos, em AAAA-MM-DD. */
  days: string[]
}

export type HabitChange =
  | { kind: 'add'; name: string; tone?: string }
  | { kind: 'toggle'; id: string; day: string }
  | { kind: 'rename'; id: string; name: string }
  | { kind: 'remove'; id: string }

/** O modo foco (Fase 45), no bloco Foco do Início (Fase 96). */
export interface FocusState {
  /** Quando o bloco acaba (ms), ou null sem foco. */
  endsAt: number | null
  /** O tamanho do bloco, em minutos (0 sem foco). */
  minutes: number
  /** Quantos blocos acabaram hoje. */
  doneToday: number
}

export type FocusAction = { kind: 'start'; minutes: number } | { kind: 'stop' }

/** O clima de agora e dos próximos dias (Fase 97). */
export interface WeatherReport {
  place: string
  /** Em °C. */
  now: number
  /** O código WMO do tempo agora. */
  code: number
  max: number
  min: number
  days: { day: number; code: number; max: number; min: number }[]
  /** Quando veio. */
  at: number
}

export type WeatherResult =
  { state: 'off' } | { state: 'ok'; report: WeatherReport } | { state: 'error'; message: string }

/** A API do Início no preload. */
export interface HomeApi {
  /** Os compromissos entre dois instantes (null: a agenda está desligada). */
  agenda(from: number, to: number): Promise<HomeEvent[] | null>
  /** As contagens dos últimos `days` dias, do mais antigo ao de hoje. */
  activity(days: number): Promise<ActivityDay[]>
  /** O que o Wisp fez hoje, do diário. */
  feed(): Promise<FeedLine[]>
  /** Anota na memória (o "+" das anotações). */
  note(text: string): Promise<{ ok: true } | { error: string }>
  todos(): Promise<Todo[]>
  changeTodo(change: TodoChange): Promise<Todo[]>
  onTodos(listener: (todos: Todo[]) => void): () => void
  habits(): Promise<Habit[]>
  changeHabit(change: HabitChange): Promise<Habit[]>
  focus(): Promise<FocusState>
  focusAction(action: FocusAction): Promise<FocusState>
  onFocus(listener: (state: FocusState) => void): () => void
  music(): Promise<IslandMusic | null>
  musicAction(action: IslandMusicAction): Promise<void>
  /** O clima (só com ele ligado; no máximo uma consulta a cada 30 min). */
  weather(): Promise<WeatherResult>
  /** Procura a cidade e guarda (ou desliga, com texto vazio). */
  weatherPlace(name: string): Promise<{ ok: true; place: string } | { error: string }>
}
