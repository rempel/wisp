// Os comandos com barra da caixa de texto: os que o Wisp atende e os do Claude Code.

import { t } from '../../shared/i18n'
import { promptPreview } from '../../shared/prompts'
import type { SavedPrompt } from '../../shared/prompts'

/** Um comando com barra: os do Wisp (compactar, conversa nova) e os do Claude Code. */
export interface SlashCommand {
  name: string
  description: string
  /** Um prompt salvo (Fase 26): escolher põe o texto dele, já preenchido, na caixa. */
  prompt?: boolean
}

/** Os comandos que o próprio Wisp atende (os outros vão para o Claude Code como mensagem). */
export const WISP_COMMANDS: SlashCommand[] = [
  { name: 'compact', description: t('Compactar a conversa (escreva depois o que manter)') },
  { name: 'clear', description: t('Começar uma conversa nova nesta aba') }
]

/** O que os comandos mais comuns do Claude Code fazem (os outros, como skills, vão sem descrição). */
const KNOWN: Record<string, string> = {
  review: t('Revisar um pull request'),
  'security-review': t('Revisar a segurança das mudanças'),
  init: t('Criar um CLAUDE.md para o projeto'),
  'pr-comments': t('Ler os comentários de um pull request'),
  context: t('Ver o que ocupa o contexto'),
  cost: t('Ver o custo da conversa'),
  todos: t('Ver a lista de tarefas')
}

/** Quantos comandos o menu mostra de uma vez. */
const MAX_SHOWN = 8

/** O texto da caixa é o começo de um comando ("/", "/com")? Devolve o que foi digitado depois da barra. */
export function slashQuery(draft: string): string | null {
  const match = /^\/([\w:.-]*)$/.exec(draft)
  return match ? match[1] : null
}

/**
 * Os comandos que combinam com o que foi digitado: primeiro os que começam assim. Os prompts
 * salvos vêm logo depois dos do Wisp e, com o mesmo nome, passam na frente de um do Claude Code.
 */
export function matchCommands(
  query: string,
  cli: string[],
  prompts: SavedPrompt[] = []
): SlashCommand[] {
  const wisp = new Set(WISP_COMMANDS.map((command) => command.name))
  const saved = prompts.filter((prompt) => !wisp.has(prompt.name))
  const taken = new Set([...wisp, ...saved.map((prompt) => prompt.name)])
  const all = [
    ...WISP_COMMANDS,
    ...saved.map((prompt) => ({
      name: prompt.name,
      description: promptPreview(prompt.text),
      prompt: true
    })),
    ...cli
      .filter((name) => !taken.has(name))
      .map((name) => ({ name, description: KNOWN[name] ?? '' }))
  ]
  const q = query.toLowerCase()
  const starts = all.filter((command) => command.name.toLowerCase().startsWith(q))
  const contains = all.filter(
    (command) => !command.name.toLowerCase().startsWith(q) && command.name.toLowerCase().includes(q)
  )
  return [...starts, ...contains].slice(0, MAX_SHOWN)
}
