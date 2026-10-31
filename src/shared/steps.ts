// Os passos de uma conversa ou sessão, numa linha ("Editar app.ts", "Rodar npm test"): o painel
// (a aba Sessões, os cards das ferramentas) e a ilha (Fase 37) mostram os mesmos.

import { t } from './i18n'

/** Nome curto da ferramenta: "mcp__desktop__open_url" vira "open_url". */
export function toolLabel(name: string): string {
  return name.replace(/^mcp__[^_]+(?:_[^_]+)*__/, '')
}

export const field = (input: unknown, key: string): string => {
  const value = (input as Record<string, unknown> | null)?.[key]
  return typeof value === 'string' ? value : ''
}

/** O nome do arquivo no fim de um caminho. */
export const fileName = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? path

export const quote = (text: string): string =>
  `“${text.length > 24 ? `${text.slice(0, 23).trimEnd()}…` : text}”`

export const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text

/** Um passo de uma sessão do terminal, numa linha: "Editar app.ts", "Rodar npm test". */
export function stepLabel(name: string, input: unknown): string {
  const file = fileName(field(input, 'file_path'))
  switch (name) {
    case 'Read':
      return file ? t('Ler {file}', { file }) : t('Ler um arquivo')
    case 'Write':
      return file ? t('Escrever {file}', { file }) : t('Escrever um arquivo')
    case 'Edit':
    case 'MultiEdit':
      return file ? t('Editar {file}', { file }) : t('Editar um arquivo')
    case 'NotebookEdit':
      return t('Editar um notebook')
    case 'Bash': {
      const command = field(input, 'command').split('\n')[0]
      return command ? t('Rodar {v1}', { v1: clip(command, 60) }) : t('Rodar um comando')
    }
    case 'Glob':
      return field(input, 'pattern')
        ? t('Procurar {v1}', { v1: clip(field(input, 'pattern'), 40) })
        : t('Procurar arquivos')
    case 'Grep': {
      const pattern = field(input, 'pattern')
      return pattern ? t('Buscar {v1}', { v1: quote(pattern) }) : t('Buscar nos arquivos')
    }
    case 'WebSearch': {
      const query = field(input, 'query')
      return query ? t('Pesquisar {v1}', { v1: quote(query) }) : t('Pesquisar na web')
    }
    case 'WebFetch':
      try {
        return t('Abrir {host}', { host: new URL(field(input, 'url')).host })
      } catch {
        return t('Abrir uma página')
      }
    case 'Task':
    case 'Agent': {
      const description = field(input, 'description')
      return description
        ? t('Delegar: {v1}', { v1: clip(description, 50) })
        : t('Delegar uma tarefa')
    }
    case 'TodoWrite':
      return t('Atualizar as tarefas')
    case 'Skill': {
      const skill = field(input, 'skill')
      return skill ? t('Usar a skill {v1}', { v1: clip(skill, 50) }) : t('Usar uma skill')
    }
    case 'AskUserQuestion':
      return t('Perguntar')
    case 'mcp__desktop__express':
      return t('Mostrar uma emoção no mascote')
    default:
      return toolLabel(name)
  }
}
