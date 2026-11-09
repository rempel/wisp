// A conversa no painel: anexos, a área de transferência, os modelos e o uso do plano, os diffs, os
// eventos do chat, as permissões, as abas e a janela.

import type { Layout } from './layout'
import type { DroppedFile } from './ipc-mascot'

/** Limites dos anexos de uma mensagem. O chat confere ao anexar; o main, de novo, ao copiar. */
export const ATTACHMENT_LIMITS = { maxFiles: 20, maxBytes: 50 * 1024 * 1024 } as const

/** Um anexo saindo com a mensagem: o arquivo e, se for imagem, a miniatura (data URL). */
export interface OutgoingAttachment {
  path: string
  thumbnail?: string
}

/** Como um anexo aparece na conversa. */
export interface AttachmentPreview {
  name: string
  size: number
  /** Miniatura (data URL) quando é uma imagem que dá para mostrar. */
  thumbnail?: string
}

/** Imagem colada guardada pelo main, ou por que não deu. */
export type PastedImage = { path: string; name: string } | { error: string }

/**
 * O chip "usar o que você copiou": só o tipo e o tamanho do que está na área de transferência.
 * O conteúdo fica no main até o usuário clicar.
 */
export interface ClipboardOffer {
  /** Identifica este conteúdo (para usar ou dispensar exatamente ele). */
  id: string
  kind: 'text' | 'link' | 'image'
  /** Texto: caracteres e linhas. */
  chars?: number
  lines?: number
  /** Link: o domínio. */
  host?: string
  /** Imagem: o tamanho. */
  width?: number
  height?: number
  /** Texto longo demais para a caixa: entra como anexo .txt. */
  asFile?: boolean
}

/** O que foi copiado, pronto para usar: texto para a caixa ou um anexo. */
export type ClipboardUse = { text: string } | { attachment: DroppedFile } | { error: string }

/**
 * Modelos da pílula, pelos apelidos que o `--model` do Claude Code aceita (cada um aponta para
 * a versão mais nova da família). null é o padrão do Claude Code.
 */
export const MODEL_CHOICES = ['haiku', 'sonnet', 'opus', 'fable'] as const

/** Uma janela de uso do plano: quanto já foi usado (0 a 1) e quando ela reinicia. */
export interface UsageWindow {
  used: number
  /** Segundos Unix; null se o CLI não disse. */
  resetsAt: number | null
}

/** Uso do plano do Claude, como o Claude Code informa a cada resposta. */
export interface PlanUsage {
  /** Janela de 5 horas. */
  session: UsageWindow | null
  /** Janela de 7 dias. */
  week: UsageWindow | null
  /** O limite foi atingido. */
  limited: boolean
  /** Quando a informação chegou (ms Unix). */
  at: number
}

/** Trecho de um diff: cada linha começa com ' ' (contexto), '-' (saiu) ou '+' (entrou). */
export interface DiffHunk {
  oldStart: number
  newStart: number
  lines: string[]
}

/** O texto de um arquivo para ver no painel (Fase 34), ou por que ele não aparece. */
export type FileViewResult = { ok: true; text: string } | { ok: false; message: string }

/** O que uma edição de arquivo mudou. */
export interface FileDiff {
  added: number
  removed: number
  hunks: DiffHunk[]
  /** Linhas demais: os trechos trazem só o começo (as contagens valem para tudo). */
  truncated: boolean
}

/** Um arquivo no card de revisão do fim do turno (Fase 42). */
export interface ReviewFile {
  path: string
  status: 'created' | 'modified' | 'deleted'
  added: number
  removed: number
  /** O diff (sem ele: um arquivo binário ou grande demais). */
  diff?: FileDiff
  /** A marca do conteúdo de agora: desfazer só vale com o arquivo ainda assim. */
  hash: string
  /** Há a cópia de antes. */
  canUndo: boolean
}

/** O que o desfazer do card conseguiu. */
export interface ReviewUndoResult {
  undone: string[]
  problems: string[]
}

/** O que voltar a um ponto da conversa muda nos arquivos (Fase 46), antes de confirmar. */
export interface RewindPreview {
  ok: boolean
  /** Por que não dá (com ok false). */
  message?: string
  /** Os arquivos que voltam a ser como eram antes daquela mensagem. */
  files: ReviewFile[]
  /** Algumas respostas dali em diante são de antes de o Wisp abrir: sem as cópias delas. */
  partial: boolean
}

