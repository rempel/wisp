// Exportar uma conversa em Markdown (Fase 21): o que o painel mostrou, com as mensagens, as
// respostas, as ferramentas resumidas numa linha e os pedidos de permissão com o que foi
// respondido. Vai para um arquivo que a pessoa escolhe no diálogo do sistema.

import { applyRewinds } from './history'
import type { SavedConversation } from './history'
import type { ChatEvent } from '../shared/ipc'
import { t, dateLocale } from '../shared/i18n'

const DECISIONS: Record<string, string> = {
  allow: t('permitido'),
  'allow-always': t('permitido sempre'),
  'allow-edits': t('plano aprovado (aceitar edições)'),
  'allow-auto': t('plano aprovado (automático)'),
  deny: t('negado'),
  answered: t('respondido'),
  cancelled: t('cancelado')
}

/** Uma linha só, cortada. */
function line(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/** O essencial da entrada de uma ferramenta: o comando, o arquivo, o padrão, o endereço. */
export function toolSummary(name: string, input: unknown): string {
  const fields = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  for (const key of ['command', 'file_path', 'notebook_path', 'pattern', 'url', 'query', 'path']) {
    const value = fields[key]
    if (typeof value === 'string' && value.trim())
      return `**${name}** \`${line(value).replace(/`/g, "'")}\``
  }
  const description = fields.description
  if (typeof description === 'string' && description.trim())
    return `**${name}** · ${line(description)}`
  return `**${name}**`
}

/** Um bloco de citação (cada linha com "> "). */
const quote = (text: string): string =>
  text
    .split('\n')
    .map((l) => `> ${l}`.trimEnd())
    .join('\n')

/** A conversa em Markdown. */
export function exportMarkdown(saved: SavedConversation, now = new Date()): string {
  const events = applyRewinds(saved.events)
  const date = (ms: number | Date): string =>
    new Date(ms).toLocaleString(dateLocale(), { dateStyle: 'short', timeStyle: 'short' })
  const out: string[] = [
    `# ${line(saved.title, 200)}`,
    '',
    t('_Conversa do Wisp de {v1}, exportada em {v2}._', {
      v1: date(saved.createdAt),
      v2: date(now)
    })
  ]
  const tools = new Map<string, { name: string; input: unknown }>()
  let speaker: 'user' | 'claude' | null = null
  const head = (who: 'user' | 'claude'): void => {
    if (speaker === who) return
    speaker = who
    out.push('', who === 'user' ? '## Você' : '## Claude')
  }
  const texts = new Map<string, number>()
  for (const event of events as ChatEvent[]) {
    switch (event.type) {
      case 'user': {
        head('user')
        out.push('', event.text || t('_(só anexos)_'))
        if (event.attachments.length) {
          out.push('', t('_Anexos: {v1}_', { v1: event.attachments.map((a) => a.name).join(', ') }))
        }
        break
      }
      case 'text': {
        head('claude')
        // Um bloco que chegou em pedaços continua no mesmo parágrafo.
        const at = texts.get(event.blockId)
        if (at !== undefined) out[at] += event.delta
        else {
          out.push('')
          texts.set(event.blockId, out.length)
          out.push(event.delta)
        }
        break
      }
      case 'tool-start':
      case 'tool-input':
        tools.set(event.id, {
          name: event.name,
          input: 'input' in event ? event.input : tools.get(event.id)?.input
        })
        break
      case 'tool-result': {
        const tool = tools.get(event.id)
        if (!tool) break
        head('claude')
        out.push(
          '',
          quote(`🔧 ${toolSummary(tool.name, tool.input)}${event.isError ? t(' — erro') : ''}`)
        )
        break
      }
      case 'permission-request':
        tools.set(event.id, { name: event.toolName, input: event.input })
        break
      case 'permission-resolved': {
        const tool = tools.get(event.id)
        if (!tool) break
        head('claude')
        out.push(
          '',
          quote(
            t('Pedido: {v1} — {v2}', {
              v1: toolSummary(tool.name, tool.input),
              v2: DECISIONS[event.decision] ?? event.decision
            })
          )
        )
        break
      }
      case 'notice':
        out.push('', quote(`_${line(event.text, 400)}_`))
        break
      case 'compacted':
        out.push('', t('_(a conversa foi compactada aqui)_'))
        break
    }
  }
  return (
    out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  )
}

/** Um nome de arquivo a partir do título. */
export function exportFileName(title: string): string {
  const name = title
    .normalize('NFC')
    .replace(/[/\\:*?"<>|]/g, ' ')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  return `${name || t('Conversa')}.md`
}
