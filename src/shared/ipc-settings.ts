// As configurações e o que mora nelas: as integrações (o resumo da semana e a agenda), o
// diagnóstico, o celular, as skills, a chave da OpenRouter e os servidores MCP.

import type { AvatarName } from './avatars'
import type { Dance } from './emotions'
import type { SavedPrompt, ScheduledTask } from './prompts'
import type { DiffHunk, PermissionMode, Provider } from './ipc-chat'

/** O resumo de uma semana (de segunda a segunda), só com contagens (Fase 13). */
export interface WeekSummary {
  from: number
  to: number
  conversations: number
  turns: number
  /** Minutos do Claude trabalhando (a soma dos turnos). */
  claudeMinutes: number
  stopped: number
  errors: number
  edits: number
  added: number
  removed: number
  approved: number
  denied: number
  tools: [string, number][]
  apps: [string, number][]
  terminal: number
  projects: [string, number][]
  reminders: number
}

/** O que o painel recebe para o cartão da semana. */
export interface WeekSummaries {
  enabled: boolean
  current: WeekSummary
  previous: WeekSummary
}

/** O próximo compromisso da agenda, para o painel vazio mostrar (Fase 13). */
export interface AgendaItem {
  title: string
  start: number
  end: number
  location: string
}

/** Os campos do config.json que a tela de configurações mostra e muda. */
export interface Settings {
  projectRoots: string[]
  editorCommand: string
  terminalCommand: string | null
  model: string | null
  permissionMode: PermissionMode
  extraAllowedTools: string[]
  enabledMcpServers: string[]
  sound: boolean
  volume: number
  sleepAfterMinutes: number
  accessory: 'auto' | 'none' | 'christmas' | 'summer'
  avatar: AvatarName
  dance: Dance
  theme: 'system' | 'light' | 'dark'
  highContrast: boolean
  reduceMotion: boolean
  panelZoom: number
  tabSleepMinutes: number
  notifyApprovals: boolean
  quietWithDnd: boolean
  language: 'auto' | 'pt' | 'en'
  shortcut: string | null
  paletteShortcut: string | null
  islandShortcut: string | null
  areaShortcut: string | null
  selectionShortcut: string | null
  windowShortcut: string | null
  dictationShortcut: string | null
  voiceShortcut: string | null
  clipboardChip: boolean
  browserAutomation: boolean
  voiceReview: boolean
  quickCommands: boolean
  voiceReplies: boolean
  voiceLanguage: string
  demo: boolean
  compact: boolean
  github: boolean
  calendar: boolean
  calendarFiles: string[]
  calendarAlertMinutes: number
  weeklySummary: boolean
  usageAlerts: boolean
  turnReview: boolean
  provider: Provider
  openrouterModel: string | null
  phoneAfterSeconds: number
  updateCheck: boolean
  prompts: SavedPrompt[]
  scheduledTasks: ScheduledTask[]
}

export const SETTINGS_KEYS: readonly (keyof Settings)[] = [
  'projectRoots',
  'editorCommand',
  'terminalCommand',
  'model',
  'permissionMode',
  'extraAllowedTools',
  'enabledMcpServers',
  'sound',
  'volume',
  'sleepAfterMinutes',
  'accessory',
  'avatar',
  'dance',
  'theme',
  'highContrast',
  'reduceMotion',
  'panelZoom',
  'tabSleepMinutes',
  'notifyApprovals',
  'quietWithDnd',
  'language',
  'shortcut',
  'paletteShortcut',
  'islandShortcut',
  'areaShortcut',
  'selectionShortcut',
  'windowShortcut',
  'dictationShortcut',
  'voiceShortcut',
  'clipboardChip',
  'browserAutomation',
  'voiceReview',
  'quickCommands',
  'voiceReplies',
  'voiceLanguage',
  'demo',
  'compact',
  'github',
  'calendar',
  'calendarFiles',
  'calendarAlertMinutes',
  'weeklySummary',
  'usageAlerts',
  'turnReview',
  'provider',
  'openrouterModel',
  'phoneAfterSeconds',
  'updateCheck',
  'prompts',
  'scheduledTasks'
]

