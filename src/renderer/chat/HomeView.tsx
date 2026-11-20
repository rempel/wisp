// O Início como painel de controle (Fases 92 a 94; antes, Fase 89): no alto, a saudação, a caixa
// Pergunte ao Wisp e o relógio; embaixo, os blocos, na arrumação que você escolheu (Editar o
// Início: arrastar, mudar o tamanho, esconder e trazer de volta). Os dados que os blocos dividem
// vêm daqui, relidos de minuto em minuto.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import type {
  ConversationSummary,
  HomeBlockLayout,
  HomeSnapshot,
  PlanUsage,
  SettingsSnapshot,
  TabsState
} from '../../shared/ipc'
import type { ChatState } from './state'
import type { ChatView } from './ChatHeader'
import { Avatar, CheckIcon } from './icons'
import { HomeContext } from './home/context'
import type { HomeData } from './home/context'
import { greeting, time } from './home/format'
import { HomeGrid } from './home/HomeGrid'
import type { GridBlock } from './home/HomeGrid'
import { defaultLayout, resolveLayout, setHidden } from './home/layout'
import { EyeIcon, EyeOffIcon, LayoutIcon, SendUpIcon } from './home/icons-home'
import { AgendaBlock, CalendarBlock, NextUpBlock, WeekBlock } from './home/blocks-agenda'
import {
  ActivityBlock,
  FeedBlock,
  HeartbeatBlock,
  NotesBlock,
  ScheduledBlock,
  UsageBlock,
  WeekWispBlock
} from './home/blocks-wisp'
import { BoardBlock, ConversationsBlock, GithubBlock, NeedsYouBlock } from './home/blocks-work'
import { FocusBlock, HabitsBlock, TodosBlock } from './home/blocks-personal'
import { MusicBlock, WeatherBlock } from './home/blocks-media'
import { dateLocale, t } from '../../shared/i18n'

/** Os blocos: o título (na lista e para o leitor de tela) e o conteúdo. */
function catalog(): Record<string, GridBlock> {
  const block = (title: string, Body: () => JSX.Element): GridBlock => ({
    title,
    render: () => <Body />
  })
  return {
    precisa: block(t('Precisa de você'), NeedsYouBlock),
    calendario: block(t('Calendário'), CalendarBlock),
    agenda: block(t('Agenda de hoje'), AgendaBlock),
    batimento: block(t('Batimento'), HeartbeatBlock),
    uso: block(t('Uso do plano'), UsageBlock),
    tarefas: block(t('Minhas tarefas'), TodosBlock),
    agendado: block(t('Agendado e lembretes'), ScheduledBlock),
    anotacoes: block(t('Anotações'), NotesBlock),
    conversas: block(t('Conversas'), ConversationsBlock),
    'semana-wisp': block(t('A semana do Wisp'), WeekWispBlock),
    semana: block(t('Esta semana'), WeekBlock),
    'a-seguir': block(t('A seguir'), NextUpBlock),
    quadro: block(t('Quadro de tarefas'), BoardBlock),
    github: block('GitHub', GithubBlock),
    'hoje-wisp': block(t('Hoje no Wisp'), FeedBlock),
    atividade: block(t('Atividade'), ActivityBlock),
    habitos: block(t('Hábitos'), HabitsBlock),
    foco: block(t('Foco'), FocusBlock),
    musica: block(t('Tocando agora'), MusicBlock),
    clima: block(t('Clima'), WeatherBlock)
  }
}

/** O relógio grande, que anda de segundo em segundo só enquanto o Início está aberto. */
function Clock(): JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return (
    <div className="home-clock">
      <strong>{time(now)}</strong>
      <span>
        {new Date(now).toLocaleDateString(dateLocale(), {
          weekday: 'long',
          day: 'numeric',
          month: 'long'
        })}
      </span>
    </div>
  )
}

/** A caixa do alto: manda a pergunta para a aba Wisp e abre a conversa. */
function Ask({ tabs, onAsk }: { tabs: TabsState; onAsk: (text: string) => void }): JSX.Element {
  const [text, setText] = useState('')
  const main = tabs.tabs.find((tab) => tab.kind === 'chat' && tab.main)
  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (!text.trim() || !main) return
    onAsk(text.trim())
    setText('')
  }
  return (
    <form className="home-ask" onSubmit={submit}>
      <Avatar size={18} />
      <input
        value={text}
        placeholder={t('Pergunte ao Wisp…')}
        aria-label={t('Pergunte ao Wisp')}
        onChange={(event) => setText(event.target.value)}
        disabled={!main}
      />
      <button
        type="submit"
        className="home-ask-send"
        aria-label={t('Enviar para a aba Wisp')}
        disabled={!text.trim() || !main}
      >
        <SendUpIcon />
      </button>
    </form>
  )
}

