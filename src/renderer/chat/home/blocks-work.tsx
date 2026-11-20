// Os blocos do trabalho (Fase 94): as conversas recentes, o quadro de tarefas (as colunas, em
// pequeno), o Precisa de você (os pedidos esperando nas abas, com Permitir e Negar ali mesmo) e o
// GitHub.
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { BoardCard, BoardColumn } from '../../../shared/ipc'
import { BoardIcon, ChatIcon, CheckIcon } from '../icons'
import { describe } from '../describe-request'
import type { PermissionItem } from '../describe-request'
import { AlertIcon, GitIcon } from './icons-home'
import { useHome } from './context'
import { when } from './format'
import { BlockHead, Empty } from './ui'
import { openSettingsAt } from '../settings-categories'
import { t } from '../../../shared/i18n'

export function ConversationsBlock(): JSX.Element {
  const { recent, conversations, tabs, now, onView, openConversation } = useHome()
  // As abertas que estão trabalhando ou esperando você mostram a bolinha.
  const status = (id: string): string => {
    const tab = tabs.tabs.find((item) => item.id === id)
    const state = tab ? conversations.get(tab.id) : undefined
    if (!state) return 'idle'
    if (state.items.some((item) => item.kind === 'permission' && item.status === 'pending')) {
      return 'wait'
    }
    return state.busy ? 'run' : 'done'
  }
  return (
    <>
      <BlockHead
        icon={<ChatIcon />}
        title={t('Conversas')}
        action={t('Ver todas')}
        onAction={() => onView('history')}
      />
      {recent.length ? (
        <ul className="rows">
          {recent.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="row-button"
                onClick={() => openConversation(item.id)}
              >
                <span className={`status-dot ${status(item.id)}`} />
                <span className="row-text">
                  <strong>{item.main ? `Wisp · ${item.title}` : item.title}</strong>
                </span>
                {(item.project ?? item.folder) && (
                  <span className="pill">
                    {item.project ?? item.folder?.split(/[\\/]/).filter(Boolean).pop()}
                  </span>
                )}
                <span className="row-when">{when(item.updatedAt, now)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{t('As conversas aparecem aqui.')}</Empty>
      )}
    </>
  )
}

const LANES: [BoardColumn, string, string][] = [
  ['todo', t('A fazer'), 'idle'],
  ['running', t('Rodando'), 'run'],
  ['review', t('Revisar'), 'wait'],
  ['done', t('Feito'), 'done']
]

export function BoardBlock(): JSX.Element {
  const { onView } = useHome()
  const [cards, setCards] = useState<BoardCard[] | null>(null)
  useEffect(() => {
    let alive = true
    void window.wisp.board.list().then((list) => {
      if (alive) setCards(list)
    })
    const off = window.wisp.board.onChanged(setCards)
    return () => {
      alive = false
      off()
    }
  }, [])
  return (
    <>
      <BlockHead
        icon={<BoardIcon />}
        title={t('Quadro de tarefas')}
        action={t('Abrir o quadro')}
        onAction={() => onView('board')}
      />
      {cards && !cards.length ? (
        <Empty>
          {t('O quadro está vazio. Um cartão é um pedido que o Claude faz numa cópia do projeto.')}
        </Empty>
      ) : (
        <div className="lanes">
          {LANES.map(([column, title, dot]) => {
            const list = (cards ?? []).filter((card) => card.column === column)
            return (
              <div key={column} className="lane">
                <div className="lane-head">
                  <span className={`status-dot ${dot}`} />
                  {title}
                  <span className="lane-count">{list.length}</span>
                </div>
                {list.slice(0, 4).map((card) => (
                  <button
                    type="button"
                    key={card.id}
                    className="lane-card"
                    onClick={() => onView('board')}
                  >
                    <strong>{card.title}</strong>
                    <small>{card.folder.split(/[\\/]/).filter(Boolean).pop()}</small>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

/** Os pedidos de permissão e as perguntas esperando nas abas abertas. */
export function NeedsYouBlock(): JSX.Element {
  const { tabs, conversations, showTab } = useHome()
  const waiting = tabs.tabs.flatMap((tab) => {
    const state = conversations.get(tab.id)
    if (!state) return []
    return state.items
      .filter(
        (item): item is PermissionItem => item.kind === 'permission' && item.status === 'pending'
      )
      .map((item) => ({ tab, item }))
  })
  // Sem nada esperando, as conversas que estão trabalhando agora.
  const working = tabs.tabs.filter(
    (tab): tab is Extract<typeof tab, { kind: 'chat' }> =>
      tab.kind === 'chat' && !!conversations.get(tab.id)?.busy
  )
  return (
    <>
      <BlockHead icon={<AlertIcon />} title={t('Precisa de você')}>
        {!!waiting.length && <span className="pill tone-amber">{waiting.length}</span>}
      </BlockHead>
      {waiting.length ? (
        <ul className="needs">
          {waiting.map(({ tab, item }) => {
            const question = item.toolName === 'AskUserQuestion'
            const { title } = describe(item.toolName, item.input, undefined, item.site)
            return (
              <li key={item.id} className="need">
                <span className="row-text">
                  <strong>{question ? t('Pergunta do Claude') : title}</strong>
                  <small>{tab.title}</small>
                </span>
                <button type="button" className="link" onClick={() => showTab(tab.id)}>
                  {t('Ver')}
                </button>
                {!question && (
                  <>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => window.wisp.chat.answerPermission(item.id, 'deny')}
                    >
                      {t('Negar')}
                    </button>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => window.wisp.chat.answerPermission(item.id, 'allow')}
                    >
                      {t('Permitir')}
                    </button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <>
          <p className="block-ok">
            <CheckIcon /> {t('Nada esperando você.')}
            {working.length ? ` ${t('Trabalhando agora:')}` : ` ${t('As abas estão em dia.')}`}
          </p>
          {!!working.length && (
            <div className="chips">
              {working.map((tab) => (
                <button key={tab.id} type="button" className="chip" onClick={() => showTab(tab.id)}>
                  <span className="status-dot run" />
                  {tab.main ? 'Wisp' : tab.title}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}

export function GithubBlock(): JSX.Element {
  const { snapshot, onView } = useHome()
  const lines = (snapshot?.github ?? '')
    .split('\n')
    .map((line) => line.trim().replace(/^[-*]\s*/, ''))
    .filter(Boolean)
  return (
    <>
      <BlockHead icon={<GitIcon />} title="GitHub" />
      {lines.length ? (
        <ul className="rows plain">
          {lines.slice(0, 8).map((line) => (
            <li key={line}>
              <span className="row-text">{line}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>
          {snapshot?.github === null || !snapshot ? (
            <>
              {t('O GitHub está desligado.')}{' '}
              <button
                type="button"
                className="link"
                onClick={() => {
                  openSettingsAt('integracoes')
                  onView('settings')
                }}
              >
                {t('Ligar')}
              </button>
            </>
          ) : (
            t('Nada do GitHub agora.')
          )}
        </Empty>
      )}
    </>
  )
}
