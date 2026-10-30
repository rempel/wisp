// As configurações com que o Wisp sobe o Claude Code: as ferramentas liberadas, os arquivos de
// segredos que sempre pedem aprovação, o hook que manda todo Bash para o card, o --settings do
// modo terminal e as opções de uma conversa.

import { homedir } from 'os'
import { PERMISSION_MODES } from '../shared/ipc'
import type { PermissionMode, Provider } from '../shared/ipc'
import { WRAPPER_PATH } from './hooks/install'
import { HOOK_EVENTS, RELAY_ARG, STATUS_ARG, TAB_ARG } from './hooks/protocol'
import { shellQuote } from './launcher'
import { ASK_FOR_BASH, MODE_FILE_ENV, MODE_HOOK_ARG } from './mode-hook'
import type { OpenRouterModel } from './openrouter'
import { IS_WINDOWS } from './platform'
import { selfCommandOf } from './self-command'

/** Ferramentas que o Claude usa sem pedir permissão (seção 5.4 da especificação). */
export const SAFE_TOOLS = [
  'Read',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch',
  'mcp__desktop__open_url',
  'mcp__desktop__list_apps',
  'mcp__desktop__list_projects',
  'mcp__desktop__notify',
  // Lembretes: só mexem no próprio Wisp, como a notificação.
  'mcp__desktop__set_reminder',
  'mcp__desktop__list_reminders',
  'mcp__desktop__cancel_reminder',
  // Música: tocar, pausar e volume do player não mudam nada na máquina.
  'mcp__desktop__media_status',
  'mcp__desktop__media_control',
  'mcp__desktop__media_volume',
  // Fase 13: só leitura (os seus PRs, a agenda, o resumo da semana).
  'mcp__desktop__github_status',
  'mcp__desktop__list_events',
  'mcp__desktop__weekly_summary',
  // Fase 27: as emoções e as danças do mascote só mexem no desenho dele.
  'mcp__desktop__express'
]

/** Ferramenta do servidor `desktop` que mostra o card de permissão (seção 5.4). */
export const PERMISSION_TOOL = 'mcp__desktop__approve'

/**
 * Arquivos de segredos (chaves, tokens, senhas de navegador). O Read continua liberado no
 * resto da máquina, mas ler estes pede aprovação: sem isso, um texto malicioso numa página
 * lida pelo WebFetch poderia levar o Claude a ler uma chave e mandá-la para fora sem ninguém ver.
 */
const SENSITIVE_PATHS = [
  '~/.ssh/**',
  '~/.gnupg/**',
  '~/.aws/**',
  '~/.azure/**',
  '~/.config/gcloud/**',
  '~/.kube/**',
  '~/.docker/config.json',
  '~/.netrc',
  '~/.pgpass',
  '~/.git-credentials',
  '~/.config/gh/**',
  '~/.claude/.credentials.json',
  '~/.local/share/keyrings/**',
  '~/.password-store/**',
  '~/.mozilla/**',
  '~/.config/google-chrome/**',
  '~/.config/chromium/**',
  '~/.config/BraveSoftware/**',
  // No Windows (Fase 33): os perfis dos navegadores e as credenciais em %APPDATA%.
  '~/AppData/Roaming/Mozilla/**',
  '~/AppData/Local/Google/Chrome/User Data/**',
  '~/AppData/Local/Microsoft/Edge/User Data/**',
  '~/AppData/Local/BraveSoftware/**',
  '~/AppData/Roaming/gcloud/**',
  '~/AppData/Roaming/GitHub CLI/**',
  '//**/.env',
  '//**/.env.*'
]

/** Um padrão de SENSITIVE_PATHS como expressão regular (só o que eles usam: ~/, //, * e **). */
function sensitiveRegex(glob: string, home: string): RegExp {
  const anywhere = glob.startsWith('//**/')
  const rest = anywhere ? glob.slice(5) : glob.slice(2)
  const body = rest
    .split(/(\*\*\/|\*\*|\*)/)
    .map((part) =>
      part === '**/'
        ? '(?:.*/)?'
        : part === '**'
          ? '.*'
          : part === '*'
            ? '[^/]*'
            : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    )
    .join('')
  const base = home
    .replaceAll('\\', '/')
    .replace(/\/+$/, '')
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(anywhere ? `(?:^|/)${body}$` : `^${base}/${body}$`, IS_WINDOWS ? 'i' : '')
}

/**
 * Um arquivo de segredos (Fase 34): o painel não mostra o que o Claude só lê com aprovação. As
 * barras do Windows valem como as do Linux.
 */
export function isSensitivePath(path: string, home = homedir()): boolean {
  const normal = path.replaceAll('\\', '/')
  return SENSITIVE_PATHS.some((glob) => sensitiveRegex(glob, home).test(normal))
}

export { MODE_FILE_ENV }

/**
 * Configurações extras da sessão (--settings):
 * - um hook que manda todo comando Bash para a aprovação. Sem ele o Claude Code roda sozinho
 *   comandos que considera só de leitura (ps, whoami, ls na pasta de trabalho, e também um `cat`
 *   de uma chave). No modo Automático ele fica quieto: quem decide é o classificador do Claude
 *   Code. O modo vem de um arquivo, porque muda no meio da conversa e o --settings não.
 * - as regras "ask" dos arquivos de segredos.
 */
const BASH_HOOK = `[ "$(cat "$${MODE_FILE_ENV}" 2>/dev/null)" = auto ] || printf %s '${ASK_FOR_BASH}'`

/**
 * O hook do Bash: no Linux, a linha de shell; no Windows, a forma exec (command + args, sem shell),
 * rodando o próprio Wisp, que lê o modo e responde (mode-hook.ts). Um hook de shell no Windows
 * rodaria no Git Bash ou no PowerShell, conforme a máquina.
 */