/** A lista de todos os blocos, para mostrar e esconder, e o restaurar. */
function BlockList({
  layout,
  blocks,
  onChange,
  onReset,
  onDone
}: {
  layout: HomeBlockLayout[]
  blocks: Record<string, GridBlock>
  onChange: (layout: HomeBlockLayout[]) => void
  onReset: () => void
  onDone: () => void
}): JSX.Element {
  return (
    <aside className="home-blocks" aria-label={t('Blocos do Início')}>
      <header>
        <h2>{t('Blocos')}</h2>
        <p>
          {t(
            'Arraste pela alça para mudar de lugar e pelo canto para mudar o tamanho. O olho esconde; aqui eles voltam.'
          )}
        </p>
      </header>
      <ul>
        {layout.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              role="switch"
              aria-checked={!item.hidden}
              className={item.hidden ? '' : 'on'}
              onClick={() => onChange(setHidden(layout, item.id, !item.hidden))}
            >
              {item.hidden ? <EyeOffIcon /> : <EyeIcon />}
              <span>{blocks[item.id]?.title ?? item.id}</span>
            </button>
          </li>
        ))}
      </ul>
      <footer>
        <button type="button" className="btn" onClick={onReset}>
          {t('Restaurar o padrão')}
        </button>
        <button type="button" className="btn primary" onClick={onDone}>
          <CheckIcon />
          {t('Pronto')}
        </button>
      </footer>
    </aside>
  )
}

export function HomeView({
  onView,
  usage,
  tabs,
  conversations,
  settings,
  onAsk
}: {
  onView: (view: ChatView) => void
  usage: PlanUsage | null
  tabs: TabsState
  conversations: Map<string, ChatState>
  settings: SettingsSnapshot | null
  /** Manda a pergunta do alto para a aba Wisp (e abre a conversa). */
  onAsk: (text: string) => void
}): JSX.Element {
  const [snapshot, setSnapshot] = useState<HomeSnapshot | null>(null)
  const [recent, setRecent] = useState<ConversationSummary[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [editing, setEditing] = useState(false)
  // A arrumação: a guardada (no config.json), e a que se vê enquanto arrasta.
  const saved = settings?.values.homeLayout ?? null
  const [draft, setDraft] = useState<HomeBlockLayout[] | null>(null)
  const layout = useMemo(() => draft ?? resolveLayout(saved), [draft, saved])
  const blocks = useMemo(() => catalog(), [])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback((): void => {
    void window.wisp.chat.home().then((next) => next && setSnapshot(next))
    void window.wisp.history
      .list()
      .then((list) => setRecent([...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8)))
  }, [])

  useEffect(() => {
    load()
    // Aberto, ele se atualiza de minuto em minuto.
    const timer = setInterval(() => {
      setNow(Date.now())
      load()
    }, 60_000)
    return () => clearInterval(timer)
  }, [load])

  const save = (next: HomeBlockLayout[], done: boolean): void => {
    setDraft(next)
    if (!done) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void window.wisp.settings.set({ homeLayout: next })
    }, 300)
  }

  const data: HomeData = {
    snapshot,
    usage,
    recent,
    tabs,
    conversations,
    onView,
    now,
    openConversation: (id) => {
      void window.wisp.history.open(id)
      onView('chat')
    },
    showTab: (id) => {
      window.wisp.tabs.show(id)
      onView('chat')
    },
    refresh: load
  }

  // O resumo do alto: os compromissos e as tarefas de hoje e o que espera você.
  const waiting = tabs.tabs.reduce((sum, tab) => {
    const state = conversations.get(tab.id)
    return (
      sum +
      (state?.items.filter((item) => item.kind === 'permission' && item.status === 'pending')
        .length ?? 0)
    )
  }, 0)
  const events = snapshot?.events?.length ?? 0
  const tasks = snapshot?.tasks.length ?? 0
  const summary = [
    events === 1
      ? t('1 compromisso ainda hoje')
      : events
        ? t('{n} compromissos ainda hoje', { n: events })
        : null,
    tasks === 1
      ? t('1 tarefa do Wisp agendada')
      : tasks
        ? t('{n} tarefas do Wisp agendadas', { n: tasks })
        : null,
    waiting ? t('{n} esperando você', { n: waiting }) : null
  ].filter(Boolean)

  const weekday = new Date(now).toLocaleDateString(dateLocale(), { weekday: 'long' })
  return (
    <HomeContext.Provider value={data}>
      <div className={`home${editing ? ' editing' : ''}`}>
        <div className="home-main">
          <div className="home-hero">
            <div className="home-hello">
              <h1>
                {greeting(new Date(now))},
                <br />
                <em>{t('boa {weekday}', { weekday })} ✦</em>
              </h1>
              <p>{summary.length ? summary.join(' · ') : t('O seu dia num lugar só.')}</p>
            </div>
            <Ask tabs={tabs} onAsk={onAsk} />
            <Clock />
          </div>
          <div className="home-toolbar">
            <button
              type="button"
              className={`btn small${editing ? ' primary' : ''}`}
              aria-pressed={editing}
              onClick={() => setEditing(!editing)}
            >
              <LayoutIcon />
              {editing ? t('Editando o Início') : t('Editar o Início')}
            </button>
          </div>
          <HomeGrid layout={layout} editing={editing} blocks={blocks} onChange={save} />
          {!layout.some((item) => !item.hidden) && (
            <p className="block-empty">
              {t('Todos os blocos estão escondidos. Editar o Início traz de volta.')}
            </p>
          )}
        </div>
        {editing && (
          <BlockList
            layout={layout}
            blocks={blocks}
            onChange={(next) => save(next, true)}
            onReset={() => save(defaultLayout(), true)}
            onDone={() => setEditing(false)}
          />
        )}
      </div>
    </HomeContext.Provider>
  )
}
