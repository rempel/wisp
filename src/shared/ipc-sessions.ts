// As sessões do Claude Code no terminal (Fase 7): os hooks do Wisp no settings.json e o que
// cada sessão mostra na aba Sessões.

import type { DiffHunk, FileDiff, PermissionDecision } from './ipc-chat'

/** Instalar ou tirar os hooks do Wisp do settings.json do Claude Code. */
export type HooksAction = 'install' | 'uninstall'

export interface HooksStatus {
  installed: boolean
  /** Há entradas do Wisp, mas diferentes das de agora (de outra versão): vale reinstalar. */
  outdated: boolean
  /** O settings.json (com ~ no lugar da pasta pessoal). */
  settingsPath: string
  /** Por que não dá para ler ou mexer no arquivo. */
  problem?: string
}

/** A prévia da mudança no settings.json. */
export interface HookPreview {
  action: HooksAction
  settingsPath: string
  /** Onde fica o backup; null se o arquivo ainda não existe. */
  backupPath: string | null
  diff: DiffHunk[]
  /** Impressão digital do arquivo lido: só ele pode ser gravado com esta prévia. */
  fingerprint: string
  /** Há o que mudar (instalar de novo algo já instalado não muda nada). */
  changes: boolean
}

/** O estado de uma sessão do Claude Code que roda fora do Wisp (num terminal). */
export type ExternalState = 'working' | 'waiting' | 'idle' | 'ended' | 'error'

/** Um passo de uma sessão: uma chamada de ferramenta. */
export interface ExternalStep {
  id: string
  tool: string
  input?: unknown
  status: 'running' | 'done' | 'error'
  diff?: FileDiff
  at: number
  /** Feito por um subagente. */
  subagent?: boolean
}

/** Um pedido de permissão (ou pergunta) de uma sessão, esperando resposta. */
export interface ExternalRequest {
  id: string
  toolName: string
  input: unknown
  at: number
  /** Bash: o que o "Permitir sempre" libera (veja o permission-request do chat). */
  scope?: string
  exact?: boolean
}

export interface ExternalSession {
  id: string
  /** A pasta onde a sessão roda. */
  cwd: string
  /** O nome curto do projeto (o fim do caminho). */
  project: string
  state: ExternalState
  startedAt: number
  updatedAt: number
  /** A última mensagem do usuário. */
  prompt?: string
  /** A última resposta do Claude, quando o turno acaba. */
  lastMessage?: string
  error?: string
  model?: string
  /** Os últimos passos, do mais antigo para o mais novo. */
  steps: ExternalStep[]
  requests: ExternalRequest[]
  /** O processo do Claude Code ainda está rodando. */
  alive: boolean
}

/** O que a aba Sessões mostra. */
export interface SessionsSnapshot {
  hooks: HooksStatus
  /** O Wisp está ouvindo os hooks. Se não, `problem` diz por quê. */
  listening: boolean
  problem?: string
  sessions: ExternalSession[]
}

/** Resposta a um pedido de uma sessão: permissão (ou "responder no terminal") ou pergunta. */
export type SessionAnswer =
  { decision: PermissionDecision | 'terminal' } | { answers: Record<string, string> | null }