/** O que voltar a um ponto conseguiu: o texto da mensagem volta para a caixa. */
export interface RewindResult {
  ok: boolean
  message?: string
  text: string
  attachments: AttachmentPreview[]
  undone: string[]
  problems: string[]
}

/** O que abrir a pré-visualização deu (Fase 47): o Markdown abre no painel, pelo `path`. */
export interface PreviewResult {
  ok: boolean
  message?: string
  kind?: 'url' | 'file' | 'markdown'
  path?: string
}

/** A pré-visualização (Fase 47; na bancada desde a Fase 55): aberta e com o quê. */
export interface PreviewState {
  open: boolean
  display: string
  kind: 'url' | 'file' | 'markdown' | null
  /** O título da página e o que os botões de voltar e avançar podem fazer (Fase 55). */
  title?: string
  loading?: boolean
  canGoBack?: boolean
  canGoForward?: boolean
}

/** Uma linha do painel de uso (Fase 49): um dia, um projeto e um modelo. */
export interface UsageRow {
  /** AAAA-MM-DD, no fuso daqui. */
  day: string
  project: string
  model: string
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
  /** O custo estimado pela API, em dólares (null: o modelo não tem preço na tabela). */
  cost: number | null
}

/** O uso dos últimos dias, lido dos .jsonl do Claude Code (Fase 49). */
export interface UsageReport {
  since: string
  days: number
  rows: UsageRow[]
  /** Os modelos sem preço (o custo deles fica de fora). */
  unknownModels: string[]
  /** Quantos arquivos de sessão foram lidos. */
  files: number
}

/** De onde é um subagente (Fase 50): os seus ou os do projeto da conversa. */
export type AgentScope = 'personal' | 'project'

/** Um subagente do Claude Code (um .md em agents/). */
export interface AgentInfo {
  name: string
  /** O nome do arquivo, sem o .md. */
  file: string
  scope: AgentScope
  path: string
  description: string
  model?: string
  /** As ferramentas, separadas por vírgula (sem elas: todas). */
  tools?: string
  prompt: string
}

/** O que o formulário manda para criar ou editar um subagente. */
export interface AgentSpec {
  scope: AgentScope
  name: string
  description: string
  prompt: string
  /** Separadas por vírgula; vazio: todas as ferramentas da conversa. */
  tools: string
  /** "", sonnet, opus, haiku, fable ou inherit. */
  model: string
}

/** O que gravar muda, antes de gravar. */
export interface AgentPreview {
  path: string
  exists: boolean
  diff: FileDiff
  /** O arquivo como estava na prévia: gravar só vale com ele assim. */
  fingerprint: string
  unchanged: boolean
}

export interface AgentResult {
  ok: boolean
  message: string
}

/** As colunas do quadro de tarefas (Fase 51). */
export type BoardColumn = 'todo' | 'running' | 'review' | 'done'

/** Um cartão do quadro: um pedido numa pasta de projeto. */
export interface BoardCard {
  id: string
  title: string
  prompt: string
  /** A pasta original do projeto. */
  folder: string
  column: BoardColumn
  /** A conversa que roda o cartão (a aba), depois de Começar. */
  conversation?: string
  /** A cópia do Git onde ele roda (Fase 43). */
  copy?: string
  /** Um aviso (rodou sem cópia, por exemplo). */
  note?: string
  createdAt: number
}

export interface BoardResult {
  ok: boolean
  message: string
}

/** A resposta da pergunta lateral (Fase 46). */
export interface AsideResult {
  ok: boolean
  text: string
}

/** Uma conversa guardada no histórico. */
export interface ConversationSummary {
  id: string
  /** A primeira mensagem, encurtada. */
  title: string
  /** ms Unix. */
  createdAt: number
  updatedAt: number
  /** Está aberta numa aba. */
  current: boolean
  /** O nome da pasta da conversa (uma sessão trazida do terminal ou uma conversa numa pasta). */
  project?: string
  /** A pasta inteira, para o filtro do histórico (Fase 29). */
  folder?: string
  /** Foi pela OpenRouter. */
  provider?: 'openrouter'
  /** Fixada no topo do histórico. */
  pinned?: boolean
}

