// As configurações e o que mora nelas: as integrações (o resumo da semana e a agenda), o
// diagnóstico, o celular, as skills e a chave da OpenRouter.

import type { AvatarName } from './avatars'
import type { Dance } from './emotions'
import type { SavedPrompt, ScheduledTask } from './prompts'
import type { PermissionMode, Provider } from './ipc-chat'

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
  language: 'auto' | 'pt' | 'en'
  shortcut: string | null
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
  'language',
  'shortcut',
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
}

/** O resultado de uma conferência do diagnóstico (Fase 20). */
export type DiagnosticStatus = 'ok' | 'warn' | 'error' | 'off'

/** O que o botão de uma conferência faz. */
export type DiagnosticAction = 'terminal' | 'demo' | 'settings' | 'release'

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
export type PanelView = 'welcome' | 'diagnostics'

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

/** A mudança deu certo, ou o campo que estava errado e o motivo. */
export type SettingsResult = { ok: true } | { ok: false; field: string; message: string }
