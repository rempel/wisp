import { createServer } from 'http'
import type { IncomingMessage, ServerResponse } from 'http'
import { randomBytes, timingSafeEqual } from 'crypto'
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import type { AddressInfo } from 'net'
import { isAbsolute, join } from 'path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { listApps, listProjects, openApp, openProject, openUrl } from './desktop'
import type { Outcome } from './desktop'
import { CACHE_DIR } from './paths'

/** Um pedido de permissão que o Claude Code faz pelo --permission-prompt-tool. */
export interface ApprovalRequest {
  toolName: string
  input: unknown
  toolUseId?: string
}

export type Approval = { allow: true } | { allow: false; message: string }

export interface DesktopServerOptions {
  /** Mostra o card de permissão no chat e resolve quando o usuário decidir. */
  requestApproval(request: ApprovalRequest): Promise<Approval>
  notify(title: string, body: string): void
  /** Lidos a cada chamada, para valerem as mudanças no config.json. */
  projectRoots(): string[]
  editorCommand(): string
}

export interface DesktopServer {
  /** Arquivo para o --mcp-config. Só o dono lê: ele tem o token. */
  configPath: string
  close(): void
}

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
function buildMcpServer(options: DesktopServerOptions): McpServer {
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
    async ({ tool_name, input, tool_use_id }) => {
      const approval = await options.requestApproval({
        toolName: tool_name,
        input,
        toolUseId: tool_use_id
      })
      const decision = approval.allow
        ? { behavior: 'allow', updatedInput: input }
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

/** Pasta só do usuário para o arquivo com o token: $XDG_RUNTIME_DIR (tmpfs) ou o cache. */
function runtimeDir(): string {
  const xdg = process.env.XDG_RUNTIME_DIR
  return xdg && isAbsolute(xdg) ? join(xdg, 'wisp') : CACHE_DIR
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
    if (req.url !== '/mcp') return reply(res, 404)
    // Sem sessões, não há stream de notificações (GET) nem sessão para encerrar (DELETE).
    if (req.method !== 'POST') return reply(res, 405, { Allow: 'POST' })

    let body: unknown
    try {
      body = JSON.parse(await readBody(req))
    } catch {
      return reply(res, 400)
    }
    const server = buildMcpServer(options)
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
  const configPath = join(dir, `mcp-${process.pid}.json`)
  const config = {
    mcpServers: {
      desktop: {
        type: 'http',
        url: `http://127.0.0.1:${port}/mcp`,
        headers: { Authorization: `Bearer ${token}` }
      }
    }
  }
  writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 })
  chmodSync(configPath, 0o600)

  return {
    configPath,
    close() {
      http.close()
      http.closeAllConnections()
      rmSync(configPath, { force: true })
    }
  }
}