/**
 * Uma mensagem de uma conversa guardada (Fase 29): a n-ésima sua (contando só as que ficaram,
 * depois das edições) ou um bloco de texto do Claude, pelo id dele. `term` é o que marcar nela.
 */
export type HistoryTarget =
  { kind: 'user'; n: number; term: string } | { kind: 'text'; id: string; term: string }

/** Uma conversa achada pela busca do histórico, com o trecho que bate. */
export interface HistoryHit extends ConversationSummary {
  /** O trecho: o texto antes, o que bate e o depois; null quando só o título bate. */
  snippet: { who: 'user' | 'claude'; before: string; match: string; after: string } | null
  /** Quantas mensagens batem. */
  matches: number
  /** A mensagem do trecho, para abrir nela. */
  at?: HistoryTarget
}

/** Exportar uma conversa: onde ficou, ou por que não (null: a pessoa desistiu). */
export type ExportResult = { ok: true; path: string } | { ok: false; message: string } | null

/**
 * O que o main conta ao chat sobre a conversa. É uma versão enxuta da saída stream-json do
 * Claude Code, para a interface não depender do formato do CLI.
 */
export type ChatEvent =
  /** Começou ou terminou um turno (do envio da mensagem até a resposta final). */
  | { type: 'busy'; busy: boolean }
  /** Pedaço de texto da resposta. Blocos diferentes têm ids diferentes. */
  | { type: 'text'; blockId: string; delta: string }
  /** O Claude começou a chamar uma ferramenta. */
  | { type: 'tool-start'; id: string; name: string }
  /** Os argumentos completos da chamada. */
  | { type: 'tool-input'; id: string; name: string; input: unknown }
  /**
   * Resultado da ferramenta (texto, possivelmente cortado). Edições de arquivo trazem o diff,
   * quando o Claude Code o informa, e imagens vêm como miniaturas.
   */
  | {
      type: 'tool-result'
      id: string
      isError: boolean
      output: string
      diff?: FileDiff
      /** Miniaturas (data URLs) das imagens que a ferramenta devolveu, como um print da tela. */
      images?: string[]
    }
  /** O turno acabou: normalmente, com erro ou porque o usuário parou. */
  | {
      type: 'turn-end'
      outcome: 'done' | 'error' | 'stopped'
      /** A última resposta do turno no Claude Code (o uuid): onde voltar para editar a seguinte. */
      at?: string
    }
  /** Aviso para mostrar na conversa (texto em Markdown). */
  | { type: 'notice'; level: NoticeLevel; text: string }
  /**
   * O que a resposta mudou nos arquivos (Fase 42), no fim do turno: o diff de cada um, de antes
   * do turno até agora, para revisar e desfazer. `turn` diz de qual turno é o card.
   */
  | { type: 'turn-review'; turn: number; files: ReviewFile[] }
  /**
   * O Claude quer usar uma ferramenta que precisa de aprovação. `toolUseId` liga o pedido ao
   * card da ferramenta.
   */
  | {
      type: 'permission-request'
      id: string
      toolName: string
      input: unknown
      toolUseId?: string
      /** Navegador: o site em jogo (o de destino, ou o da página aberta). */
      site?: string
      /**
       * Até onde vai o "Permitir sempre": 'site' libera o site nesta conversa (navegador); 'none'
       * não oferece (código na página, envio de arquivos). Sem o campo, a ferramenta ou o comando.
       */
      always?: 'site' | 'none'
      /**
       * Comando do Bash: o que o "Permitir sempre" libera ("git status", "ls" ou o comando
       * inteiro, quando não dá para generalizar com segurança).
       */
      scope?: string
      /** O comando inteiro é o escopo (comando composto, perigoso ou com segredos). */
      exact?: boolean
    }
  /**
   * O pedido foi respondido, ou cancelado (o turno acabou ou o Claude desistiu). Perguntas
   * respondidas trazem as respostas.
   */
  | {
      type: 'permission-resolved'
      id: string
      decision: PermissionDecision | 'answered' | 'cancelled'
      answers?: Record<string, string>
    }
  /**
   * A conversa recomeçou. Vem pelo mesmo canal dos outros eventos, então nada da conversa
   * anterior chega depois dele.
   */
  | { type: 'reset' }
  /**
   * Mensagens saíram: a última (e o que veio depois dela), editada (Fase 21), ou, com `keep`,
   * tudo a partir da mensagem que começa o turno número `keep` (Fase 46: voltar a um ponto).
   */
  | { type: 'rewind'; keep?: number }
  /** O rascunho da caixa, guardado da última vez. */
  | { type: 'draft'; text: string }
  /**
   * O modelo: o escolhido na pílula (null é o padrão do Claude Code) e o que respondeu por
   * último, como o CLI o chama (por exemplo "claude-sonnet-5-5"), se já se sabe.
   */
  | { type: 'model'; choice: string | null; active: string | null }
  /** O uso do plano mudou. */
  | { type: 'usage'; usage: PlanUsage }
  /** Por onde a conversa vai (assinatura ou OpenRouter). */
  | { type: 'provider'; provider: Provider }
  /** A pasta onde a conversa roda (com ~), ou null: o espaço de trabalho do Wisp. */
  | { type: 'folder'; folder: string | null }
  /** O custo estimado da conversa pela OpenRouter, a cada resposta. */
  | { type: 'cost'; cost: ConversationCost }
  /** Quanto da janela de contexto a conversa ocupa (a cada resposta e ao compactar). */
  | { type: 'context'; context: ContextUsage }
  /** A conversa foi compactada (por você ou sozinha, perto do limite): tokens antes e depois. */
  | {
      type: 'compacted'
      trigger: 'manual' | 'auto'
      before: number | null
      after: number | null
    }
  /** O modo de permissão da conversa mudou (pelo usuário ou pelo Claude Code). */
  | { type: 'mode'; mode: PermissionMode }
  /**
   * Uma mensagem do usuário, ao reabrir uma conversa do histórico. Ao vivo, o chat mostra a
   * mensagem na hora do envio, sem esperar o main; as faladas (`voice`) vêm do main. `queued`:
   * mandada com o Claude trabalhando, espera ele pegar (o user-delivered avisa).
   */
  | {
      type: 'user'
      text: string
      attachments: AttachmentPreview[]
      voice?: boolean
      queued?: boolean
      /** No histórico: entrou num turno em andamento (não começou um). */
      inTurn?: boolean
    }
  /** A mais antiga das mensagens mandadas com o Claude trabalhando chegou a ele. */
  | { type: 'user-delivered' }
  /** As mensagens que esperavam o Claude não chegaram (a resposta parou, o processo caiu). */
  | { type: 'queue-dropped' }
  /** Um passo de um subagente (o card do Agente mostra a lista). */
  | { type: 'subagent-step'; parent: string; id: string; name: string; input: unknown }
  | { type: 'subagent-step-end'; parent: string; id: string; isError: boolean }
  /** Uma tarefa do Claude Code começou ou mudou (um comando em segundo plano, por exemplo). */
  | { type: 'task'; task: TaskInfo }
  /** Os comandos com barra que o Claude Code aceita nesta conversa (skills e comandos). */
  | { type: 'commands'; commands: string[] }
  /** A aba passou a mostrar o chat ou o terminal (o Claude Code de verdade). */
  | { type: 'view'; view: ConversationView }
  /** Como está o Claude Code do modo terminal: rodando, encerrado (com o código) ou parado. */
  | { type: 'terminal'; terminal: TerminalStatus }
  /** Fim da reabertura de uma conversa do histórico (vem depois das mensagens dela). */
  | { type: 'restored'; createdAt: number }
  /** Abrir uma conversa pela busca do histórico: a busca na conversa abre nessa mensagem. */
  | { type: 'jump'; target: HistoryTarget }

