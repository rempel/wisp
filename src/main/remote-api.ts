// O que a página do celular pode fazer (Fase 54), atrás do pareamento (o remote-chat.ts confere a
// chave antes de chegar aqui): o mesmo que o painel do computador, pelos mesmos caminhos. Ler as
// conversas e mandar (com anexos), parar, editar a última mensagem, trocar o modelo, o modo e o
// provedor, compactar, recomeçar e fechar a aba, responder aos cards de permissão e às perguntas
// do Claude, abrir uma conversa nova (numa pasta de projeto) e as do histórico, e os prompts
// salvos. Cada troca vai também para o painel, que acompanha.

import { randomBytes } from 'crypto'
import { basename, extname } from 'path'
import type { ChatTabs } from './chat-tabs'
import { previewOf } from './chat-conversation'
import { getConfig, MODEL_NAME, updateConfig } from './config'
import type { Conversation } from './conversation'
import { remoteView, viewVersion } from './remote-view'
import type { History } from './history'
import { savePasted, saveIncoming, isThumbnail } from './attachments'
import { MODEL_CHOICES, PERMISSION_MODES } from '../shared/ipc'
import type {
  ChatEvent,
  ConversationSummary,
  FolderChoice,
  OutgoingAttachment,
  PermissionDecision,
  PermissionMode
} from '../shared/ipc'
import { t } from '../shared/i18n'

const MAX_TEXT = 20_000
const MAX_FILES = 10
const MAX_HISTORY = 60
const DECISIONS: PermissionDecision[] = [
  'allow',
  'allow-always',
  'deny',
  'allow-edits',
  'allow-auto'
]
/** Os arquivos que o celular pode mandar além das imagens: documentos e texto. */
const DOCUMENTS: Record<string, string> = {
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'application/json': 'json'
}

/** O que a página do celular precisa do resto do Wisp. */
export interface RemoteContext {
  tabs: ChatTabs
  /** O histórico (listar e buscar). */
  store: Pick<History, 'list'>
  /** Busca nas conversas guardadas (o mesmo índice do painel). */
  search(query: string, list: ConversationSummary[]): ConversationSummary[]
  /** Os projetos que dá para abrir numa conversa nova. */
  projects(): FolderChoice[]
  /** Uma conversa nova numa aba (numa pasta, ou no espaço do Wisp). */
  openFolder(folder: string | null): Conversation | null
  /** Abre uma conversa guardada numa aba (ou mostra a aba dela). */
  openSaved(id: string): Conversation | null
  /** Manda um evento de uma conversa para o painel. */
  toPage(conversation: string, event: ChatEvent): void
  /** O texto de um prompt salvo, já preenchido para a pasta da conversa (null: não existe). */
  promptText(name: string, folder: string | null): string | null
}

export interface ApiResult {
  status: number
  body: unknown
}

const ok = (body: unknown = { ok: true }): ApiResult => ({ status: 200, body })
const fail = (status: number, error: string): ApiResult => ({ status, body: { error } })
const str = (value: unknown, max = MAX_TEXT): string =>
  typeof value === 'string' ? value.slice(0, max) : ''

/** Uma conversa aberta, para a página: o que o rodapé do painel mostra. */
export function conversationInfo(conversation: Conversation): Record<string, unknown> {
  const model = conversation.session.modelEvent()
  const context = conversation.session.contextEvent()?.context ?? null
  return {
    id: conversation.id,
    title: conversation.title ?? t('Conversa nova'),
    busy: conversation.busy,
    waiting: conversation.pendingCount() > 0,
    terminal: conversation.view === 'terminal',
    mode: conversation.mode,
    provider: conversation.provider,
    model: model.choice,
    activeModel: model.active,
    folder: conversation.folder ? basename(conversation.folder) : null,
    context: context && context.window ? Math.round((context.used / context.window) * 100) : null
  }
}

/** A API do celular: um pedido (já autorizado) vira a resposta. */
export class RemoteApi {
  /** Os anexos que o celular mandou: o token que a página guarda e o arquivo no computador. */
  private readonly uploads = new Map<string, OutgoingAttachment>()

  constructor(private readonly ctx: RemoteContext) {}

