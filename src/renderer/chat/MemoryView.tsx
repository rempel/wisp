// A memória à vista (Fase 65): os CLAUDE.md que o Claude Code lê em toda conversa, com o texto
// de cada um, o editar e a prévia com o diff antes de gravar. O main confere tudo de novo e só
// grava com o arquivo ainda como na prévia.
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { DiffView } from './DiffView'
import { Markdown } from './Markdown'
import type { AgentPreview, MemoryFile, MemoryId } from '../../shared/ipc'
import { t } from '../../shared/i18n'

/** O nome e a explicação de cada arquivo. */
const LABELS: Record<MemoryId, [string, string]> = {
  user: [t('Sua'), t('vale em todas as conversas, em qualquer pasta')],
  workspace: [t('Do Wisp'), t('a persona do Wisp, nas conversas sem pasta')],
  project: [t('Do projeto'), t('o CLAUDE.md da pasta da conversa, para quem trabalha nela')],
  'project-dir': [t('Do projeto (.claude)'), t('o mesmo, guardado na pasta .claude')],
  local: [t('Só sua, neste projeto'), t('o CLAUDE.local.md, que não vai para o Git')]
}

export function MemoryView({ folder }: { folder: string | null }): JSX.Element {
  const [files, setFiles] = useState<MemoryFile[] | null>(null)
  const [editing, setEditing] = useState<{ id: MemoryId; text: string } | null>(null)
  const [preview, setPreview] = useState<AgentPreview | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let alive = true
    void window.wisp.memory.list(folder).then((list) => {
      if (alive) setFiles(list)
    })
    return () => {
      alive = false
    }
  }, [folder])

  const showPreview = async (): Promise<void> => {
    if (!editing) return
    const result = await window.wisp.memory.preview(editing.id, folder, editing.text)
    if ('error' in result) setMessage({ ok: false, text: result.error })
    else setPreview(result)
  }
  const save = async (): Promise<void> => {
    if (!editing || !preview) return
    const result = await window.wisp.memory.save(
      editing.id,
      folder,
      editing.text,
      preview.fingerprint
    )
    setMessage({ ok: result.ok, text: result.message })
    setPreview(null)
    if (!result.ok) return
    setEditing(null)
    setFiles(await window.wisp.memory.list(folder))
  }

  return (
    <div className="settings agents-view memory-view">
      <p className="settings-hint">
        {t(
          'O que o Claude lê antes de cada conversa. Escreva aqui o que ele deve sempre saber: como você gosta das respostas, as regras do projeto, os comandos de teste. Vale nas conversas novas (Ctrl+K).'
        )}
      </p>
      {message && (
        <p className={message.ok ? 'settings-hint' : 'settings-error'} role="status">
          {message.text}
        </p>
      )}
      {!folder && (
        <p className="settings-hint">
          {t(
            'A conversa em foco não está numa pasta: a memória de um projeto aparece quando estiver.'
          )}
        </p>
      )}
      {(files ?? []).map((file) => {
        const [name, hint] = LABELS[file.id]
        const open = editing?.id === file.id
        return (
          <section key={file.id} className="memory-file">
            <header>
              <div>
                <strong>{name}</strong> <small>{hint}</small>
                <code className="permission-path" title={file.path}>
                  {file.path}
                </code>
              </div>
              {!open && (
                <button
                  type="button"
                  className="settings-button"
                  disabled={file.tooBig}
                  title={
                    file.tooBig
                      ? t('Este arquivo é grande demais para editar pelo painel.')
                      : undefined
                  }
                  onClick={() => {
                    setMessage(null)
                    setPreview(null)
                    setEditing({ id: file.id, text: file.text })
                  }}
                >
                  {file.exists ? t('Editar') : t('Criar')}
                </button>
              )}
            </header>
            {open ? (
              <form
                className="agent-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  void showPreview()
                }}
              >
                <textarea
                  rows={12}
                  value={editing.text}
                  spellCheck={false}
                  aria-label={t('O texto da memória: {name}', { name })}
                  onChange={(event) => {
                    setPreview(null)
                    setEditing({ id: file.id, text: event.target.value })
                  }}
                />
                {preview && (
                  <div className="agent-preview" role="region" aria-label={t('O que muda')}>
                    <strong>
                      {preview.unchanged
                        ? t('Nada muda em {path}.', { path: preview.path })
                        : preview.exists
                          ? t('Muda {path} (o de antes ganha um backup ao lado):', {
                              path: preview.path
                            })
                          : t('Cria {path}:', { path: preview.path })}
                    </strong>
                    {!preview.unchanged && <DiffView diff={preview.diff} path={preview.path} />}
                  </div>
                )}
                <div className="rewind-actions">
                  {preview && !preview.unchanged ? (
                    <button type="button" className="settings-button" onClick={() => void save()}>
                      {preview.exists ? t('Gravar') : t('Criar')}
                    </button>
                  ) : (
                    <button type="submit" className="settings-button">
                      {t('Ver o que muda')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      setEditing(null)
                      setPreview(null)
                    }}
                  >
                    {t('Cancelar')}
                  </button>
                </div>
              </form>
            ) : file.exists ? (
              <div className="memory-text msg assistant">
                <Markdown text={file.text} />
              </div>
            ) : (
              <p className="settings-hint">{t('Ainda não existe.')}</p>
            )}
          </section>
        )
      })}
    </div>
  )
}
