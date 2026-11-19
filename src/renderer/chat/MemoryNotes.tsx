// A memória pessoal na tela Memória (Fase 79): o que o Wisp anotou e esqueceu sozinho, com a
// conversa de origem e o desfazer de cada anotação; e as pastas que ficam fora da memória.
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { ListInput } from './SettingsFields'
import type { MemoryModelInfo, MemoryNote } from '../../shared/ipc'
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
                {note.auto ? ` · ${t('pela destilação')}` : ''}
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

const megabytes = (bytes: number): string => `${Math.round(bytes / 1_000_000)} MB`

/**
 * A busca por sentido (Fase 80): o modelo de embeddings, que só é baixado com o seu clique, e o
 * índice (quantos trechos, quantos já com vetor).
 */
export function MemoryModel(): JSX.Element {
  const [info, setInfo] = useState<MemoryModelInfo | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    let alive = true
    const load = (): void => {
      void window.wisp.memory.model('status').then((next) => {
        if (!alive) return
        setInfo(next)
        // Baixando, ou com trechos ainda sem vetor: confere de novo daqui a pouco.
        if (
          next &&
          (next.progress !== undefined || (next.installed && next.vectors < next.chunks))
        ) {
          setTimeout(load, 1500)
        }
      })
    }
    load()
    return () => {
      alive = false
    }
  }, [])

  const run = async (action: 'download' | 'remove'): Promise<void> => {
    setConfirming(false)
    if (action === 'download') {
      setInfo((old) => (old ? { ...old, progress: 0, error: undefined } : old))
      // A barra acompanha pela conferência periódica.
      const poll = setInterval(() => {
        void window.wisp.memory.model('status').then(setInfo)
      }, 1000)
      const next = await window.wisp.memory.model('download')
      clearInterval(poll)
      setInfo(next)
    } else {
      setInfo(await window.wisp.memory.model('remove'))
    }
  }

  const downloading = info?.progress !== undefined
  return (
    <section className="memory-file" aria-label={t('Busca por sentido')}>
      <header>
        <div>
          <strong>{t('Busca por sentido')}</strong>{' '}
          <small>
            {t(
              'com o modelo, o Wisp acha nas conversas e no diário pelo sentido, não só pelas palavras'
            )}
          </small>
        </div>
        {info && !downloading && !confirming && (
          <button
            type="button"
            className="settings-button"
            onClick={() => (info.installed ? void run('remove') : setConfirming(true))}
          >
            {info.installed ? t('Remover o modelo') : t('Baixar o modelo')}
          </button>
        )}
      </header>
      {info && (
        <p className="settings-hint" role="status">
          {downloading
            ? t('Baixando… {percent}%', { percent: Math.round((info.progress ?? 0) * 100) })
            : info.installed
              ? t('Modelo instalado ({size}). {vectors} de {chunks} trechos com vetor.', {
                  size: megabytes(info.bytes),
                  vectors: info.vectors,
                  chunks: info.chunks
                })
              : t('Sem o modelo, a busca é só pelas palavras. {chunks} trechos no índice.', {
                  chunks: info.chunks
                })}
        </p>
      )}
      {downloading && <progress value={info?.progress ?? 0} max={1} />}
      {info?.error && (
        <p className="settings-error" role="alert">
          {t('O download não deu certo: {error}', { error: info.error })}
        </p>
      )}
      {confirming && info && (
        <div className="agent-preview" role="region" aria-label={t('Baixar o modelo')}>
          <p>
            {t(
              'O modelo multilingual-e5-small tem uns {size} e vem de {source}. Depois de baixado, tudo roda no seu computador, sem internet.',
              { size: megabytes(info.approxBytes), source: info.source }
            )}
          </p>
          <div className="rewind-actions">
            <button type="button" className="settings-button" onClick={() => void run('download')}>
              {t('Baixar')}
            </button>
            <button type="button" className="link" onClick={() => setConfirming(false)}>
              {t('Cancelar')}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
