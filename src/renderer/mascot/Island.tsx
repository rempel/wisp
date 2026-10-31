// A ilha (Fase 14; aberta e interativa na Fase 37): a cápsula do topo da tela com o mascote em
// miniatura e a linha de estado; aberta, os cartões: a conversa ou sessão em foco com os passos, a
// música com os controles, os pedidos que esperam (Negar, Permitir, Sempre, as perguntas) e os
// ajustes. O main decide quando ela abre e recolhe (island-state.ts); aqui é só o desenho e os
// botões, que voltam para o main pelo window.wisp.mascot.island.

import { useEffect, useRef } from 'react'
import type { DragEvent, JSX } from 'react'
import {
  AGENDA_ID,
  GITHUB_ID,
  islandOpenHeight,
  MUSIC_ID,
  UPDATE_ID,
  USAGE_ID
} from '../../shared/ipc'
import { t } from '../../shared/i18n'
import {
  TaskCard,
  DiffCard,
  MusicCard,
  AskCard,
  UsageCard,
  GithubCard,
  AgendaCard,
  UpdateCard,
  EmptyCard,
  Pills,
  AlertCard,
  SettingsCard
} from './island/cards'
import {
  HomeIcon,
  GearIcon,
  PanelIcon,
  SoundIcon,
  AskIcon,
  FoldIcon,
  NoteIcon
} from './island/icons'
import { act } from './island/util'
import type { Island } from './island/util'

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

/** As pílulas que não são conversas nem a música: o id, o nome e o detalhe. */
function extraPills(island: Island): [string, string, string][] {
  const pills: [string, string, string][] = []
  if (island.update)
    pills.push([UPDATE_ID, t('Wisp {version}', { version: island.update.version }), t('novo')])
  if (island.usage) {
    const used = island.usage.session?.used ?? island.usage.week?.used ?? 0
    // O uso vem de 0 a 1.
    pills.push([USAGE_ID, t('Plano'), `${Math.round(used * 100)}%`])
  }
  if (island.github && (island.github.mine.length || island.github.reviews.length)) {
    const failing = island.github.mine.filter((pr) => pr.ci === 'failure').length
    pills.push([
      GITHUB_ID,
      'GitHub',
      failing
        ? t('{n} com CI falhando', { n: failing })
        : t('{n} PRs', { n: island.github.mine.length + island.github.reviews.length })
    ])
  }
  if (island.agenda.length) {
    const next = island.agenda[0]
    pills.push([
      AGENDA_ID,
      t('Agenda'),
      next.allDay
        ? next.title
        : new Date(next.start).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    ])
  }
  return pills
}

function OpenIsland({ island, stage }: { island: Island; stage: JSX.Element }): JSX.Element {
  const { tasks, music } = island
  const extra = extraPills(island)
  const items = tasks.length + (music ? 1 : 0) + extra.length
  const task = tasks.find((item) => item.id === island.focus)
  const showMusic = music && (island.focus === MUSIC_ID || !task)
  let main: JSX.Element
  if (island.alert) {
    main = <AlertCard key={island.alert.id} alert={island.alert} count={island.alerts} />
  } else if (island.tab === 'settings') main = <SettingsCard settings={island.settings} />
  else if (island.tab === 'ask') main = <AskCard island={island} />
  else if (island.diff) main = <DiffCard diff={island.diff} />
  else if (task) main = <TaskCard task={task} />
  else if (island.focus === UPDATE_ID && island.update) main = <UpdateCard update={island.update} />
  else if (island.focus === USAGE_ID && island.usage) main = <UsageCard usage={island.usage} />
  else if (island.focus === GITHUB_ID && island.github) main = <GithubCard github={island.github} />
  else if (island.focus === AGENDA_ID && island.agenda.length) {
    main = <AgendaCard events={island.agenda} />
  } else if (showMusic && music) main = <MusicCard music={music} />
  else main = <EmptyCard />
  const pills = !island.alert && island.tab === 'home' && !island.diff && items > 1
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
            aria-selected={island.tab === 'ask'}
            onClick={() => act({ type: 'tab', tab: 'ask' })}
          >
            <AskIcon /> {t('Perguntar')}
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
        {pills && <Pills tasks={tasks} music={music} focus={island.focus} extra={extra} />}
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
  // O teclado (quando a ilha o tem, no Windows): Esc fecha o diff ou recolhe; Ctrl+← e Ctrl+→
  // trocam de pílula (na caixa de texto, elas andam de palavra em palavra).
  const current = useRef(island)
  useEffect(() => {
    current.current = island
  })
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      const now = current.current
      if (e.key === 'Escape') {
        e.preventDefault()
        if (now.diff) act({ type: 'diff', task: now.diff.task, step: null })
        else act({ type: 'close' })
        return
      }
      if (!e.ctrlKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
      if ((e.target as Element | null)?.closest?.('textarea, input')) return
      const ids = [
        ...now.tasks.map((task) => task.id),
        ...extraPills(now).map(([id]) => id),
        ...(now.music ? [MUSIC_ID] : [])
      ]
      if (ids.length < 2) return
      e.preventDefault()
      const at = Math.max(0, ids.indexOf(now.focus ?? ''))
      const next = (at + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length
      if (now.tab !== 'home') act({ type: 'tab', tab: 'home' })
      act({ type: 'focus', id: ids[next] })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
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