/**
 * "allow-always" vale até a conversa recomeçar (Permitir sempre nesta conversa). No card do
 * plano (ExitPlanMode), "allow" aprova e volta a pedir antes das ações, e "allow-edits" e
 * "allow-auto" aprovam e passam para Aceitar edições ou Automático.
 */
export type PermissionDecision = 'allow' | 'allow-always' | 'deny' | 'allow-edits' | 'allow-auto'

/**
 * Os modos de permissão do Claude Code que o Wisp oferece, como no Shift+Tab do terminal:
 * - 'default' (Pedir): tudo fora da lista segura vira card;
 * - 'acceptEdits' (Aceitar edições): edições de arquivos passam direto (menos os ocultos);
 * - 'plan' (Planejar): o Claude só lê e planeja, e o plano vem num card para aprovar;
 * - 'auto' (Automático): o classificador do Claude Code aprova o que você pediu e barra o
 *   arriscado; só o que ele não decidir vira card.
 * O "bypassPermissions" (pular todas as permissões) fica de fora de propósito.
 */
export const PERMISSION_MODES = ['default', 'acceptEdits', 'plan', 'auto'] as const

/**
 * Por onde a conversa vai: o Claude Code com a assinatura (o padrão) ou com a API da OpenRouter
 * (experimental), com a chave da pessoa e um modelo de lá.
 */
