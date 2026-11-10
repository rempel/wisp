// A aba Mudanças da bancada (Fase 74): os arquivos que a conversa em foco mexeu, de antes da
// primeira edição até agora, com o diff de cada um e o desfazer, um a um ou todos. É o card do
// fim da resposta (Fase 42) que fica à vista durante o trabalho, somando as respostas.
import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import { DiffCount, DiffView } from './DiffView'
import { openFileView } from './fileView'
import { ChevronIcon } from './icons'
import type { ReviewFile } from '../../shared/ipc'
import { t } from '../../shared/i18n'

/** De quanto em quanto tempo a lista é relida com a aba à vista (ms). */
const REFRESH_MS = 2500

const STATUS: Record<ReviewFile['status'], () => string> = {
  created: () => t('novo'),
  modified: () => t('mudou'),
  deleted: () => t('apagado')
}

/** O nome do arquivo e a pasta dele, para a lista. */
function splitPath(path: string): { name: string; dir: string } {
  const normal = path.replaceAll('\\', '/')
  const cut = normal.lastIndexOf('/')
  return { name: normal.slice(cut + 1), dir: cut > 0 ? normal.slice(0, cut) : '' }
}

export function ChangesTab({
  conversation,
  busy
}: {
  /** A conversa em foco (null: uma sessão do terminal, ou nenhuma). */
  conversation: string | null
  /** O Claude está respondendo: desfazer espera. */
  busy: boolean
}): JSX.Element {
  const [files, setFiles] = useState<ReviewFile[] | null>(null)
  const [partial, setPartial] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [working, setWorking] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    if (!conversation) return setFiles([])
    const result = await window.wisp.chat.changes(conversation)
    setFiles(result.files)
    setPartial(result.partial)
  }, [conversation])
  useEffect(() => {
    let alive = true
    const read = (): void => {
      if (alive && !document.hidden) void refresh()
    }
    read()
    const timer = window.setInterval(read, REFRESH_MS)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [refresh])

  const undo = async (targets: ReviewFile[]): Promise<void> => {
    if (!conversation || !targets.length) return
    setWorking(true)
    try {
      const result = await window.wisp.chat.undoChanges(
        conversation,
        targets.map(({ path, hash }) => ({ path, hash }))
      )
      setProblems(result.problems)
      await refresh()
    } finally {
      setWorking(false)
    }
  }

  const list = files ?? []
  const undoable = list.filter((file) => file.canUndo)
  const added = list.reduce((sum, file) => sum + file.added, 0)
  const removed = list.reduce((sum, file) => sum + file.removed, 0)
  const blocked = busy || working

  return (
    <div className="workbench-body workbench-changes" role="tabpanel" aria-label={t('Mudanças')}>
      <div className="workbench-bar">
        <span className="workbench-changes-total">
          {list.length === 1
            ? t('1 arquivo mudou')
            : t('{count} arquivos mudaram', { count: list.length })}{' '}
          {list.length > 0 && <DiffCount diff={{ added, removed, hunks: [], truncated: false }} />}
        </span>
        <button
          type="button"
          className="settings-button"
          disabled={blocked || !undoable.length}
          title={
            busy
              ? t('Espere a resposta acabar para desfazer')
              : t('Cada arquivo volta a ser como era antes de a conversa mexer nele')
          }
          onClick={() => void undo(undoable)}
        >
          {t('Desfazer tudo')}
        </button>
      </div>
      {partial && (
        <small className="workbench-note settings-hint">
          {t('Parte das respostas é de antes de o Wisp abrir: as edições delas não aparecem aqui.')}
        </small>
      )}
      {problems.map((problem) => (
        <small key={problem} className="settings-error workbench-note" role="alert">
          {problem}
        </small>
      ))}
      {list.length === 0 ? (
        <div className="workbench-empty">
          <strong>{t('Nenhuma mudança ainda')}</strong>
          <span>
            {t(
              'Os arquivos que o Claude editar nesta conversa aparecem aqui, com o diff e o desfazer. Os comandos do terminal não entram.'
            )}
          </span>
        </div>
      ) : (
        <ul className="workbench-change-list">
          {list.map((file) => {
            const { name, dir } = splitPath(file.path)
            const expanded = open === file.path
            return (
              <li key={file.path} className={`workbench-change status-${file.status}`}>
                <div className="workbench-change-head">
                  <button
                    type="button"
                    className="workbench-change-name"
                    aria-expanded={expanded}
                    title={file.path}
                    onClick={() => setOpen(expanded ? null : file.path)}
                  >
                    <ChevronIcon open={expanded} />
                    <strong>{name}</strong>
                    <small>{dir}</small>
                  </button>
                  <span className="workbench-change-status">{STATUS[file.status]()}</span>
                  {file.diff && <DiffCount diff={file.diff} />}
                  {file.status !== 'deleted' && (
                    <button
                      type="button"
                      className="link"
                      onClick={() => openFileView({ path: file.path, line: 1, changed: [] })}
                    >
                      {t('Abrir')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="link"
                    disabled={blocked || !file.canUndo}
                    onClick={() => void undo([file])}
                  >
                    {t('Desfazer')}
                  </button>
                </div>
                {expanded &&
                  (file.diff ? (
                    <DiffView diff={file.diff} path={file.path} />
                  ) : (
                    <small className="settings-hint">
                      {t('Sem diff: o arquivo é binário ou grande demais.')}
                    </small>
                  ))}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
