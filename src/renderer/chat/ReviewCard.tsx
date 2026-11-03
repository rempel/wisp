import { useState } from 'react'
import type { JSX } from 'react'
import { DiffCount, DiffView } from './DiffView'
import { openFileView } from './fileView'
import { ChevronIcon } from './icons'
import type { Item } from './state'
import type { ReviewFile } from '../../shared/ipc'
import { t } from '../../shared/i18n'

type ReviewItem = Extract<Item, { kind: 'review' }>

/** O nome do arquivo e a pasta dele, para a lista. */
function splitPath(path: string): { name: string; dir: string } {
  const normal = path.replaceAll('\\', '/')
  const cut = normal.lastIndexOf('/')
  return { name: normal.slice(cut + 1), dir: cut > 0 ? normal.slice(0, cut) : '' }
}

const STATUS: Record<ReviewFile['status'], () => string> = {
  created: () => t('novo'),
  modified: () => t('mudou'),
  deleted: () => t('apagado')
}

/**
 * O card do fim do turno (Fase 42): os arquivos que a resposta mudou, com o diff de cada um (de
 * antes do turno até agora) e o desfazer, um a um ou todos. Desfazer só vale enquanto o card for
 * o do último turno e o arquivo continuar como ele mostra.
 */
export function ReviewCard({
  item,
  conversation
}: {
  item: ReviewItem
  conversation?: string
}): JSX.Element {
  const [open, setOpen] = useState<string | null>(null)
  const [undone, setUndone] = useState<string[]>([])
  const [problems, setProblems] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const pending = item.files.filter((file) => file.canUndo && !undone.includes(file.path))
  const canUndo = !item.stale && !!conversation && !busy

  const undo = async (files: ReviewFile[]): Promise<void> => {
    if (!conversation || !files.length) return
    setBusy(true)
    try {
      const result = await window.wisp.chat.reviewUndo(
        conversation,
        item.turn,
        files.map(({ path, hash }) => ({ path, hash }))
      )
      setUndone((before) => [...before, ...result.undone])
      setProblems(result.problems)
    } finally {
      setBusy(false)
    }
  }

  const added = item.files.reduce((sum, file) => sum + file.added, 0)
  const removed = item.files.reduce((sum, file) => sum + file.removed, 0)
  return (
    <section className="review-card" aria-label={t('O que esta resposta mudou')}>
      <header className="review-head">
        <strong>
          {item.files.length === 1
            ? t('Esta resposta mudou 1 arquivo')
            : t('Esta resposta mudou {count} arquivos', { count: item.files.length })}
        </strong>
        <DiffCount diff={{ added, removed, hunks: [], truncated: false }} />
        {pending.length > 1 && (
          <button
            type="button"
            className="settings-button review-undo-all"
            disabled={!canUndo}
            onClick={() => void undo(pending)}
          >
            {t('Desfazer tudo')}
          </button>
        )}
      </header>
      <ul className="review-files">
        {item.files.map((file) => {
          const { name, dir } = splitPath(file.path)
          const isOpen = open === file.path
          const reverted = undone.includes(file.path)
          return (
            <li key={file.path} className={reverted ? 'reverted' : undefined}>
              <div className="review-file">
                <button
                  type="button"
                  className="review-toggle"
                  aria-expanded={isOpen}
                  disabled={!file.diff}
                  onClick={() => setOpen(isOpen ? null : file.path)}
                  title={file.path}
                >
                  <ChevronIcon open={isOpen} />
                  <span className="review-name">{name}</span>
                  <span className="review-dir">{dir}</span>
                </button>
                <span className={`review-status ${file.status}`}>
                  {reverted ? t('desfeito') : STATUS[file.status]()}
                </span>
                {file.diff && <DiffCount diff={file.diff} />}
                {file.status !== 'deleted' && !reverted && (
                  <button
                    type="button"
                    className="settings-button"
                    onClick={() => openFileView({ path: file.path, line: 1, changed: [] })}
                  >
                    {t('Abrir')}
                  </button>
                )}
                {file.canUndo && !reverted && (
                  <button
                    type="button"
                    className="settings-button"
                    disabled={!canUndo}
                    aria-label={t('Desfazer {name}', { name })}
                    onClick={() => void undo([file])}
                  >
                    {t('Desfazer')}
                  </button>
                )}
              </div>
              {isOpen && file.diff && <DiffView diff={file.diff} path={file.path} />}
            </li>
          )
        })}
      </ul>
      {item.stale && pending.length > 0 && (
        <small className="settings-hint">
          {t('Outra mensagem já começou: o desfazer vale só para a última resposta.')}
        </small>
      )}
      {problems.map((problem) => (
        <small key={problem} className="settings-error" role="alert">
          {problem}
        </small>
      ))}
    </section>
  )
}