export type Provider = 'subscription' | 'openrouter'

/** Um projeto para abrir numa aba: o nome, o caminho com ~ e o caminho de verdade. */
export interface FolderChoice {
  name: string
  display: string
  path: string
}

/** Uma conversa numa cópia do projeto (Fase 43): de onde, o ramo e o que mudou nela. */
export interface WorktreeStatus {
  /** A pasta do repositório original (com ~). */
  repo: string
  branch: string
  changes: { path: string; added: number; removed: number }[]
  error?: string
}

/** Juntar ou descartar a cópia: deu certo ou não, e o que dizer. */
export interface WorktreeResult {
  ok: boolean
  message: string
}

/** Abrir uma pasta numa aba: deu certo, a pessoa desistiu, ou o motivo. */
export type FolderResult = { ok: true } | { ok: false; message?: string }

/** Um modelo da OpenRouter para a pílula, com os preços em dólares por milhão de tokens. */
export interface OpenRouterModelInfo {
  id: string
  name: string
  prompt: number | null
  completion: number | null
  context: number | null
}

/** O custo estimado de uma conversa pela OpenRouter: dólares (null sem preço) e tokens. */
export interface ConversationCost {
  usd: number | null
  inputTokens: number
  outputTokens: number
  /** Quantas respostas entraram na conta. */
  turns: number
}

/** O contexto da conversa: tokens ocupados, o tamanho da janela (null até o CLI contar) e se está
 * compactando agora. */
export interface ContextUsage {
  used: number
  window: number | null
  compacting: boolean
}

/** Uma tarefa do Claude Code (um comando rodando, um subagente em segundo plano). */
export interface TaskInfo {
  id: string
  description: string
  status: 'running' | 'completed' | 'failed' | 'stopped'
  /** Roda em segundo plano: a resposta segue sem esperar por ela. */
  background: boolean
}

/** O que a aba mostra: o chat do Wisp ou o Claude Code de verdade, num terminal. */
export type ConversationView = 'chat' | 'terminal'

/** O processo do modo terminal. */
export type TerminalStatus =
  { state: 'idle' } | { state: 'running' } | { state: 'exited'; code: number | null }

export type PermissionMode = (typeof PERMISSION_MODES)[number]

/** Quantos painéis a janela do chat mostra, no máximo (a grade, em shared/layout.ts). */
export { MAX_PANES } from './layout'

/** Uma aba do painel: uma conversa do Wisp ou uma sessão do Claude Code no terminal. */
export type TabInfo =
  | { id: string; kind: 'chat'; title: string; project?: string; folder?: string }
  | { id: string; kind: 'session'; title: string; sessionId: string }

/** As abas abertas e os painéis da grade (cada um mostra uma aba). */
export interface TabsState {
  tabs: TabInfo[]
  /** Ids das abas à vista, na ordem da grade (1 a MAX_PANES). */
  panes: string[]
  /** O painel em foco (onde vão o atalho de voz, o --ask e os arquivos soltos). */
  focused: number
  /** A grade: como os painéis se dividem e as proporções de cada um. */
  layout: Layout
}

/** A janela do painel: maximizada, e solta (onde você deixou) ou ao lado do mascote. */
export interface WindowState {
  maximized: boolean
  detached: boolean
}

export type NoticeLevel = 'info' | 'warning' | 'error'
