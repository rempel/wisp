// A memória pessoal na tela Memória (Fase 79): o que o Wisp anotou e esqueceu sozinho, com a
// conversa de origem e o desfazer de cada anotação; e as pastas que ficam fora da memória.
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { ListInput } from './SettingsFields'
import type { MemoryNote } from '../../shared/ipc'
import { dateLocale, t } from '../../shared/i18n'

const WHERE: Record<MemoryNote['target'], string> = {
  eu: t('sobre você'),
  memoria: t('fatos e decisões'),
  diario: t('diário')
}

function when(at: number): string {
  return new Date(at).toLocaleString(dateLocale(), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/** O que o Wisp anotou, da mais nova para a mais velha, com o desfazer. */
export function MemoryNotes({ onChanged }: { onChanged: () => void }): JSX.Element {
  const [notes, setNotes] = useState<MemoryNote[] | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const load = async (): Promise<void> => setNotes(await window.wisp.memory.notes())
  useEffect(() => {
    let alive = true
    void window.wisp.memory.notes().then((list) => {
      if (alive) setNotes(list)
    })
    return () => {
      alive = false
    }
  }, [])

  const undo = async (id: string): Promise<void> => {
    const result = await window.wisp.memory.undo(id)
    setMessage({ ok: result.ok, text: result.message })
    await load()
    onChanged()
  }

  return (
    <section className="memory-file memory-notes" aria-label={t('O que o Wisp anotou')}>
      <header>
        <div>
          <strong>{t('O que o Wisp anotou')}</strong>{' '}
          <small>{t('cada anotação, com a conversa de onde veio')}</small>
        </div>
        <button type="button" className="settings-button" onClick={() => void load()}>
          {t('Atualizar')}
        </button>
      </header>
      {message && (
        <p className={message.ok ? 'settings-hint' : 'settings-error'} role="status">
          {message.text}
        </p>
      )}
      {notes && !notes.length && (
        <p className="settings-hint">
          {t('Nada ainda. Conte algo numa conversa ("lembra que…") e a anotação aparece aqui.')}
        </p>
      )}
      <ul className="memory-note-list">
        {(notes ?? []).map((note) => (
          <li key={note.id} className={note.undone ? 'undone' : undefined}>
            <div className="memory-note-meta">
              <span>
                {note.action === 'save' ? t('Anotou') : t('Esqueceu')} · {WHERE[note.target]} ·{' '}
                {when(note.at)}
              </span>
              {note.title &&
                (note.conversation ? (
                  <button
                    type="button"
                    className="link"
                    title={t('Abrir a conversa')}
                    onClick={() => void window.wisp.history.open(note.conversation!)}
                  >
                    {note.title}
                  </button>
                ) : (
                  <span>{note.title}</span>
                ))}
            </div>
            <p className="memory-note-text">{note.text}</p>
            {note.undone ? (
              <small>{t('Desfeita em {when}.', { when: when(note.undone) })}</small>
            ) : (
              <button type="button" className="link" onClick={() => void undo(note.id)}>
                {t('Desfazer')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** As pastas cujas conversas ficam fora da memória pessoal (o config.json, memoryExcludedFolders). */
export function MemoryExcluded(): JSX.Element {
  const [folders, setFolders] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void window.wisp.settings.get().then((snapshot) => {
      if (alive) setFolders(snapshot.values.memoryExcludedFolders)
    })
    return () => {
      alive = false
    }
  }, [])

  const save = async (memoryExcludedFolders: string[]): Promise<void> => {
    const result = await window.wisp.settings.set({ memoryExcludedFolders })
    setError(result.ok ? null : result.message)
    if (result.ok) setFolders(memoryExcludedFolders)
  }

  return (
    <section className="memory-file" aria-label={t('Pastas fora da memória')}>
      <header>
        <div>
          <strong>{t('Pastas fora da memória')}</strong>{' '}
          <small>
            {t(
              'as conversas nelas (e nas de dentro) leem o EU.md, mas não anotam nada: o trabalho de um cliente, por exemplo'
            )}
          </small>
        </div>
      </header>
      {folders && (
        <ListInput value={folders} placeholder="~/clientes" onCommit={(value) => save(value)} />
      )}
      {error && (
        <p className="settings-error" role="status">
          {error}
        </p>
      )}
    </section>
  )
}
