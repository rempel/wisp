// O que uma conversa (conversation.ts) recebe de quem a cria: para onde vão os eventos dela e as
// opções de cada processo do Claude Code. Separado para o conversation.ts caber no limite.

import type { ClaudeOptions } from './claude'
import type { Conversation } from './conversation'
import type { ChatEvent, PermissionMode, Provider } from '../shared/ipc'

/** Para onde vão os eventos de uma conversa e o que ela pede ao painel. */
export interface ConversationHost {
  /**
   * Um evento da conversa. `live`: aconteceu agora (o mascote e os sons acompanham); senão, é a
   * reabertura de uma conversa guardada, que só vai para a página.
   */
  emit(conversation: Conversation, event: ChatEvent, live: boolean): void
  /** Chegou um card: o painel aparece, sem roubar o foco, com esta aba à vista. */
  attention(conversation: Conversation): void
  /** O título ou a pasta mudaram (a aba acompanha). */
  changed(conversation: Conversation): void
  /** Saída do terminal do modo terminal, para a página (o xterm.js). */
  terminalData(conversation: Conversation, chunk: string): void
}

export interface ConversationOptions {
  id: string
  host: ConversationHost
  /** O que vale para todo processo do Claude Code: CLI, ferramentas liberadas, persona. */
  claude: Omit<ClaudeOptions, 'mcpConfig' | 'modeFile' | 'permissionMode' | 'model' | 'provider'>
  /** O --mcp-config desta conversa (o servidor desktop com o endereço dela). */
  mcpConfig?: () => string | undefined
  /** O arquivo do modo, que o hook do Bash lê. */
  modeFile?: string
  permissionMode: PermissionMode
  /** O modelo de cada provedor (o do config.json: model ou openrouterModel). */
  modelFor: (provider: Provider) => string | null
  /** Por onde a conversa começa. */
  provider: Provider
  /** A pasta onde a conversa roda (um projeto aberto numa aba); sem ela, o workspace do Wisp. */
  folder?: string | null
  /** Onde fica a lista das pastas confiáveis (os testes trocam). */
  trustFile?: string
  /** Pastas onde o Aceitar edições libera edições (as de projetos, do config.json). */
  projectRoots: () => string[]
  /** Pastas que valem mesmo sendo ocultas (o workspace do Wisp, os anexos). */
  trustedDirs: string[]
  /** Modo demonstração: as respostas são gravadas, e a conversa não vai para o histórico. */
  demo?: () => boolean
}