/** Uma tarefa agendada que rodou (ou não deu para rodar). */
export type TaskResult = { ok: true } | { ok: false; message: string }

/** O que a tela de configurações recebe. */
export interface SettingsSnapshot {
  values: Settings
  /** Iniciar com o sistema (um arquivo em ~/.config/autostart, fora do config.json). */
  autostart: boolean
  /** O config.json, com ~ no lugar da pasta pessoal. */
  configPath: string
  /** O registro (wisp.log), com ~ no lugar da pasta pessoal. */
  logPath: string
  /** O que está errado no config.json (os campos inválidos caem no padrão). */
  problems: string[]
  /** Há uma chave da OpenRouter no chaveiro (null: não deu para saber, o chaveiro não respondeu). */
  openrouterKey: boolean | null
  /** Aprovar pelo celular (Fase 18). */
  phone: PhoneStatus
  /** O idioma em que o Wisp abriu, e o que ele terá ao abrir de novo (Fase 25). */
  locale: 'pt' | 'en'
  nextLocale: 'pt' | 'en'
  /** Quando cada tarefa agendada rodou pela última vez (ms), pelo id (Fase 26). */
  taskRuns: Record<string, number>
  /** O "não perturbe" do desktop agora (Fase 32); null se o desktop não diz. */
  dnd: boolean | null
  /** As agendas por endereço (Fase 40), sem o endereço. */
  calendarLinks: CalendarLinkInfo[]
}

/** O resultado de uma conferência do diagnóstico (Fase 20). */
export type DiagnosticStatus = 'ok' | 'warn' | 'error' | 'off'

/** O que o botão de uma conferência faz. */
export type DiagnosticAction = 'terminal' | 'demo' | 'settings' | 'release' | 'update' | 'restart'

/** Uma conferência: o Claude Code, o login, o atalho, a bandeja, o chaveiro, a voz... */
export interface DiagnosticCheck {
  id:
    | 'claude'
    | 'login'
    | 'shortcut'
    | 'tray'
    | 'keyring'
    | 'voice'
    | 'terminal'
    | 'config'
    | 'update'
  title: string
  status: DiagnosticStatus
  /** Uma frase curta, a do relatório (nada pessoal). */
  summary: string
  /** O que foi visto, para a tela. */
  detail: string
  /** O que fazer (Markdown). */
  fix?: string
  action?: DiagnosticAction
  /** Não impede de usar o Wisp (fica como "opcional" nos primeiros passos). */
  optional?: boolean
}

/** As conferências de agora e o relatório para uma issue. */
export interface DiagnosticsSnapshot {
  checks: DiagnosticCheck[]
  report: string
}

/** Uma tela do painel aberta pelo main. */
export type PanelView = 'welcome' | 'diagnostics' | 'palette' | 'usage'

/** Em que pé está a aprovação pelo celular. */
export interface PhoneStatus {
  /** Ligada (pareada e confirmada pelo celular). */
  enabled: boolean
  /** Há um pareamento no chaveiro (null: não deu para saber). */
  paired: boolean | null
  /** O servidor do ntfy. */
  server: string
}

/** O pareamento: o link para o app do ntfy (o QR code), o mesmo no navegador, ou o motivo. */
export type PhonePairResult =
  { ok: true; link: string; web: string; server: string } | { ok: false; message: string }

export type PhoneResult = { ok: true; message?: string } | { ok: false; message: string }

/** Uma skill do Claude Code. */
export interface SkillInfo {
  name: string
  description: string
  /** Pessoal (~/.claude/skills) ou de um plugin. */
  origin: 'personal' | 'plugin'
  plugin?: string
  /** Ferramentas que a skill libera sem card (o allowed-tools dela). */
  allowedTools?: string
  path: string
}

/** A skill escolhida para instalar, antes de instalar. */
export type SkillPreview = SkillInfo & { files: number }