function bashHook(): Record<string, unknown> {
  const selfCommand = selfCommandOf()
  if (IS_WINDOWS && selfCommand) {
    return {
      type: 'command',
      command: selfCommand.command,
      args: [...selfCommand.args, MODE_HOOK_ARG]
    }
  }
  return { type: 'command', command: BASH_HOOK }
}

/** As configurações extras do chat (--settings). */
export function sessionSettings(): string {
  return JSON.stringify({
    permissions: { ask: SENSITIVE_PATHS.map((path) => `Read(${path})`) },
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [bashHook()] }] }
  })
}

/**
 * As configurações do Claude Code do modo terminal (--settings): as do chat (o hook que manda
 * todo Bash para a aprovação, os arquivos de segredos), mais os hooks e a linha de status da aba,
 * pelo relay do Wisp. Valem só para aquele processo: o settings.json do usuário não muda.
 */
export function terminalSettings(tab: string, relay = WRAPPER_PATH): string {
  const command = (...parts: string[]): string => [shellQuote(relay), ...parts].join(' ')
  // No Windows (Fase 35), o relay é o próprio Wisp na forma exec (sem shell). Sem saber o
  // executável, os pedidos aparecem só no próprio terminal.
  const windows = IS_WINDOWS ? selfCommandOf() : null
  const relayHook = (...parts: string[]): Record<string, unknown> =>
    windows
      ? { command: windows.command, args: [...windows.args, RELAY_ARG, ...parts] }
      : { command: command(...parts) }
  const hooks: Record<string, unknown[]> = {
    PreToolUse: [{ matcher: 'Bash', hooks: [bashHook()] }]
  }
  if (IS_WINDOWS && !windows) {
    return JSON.stringify({
      permissions: { ask: SENSITIVE_PATHS.map((path) => `Read(${path})`) },
      hooks
    })
  }
  for (const { event, timeout, async } of HOOK_EVENTS) {
    // A mensagem vai antes de tudo: sem esperar por ela, os hooks em segundo plano podem chegar
    // fora de ordem, e a mensagem apareceria depois das ferramentas que ela pediu.
    const background = async && event !== 'UserPromptSubmit'
    hooks[event] = [
      ...(hooks[event] ?? []),
      {
        hooks: [
          {
            type: 'command',
            ...relayHook(TAB_ARG, tab, event),
            timeout,
            ...(background ? { async: true } : {})
          }
        ]
      }
    ]
  }
  return JSON.stringify({
    permissions: { ask: SENSITIVE_PATHS.map((path) => `Read(${path})`) },
    hooks,
    // A linha de status do Claude Code é uma linha de shell (sem a forma exec): no Windows, fica a
    // dele.
    ...(windows
      ? {}
      : { statusLine: { type: 'command', command: command(STATUS_ARG, tab), padding: 0 } })
  })
}

/** Como subir o Claude Code interativo do modo terminal (num pty). */
export interface TerminalLaunch {
  file: string
  args: string[]
  env: NodeJS.ProcessEnv
  cwd: string
}

/** O modo como o CLI o informa: "manual" é o nome novo do "default". */
export function modeOf(value: unknown): PermissionMode | null {
  if (value === 'manual') return 'default'
  return PERMISSION_MODES.includes(value as PermissionMode) ? (value as PermissionMode) : null
}

export interface ClaudeOptions {
  /** Comando ou caminho do CLI (config.claudePath). */
  claudePath: string
  /**
   * Prepara e devolve a pasta de trabalho do processo (o workspace do Wisp, com o CLAUDE.md da
   * persona). É chamada a cada vez que um processo sobe, então a pasta pode ser recriada.
   */
  workspace: () => string
  allowedTools: string[]
  appendSystemPrompt: string
  /**
   * O arquivo do --mcp-config com o servidor `desktop` desta conversa, pedido a cada processo
   * novo. Sem ele (o servidor não subiu), a conversa funciona sem as ferramentas de desktop, e o
   * que pediria permissão é negado.
   */
  mcpConfig?: () => string | undefined
  /** O modo de permissão com que a conversa começa. */
  permissionMode: PermissionMode
  /** Onde gravar o modo atual, para o hook do Bash ler (em $XDG_RUNTIME_DIR, só do usuário). */
  modeFile?: string
  /** Modelo inicial (config.model): um apelido ou nome que o --model aceita; null é o padrão. */
  model: string | null
  /** O session_id mudou (o CLI criou uma cópia com --fork-session, por exemplo). */
  onSessionId?: (id: string) => void
  /**
   * Miniatura (data URL) de uma imagem em base64 que uma ferramenta devolveu, para o card da
   * ferramenta mostrar o que o Claude viu (um print da tela, por exemplo).
   */
  thumbnail?: (base64: string) => string | undefined
  /** No modo demonstração: o Claude Code gravado e as gravações, no lugar do CLI. */
  demo?: () => DemoPlayer | null
  /** Por onde a conversa começa; o padrão é a assinatura. */
  provider?: Provider
  /**
   * Antes de subir um processo numa pasta (Fase 15): confere se a pasta é confiável (pode
   * mostrar um card). false: o processo não sobe.
   */
  folderGate?: () => Promise<boolean>
  /** A OpenRouter: a chave (do chaveiro; lança o motivo se não deu) e os preços de um modelo. */
  openrouter?: {
    key(): Promise<string | null>
    pricing(model: string): Promise<OpenRouterModel | null>
  }
}

/** O Claude Code gravado do modo demonstração (demo/player.ts), rodado pelo Electron em modo Node. */
export interface DemoPlayer {
  /** O script do reprodutor (out/main/wisp-demo.js). */
  player: string
  /** A pasta das gravações (resources/demo). */
  recordings: string
}
