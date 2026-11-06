// O quadro de tarefas (Fase 51): A fazer, Rodando, Revisar e Feito. Um cartão é um pedido numa
// pasta de projeto; Começar o roda numa cópia do Git, o cartão anda sozinho para Revisar no fim
// da resposta, e Juntar ou Descartar decidem o que fica.
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { BoardCard, BoardColumn, FolderChoice } from '../../shared/ipc'
import { t } from '../../shared/i18n'

const COLUMNS: [BoardColumn, string][] = [
  ['todo', t('A fazer')],
  ['running', t('Rodando')],
  ['review', t('Revisar')],
  ['done', t('Feito')]
]

const nameOf = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? path

export function BoardView({ onShow }: { onShow: () => void }): JSX.Element {
  const [cards, setCards] = useState<BoardCard[]>([])
  const [projects, setProjects] = useState<FolderChoice[]>([])
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', prompt: '', folder: '' })
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)

  useEffect(() => {
    void window.wisp.board.list().then(setCards)
    void window.wisp.tabs.projects().then((list) => {
      // As cópias guardadas também entram no menu das pastas; o quadro faz as dele.
      setProjects(list.filter((project) => !/[\\/]copias[\\/]/.test(project.path)))
    })
    return window.wisp.board.onChanged(setCards)
  }, [])

  const act = async (
    action: Parameters<typeof window.wisp.board.action>[0],
    card: BoardCard,
    column?: BoardColumn
  ): Promise<void> => {
    setBusy(card.id)
    setConfirm(null)
    setMessage(null)
    try {
      const result = await window.wisp.board.action(action, card.id, column)
      if (action === 'show' && result.ok) onShow()
      else if (result.message) setMessage({ ok: result.ok, text: result.message })
      if (action === 'start' && result.ok) onShow()
    } finally {
      setBusy(null)
    }
  }

  const add = async (): Promise<void> => {
    const result = await window.wisp.board.add(form.title, form.prompt, form.folder)
    if (!result.ok) {
      setMessage({ ok: false, text: result.message })
      return
    }
    setMessage(null)
    setAdding(false)
    setForm({ title: '', prompt: '', folder: form.folder })
  }

  const actions = (card: BoardCard): JSX.Element => {
    const disabled = busy === card.id
    const button = (label: string, run: () => void, extra = ''): JSX.Element => (
      <button type="button" className={`link${extra}`} disabled={disabled} onClick={run}>
        {label}
      </button>
    )
    switch (card.column) {
      case 'todo':
        return (
          <>
            {button(t('Começar'), () => void act('start', card))}
            {button(t('Tirar'), () => void act('remove', card))}
          </>
        )
      case 'running':
        return button(t('Abrir a conversa'), () => void act('show', card))
      case 'review':
        return (
          <>
            {card.conversation && button(t('Abrir'), () => void act('show', card))}
            {card.copy && button(t('Juntar'), () => void act('join', card))}
            {card.copy &&
              (confirm === card.id
                ? button(t('Descartar de vez?'), () => void act('discard', card), ' danger')
                : button(t('Descartar'), () => setConfirm(card.id)))}
            {!card.copy && button(t('Feito'), () => void act('move', card, 'done'))}
          </>
        )
      case 'done':
        return (
          <>
            {button(t('Voltar para A fazer'), () => void act('move', card, 'todo'))}
            {!card.copy && button(t('Tirar'), () => void act('remove', card))}
          </>
        )
    }
  }

  return (
    <div className="settings board-view">
      <div className="board-head">
        <p className="settings-hint">
          {t(
            'Cada cartão é um pedido num projeto. Começar abre uma conversa numa cópia do Git (as tarefas não pisam uma na outra); no fim da resposta, o cartão vai para Revisar, onde você junta as mudanças na pasta original (sem commit) ou descarta.'
          )}
        </p>
        {!adding && (
          <button
            type="button"
            className="settings-button"
            onClick={() => {
              setAdding(true)
              setForm((current) => ({
                ...current,
                folder: current.folder || projects[0]?.path || ''
              }))
            }}
          >
            {t('Novo cartão')}
          </button>
        )}
      </div>
      {message && (
        <small className={message.ok ? 'settings-hint' : 'settings-error'} role="status">
          {message.text}
        </small>
      )}
      {adding && (
        <form
          className="agent-form board-form"
          onSubmit={(event) => {
            event.preventDefault()
            void add()
          }}
        >
          <label>
            {t('Título')}
            <input
              value={form.title}
              placeholder={t('Adicionar o modo escuro')}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </label>
          <label>
            {t('O pedido para o Claude')}
            <textarea
              rows={4}
              value={form.prompt}
              placeholder={t('Adicione um modo escuro às configurações, com testes.')}
              onChange={(event) => setForm({ ...form, prompt: event.target.value })}
            />
          </label>
          <label>
            {t('Projeto')}
            <select
              value={form.folder}
              onChange={(event) => setForm({ ...form, folder: event.target.value })}
            >
              {projects.length === 0 && (
                <option value="">
                  {t('Nenhuma pasta de projeto (veja Configurações → Pastas)')}
                </option>
              )}
              {projects.map((project) => (
                <option key={project.path} value={project.path}>
                  {project.name} ({project.display})
                </option>
              ))}
            </select>
          </label>
          <div className="rewind-actions">
            <button type="submit" className="settings-button">
              {t('Pôr em A fazer')}
            </button>
            <button type="button" className="link" onClick={() => setAdding(false)}>
              {t('Cancelar')}
            </button>
          </div>
        </form>
      )}
      <div className="board-columns">
        {COLUMNS.map(([column, title]) => {
          const inColumn = cards.filter((card) => card.column === column)
          return (
            <section key={column} className={`board-column board-${column}`} aria-label={title}>
              <h3>
                {title} <span className="board-count">{inColumn.length}</span>
              </h3>
              {inColumn.map((card) => (
                <article key={card.id} className="board-card">
                  <strong>{card.title}</strong>
                  <small className="board-project">
                    {nameOf(card.folder)}
                    {card.copy ? ` · ${t('numa cópia')}` : ''}
                  </small>
                  <p className="board-prompt">{card.prompt}</p>
                  {card.note && <small className="settings-hint">{card.note}</small>}
                  <div className="board-actions">{actions(card)}</div>
                </article>
              ))}
            </section>
          )
        })}
      </div>
    </div>
  )
}
