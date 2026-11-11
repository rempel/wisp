// Os projetos (Fase 77): uma pasta com nome, cor e o modo de permissão de costume. As abas das
// conversas numa pasta de projeto ganham a cor e o nome dele, e uma conversa nova no projeto já
// começa no modo dele. Ficam no config.json (`projects`).

/** As cores de um projeto (nomes, e não valores: o tema decide o tom). */
export const PROJECT_COLORS = ['cyan', 'green', 'amber', 'red', 'violet', 'pink'] as const
export type ProjectColor = (typeof PROJECT_COLORS)[number]
/** O tom de cada cor (legível no claro e no escuro). */
export const PROJECT_TONES: Record<ProjectColor, string> = {
  cyan: '#22b8d6',
  green: '#3fb87a',
  amber: '#e0a020',
  red: '#e5605e',
  violet: '#9a7bf0',
  pink: '#e06aa8'
}
export const MAX_PROJECTS = 30

export interface Project {
  /** A pasta do projeto (o caminho inteiro). */
  folder: string
  name: string
  color: ProjectColor
  /** O modo de permissão das conversas novas nele (null: o das configurações). */
  mode: 'default' | 'acceptEdits' | 'plan' | 'auto' | null
}

const clean = (path: string): string => path.replace(/[\\/]+$/, '')

/**
 * O projeto de uma pasta: o que tem essa pasta, ou o de uma pasta de cima (uma subpasta, uma
 * cópia do Git dentro dele). O mais específico ganha. null: nenhum.
 */
export function projectOf(folder: string | null | undefined, projects: Project[]): Project | null {
  if (!folder) return null
  const target = clean(folder)
  let best: Project | null = null
  for (const project of projects) {
    const root = clean(project.folder)
    const inside =
      target === root || target.startsWith(`${root}/`) || target.startsWith(`${root}\\`)
    if (inside && (!best || root.length > clean(best.folder).length)) best = project
  }
  return best
}

/** O nome de costume de um projeto: o da pasta. */
export function defaultProjectName(folder: string): string {
  return clean(folder).split(/[\\/]/).pop() || folder
}

/** A próxima cor ainda sem uso (ou a primeira, com todas em uso). */
export function nextProjectColor(projects: Project[]): ProjectColor {
  const used = new Set(projects.map((project) => project.color))
  return PROJECT_COLORS.find((color) => !used.has(color)) ?? PROJECT_COLORS[projects.length % 6]
}
