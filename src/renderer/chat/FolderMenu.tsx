import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { FolderChoice } from '../../shared/ipc'
import { FolderIcon } from './icons'
import { t } from '../../shared/i18n'

/**
 * "Abrir pasta": uma conversa numa aba nova que roda dentro de um projeto, como o Claude Code no
 * terminal (com o CLAUDE.md, as configurações e as skills dele). A lista vem das pastas de
 * projetos; outra pasta, pelo diálogo do sistema.
 */
export function FolderMenu(): JSX.Element {
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<FolderChoice[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Numa cópia do Git (Fase 43): a conversa trabalha numa worktree, num ramo só dela.
  const [copy, setCopy] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    let alive = true
    void window.wisp.tabs.projects().then((list) => alive && setProjects(list))
    return () => {
      alive = false
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const openFolder = async (path: string | null): Promise<void> => {
    setError(null)
    const result = await window.wisp.tabs.openFolder(path, copy)
    if (result.ok) setOpen(false)
    else if (result.message) setError(result.message)
  }

  return (
    <div
      className="folder-menu"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          setOpen(false)
        }
      }}
    >
      <button
        type="button"
        className="icon-button tabs-folder"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('Abrir uma pasta numa conversa (como o Claude Code no terminal)')}
        aria-label={t('Abrir uma pasta numa conversa')}
      >
        <FolderIcon />
      </button>
      {open && (
        <div className="model-menu folder-list" role="menu">
          <p className="model-menu-note">
            {t(
              'Uma conversa nova que roda dentro da pasta, com o CLAUDE.md, as configurações e as skills dela.'
            )}
          </p>
          <label className="folder-copy">
            <input
              type="checkbox"
              checked={copy}
              onChange={(event) => setCopy(event.target.checked)}
            />
            <span>
              <strong>{t('Numa cópia (worktree do Git)')}</strong>
              <small>
                {t(
                  'A conversa trabalha numa cópia, num ramo só dela; no fim, você junta na pasta original ou descarta.'
                )}
              </small>
            </span>
          </label>
          {projects?.map((project) => (
            <button
              key={project.path}
              type="button"
              role="menuitem"
              className="model-option"
              onClick={() => void openFolder(project.path)}
            >
              <span className="model-check">
                <FolderIcon />
              </span>
              <span className="model-text">
                <strong>{project.name}</strong>
                <small>{project.display}</small>
              </span>
            </button>
          ))}
          {projects?.length === 0 && (
            <p className="model-menu-note">
              {t('Nenhum projeto (com .git) nas suas pastas de projetos.')}
            </p>
          )}
          <button
            type="button"
            role="menuitem"
            className="model-option"
            onClick={() => void openFolder(null)}
          >
            <span className="model-check" />
            <span className="model-text">
              <strong>{t('Escolher outra pasta…')}</strong>
            </span>
          </button>
          {error && (
            <p className="model-menu-note folder-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