  get(path: string, params: URLSearchParams): ApiResult {
    const { tabs } = this.ctx
    if (path === '/api/state') {
      // A conversa em foco no computador: a página a acompanha (até você escolher outra).
      const state = tabs.state()
      const focused = tabs.conversationById(state.panes[state.focused])?.id ?? null
      return ok({
        conversations: tabs.conversations().map(conversationInfo),
        focused,
        full: tabs.full,
        models: MODEL_CHOICES,
        openrouterModel: getConfig().openrouterModel,
        projects: this.ctx.projects().map((project) => ({
          name: project.name,
          display: project.display,
          path: project.path
        })),
        prompts: getConfig().prompts.map((prompt) => prompt.name)
      })
    }
    if (path === '/api/messages') {
      const conversation = tabs.conversationById(params.get('c') ?? '')
      if (!conversation) return fail(404, t('Essa conversa não está aberta.'))
      const view = remoteView(conversation.history.events(), conversation.history.pendingText())
      // Um card que ficou no histórico sem dono (o app reabriu) não espera mais nada.
      for (const item of view.items) {
        if (item.status === 'waiting' && item.request && !conversation.owns(item.request)) {
          item.status = 'denied'
          item.result = t('Cancelado')
        }
      }
      const version = viewVersion(view, conversation.busy)
      // Nada mudou desde a última leitura: a página não redesenha nada.
      if (params.get('v') === version) return ok({ v: version, same: true })
      return ok({
        v: version,
        busy: conversation.busy,
        activity: conversation.busy ? view.activity : null,
        items: view.items
      })
    }
    if (path === '/api/history') {
      const open = new Set(tabs.conversations().flatMap((c) => (c.historyId ? [c.historyId] : [])))
      const all = this.ctx.store.list(open)
      const query = str(params.get('q'), 200).trim()
      const list = query ? this.ctx.search(query, all) : all
      return ok({
        items: list.slice(0, MAX_HISTORY).map((item) => ({
          id: item.id,
          title: item.title,
          updatedAt: item.updatedAt,
          project: item.project ?? null,
          current: item.current
        }))
      })
    }
    return fail(404, 'not found')
  }

  /** Um anexo que chegou do celular (os bytes crus): guarda e devolve o token. */
  async upload(data: Uint8Array, type: string, name: string): Promise<ApiResult> {
    try {
      let saved: { path: string; name: string }
      if (type.startsWith('image/')) saved = await savePasted(data, type)
      else {
        const ext = DOCUMENTS[type] ?? DOCUMENTS[`text/${extname(name).slice(1)}`]
        if (!ext)
          return fail(415, t('Pelo celular dá para mandar imagens, PDFs e arquivos de texto.'))
        saved = await saveIncoming(data, 'celular', ext)
      }
      const token = randomBytes(12).toString('base64url')
      this.uploads.set(token, { path: saved.path })
      return ok({ token, name: saved.name })
    } catch (err) {
      return fail(400, (err as Error).message)
    }
  }

  post(path: string, body: Record<string, unknown> | null): ApiResult {
    const { tabs } = this.ctx
    if (path === '/api/new') {
      const folder = str(body?.folder, 4096) || null
      if (folder && !this.ctx.projects().some((project) => project.path === folder))
        return fail(403, t('Essa pasta não está nas suas pastas de projetos.'))
      if (tabs.full && !tabs.emptyFocused())
        return fail(409, t('As abas estão cheias: feche uma no computador.'))
      const conversation = this.ctx.openFolder(folder)
      return conversation
        ? ok({ c: conversation.id })
        : fail(409, t('A conversa não pode receber agora.'))
    }
    if (path === '/api/history/open') {
      const conversation = this.ctx.openSaved(str(body?.id, 200))
      return conversation
        ? ok({ c: conversation.id })
        : fail(409, t('Não deu para abrir essa conversa: feche uma aba no computador.'))
    }
    if (path === '/api/permission') {
      const id = str(body?.id, 200)
      const decision = body?.decision as PermissionDecision
      if (!DECISIONS.includes(decision)) return fail(400, t('pedido inválido'))
      const owner = tabs.conversations().find((conversation) => conversation.owns(id))
      return owner?.answer(id, decision) ? ok() : fail(410, t('Esse pedido já foi respondido.'))
    }
    if (path === '/api/answer') {
      const id = str(body?.id, 200)
      const owner = tabs.conversations().find((conversation) => conversation.owns(id))
      if (!owner) return fail(410, t('Esse pedido já foi respondido.'))
      const answers = body?.answers === null ? null : body?.answers
      owner.answerQuestion(id, answers)
      return owner.owns(id) ? fail(400, t('Responda a todas as perguntas.')) : ok()
    }
    if (path === '/api/prompt') {
      const conversation = tabs.conversationById(str(body?.c, 100))
      const text = this.ctx.promptText(str(body?.name, 100), conversation?.folder ?? null)
      return text === null ? fail(404, 'not found') : ok({ text })
    }
    const conversation = tabs.conversationById(str(body?.c, 100))
    if (!conversation) return fail(404, t('Essa conversa não está aberta.'))
    switch (path) {
      case '/api/send':
        return this.send(conversation, body, false)
      case '/api/edit':
        return this.send(conversation, body, true)
      case '/api/stop':
        conversation.stop()
        return ok()
      case '/api/compact':
        conversation.compact(str(body?.instructions, 500))
        return ok()
      case '/api/clear':
        if (conversation.busy) return fail(409, t('Espere a resposta terminar.'))
        conversation.reset()
        return ok()
      case '/api/close':
        tabs.close(conversation.id)
        return ok()
      case '/api/view':
        if (body?.view !== 'chat' && body?.view !== 'terminal')
          return fail(400, t('pedido inválido'))
        void conversation.setView(body.view)
        return ok()
      case '/api/mode': {
        const mode = body?.mode as PermissionMode
        if (!PERMISSION_MODES.includes(mode)) return fail(400, t('pedido inválido'))
        conversation.setMode(mode)
        return ok()
      }
      case '/api/provider':
        if (body?.provider !== 'subscription' && body?.provider !== 'openrouter')
          return fail(400, t('pedido inválido'))
        conversation.setProvider(body.provider)
        return ok()
      case '/api/model':
        return this.model(conversation, body?.model)
      default:
        return fail(404, 'not found')
    }
  }

