// O que o painel de chat oferece ao resto do Wisp (o Chat do setupChat) e o que ele recebe.

import type { Rectangle, WebContents } from 'electron'
import type { RelayEvent } from './hooks/protocol'
import type { PendingReply } from './hooks/server'
import type { Approval, ApprovalRequest } from './mcp-server'
import type { ScreenImage } from './screenshot'
import type {
  AgendaItem,
  ChatEvent,
  DroppedFiles,
  MascotState,
  NoticeLevel,
  PanelView,
  SettingsSnapshot,
  SoundSettings,
  TaskResult,
  VoiceStatus
} from '../shared/ipc'
import type { ScheduledTask } from '../shared/prompts'

export interface Chat {
  /** Mostra o painel ao lado do mascote, traz para a frente ou esconde. */
  toggle(): void
  /** Mostra o painel e traz para a frente (sem esconder, se já estiver à vista). */
  open(): void
  /**
   * Manda uma mensagem como se o usuário a tivesse escrito, na aba em foco (o comando
   * `wisp --ask`, o atalho de voz). Devolve a conversa, ou null se não foi: o Claude ainda
   * respondia a anterior (a falada fica na caixa).
   */
  ask(text: string, options?: { voice?: boolean }): string | null
  /** Põe um texto ditado na caixa de mensagem da aba em foco, para revisar e enviar. */
  compose(text: string): void
  /**
   * Roda uma tarefa agendada (Fase 26): o prompt dela numa aba nova, no modo Pedir (o modo do
   * config.json não vale aqui). Com você olhando o painel, a aba nova não toma o lugar da que está
   * à vista.
   */
  runTask(task: ScheduledTask): TaskResult
  /** Mostra uma frase dita ao Wisp que ele mesmo resolve (um comando rápido de voz). */
  utterance(text: string): void
  /** Quantos cards de permissão (não perguntas) esperam resposta, em todas as abas. */
  pendingApprovals(): number
  /** Nega os cards da conversa com o pedido mais recente (o "não" falado). */
  denyApprovals(): void
  /**
   * A resposta a um card que veio de fora do painel: do celular (ou o tempo dele acabou: fica
   * negado) ou da notificação do sistema. Devolve false se o card já não esperava.
   */
  answerRemote(
    id: string,
    decision: 'allow' | 'deny',
    how: 'phone' | 'expired' | 'notification'
  ): boolean
  /**
   * A resposta a um pedido que veio da ilha (Fase 37): Permitir, Negar, Sempre, ou as respostas
   * de uma pergunta. Devolve false se o pedido já não esperava.
   */
  answerIsland(
    id: string,
    answer: { decision: 'allow' | 'deny' | 'allow-always' } | { answers: Record<string, string> }
  ): boolean
  /** Abre o painel numa conversa (a aba dela, à vista). */
  showConversation(id: string): void
  /** O título da aba de uma conversa (para o resumo de quando a tela estava bloqueada). */
  conversationTitle(id: string): string
  /** O painel está à vista. */
  visible(): boolean
  /** O painel está à vista e com o foco: você está olhando para ele. */
  attended(): boolean
  /** Em que pé está a voz (o botão do microfone acompanha). */
  voiceStatus(status: VoiceStatus): void
  /** O volume do microfone enquanto ouve. */
  voiceLevel(level: number): void
  /** O humor do mascote mudou: o avatar do cabeçalho acompanha. */
  setMood(state: MascotState): void
  /** Abre o painel numa conversa nova, numa aba (menu da bandeja). */
  newConversation(): void
  /** Abre o painel na tela de configurações (menu do mascote). */
  openSettings(): void
  /** Abre o painel numa tela: os primeiros passos ou o diagnóstico (Fase 20). */
  showView(view: PanelView): void
  /** Abre o painel no histórico, com o resumo da semana em cima (a notificação de segunda). */
  openSummary(): void
  /** De que lado do mascote o painel fica (para o mascote olhar para ele). */
  side(): 'left' | 'right'
  /** Mostra o card de permissão na conversa do pedido e resolve com a decisão do usuário. */
  requestApproval(request: ApprovalRequest): Promise<Approval>
  /** O IPC veio da página do painel? */
  isSender(sender: WebContents): boolean
  /** As sessões do terminal mudaram: a aba Sessões busca de novo. */
  notifySessions(): void
  /** Uma sessão do terminal pede algo: o painel aparece (sem roubar o foco) na aba Sessões. */
  showSessions(): void
  /** Continua no chat, numa aba, uma sessão do terminal. */
  continueSession(seed: SessionSeed): void
  /** Arquivos soltos no mascote: o painel aparece com eles anexados. */
  attach(dropped: DroppedFiles): void
  /** Os sons foram ligados ou desligados (o botão de mudo acompanha). */
  notifySound(settings: SoundSettings): void
  /** As configurações mudaram (a tela de configurações e a pílula da demonstração). */
  notifySettings(snapshot: SettingsSnapshot): void
  /** O próximo compromisso da agenda (null: nenhum), para o painel vazio. */
  setAgenda(next: AgendaItem | null): void
  /**
   * Tira o print das telas com o painel fora da frente; depois ele volta como estava. Lança
   * CaptureError com o motivo.
   */
  capture(): Promise<ScreenImage[]>
  /** Um aviso na conversa em foco (fora do histórico), como um problema na configuração. */
  notice(level: NoticeLevel, text: string): void
  /** A chave da OpenRouter mudou: as conversas de lá a leem de novo. */
  openrouterKeyChanged(): void
  /**
   * Um evento dos hooks do Claude Code do modo terminal de uma aba (pela ficha dele). false: não
   * é de nenhuma aba aberta.
   */
  terminalEvent(event: RelayEvent, pending: PendingReply | null): boolean
  /** Encerra os processos do Claude Code (o app está fechando). */
  dispose(): void
}

/** Uma sessão do terminal para continuar no chat. */
export interface SessionSeed {
  sessionId: string
  cwd: string
  project: string
  /** A sessão ainda roda no terminal: o chat segue numa cópia dela. */
  alive: boolean
  prompt?: string
  lastMessage?: string
}

export interface ChatOptions {
  /** Onde está o mascote, para ancorar o painel ao lado dele. */
  anchor: () => Rectangle | null
  /**
   * O --mcp-config de uma conversa (o servidor `desktop`); sem ele, as conversas rodam sem as
   * ferramentas de desktop.
   */
  mcpConfig?: (conversation: string) => string
  /** A conversa fechou: o arquivo do --mcp-config dela sai. */
  releaseMcpConfig?: (conversation: string) => void
  /** O nome de uma sessão do terminal (o projeto), para a aba dela; null se ela não existe. */
  sessionTitle?: (sessionId: string) => string | null
  /** Recebe cada evento das conversas (o humor do mascote acompanha por aqui). */
  onEvent?: (event: ChatEvent, conversation: string) => void
  /** Uma aba de conversa fechou. */
  onClose?: (conversation: string) => void
  /** O usuário abriu ou fechou o painel (os sons de abrir e fechar). */
  onPanel?: (change: 'open' | 'close') => void
  /** O usuário está mexendo no painel (o mascote não cochila). */
  onActivity?: () => void
  /** A janela do painel apareceu ou sumiu, de qualquer jeito (o modo compacto acompanha). */
  onVisible?: (visible: boolean) => void
  /**
   * Você passou a olhar o painel (à vista e com o foco) ou deixou de olhar (Fase 24: os cards
   * viram notificações enquanto ninguém olha).
   */
  onAttention?: (attended: boolean) => void
}
