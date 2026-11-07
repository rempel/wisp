// O que a página do celular mostra de uma conversa (Fase 54): os eventos dela viram itens com um
// número fixo (a posição do evento que o começou), para a página redesenhar só o que mudou. As
// mensagens (com as miniaturas dos anexos), as respostas (o texto inteiro do bloco, em Markdown,
// e o que ainda está sendo escrito), cada ferramenta com o passo, o resultado e o diff, os
// pedidos de permissão e as perguntas do Claude (com o que é preciso para responder pelo
// celular), os avisos e o fim de uma resposta que parou ou deu erro. E a linha da atividade de
// agora ("Rodar npm test").

import { createHash } from 'crypto'
import { applyRewinds } from './history'
import { QUESTION_TOOL } from './questions'
import { summarize } from './phone'
import type { ChatEvent, PermissionDecision } from '../shared/ipc'
import { t } from '../shared/i18n'
import { clip, field, stepLabel, toolLabel } from '../shared/steps'

const PLAN_TOOL = 'ExitPlanMode'
const TRUST_TOOL = 'wisp_trust_folder'

export type RemoteStatus = 'running' | 'done' | 'error' | 'waiting' | 'allowed' | 'denied'

/** Uma pergunta do Claude (AskUserQuestion), como a página mostra. */
export interface RemoteQuestion {
  question: string
  header?: string
  multiSelect: boolean
  options: { label: string; description?: string }[]
}

/** Um item da conversa, como a página mostra. */
export interface RemoteItem {
  id: number
  kind: 'user' | 'assistant' | 'tool' | 'permission' | 'question' | 'notice' | 'end'
  text: string
  /** O resumo da ferramenta (o comando, o arquivo), ou o nível de um aviso. */
  detail?: string
  status?: RemoteStatus
  /** O que a ferramenta devolveu (cortado). */
  output?: string
  /** As linhas do diff de uma edição ('+', '-' ou ' ' na frente), cortadas. */
  diff?: string[]
  /** Os anexos de uma mensagem: o nome e a miniatura, quando é imagem. */
  attachments?: { name: string; thumbnail?: string }[]
  /** Um pedido: o id (para responder), o que está em jogo e como responder. */
  request?: string
  body?: string
  /** 'plan': o card do plano; 'trust': confiar na pasta; sem o campo, Permitir e Negar. */
  variant?: 'plan' | 'trust'
  /** O texto do "Permitir sempre", ou nada quando o pedido não oferece. */
  always?: string
  /** Como o pedido acabou (o texto do PC: "Permitido nesta conversa", "Plano aprovado"…). */
  result?: string
  questions?: RemoteQuestion[]
  answers?: Record<string, string>
  /** A mensagem foi falada (Fase 9). */
  voice?: boolean
}

const MAX_ITEMS = 300
const MAX_OUTPUT = 4000
const MAX_DIFF = 160
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

/** As perguntas de um AskUserQuestion (sem opções também: a resposta é escrita). */
export function remoteQuestions(input: unknown): RemoteQuestion[] | null {
  const list = (input as { questions?: unknown } | null)?.questions
  if (!Array.isArray(list) || !list.length) return null
  const questions: RemoteQuestion[] = []
  for (const item of list.slice(0, 6)) {
    const entry = (item ?? {}) as Record<string, unknown>
    if (typeof entry.question !== 'string' || !entry.question) return null
    const options = Array.isArray(entry.options)
      ? entry.options
          .map((option) => (option ?? {}) as Record<string, unknown>)
          .filter((option) => typeof option.label === 'string' && option.label)
          .slice(0, 8)
          .map((option) => ({
            label: clip(option.label as string, 120),
            ...(typeof option.description === 'string' && option.description
              ? { description: clip(option.description, 300) }
              : {})
          }))
      : []
    questions.push({
      question: clip(entry.question, 500),
      ...(typeof entry.header === 'string' && entry.header
        ? { header: clip(entry.header, 40) }
        : {}),
      multiSelect: entry.multiSelect === true,
      options
    })
  }
  return questions
}

/** O que está em jogo num pedido, por extenso: o comando, o trecho editado, o arquivo novo. */
function requestBody(name: string, input: unknown): string {
  switch (name) {
    case 'Bash':
      return clip(field(input, 'command'), 3000)
    case 'Edit': {
      const old = field(input, 'old_string')
      const next = field(input, 'new_string')
      const lines = [
        field(input, 'file_path'),
        ...old.split('\n').map((line) => `- ${line}`),
        ...next.split('\n').map((line) => `+ ${line}`)
      ]
      return clip(lines.slice(0, 80).join('\n'), 3000)
    }
    case 'Write':
      return clip(
        [field(input, 'file_path'), ...field(input, 'content').split('\n').slice(0, 40)].join('\n'),
        3000
      )
    case 'MultiEdit':
    case 'NotebookEdit':
      return field(input, 'file_path') || field(input, 'notebook_path')
    case 'WebFetch':
      return field(input, 'url')
    case TRUST_TOOL: {
      const items = (input as { items?: unknown } | null)?.items
      return [
        field(input, 'path'),
        t(
          'As configurações do Claude Code desta pasta rodam comandos ou liberam ferramentas sozinhas, sem passar pelos cards:'
        ),
        ...(Array.isArray(items) ? items.map((item) => `• ${String(item)}`) : []),
        t('Confie só se você conhece este projeto. Vale até esses arquivos mudarem.')
      ].join('\n')
    }
    default: {
      const summary = toolSummary(input)
      return summary || clip(JSON.stringify(input ?? {}), 600)
    }
  }
}

