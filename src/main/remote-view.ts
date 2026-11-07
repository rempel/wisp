// O que a página do celular mostra de uma conversa (Fase 54): os eventos dela viram itens com um
// número fixo (a posição do evento que o começou), para a página redesenhar só o que mudou. As
// mensagens, as respostas (o texto inteiro do bloco, em Markdown), cada ferramenta com o resumo e
// o resultado, os pedidos que esperam você no computador, os avisos e o fim de uma resposta que
// parou ou deu erro. E a linha da atividade de agora ("Bash: npm test").

import { applyRewinds } from './history'
import type { ChatEvent } from '../shared/ipc'
import { t } from '../shared/i18n'

export type RemoteStatus = 'running' | 'done' | 'error' | 'waiting' | 'allowed' | 'denied'

/** Um item da conversa, como a página mostra. */
export interface RemoteItem {
  id: number
  kind: 'user' | 'assistant' | 'tool' | 'permission' | 'notice' | 'end'
  text: string
  /** O resumo da ferramenta (o comando, o arquivo), ou o nível de um aviso. */
  detail?: string
  status?: RemoteStatus
  /** O que a ferramenta devolveu (cortado). */
  output?: string
  /** Os nomes dos anexos de uma mensagem. */
  attachments?: string[]
}

const MAX_ITEMS = 300
const MAX_OUTPUT = 4000
const SUMMARY_KEYS = ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description']

/** O resumo de uma chamada: o campo mais útil da entrada dela. */
export function toolSummary(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const fields = input as Record<string, unknown>
  const key = SUMMARY_KEYS.find((name) => typeof fields[name] === 'string' && fields[name])
  return key ? String(fields[key]).slice(0, 300) : ''
}

/** O nome que a página mostra de uma ferramenta (as do MCP sem o prefixo). */
export const toolName = (name: string): string =>
  name.startsWith('mcp__') ? name.split('__').slice(2).join(' ') || name : name

export interface RemoteView {
  items: RemoteItem[]
  /** O que o Claude está fazendo agora (a última ferramenta sem resultado), ou null. */
  activity: string | null
}

export function remoteView(events: ChatEvent[]): RemoteView {
  const items: RemoteItem[] = []
  const tools = new Map<string, RemoteItem>()
  const permissions = new Map<string, RemoteItem>()
  let text: { block: string; item: RemoteItem } | null = null
  applyRewinds(events).forEach((event, index) => {
    if (event.type !== 'text') text = null
    switch (event.type) {
      case 'user':
        items.push({
          id: index,
          kind: 'user',
          text: event.text,
          ...(event.attachments.length
            ? { attachments: event.attachments.map((attachment) => attachment.name) }
            : {})
        })
        return
      case 'text': {
        // O mesmo bloco pode vir em pedaços (o histórico grava quando o painel pede): junta.
        if (text && text.block === event.blockId) {
          text.item.text += event.delta
          return
        }
        const item: RemoteItem = { id: index, kind: 'assistant', text: event.delta }
        text = { block: event.blockId, item }
        items.push(item)
        return
      }
      case 'tool-start': {
        const item: RemoteItem = {
          id: index,
          kind: 'tool',
          text: toolName(event.name),
          status: 'running'
        }
        tools.set(event.id, item)
        items.push(item)
        return
      }
      case 'tool-input': {
        const item = tools.get(event.id)
        const summary = toolSummary(event.input)
        if (item && summary) item.detail = summary
        return
      }
      case 'tool-result': {
        const item = tools.get(event.id)
        if (!item) return
        item.status = event.isError ? 'error' : 'done'
        if (event.output) item.output = event.output.slice(0, MAX_OUTPUT)
        return
      }
      case 'permission-request': {
        const item: RemoteItem = {
          id: index,
          kind: 'permission',
          text: toolName(event.toolName),
          detail: toolSummary(event.input),
          status: 'waiting'
        }
        permissions.set(event.id, item)
        items.push(item)
        return
      }
      case 'permission-resolved': {
        const item = permissions.get(event.id)
        if (item)
          item.status =
            event.decision === 'deny' || event.decision === 'cancelled' ? 'denied' : 'allowed'
        return
      }
      case 'notice':
        items.push({ id: index, kind: 'notice', text: event.text, detail: event.level })
        return
      case 'turn-end':
        // As ferramentas que não acabaram (a resposta parou) não ficam "rodando".
        for (const item of tools.values()) if (item.status === 'running') item.status = 'error'
        tools.clear()
        if (event.outcome === 'stopped')
          items.push({ id: index, kind: 'end', text: t('Resposta parada.') })
        else if (event.outcome !== 'done') {
          items.push({ id: index, kind: 'end', text: t('A resposta parou com um erro.') })
        }
        return
      case 'compacted':
        items.push({ id: index, kind: 'notice', text: t('Conversa compactada.'), detail: 'info' })
        return
      default:
        return
    }
  })
  const running = [...tools.values()].reverse().find((item) => item.status === 'running')
  return {
    items: items.slice(-MAX_ITEMS),
    activity: running
      ? running.detail
        ? `${running.text}: ${running.detail}`
        : running.text
      : null
  }
}

/** Uma marca do que a conversa tem agora: igual, a página não precisa de nada novo. */
export function viewVersion(view: RemoteView, busy: boolean): string {
  let size = 0
  for (const item of view.items)
    size += item.text.length + (item.output?.length ?? 0) + (item.status?.length ?? 0)
  const last = view.items.at(-1)
  return `${view.items.length}.${size}.${last?.id ?? 0}.${busy ? 1 : 0}.${view.activity ?? ''}`
}