  /** O mesmo que a pílula do modelo do painel: vale para a conversa e vira o padrão. */
  private model(conversation: Conversation, choice: unknown): ApiResult {
    if (conversation.provider === 'openrouter') {
      if (typeof choice !== 'string' || !MODEL_NAME.test(choice))
        return fail(400, t('pedido inválido'))
      updateConfig({ openrouterModel: choice })
      conversation.setModel(choice)
      return ok()
    }
    if (choice !== null && !MODEL_CHOICES.includes(choice as (typeof MODEL_CHOICES)[number]))
      return fail(400, t('pedido inválido'))
    updateConfig({ model: choice as string | null })
    conversation.setModel(choice as string | null)
    return ok()
  }

  private send(
    conversation: Conversation,
    body: Record<string, unknown> | null,
    edit: boolean
  ): ApiResult {
    const text = str(body?.text).trim()
    const files = this.files(body?.files)
    if (!text && !files.length) return fail(400, t('pedido inválido'))
    if (conversation.view === 'terminal')
      return fail(403, t('Esta conversa está no modo terminal: use o computador.'))
    // Os comandos que o painel atende (os outros vão para o Claude Code como mensagem).
    const command = /^\/(compact|clear)(?:\s+([\s\S]*))?$/.exec(text)
    if (command && !files.length && !edit) {
      if (command[1] === 'compact') conversation.compact((command[2] ?? '').trim())
      else if (conversation.busy) return fail(409, t('Espere a resposta terminar.'))
      else conversation.reset()
      return ok()
    }
    const previews = files.map(previewOf)
    if (edit) {
      // A resposta da última mensagem sai; o painel tira a velha e mostra a nova.
      if (!conversation.editLast(text, files, previewOf))
        return fail(409, t('Não deu para editar a última mensagem agora.'))
      this.ctx.toPage(conversation.id, { type: 'rewind' })
      conversation.showUser(text, false, previews)
      return ok()
    }
    if (!conversation.canSend) return fail(409, t('A conversa não pode receber agora.'))
    conversation.showUser(text, false, previews)
    return conversation.send(text, files, previewOf)
      ? ok()
      : fail(409, t('A conversa não pode receber agora.'))
  }

  /** Os anexos de uma mensagem: só os que vieram do celular, com a miniatura que a página fez. */
  private files(value: unknown): OutgoingAttachment[] {
    if (!Array.isArray(value)) return []
    return value.slice(0, MAX_FILES).flatMap((item: Record<string, unknown> | null) => {
      const saved = this.uploads.get(str(item?.token, 100))
      if (!saved) return []
      return [isThumbnail(item?.thumbnail) ? { ...saved, thumbnail: item.thumbnail } : saved]
    })
  }
}