export type SkillResult = { ok: true; message: string } | { ok: false; message: string }

/** Guardar ou conferir a chave: deu certo (com o nome que ela tem na OpenRouter) ou o motivo. */
export type OpenRouterKeyResult =
  { ok: true; label: string | null; note?: string } | { ok: false; message: string }

/** Guardar ou apagar uma agenda por endereço (Fase 40): deu certo (com um aviso) ou o motivo. */
export type CalendarLinkResult = { ok: true; note?: string } | { ok: false; message: string }

/** Uma agenda por endereço, como a tela de configurações mostra: o endereço fica no chaveiro. */
export interface CalendarLinkInfo {
  id: string
  name: string
}

/** A mudança deu certo, ou o campo que estava errado e o motivo. */
export type SettingsResult = { ok: true } | { ok: false; field: string; message: string }

/** Um servidor MCP do Claude Code, como as configurações mostram (Fase 30). */
export interface McpServerInfo {
  name: string
  /** O seu (do ~/.claude.json) ou de um projeto (do .mcp.json dele, só para ver). */
  scope: 'user' | 'project'
  /** O projeto (o nome da pasta), para os de projeto. */
  project?: string
  /** Por comando, por endereço, ou num formato que o Wisp não conhece. */
  kind: 'command' | 'url' | 'other'
  /** O comando com os argumentos, ou o endereço. */
  summary: string
  /** Os nomes das variáveis (comando) ou dos cabeçalhos (endereço); os valores ficam escondidos. */
  secrets: string[]
  /** Entra nas conversas do Wisp (só os seus). */
  enabled: boolean
  /** O nome é de um servidor do próprio Wisp (desktop, playwright): ele não entra. */
  reserved?: boolean
  /** Da última conversa em que ele entrou: se conectou e as ferramentas (sem o mcp__nome__). */
  status?: string
  tools?: string[]
}

/** Os servidores MCP: os seus e os dos projetos, e o arquivo dos seus. */
export interface McpSnapshot {
  configPath: string
  servers: McpServerInfo[]
  /** Por que não deu para ler o arquivo. */
  problem?: string
}

/** Um servidor novo, como o formulário das configurações o descreve. */
export type McpServerInput =
  | { kind: 'command'; name: string; command: string; args: string[]; env: Record<string, string> }
  | { kind: 'url'; name: string; url: string; headers: Record<string, string> }

/** Pôr ou tirar um servidor do seu Claude Code. */
export type McpChange =
  { action: 'add'; server: McpServerInput } | { action: 'remove'; name: string }

/** A prévia da mudança no ~/.claude.json (com os valores secretos escondidos). */
export interface McpPreview {
  change: McpChange
  configPath: string
  /** Onde fica o backup; null se o arquivo ainda não existe. */
  backupPath: string | null
  diff: DiffHunk[]
  /** O servidor como estava na prévia: só ele pode ser mudado com ela. */
  fingerprint: string
}

export type McpApplyResult =
  { ok: true; backupPath: string | null } | { ok: false; message: string }

/** O que importar um arquivo do Wisp muda (Fase 31), antes de importar. */
export interface PortablePreview {
  /** O arquivo (com ~). */
  file: string
  /** A impressão do arquivo lido: só ele é importado com esta prévia. */
  fingerprint: string
  /** A versão do Wisp que exportou e quando. */
  versao: string
  em: string
  /** Os campos das configurações que mudam; `sensitive`: muda o que o Wisp roda ou lê. */
  changes: { key: string; before: string; after: string; sensitive: boolean }[]
  prompts: { added: number; replaced: number }
  tasks: { added: number; replaced: number }
  /** As conversas do arquivo: as que entram e as que já estão aqui (ficam como estão). */
  conversations: { added: number; present: number }
  /** Campos que esta versão não conhece (de uma mais nova): ficam de fora. */
  ignored: string[]
}

/** Exportar ou importar: deu certo (com o que fez) ou o motivo; null, a pessoa desistiu. */
export type PortableResult = { ok: boolean; message: string } | null
