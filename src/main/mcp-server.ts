import { createServer } from 'http'
import type { IncomingMessage, ServerResponse } from 'http'
import { randomBytes, timingSafeEqual } from 'crypto'
import { chmodSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs'
import type { AddressInfo } from 'net'
import { join } from 'path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { listApps, listProjects, openApp, openProject, openTerminalIn, openUrl } from './desktop'
import type { Outcome } from './desktop'
import { runtimeDir } from './paths'
import { describeTrack } from './media'
import { DANCES, EMOTIONS } from '../shared/emotions'
import type { Dance, Emotion } from '../shared/emotions'
import type { Media, MediaAction } from './media'
import { describeIn, describeWhen, parseWhen } from './reminders'
import type { Reminder } from './reminders'
import { activateWindow, describeWindow, findWindows, listWindows } from './windows'

/** Um pedido de permissão que o Claude Code faz pelo --permission-prompt-tool. */
export interface ApprovalRequest {
  toolName: string
  input: unknown
  toolUseId?: string
  /** A conversa (aba) de onde veio o pedido: cada processo do Claude Code tem o seu endereço. */
  conversation?: string
  /** Disparado se o Claude Code desistir do pedido (turno interrompido, conexão fechada). */
  signal?: AbortSignal
}

/** A decisão. `updatedInput` troca a entrada da ferramenta (as respostas de uma pergunta). */
export type Approval =
  | {
      allow: true
      updatedInput?: Record<string, unknown>
      /**
       * Mudanças nas permissões da sessão do Claude Code, como `setMode` (aprovar o plano e
       * passar para Aceitar edições).
       */
      updatedPermissions?: Record<string, unknown>[]
    }
  | { allow: false; message: string }

/** Um print pronto para o Claude: a imagem em base64 e o tamanho. */
export interface ScreenshotImage {
  data: string
  mimeType: string
  width: number
  height: number
  /** "tela 1 de 2", quando há mais de uma. */
  label?: string
}

export interface DesktopServerOptions {
  /** Mostra o card de permissão no chat e resolve quando o usuário decidir. */
  requestApproval(request: ApprovalRequest): Promise<Approval>
  notify(title: string, body: string): void
  /** Lidos a cada chamada, para valerem as mudanças no config.json. */
  projectRoots(): string[]
  editorCommand(): string
  /** O terminal do config.json (null: escolhe pelo desktop). */
  terminalCommand?(): string | null
  /** Os players de música (MPRIS); null sem D-Bus. */
  media?: () => Media | null
  /** Tira o print das telas, com o painel fora da frente. Lança um erro com o motivo. */
  screenshot?: () => Promise<ScreenshotImage[]>
  /** Os lembretes do app (Fase 9). */
  reminders?: {
    add(text: string, at: number): Reminder | { error: string }
    list(): Reminder[]
    cancel(id: string): Reminder | null
  }
  /** Os seus PRs no GitHub, em texto (Fase 13). */
  github?: () => Promise<string>
  /** Os compromissos da agenda, em texto: `days` dias a partir de hoje (ou de `from`, AAAA-MM-DD). */
  agenda?: (days: number, from?: string) => Promise<string>
  /** O resumo da semana em texto: a atual (até agora) ou a anterior. */
  weekly?: (which: 'atual' | 'anterior') => string
  /** Mostra uma emoção ou uma dança no mascote, por `seconds` segundos (Fase 27). */
  express?: (act: { emotion?: Emotion; dance?: Dance; seconds?: number }) => void
}

export interface DesktopServer {
  /**
   * O arquivo do --mcp-config de uma conversa (aba). Cada uma tem o seu endereço no servidor
   * (`/mcp/<conversa>`), para os pedidos de permissão chegarem à aba certa. Só o dono lê: ele tem
   * o token. É gravado de novo a cada chamada, com os servidores extras de agora.
   */
  configFor(conversation: string): string
  /** A conversa fechou: o arquivo dela sai. */
  releaseConfig(conversation: string): void
  /**
   * Outros servidores MCP nos arquivos (o navegador do Playwright). Vale para os próximos
   * processos do Claude Code, ou seja, a partir da próxima conversa.
   */
  setExtraServers(servers: Record<string, unknown>): void
  close(): void
}

/** Ids de conversa que podem ir no endereço e no nome do arquivo. */
const CONVERSATION_ID = /^[\w-]{1,64}$/

/**
 * Pede ao Claude Code para pôr a ferramenta direto no prompt. Sem isso ela fica atrás do
 * ToolSearch, e cada pedido gasta uma ida a mais ao modelo só para carregá-la.
 */
const ALWAYS_LOAD = { 'anthropic/alwaysLoad': true }

/** Limite do corpo de um pedido (as mensagens MCP aqui são pequenas). */
const MAX_BODY = 1024 * 1024

const text = (content: string): { content: { type: 'text'; text: string }[] } => ({
  content: [{ type: 'text', text: content }]
})

const outcome = (result: Outcome): ReturnType<typeof text> & { isError: boolean } => ({
  ...text(result.message),
  isError: !result.ok
})

/** As ferramentas da seção 6. As descrições são o que o Claude lê para decidir quando usá-las. */
function buildMcpServer(options: DesktopServerOptions, conversation?: string): McpServer {
  const server = new McpServer({ name: 'desktop', version: '1.0.0' })

  server.registerTool(
    'list_apps',
    {
      title: 'Listar apps',
      description:
        'Lista os apps instalados no desktop do usuário, com id e nome. Use antes de open_app ' +
        'para descobrir o id. `busca` filtra por nome, tipo ou palavra-chave (ex.: "firefox", ' +
        '"navegador", "planilha").',
      inputSchema: { busca: z.string().optional() },
      annotations: { readOnlyHint: true },
      _meta: ALWAYS_LOAD
    },
    async ({ busca }) => {
      const apps = listApps(busca)
      return text(apps.length ? JSON.stringify(apps) : 'Nenhum app encontrado.')
    }
  )

  server.registerTool(
    'open_app',
    {
      title: 'Abrir app',
      description: 'Abre um app instalado, pelo id que aparece em list_apps.',
      inputSchema: { id: z.string() },
      _meta: ALWAYS_LOAD
    },
    async ({ id }) => outcome(await openApp(id))
  )

  server.registerTool(
    'open_url',
    {
      title: 'Abrir link',
      description:
        'Abre um link http ou https no navegador padrão do usuário. Para pesquisar algo no ' +
        'navegador, monte a URL de busca (ex.: https://www.google.com/search?q=termo).',
      inputSchema: { url: z.string() },
      annotations: { openWorldHint: true },
      _meta: ALWAYS_LOAD
    },
    async ({ url }) => outcome(await openUrl(url))
  )

  server.registerTool(
    'list_projects',
    {
      title: 'Listar projetos',
      description:
        'Lista os projetos de código do usuário (repositórios git nas pastas de projetos), ' +
        'com nome e caminho. Use antes de open_project.',
      annotations: { readOnlyHint: true },
      _meta: ALWAYS_LOAD
    },
    async () => {
      const roots = options.projectRoots()
      const projects = listProjects(roots)
      return text(
        projects.length
          ? JSON.stringify(projects)
          : `Nenhum projeto (pasta com .git) encontrado em ${roots.join(', ')}.`
      )
    }
  )

  server.registerTool(
    'open_project',
    {
      title: 'Abrir projeto',
      description:
        'Abre um projeto no editor de código do usuário. `path` é o caminho completo que ' +
        'aparece em list_projects.',
      inputSchema: { path: z.string() },
      _meta: ALWAYS_LOAD
    },
    async ({ path }) =>
      outcome(await openProject(path, options.projectRoots(), options.editorCommand()))
  )

  server.registerTool(
    'open_terminal',
    {
      title: 'Abrir terminal',
      description:
        'Abre a janela de um terminal para o usuário trabalhar nela, numa pasta: a de um ' +
        'projeto (veja list_projects) ou outra dentro da pasta pessoal. Sem `path`, na pasta ' +
        'pessoal. Não roda comandos: para rodar um comando, use o Bash.',
      inputSchema: { path: z.string().optional() },
      _meta: ALWAYS_LOAD
    },
    async ({ path }) =>
      outcome(
        await openTerminalIn(path, options.projectRoots(), options.terminalCommand?.() ?? null)
      )
  )

  server.registerTool(
    'list_windows',
    {
      title: 'Janelas abertas',
      description:
        'Lista as janelas abertas (o app e o título), da mais à frente para a mais atrás. ' +
        'Funciona no KDE e no X11; no GNOME com Wayland o sistema não deixa.',
      annotations: { readOnlyHint: true },
      _meta: ALWAYS_LOAD
    },
    async () => {
      const windows = await listWindows()
      if ('error' in windows) return { ...text(windows.error), isError: true }
      return text(
        windows.length
          ? windows.map((window) => `- ${describeWindow(window)}`).join('\n')
          : 'Nenhuma janela de app aberta.'
      )
    }
  )

  server.registerTool(
    'focus_window',
    {
      title: 'Trazer janela para a frente',
      description:
        'Traz uma janela para a frente (e tira do minimizado). `janela` é o nome do app ' +
        '("Firefox", "Konsole") ou um pedaço do título. Funciona no KDE e no X11; no GNOME com ' +
        'Wayland o sistema não deixa.',
      inputSchema: { janela: z.string() },
      _meta: ALWAYS_LOAD
    },
    async ({ janela }) => {
      const windows = await listWindows()
      if ('error' in windows) return { ...text(windows.error), isError: true }
      const [target, ...others] = findWindows(windows, janela)
      if (!target) {
        const open = windows.map((window) => `- ${describeWindow(window)}`).join('\n')
        return {
          ...text(`Nenhuma janela bate com "${janela}".` + (open ? ` Abertas:\n${open}` : '')),
          isError: true
        }
      }
      if (!(await activateWindow(target))) {
        return {
          ...text(`O desktop não deixou trazer ${describeWindow(target)} para a frente.`),
          isError: true
        }
      }
      const more = others.length
        ? ` (há mais ${others.length} ${others.length === 1 ? 'janela parecida' : 'janelas parecidas'})`
        : ''
      return text(
        `Trouxe para a frente: ${describeWindow({ ...target, active: false, minimized: false })}${more}.`
      )
    }
  )

  server.registerTool(
    'notify',
    {
      title: 'Notificação',
      description:
        'Mostra uma notificação do sistema para o usuário, por exemplo quando uma tarefa ' +
        'demorada terminar.',
      inputSchema: { titulo: z.string(), texto: z.string() },
      _meta: ALWAYS_LOAD
    },
    async ({ titulo, texto }) => {
      options.notify(titulo.slice(0, 120), texto.slice(0, 500))
      return text('Notificação mostrada.')
    }
  )

  const screenshot = options.screenshot
  if (screenshot) {
    server.registerTool(
      'screenshot',
      {
        title: 'Print da tela',
        description:
          'Tira um print da tela do usuário e devolve a imagem (uma por monitor). Use quando ele ' +
          'perguntar sobre algo que está na tela ("o que é isso na minha tela?", "me ajuda com ' +
          'esse erro"). O painel do Wisp sai da frente durante o print. Cada print pede ' +
          'permissão ao usuário.',
        annotations: { readOnlyHint: true },
        _meta: ALWAYS_LOAD
      },
      async () => {
        let shots: ScreenshotImage[]
        try {
          shots = await screenshot()
        } catch (err) {
          return {
            ...text(`Não consegui tirar o print: ${(err as Error).message}.`),
            isError: true
          }
        }
        const sizes = shots
          .map((shot) => `${shot.label ? `${shot.label}, ` : ''}${shot.width}×${shot.height}`)
          .join('; ')
        const when = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        return {
          content: [
            ...shots.map((shot) => ({
              type: 'image' as const,
              data: shot.data,
              mimeType: shot.mimeType
            })),
            {
              type: 'text' as const,
              text:
                `Print da tela às ${when} (${sizes})` +
                (shots.length > 1 ? ', da esquerda para a direita.' : '.')
            }
          ]
        }
      }
    )
  }

  const reminders = options.reminders
  if (reminders) {
    server.registerTool(
      'set_reminder',
      {
        title: 'Marcar lembrete',
        description:
          'Marca um lembrete. Na hora, o Wisp mostra uma notificação e o mascote avisa, mesmo ' +
          'se o app tiver sido fechado e aberto no meio. Use `minutos` para "daqui a X ' +
          'minutos" ou `horario` para uma hora marcada, no fuso do usuário: "15:30" (hoje, ou ' +
          'amanhã se já passou) ou "2026-12-24 09:00". `texto` é o que aparece no aviso: curto, ' +
          'como uma ação ("Beber água").',
        inputSchema: {
          texto: z.string(),
          minutos: z.number().optional(),
          horario: z.string().optional()
        },
        _meta: ALWAYS_LOAD
      },
      async ({ texto, minutos, horario }) => {
        const at = parseWhen({ minutos, horario })
        if (typeof at !== 'number') return { ...text(at.error), isError: true }
        const added = reminders.add(texto, at)
        if ('error' in added) return { ...text(added.error), isError: true }
        return text(
          `Lembrete marcado (id ${added.id}): "${added.text}", ${describeWhen(added.at)} ` +
            `(${describeIn(added.at)}).`
        )
      }
    )

    server.registerTool(
      'list_reminders',
      {
        title: 'Listar lembretes',
        description: 'Lista os lembretes marcados, com id, texto e horário, e a hora de agora.',
        annotations: { readOnlyHint: true },
        _meta: ALWAYS_LOAD
      },
      async () => {
        const now = Date.now()
        const lines = reminders
          .list()
          .map((r) => `- ${r.id}: "${r.text}", ${describeWhen(r.at)} (${describeIn(r.at, now)})`)
        return text(
          `Agora: ${describeWhen(now)}.\n` +
            (lines.length ? lines.join('\n') : 'Nenhum lembrete marcado.')
        )
      }
    )

    server.registerTool(
      'cancel_reminder',
      {
        title: 'Cancelar lembrete',
        description: 'Cancela um lembrete pelo id (veja list_reminders).',
        inputSchema: { id: z.string() },
        _meta: ALWAYS_LOAD
      },
      async ({ id }) => {
        const removed = reminders.cancel(id)
        return removed
          ? text(`Cancelei o lembrete "${removed.text}" (${describeWhen(removed.at)}).`)
          : { ...text(`Não achei o lembrete "${id}". Use list_reminders.`), isError: true }
      }
    )
  }

  const github = options.github
  if (github) {
    server.registerTool(
      'github_status',
      {
        title: 'Meus PRs no GitHub',
        description:
          'Os PRs abertos do usuário no GitHub (CI passou, falhou ou rodando; aprovado, ' +
          'pediram mudanças ou esperando revisão) e os PRs em que pedem a revisão dele, com os ' +
          'links. Lido pelo gh (GitHub CLI) do usuário. Use para "como estão meus PRs?".',
        annotations: { readOnlyHint: true },
        _meta: ALWAYS_LOAD
      },
      async () => text(await github())
    )
  }

  const weekly = options.weekly
  if (weekly) {
    server.registerTool(
      'weekly_summary',
      {
        title: 'Resumo da semana',
        description:
          'O resumo da semana do usuário no Wisp, comparado com a anterior: conversas, tempo do ' +
          'Claude trabalhando, linhas editadas, permissões aprovadas e negadas, ferramentas e ' +
          'apps mais usados, mensagens no Claude Code do terminal (por projeto) e lembretes. Só ' +
          'contagens, nada do conteúdo. `semana`: "atual" (padrão, até agora) ou "anterior".',
        inputSchema: { semana: z.enum(['atual', 'anterior']).optional() },
        annotations: { readOnlyHint: true },
        _meta: ALWAYS_LOAD
      },
      async ({ semana }) => text(weekly(semana ?? 'atual'))
    )
  }

  const agenda = options.agenda
  if (agenda) {
    server.registerTool(
      'list_events',
      {
        title: 'Compromissos da agenda',
        description:
          'Os compromissos da agenda do usuário (as agendas do GNOME e arquivos .ics), por dia, ' +
          'com a hora, o título, a agenda e o local. `dias`: quantos dias a partir de hoje ' +
          '(padrão 2: hoje e amanhã; até 31). `a_partir_de`: outro dia para começar, ' +
          '"AAAA-MM-DD". Só leitura.',
        inputSchema: {
          dias: z.number().int().min(1).max(31).optional(),
          a_partir_de: z.string().optional()
        },
        annotations: { readOnlyHint: true },
        _meta: ALWAYS_LOAD
      },
      async ({ dias, a_partir_de }) => text(await agenda(dias ?? 2, a_partir_de))
    )
  }

  const media = options.media
  if (media) {
    const noMedia = (): ReturnType<typeof text> & { isError: boolean } => ({
      ...text('Sem acesso ao D-Bus da sessão: não dá para falar com os players.'),
      isError: true
    })

    server.registerTool(
      'media_status',
      {
        title: 'O que está tocando',
        description:
          'Lista os players de música e vídeo abertos (Spotify, Firefox, VLC…), com o que cada ' +
          'um está tocando, se está pausado e o volume.',
        annotations: { readOnlyHint: true },
        _meta: ALWAYS_LOAD
      },
      async () => {
        const players = await media()?.players()
        if (!players) return noMedia()
        if (!players.length) return text('Nenhum player de música ou vídeo aberto.')
        return text(
          players
            .map((player) => {
              const state =
                player.status === 'Playing'
                  ? 'tocando'
                  : player.status === 'Paused'
                    ? 'pausado'
                    : 'parado'
              const track = describeTrack(player)
              const volume =
                player.volume === undefined ? '' : `, volume ${Math.round(player.volume * 100)}%`
              return `- ${player.name}: ${state}${track ? ` ${track}` : ''}${volume}`
            })
            .join('\n')
        )
      }
    )

    server.registerTool(
      'media_control',
      {
        title: 'Controlar a música',
        description:
          'Toca, pausa, alterna, para ou pula a faixa no player de música ou vídeo. Sem `player`, ' +
          'pausar e parar valem para todos que estão tocando, e o resto vale para o que está ' +
          'tocando (ou o último que tocou). `player` é o nome do app, como "Spotify".',
        inputSchema: {
          acao: z.enum(['tocar', 'pausar', 'alternar', 'parar', 'proxima', 'anterior']),
          player: z.string().optional()
        },
        _meta: ALWAYS_LOAD
      },
      async ({ acao, player }) => {
        const current = media()
        if (!current) return noMedia()
        try {
          return text(await current.control(acao as MediaAction, player))
        } catch (err) {
          return { ...text(`O player não respondeu: ${(err as Error).message}`), isError: true }
        }
      }
    )

    server.registerTool(
      'media_volume',
      {
        title: 'Volume da música',
        description:
          'Muda o volume do player (de 0 a 100): `volume` define o valor, `mudar` soma ou ' +
          'subtrai (ex.: -20). É o volume do player, não o do sistema.',
        inputSchema: {
          volume: z.number().min(0).max(100).optional(),
          mudar: z.number().min(-100).max(100).optional(),
          player: z.string().optional()
        },
        _meta: ALWAYS_LOAD
      },
      async ({ volume, mudar, player }) => {
        const current = media()
        if (!current) return noMedia()
        if (volume === undefined && mudar === undefined) {
          return { ...text('Diga o volume (0 a 100) ou quanto mudar.'), isError: true }
        }
        try {
          return text(await current.volume(volume, mudar, player))
        } catch (err) {
          return { ...text(`O player não respondeu: ${(err as Error).message}`), isError: true }
        }
      }
    )
  }

  // As emoções do mascote (Fase 27): só mexem no desenho dele, como a notificação.
  if (options.express) {
    const express = options.express
    server.registerTool(
      'express',
      {
        title: 'Mostrar uma emoção',
        description:
          'Mostra uma emoção no mascote do Wisp (o rosto, a cor e um sinal no ar, por uns ' +
          'segundos) ou faz ele dançar. Não muda nada na máquina e não precisa ser anunciado. ' +
          'Use de vez em quando, quando combinar com o momento: um agradecimento (love, shy), ' +
          'um teste que passou ou um trabalho pronto (proud, happy, relieved), uma ideia (idea), ' +
          'um problema difícil (thinking, confused, determined), uma notícia ruim (sad), um ' +
          'susto (surprised); ou quando pedirem para ele dançar (danca). Sem exagero: uma por ' +
          'resposta, no máximo.',
        inputSchema: {
          emocao: z.enum(EMOTIONS).optional(),
          danca: z.enum(DANCES).optional(),
          segundos: z.number().min(1).max(15).optional()
        },
        annotations: { readOnlyHint: true },
        _meta: ALWAYS_LOAD
      },
      async ({ emocao, danca, segundos }) => {
        if (!emocao && !danca) {
          return { ...text('Diga a emoção (emocao) ou a dança (danca).'), isError: true }
        }
        express({ emotion: emocao, dance: danca, seconds: segundos })
        return text('ok')
      }
    )
  }

  // Chamada pelo próprio Claude Code (--permission-prompt-tool), nunca pelo modelo: o CLI a
  // esconde da lista de ferramentas.
  server.registerTool(
    'approve',
    {
      title: 'Pedido de permissão',
      description: 'Uso interno do Wisp: pede ao usuário para liberar uma ferramenta.',
      inputSchema: {
        tool_name: z.string(),
        input: z.record(z.string(), z.unknown()),
        tool_use_id: z.string().optional()
      }
    },
    async ({ tool_name, input, tool_use_id }, extra) => {
      const approval = await options.requestApproval({
        toolName: tool_name,
        input,
        toolUseId: tool_use_id,
        signal: extra.signal,
        ...(conversation ? { conversation } : {})
      })
      const decision = approval.allow
        ? {
            behavior: 'allow',
            updatedInput: approval.updatedInput ?? input,
            ...(approval.updatedPermissions
              ? { updatedPermissions: approval.updatedPermissions }
              : {})
          }
        : { behavior: 'deny', message: approval.message }
      return text(JSON.stringify(decision))
    }
  )

  return server
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('corpo grande demais'))
        req.destroy()
      } else {
        chunks.push(chunk)
      }
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function reply(res: ServerResponse, status: number, headers: Record<string, string> = {}): void {
  res.writeHead(status, headers).end()
}