/** O texto do "Permitir sempre" de um pedido, como no card do computador. */
function alwaysLabel(event: Extract<ChatEvent, { type: 'permission-request' }>): string {
  const scope = t('conversa')
  if (event.always === 'site' && event.site)
    return t('Permitir em {site} nesta {scope}', { site: event.site, scope })
  if (event.toolName === 'Bash') {
    return event.scope && !event.exact
      ? t('Permitir “{command}” sempre nesta {scope}', { command: event.scope, scope })
      : t('Permitir este comando sempre nesta {scope}', { scope })
  }
  return t('Permitir sempre nesta {scope}', { scope })
}

/** Como o pedido acabou, nas palavras do card do computador. */
function resultText(
  variant: RemoteItem['variant'],
  decision: PermissionDecision | 'answered' | 'cancelled'
): string {
  if (variant === 'plan' && decision === 'allow')
    return t('Plano aprovado: o Claude pede antes de cada ação')
  if (variant === 'plan' && decision === 'deny') return t('Continuando o planejamento')
  if (variant === 'trust')
    return decision === 'allow' ? t('Pasta confiável') : t('Não confiei na pasta')
  const texts: Record<string, string> = {
    allow: t('Permitido'),
    'allow-always': t('Permitido nesta conversa'),
    deny: t('Negado'),
    'allow-edits': t('Plano aprovado, com as edições liberadas'),
    'allow-auto': t('Plano aprovado, no modo Automático'),
    answered: t('Respondido'),
    cancelled: t('Cancelado')
  }
  return texts[decision] ?? decision
}

function permissionItem(
  event: Extract<ChatEvent, { type: 'permission-request' }>,
  id: number
): RemoteItem {
  if (event.toolName === QUESTION_TOOL) {
    const questions = remoteQuestions(event.input) ?? []
    return {
      id,
      kind: 'question',
      text: t('O Claude tem uma pergunta'),
      request: event.id,
      status: 'waiting',
      questions
    }
  }
  const variant =
    event.toolName === PLAN_TOOL ? 'plan' : event.toolName === TRUST_TOOL ? 'trust' : undefined
  const title =
    variant === 'trust'
      ? t('Confiar nesta pasta?')
      : (summarize(event.toolName, event.input)?.title ?? toolLabel(event.toolName))
  return {
    id,
    kind: 'permission',
    text: title,
    detail: toolName(event.toolName),
    request: event.id,
    status: 'waiting',
    body:
      variant === 'plan'
        ? clip(field(event.input, 'plan'), 20_000)
        : requestBody(event.toolName, event.input),
    ...(variant ? { variant } : {}),
    ...(!variant && event.always !== 'none' ? { always: alwaysLabel(event) } : {})
  }
}

export interface RemoteView {
  items: RemoteItem[]
  /** O que o Claude está fazendo agora (a última ferramenta sem resultado), ou null. */
  activity: string | null
}

/**
 * Os itens de uma conversa. `pending`: o texto da resposta que o histórico ainda está juntando
 * (aparece como se já tivesse sido gravado, e a página o vê crescer).
 */
export function remoteView(
  events: ChatEvent[],
  pending: { blockId: string; delta: string } | null = null
): RemoteView {
  const items: RemoteItem[] = []
  const tools = new Map<string, RemoteItem>()
  const permissions = new Map<string, RemoteItem>()
  let text: { block: string; item: RemoteItem } | null = null
  const all = pending
    ? [...applyRewinds(events), { type: 'text' as const, ...pending }]
    : applyRewinds(events)
  all.forEach((event, index) => {
    if (event.type !== 'text') text = null
    switch (event.type) {
      case 'user':
        items.push({
          id: index,
          kind: 'user',
          text: event.text,
          ...(event.voice ? { voice: true } : {}),
          ...(event.attachments.length
            ? {
                attachments: event.attachments.map((attachment) => ({
                  name: attachment.name,
                  ...(attachment.thumbnail ? { thumbnail: attachment.thumbnail } : {})
                }))
              }
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
        if (!item) return
        const summary = toolSummary(event.input)
        if (summary) item.detail = summary
        const step = stepLabel(event.name, event.input)
        if (step) item.text = step
        return
      }
      case 'tool-result': {
        const item = tools.get(event.id)
        if (!item) return
        item.status = event.isError ? 'error' : 'done'
        if (event.output) item.output = event.output.slice(0, MAX_OUTPUT)
        if (event.diff) {
          const lines = event.diff.hunks.flatMap((hunk) => hunk.lines)
          item.diff = lines.slice(0, MAX_DIFF).map((line) => line.slice(0, 400))
          item.detail = `${item.detail ?? ''} (+${event.diff.added} −${event.diff.removed})`.trim()
        }
        return
      }
      case 'permission-request': {
        const item = permissionItem(event, index)
        permissions.set(event.id, item)
        items.push(item)
        return
      }
      case 'permission-resolved': {
        const item = permissions.get(event.id)
        if (!item) return
        item.status =
          event.decision === 'deny' || event.decision === 'cancelled' ? 'denied' : 'allowed'
        item.result = resultText(item.variant, event.decision)
        if (event.answers) item.answers = event.answers
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
    activity: running ? running.text : null
  }
}

/** Uma marca do que a conversa tem agora: igual, a página não precisa de nada novo. */
export function viewVersion(view: RemoteView, busy: boolean, extra = ''): string {
  return createHash('sha1')
    .update(JSON.stringify(view))
    .update(busy ? '1' : '0')
    .update(extra)
    .digest('base64url')
    .slice(0, 16)
}
