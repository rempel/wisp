// Os projetos nas configurações (Fase 77): escolher uma das suas pastas de projetos e dar a ela
// um nome, uma cor e o modo de permissão de costume. As abas das conversas nela ganham a cor.
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { MODE_TEXT } from './modes'
import { PERMISSION_MODES } from '../../shared/ipc'
import type { FolderChoice, PermissionMode } from '../../shared/ipc'
import {
  defaultProjectName,
  MAX_PROJECTS,
  nextProjectColor,
  PROJECT_COLORS,
  PROJECT_TONES
} from '../../shared/projects'
import type { Project } from '../../shared/projects'
import { t } from '../../shared/i18n'

export function ProjectsSection({
  projects,
  save
}: {
  projects: Project[]
  save: (patch: { projects: Project[] }) => unknown
}): JSX.Element {
  const [folders, setFolders] = useState<FolderChoice[]>([])
  useEffect(() => {
    let alive = true
    void window.wisp.tabs.projects().then((list) => alive && setFolders(list))
    return () => {
      alive = false
    }
  }, [])
  const change = (folder: string, patch: Partial<Project>): void =>
    void save({
      projects: projects.map((project) =>
        project.folder === folder ? { ...project, ...patch } : project
      )
    })
  const free = folders.filter((folder) => !projects.some((p) => p.folder === folder.path))

  return (
    <div className="projects-section">
      <p className="settings-hint">
        {t(
          'Uma pasta com nome, cor e o modo de costume. As abas das conversas nela ganham a cor, e uma conversa nova aberta pelo menu das pastas já começa nesse modo.'
        )}
      </p>
      {projects.map((project) => (
        <div key={project.folder} className="project-row">
          <span
            className="project-dot"
            style={{ background: PROJECT_TONES[project.color] }}
            aria-hidden
          />
          <input
            type="text"
            defaultValue={project.name}
            aria-label={t('Nome do projeto {folder}', { folder: project.folder })}
            title={project.folder}
            onBlur={(event) => {
              const name = event.target.value.trim().slice(0, 60)
              if (name && name !== project.name) change(project.folder, { name })
              else event.target.value = project.name
            }}
          />
          <select
            value={project.color}
            aria-label={t('Cor')}
            onChange={(event) =>
              change(project.folder, { color: event.target.value as Project['color'] })
            }
          >
            {PROJECT_COLORS.map((color) => (
              <option key={color} value={color}>
                {COLOR_NAMES[color]()}
              </option>
            ))}
          </select>
          <select
            value={project.mode ?? ''}
            aria-label={t('Modo de permissão')}
            onChange={(event) =>
              change(project.folder, {
                mode: (event.target.value || null) as PermissionMode | null
              })
            }
          >
            <option value="">{t('O das configurações')}</option>
            {PERMISSION_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {MODE_TEXT[mode].label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="link danger"
            onClick={() =>
              void save({ projects: projects.filter((item) => item.folder !== project.folder) })
            }
            aria-label={t('Tirar o projeto {name}', { name: project.name })}
          >
            {t('Tirar')}
          </button>
        </div>
      ))}
      {free.length > 0 && projects.length < MAX_PROJECTS && (
        <select
          className="project-add"
          value=""
          aria-label={t('Fazer de uma pasta um projeto')}
          onChange={(event) => {
            const folder = event.target.value
            if (!folder) return
            void save({
              projects: [
                ...projects,
                {
                  folder,
                  name: defaultProjectName(folder),
                  color: nextProjectColor(projects),
                  mode: null
                }
              ]
            })
          }}
        >
          <option value="">{t('Fazer de uma pasta um projeto…')}</option>
          {free.map((folder) => (
            <option key={folder.path} value={folder.path}>
              {folder.name}
            </option>
          ))}
        </select>
      )}
      {folders.length === 0 && (
        <p className="settings-hint">
          {t('Nenhuma pasta de projeto encontrada: confira as Pastas de projetos, acima.')}
        </p>
      )}
    </div>
  )
}

const COLOR_NAMES: Record<Project['color'], () => string> = {
  cyan: () => t('Ciano'),
  green: () => t('Verde'),
  amber: () => t('Âmbar'),
  red: () => t('Vermelho'),
  violet: () => t('Violeta'),
  pink: () => t('Rosa')
}