/**
 * Apaga os arquivos de configuração (mcp-<pid>-…) e de modo de permissão (modo-<pid>-…) de
 * Wisps que fecharam sem apagar (um kill, uma queda).
 */
function removeStaleConfigs(dir: string): void {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return
  }
  for (const name of names) {
    const pid = Number(
      /^(?:mcp-(\d+)(?:-[\w-]+)?\.json|modo-(\d+)-[\w-]+)$/.exec(name)?.slice(1).find(Boolean)
    )
    if (!pid || pid === process.pid) continue
    try {
      process.kill(pid, 0)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ESRCH') rmSync(join(dir, name), { force: true })
    }
  }
}

/**
 * Sobe o servidor MCP `desktop` (Streamable HTTP, sem sessões) em 127.0.0.1, numa porta
 * aleatória. Todo pedido precisa do header `Authorization: Bearer <token>`, com um token novo a
 * cada execução, e do Host 127.0.0.1:<porta> (contra DNS rebinding).
 */
export async function startDesktopServer(options: DesktopServerOptions): Promise<DesktopServer> {
  const token = randomBytes(32).toString('hex')
  const expected = Buffer.from(`Bearer ${token}`)
  let port = 0

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const auth = Buffer.from(req.headers.authorization ?? '')
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) return reply(res, 401)
    if (req.headers.host !== `127.0.0.1:${port}`) return reply(res, 403)
    // /mcp/<conversa>: os pedidos de permissão vão para essa aba.
    const route = /^\/mcp(?:\/([\w-]{1,64}))?$/.exec(req.url ?? '')
    if (!route) return reply(res, 404)
    const conversation = route[1]
    // Sem sessões, não há stream de notificações (GET) nem sessão para encerrar (DELETE).
    if (req.method !== 'POST') return reply(res, 405, { Allow: 'POST' })

    let body: unknown
    try {
      body = JSON.parse(await readBody(req))
    } catch {
      return reply(res, 400)
    }
    const server = buildMcpServer(options, conversation)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => {
      void transport.close()
      void server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(req, res, body)
  }

  const http = createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      console.warn('[wisp] erro no servidor MCP:', err)
      if (!res.headersSent) reply(res, 500)
    })
  })
  // Um pedido de permissão espera o usuário clicar, o que pode levar minutos.
  http.requestTimeout = 0

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject)
    http.listen(0, '127.0.0.1', () => resolve())
  })
  port = (http.address() as AddressInfo).port

  const dir = runtimeDir()
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  removeStaleConfigs(dir)
  let extra: Record<string, unknown> = {}
  const written = new Set<string>()
  const pathFor = (conversation: string): string =>
    join(dir, `mcp-${process.pid}-${conversation}.json`)

  return {
    configFor(conversation) {
      if (!CONVERSATION_ID.test(conversation)) throw new Error('id de conversa inválido')
      const desktop = {
        type: 'http',
        url: `http://127.0.0.1:${port}/mcp/${conversation}`,
        headers: { Authorization: `Bearer ${token}` }
      }
      const path = pathFor(conversation)
      writeFileSync(path, JSON.stringify({ mcpServers: { ...extra, desktop } }), { mode: 0o600 })
      chmodSync(path, 0o600)
      written.add(conversation)
      return path
    },
    releaseConfig(conversation) {
      if (!written.delete(conversation)) return
      rmSync(pathFor(conversation), { force: true })
    },
    setExtraServers(servers) {
      extra = servers
    },
    close() {
      http.close()
      http.closeAllConnections()
      for (const conversation of written) rmSync(pathFor(conversation), { force: true })
      written.clear()
    }
  }
}
