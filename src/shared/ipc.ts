// Contrato de IPC entre main, preload e renderer: os canais (IPC) e a API do preload (WispApi).
// Os tipos de cada assunto ficam nos ipc-*.ts e saem daqui também.

import type { AvatarName } from './avatars'
import type { MascotAct, MascotPreview } from './emotions'
import type { DropZone } from './layout'
import type { SavedPrompt } from './prompts'
import type {
  ChatEvent,
  ClipboardOffer,
  ClipboardUse,
  ConversationSummary,
  ConversationView,
  ExportResult,
  FileViewResult,
  FolderChoice,
  FolderResult,
  HistoryHit,
  HistoryTarget,
  OpenRouterModelInfo,
  OutgoingAttachment,
  PastedImage,
  PermissionDecision,
  PermissionMode,
  Provider,
  ReviewUndoResult,
  RewindPreview,
  RewindResult,
  AsideResult,
  PreviewResult,
  PreviewState,
  TabsState,
  WorktreeResult,
  WorktreeStatus,
  WindowState
} from './ipc-chat'
import type {
  Accessory,
  DroppedFiles,
  Gaze,
  MascotReaction,
  MascotState,
  MascotView,
  SoundName,
  SoundSettings,
  VoiceCaptureEvent,
  VoiceCommand,
  VoiceStatus,
  VoiceTestResult
} from './ipc-mascot'
import type { IslandAction, MascotIsland } from './ipc-island'
import type { HookPreview, HooksAction, SessionAnswer, SessionsSnapshot } from './ipc-sessions'
import type {
  AgendaItem,
  DiagnosticAction,
  DiagnosticsSnapshot,
  McpApplyResult,
  McpChange,
  McpPreview,
  McpSnapshot,
  OpenRouterKeyResult,
  CalendarLinkResult,
  PanelView,
  PhonePairResult,
  PhoneResult,
  PortablePreview,
  PortableResult,
  Settings,
  SettingsResult,
  SettingsSnapshot,
  SkillInfo,
  SkillPreview,
  SkillResult,
  TaskResult,
  WeekSummaries
} from './ipc-settings'

export * from './ipc-chat'
export * from './ipc-mascot'
export * from './ipc-island'
export * from './ipc-sessions'
export * from './ipc-settings'

export const IPC = {
  /** renderer → main: começou um arraste. Args: (offsetX, offsetY) do ponto agarrado. */
  mascotDragStart: 'mascot:drag-start',
  /** renderer → main: o arraste terminou (botão solto ou captura perdida). */
  mascotDragEnd: 'mascot:drag-end',
  /** renderer → main: clique sem arraste no mascote. */
  mascotClick: 'mascot:click',
  /** mascote → main: a página carregou e já ouve o estado (o main manda o atual). */
  mascotReady: 'mascot:ready',
  /** main → mascote: o estado mudou. Arg: MascotView. */
  mascotState: 'mascot:state',
  /** main → mascote: chegou um pedaço de texto da resposta (o brilho pulsa no ritmo). */
  mascotPulse: 'mascot:pulse',
  /** main → mascote: para onde os olhos olham (Gaze), ou null para voltarem ao centro. */
  mascotGaze: 'mascot:gaze',
  /** mascote → main: o cursor entrou (true) ou saiu (false) de cima do mascote. */
  mascotHover: 'mascot:hover',
  /** mascote → main: o usuário mexeu com o mascote (cutucou, fez carinho). */
  mascotActivity: 'mascot:activity',
  /** mascote → main: arquivos soltos no mascote, para anexar no painel. Arg: DroppedFiles. */
  mascotDrop: 'mascot:drop',
  /** mascote → main: clique com o botão direito (abre o menu do mascote). */
  mascotMenu: 'mascot:menu',
  /** main → mascote: uma reação que vem de fora da página. Arg: MascotReaction. */
  mascotReact: 'mascot:react',
  /**
   * main → mascote: uma emoção ou dança pedida (pelo Claude, na galeria das configurações), ou a
   * dança de quando toca música (Fase 27). Arg: MascotAct.
   */
  mascotAct: 'mascot:act',
  /** chat → main: mostrar uma emoção ou dança da galeria das configurações. Arg: MascotPreview. */
  mascotPreview: 'mascot:preview',
  /** main → mascote: o acessório do dia. Arg: Accessory | null. */
  mascotAccessory: 'mascot:accessory',
  /** main → mascote: o avatar escolhido (Fase 19). Arg: AvatarName. */
  mascotAvatar: 'mascot:avatar',
  /** main → mascote: menos movimento, mesmo com o sistema animando (Fase 22). Arg: boolean. */
  mascotMotion: 'mascot:motion',
  mascotIsland: 'mascot:island',
  /** Um botão da ilha aberta (Fase 37). */
  islandAction: 'island:action',
  agendaNext: 'agenda:next',
  summaryGet: 'summary:get',
  summaryShow: 'summary:show',
  /** main → mascote: tocar um som. Args: (SoundName, volume de 0 a 1). */
  mascotSound: 'mascot:sound',
  /**
   * main → mascote: um som da pasta de sons do usuário. Args: (SoundName, bytes do arquivo, ou
   * null quando ele sai da pasta e o som sintetizado volta).
   */
  mascotCustomSound: 'mascot:custom-sound',

  /** mascote → main: pede um som de reação (o main confere se os sons estão ligados). */
  soundPlay: 'sound:play',
  /** chat → main (invoke): os sons estão ligados? Devolve SoundSettings. */
  soundGet: 'sound:get',
  /** chat → main: liga ou desliga os sons. Arg: boolean. */
  soundSet: 'sound:set',
  /** main → chat: os sons foram ligados ou desligados. Arg: SoundSettings. */
  soundChanged: 'sound:changed',

  /** chat → main: a página carregou e já ouve eventos (o main manda os que guardou). */
  chatReady: 'chat:ready',
  /** chat → main: mensagem do usuário. Args: (conversa, texto, anexos). */
  chatSend: 'chat:send',
  /** chat → main: parar a resposta em andamento. Arg: conversa. */
  chatStop: 'chat:stop',
  /**
   * chat → main (invoke): troca a última mensagem por outra (Fase 21): a conversa volta para
   * antes dela e a nova vai no lugar. Args: (conversa, texto, anexos). Devolve boolean.
   */
  chatEditLast: 'chat:edit-last',
  /**
   * chat → main (invoke): o que voltar ao turno `turn` (contado das mensagens que começam um
   * turno, a partir de 0) faria nos arquivos (Fase 46). Args: (conversa, turno). Devolve
   * RewindPreview.
   */
  chatRewindPreview: 'chat:rewind-preview',
  /**
   * chat → main (invoke): volta a conversa para antes do turno `turn` (Fase 46); com `files`, os
   * arquivos ([{ path, hash }] da prévia) voltam também. Devolve RewindResult.
   */
  chatRewind: 'chat:rewind',
  /** chat → main (invoke): uma aba nova com a conversa até o fim do turno `turn`. Devolve boolean. */
  chatFork: 'chat:fork',
  /** chat → main (invoke): a pergunta lateral (Fase 46). Args: (conversa, pergunta). Devolve AsideResult. */
  chatAside: 'chat:aside',
  /**
   * chat → main (invoke): abre a pré-visualização (Fase 47). Args: (alvo, pasta da conversa ou
   * null). Devolve PreviewResult.
   */
  previewOpen: 'preview:open',
  /** chat → main (invoke): um print da pré-visualização vai como anexo. Devolve boolean. */
  previewCapture: 'preview:capture',
  /** chat → main: recarregar e fechar a pré-visualização. */
  previewReload: 'preview:reload',
  previewClose: 'preview:close',
  /** chat → main (invoke): o estado da pré-visualização (PreviewState). */
  previewGet: 'preview:get',
  /** main → chat: a pré-visualização abriu, mudou ou fechou. Arg: PreviewState. */
  previewState: 'preview:state',
  /** chat → main: o rascunho da caixa de uma aba, para voltar ao reabrir. Args: (conversa, texto). */
  chatDraft: 'chat:draft',
  /** chat → main (invoke): exporta a conversa da aba em Markdown. Arg: conversa. Devolve ExportResult. */
  chatExport: 'chat:export',
  /** chat → main: recomeçar a conversa de uma aba (Ctrl+K). Arg: conversa. */
  chatNew: 'chat:new',
  /** chat → main: trocar o modelo. Args: (conversa, um de MODEL_CHOICES ou null). */
  chatModel: 'chat:model',
  /** chat → main: trocar o provedor da aba (recomeça a conversa). Args: (conversa, Provider). */
  chatProvider: 'chat:provider',
  /** chat → main: compactar a conversa. Args: (conversa, instruções opcionais). */
  chatCompact: 'chat:compact',
  chatView: 'chat:view',
  tuiAttach: 'tui:attach',
  tuiInput: 'tui:input',
  tuiResize: 'tui:resize',
  tuiData: 'tui:data',
  /** chat → main (invoke): os modelos da OpenRouter. Devolve OpenRouterModelInfo[] ou { error }. */
  openrouterModels: 'openrouter:models',
  /** chat → main (invoke): guarda a chave no chaveiro (conferida antes). Devolve OpenRouterKeyResult. */
  openrouterSetKey: 'openrouter:set-key',
  /** chat → main (invoke): apaga a chave do chaveiro. Devolve OpenRouterKeyResult. */
  openrouterClearKey: 'openrouter:clear-key',
  /**
   * chat → main (invoke): guarda uma agenda por endereço (Fase 40), conferida antes. Args:
   * (endereço, nome ou ''). Devolve CalendarLinkResult.
   */
  calendarAddLink: 'calendar:add-link',
  /** chat → main (invoke): apaga uma agenda por endereço, pelo id. Devolve CalendarLinkResult. */
  calendarRemoveLink: 'calendar:remove-link',
  /**
   * chat → main (invoke): pareia um celular (Fase 18): sorteia os tópicos e os guarda no chaveiro.
   * Args: (servidor, ficha de acesso ou ''). Devolve PhonePairResult.
   */
  phonePair: 'phone:pair',
  /** chat → main (invoke): o link do pareamento de novo (o QR code). Devolve PhonePairResult. */
  phoneLink: 'phone:link',
  /**
   * chat → main (invoke): manda o teste com o botão Confirmar e espera o celular (até 2 minutos);
   * respondido, a função liga. Devolve PhoneResult.
   */
  phoneConfirm: 'phone:confirm',
  /** chat → main: desiste de esperar o teste. */
  phoneCancel: 'phone:cancel',
  /** chat → main (invoke): desliga a função (o pareamento fica). Devolve PhoneResult. */
  phoneDisable: 'phone:disable',
  /** chat → main (invoke): desfaz o pareamento (apaga os tópicos do chaveiro). Devolve PhoneResult. */
  phoneUnpair: 'phone:unpair',
  /** chat → main (invoke): roda as conferências (Fase 20). Devolve DiagnosticsSnapshot. */
  diagnosticsRun: 'diagnostics:run',
  /** chat → main: copia o último relatório do diagnóstico. */
  diagnosticsCopy: 'diagnostics:copy',
  /** chat → main: abre uma issue nova no GitHub, com o último relatório. */
  diagnosticsIssue: 'diagnostics:issue',
  /** chat → main (invoke): o botão de uma conferência. Arg: DiagnosticAction. Devolve PhoneResult. */
  diagnosticsAction: 'diagnostics:action',
  /** main → chat: mostra uma tela do painel. Arg: 'welcome' | 'diagnostics'. */
  panelView: 'panel:view',
  /** chat → main: os primeiros passos acabaram (ou foram pulados). */
  welcomeDone: 'welcome:done',
  /** chat → main: trocar o modo de permissão. Args: (conversa, PermissionMode). */
  chatMode: 'chat:mode',
  /**
   * chat → main (invoke): guarda uma imagem colada (Ctrl+V) para virar anexo. Args: (bytes,
   * tipo MIME). Devolve PastedImage.
   */
  chatPaste: 'chat:paste',
  /** chat → main: esconder o painel. */
  chatHide: 'chat:hide',
  /** chat → main: resposta a um card de permissão. Args: (id, PermissionDecision). */
  chatPermission: 'chat:permission',
  /**
   * chat → main: respostas a uma pergunta do Claude. Args: (id, mapa pergunta → resposta, ou
   * null para pular).
   */
  chatAnswer: 'chat:answer',
  /** main → chat: um ChatEvent de uma conversa. Args: (conversa, ChatEvent). */
  chatEvent: 'chat:event',

  /** main → chat: as abas e como estão divididas na janela. Arg: TabsState. */
  tabsState: 'tabs:state',
  /** chat → main: abrir uma conversa nova numa aba (Ctrl+T). */
  tabsNew: 'tabs:new',
  /** chat → main: fechar uma aba. Arg: id da aba. */
  tabsClose: 'tabs:close',
  /** chat → main: mostrar uma aba no painel em foco. Arg: id da aba. */
  tabsShow: 'tabs:show',
  /** chat → main: o usuário mexeu num painel (ele passa a ser o do foco). Arg: índice. */
  tabsFocus: 'tabs:focus',
  /** chat → main: dividir o painel em foco (até MAX_PANES). Arg: 'row' (ao lado) ou 'column'. */
  tabsSplit: 'tabs:split',
  /** chat → main: uma aba arrastada para um painel. Args: (aba, aba do painel, DropZone). */
  tabsDrop: 'tabs:drop',
  /** chat → main: novas proporções de uma divisão da grade. Args: (caminho, proporções). */
  tabsResize: 'tabs:resize',
  /** chat → main: maximizar ou restaurar a janela. */
  windowMaximize: 'window:maximize',
  /** chat → main: a janela volta para perto do mascote. */
  windowDock: 'window:dock',
  /** main → chat: a janela mudou (maximizada, solta). Arg: WindowState. */
  windowState: 'window:state',
  /** chat → main: fechar um painel (as abas continuam abertas). Arg: índice. */
  tabsUnsplit: 'tabs:unsplit',
  /** chat → main: abrir uma sessão do terminal numa aba. Arg: id da sessão. */
  tabsOpenSession: 'tabs:open-session',
  /** chat → main (invoke): os projetos (das pastas de projetos) para abrir numa aba. */
  tabsProjects: 'tabs:projects',
  /**
   * chat → main (invoke): uma conversa numa pasta, numa aba nova. Arg: o caminho de um projeto
   * da lista, ou null para escolher a pasta. Devolve FolderResult.
   */
  tabsOpenFolder: 'tabs:open-folder',
  /** chat → main (invoke): a cópia (worktree) de uma conversa (Fase 43). Devolve WorktreeStatus ou null. */
  worktreeStatus: 'worktree:status',
  /** chat → main (invoke): junta a cópia da conversa na pasta original. Devolve WorktreeResult. */
  worktreeJoin: 'worktree:join',
  /** chat → main (invoke): descarta a cópia da conversa (e fecha a aba). Devolve WorktreeResult. */
  worktreeDiscard: 'worktree:discard',
  /** chat → main (invoke): as skills instaladas. Devolve SkillInfo[]. */
  skillsList: 'skills:list',
  /** chat → main (invoke): escolher uma pasta com uma skill. Devolve SkillPreview, { error } ou null. */
  skillsPick: 'skills:pick',
  /** chat → main (invoke): instalar a skill escolhida no skillsPick. Devolve SkillResult. */
  skillsInstall: 'skills:install',
  /** chat → main (invoke): mandar uma skill pessoal para a lixeira. Arg: nome. Devolve SkillResult. */
  skillsRemove: 'skills:remove',
  /** chat → main: abrir a pasta das skills pessoais no gerenciador de arquivos. */
  skillsOpenFolder: 'skills:open-folder',
  /** main → chat: o humor do mascote mudou (o avatar do cabeçalho acompanha). Arg: MascotState. */
  chatMood: 'chat:mood',
  /** main → chat: o painel acabou de aparecer (para a animação de abertura). */
  chatShown: 'chat:shown',
  /** main → chat: arquivos soltos no mascote, para virar anexos. Arg: DroppedFiles. */
  chatAttach: 'chat:attach',
  /** chat → main: o usuário está mexendo no painel (o mascote não cochila). */
  chatActivity: 'chat:activity',
  /**
   * chat → main (invoke): tira um print da tela, com o painel fora da frente, para anexar.
   * Devolve DroppedFiles (um arquivo por tela, ou o motivo em problems).
   */
  chatCapture: 'chat:capture',
  /**
   * chat → main (invoke): recorta uma área da tela (Fase 41): o print, a camada para arrastar e o
   * recorte. Devolve DroppedFiles (vazio se a pessoa desistiu).
   */
  chatCaptureArea: 'chat:capture-area',
  /**
   * chat → main (invoke): desfaz arquivos do card do fim do turno (Fase 42). Args: (conversa,
   * turno, [{ path, hash }]). Devolve ReviewUndoResult.
   */
  chatReviewUndo: 'chat:review-undo',
  /** área → main (invoke): o print que a camada mostra. Devolve AreaImage ou null. */
  areaImage: 'area:image',
  /** área → main: o retângulo escolhido (AreaRect, em pixels da imagem), ou null para desistir. */
  areaDone: 'area:done',
  /** main → chat: o que há de novo na área de transferência (ClipboardOffer), ou null. */
  chatClipboard: 'chat:clipboard',
  /** chat → main (invoke): usar o que foi copiado. Arg: id da oferta. Devolve ClipboardUse. */
  chatClipboardUse: 'chat:clipboard-use',
  /** chat → main: dispensar a oferta (o × do chip). Arg: id. */
  chatClipboardDismiss: 'chat:clipboard-dismiss',
  /** chat → main: o usuário copiou algo do painel (não é para oferecer de volta). */
  chatCopied: 'chat:copied',
  /** main → chat: um texto ditado, para a caixa de mensagem (o usuário revisa e envia). */
  chatCompose: 'chat:compose',

  /** main → mascote: o que fazer com o microfone e com a fala do Wisp. Arg: VoiceCommand. */
  voiceCommand: 'voice:command',
  /** mascote → main: o que a captura ouviu (ou por que não deu). Arg: VoiceCaptureEvent. */
  voiceEvent: 'voice:event',
  /** main → chat e mascote: em que pé está a voz. Arg: VoiceStatus. */
  voiceStatus: 'voice:status',
  /** main → chat: o volume do que o microfone ouve, de 0 a 1 (o botão do microfone pulsa). */
  voiceLevel: 'voice:level',
  /** chat → main: o botão do microfone (começa a ouvir; ouvindo, termina). */
  voiceToggle: 'voice:toggle',

  /** chat → main (invoke): as configurações de agora. Devolve SettingsSnapshot. */
  settingsGet: 'settings:get',
  /**
   * chat → main (invoke): muda configurações (um Partial<Settings>, e `autostart`). Devolve
   * SettingsResult; deu certo, o settingsChanged traz o novo estado.
   */
  settingsSet: 'settings:set',
  /** main → chat: as configurações mudaram (pela tela, pelo menu ou no arquivo). */
  settingsChanged: 'settings:changed',
  /** chat → main: abre o config.json (no editor de JSON, ou a pasta dele). */
  settingsOpenFile: 'settings:open-file',
  /** Abre o Wisp de novo (o idioma novo vale a partir daí). */
  settingsRelaunch: 'settings:relaunch',
  /** chat → main: roda uma tarefa agendada agora (o botão das configurações). Devolve TaskResult. */
  settingsRunTask: 'settings:run-task',
  /** chat → main: os prompts salvos, para o menu da barra. */
  promptsList: 'prompts:list',
  /** chat → main: o texto de um prompt salvo, com as variáveis preenchidas para a conversa. */
  promptsExpand: 'prompts:expand',
  /** main → chat: mostra a tela de configurações (o item do menu do mascote). */
  settingsShow: 'settings:show',
  /** chat → main: desiste da escuta (Esc). */
  voiceCancel: 'voice:cancel',
  /** chat → main (invoke): o teste de voz das configurações. Devolve VoiceTestResult. */
  voiceTest: 'voice:test',

  /** chat → main (invoke): as conversas guardadas. Devolve ConversationSummary[]. */
  historyList: 'history:list',
  /**
   * chat → main (invoke): reabre uma conversa do histórico numa aba. Args: (id, HistoryTarget
   * opcional: a mensagem onde abrir). Devolve boolean.
   */
  historyOpen: 'history:open',
  /** chat → main (invoke): busca no que foi dito (Fase 29). Arg: texto. Devolve HistoryHit[]. */
  historySearch: 'history:search',
  /** chat → main (invoke): os servidores MCP (Fase 30). Devolve McpSnapshot. */
  mcpList: 'mcp:list',
  /** chat → main (invoke): o que pôr ou tirar um servidor muda. Arg: McpChange. Devolve McpPreview. */
  mcpPreview: 'mcp:preview',
  /** chat → main (invoke): grava a mudança vista. Args: (McpChange, impressão). Devolve McpApplyResult. */
  mcpApply: 'mcp:apply',
  /** chat → main (invoke): o texto de um arquivo para ver no painel (Fase 34). Arg: caminho. Devolve FileViewResult. */
  filesView: 'files:view',
  /** chat → main (invoke): exporta para um arquivo (Fase 31). Arg: com o histórico. Devolve PortableResult. */
  portableExport: 'portable:export',
  /** chat → main (invoke): escolhe um arquivo para importar. Devolve PortablePreview, { error } ou null. */
  portablePick: 'portable:pick',
  /** chat → main (invoke): importa o arquivo da prévia. Devolve PortableResult. */
  portableImport: 'portable:import',
  /** chat → main (invoke): apaga uma conversa do histórico. Arg: id. Devolve boolean. */
  historyDelete: 'history:delete',
  /** chat → main (invoke): fixa ou solta uma conversa no topo. Args: (id, fixada). Devolve boolean. */
  historyPin: 'history:pin',
  /** chat → main (invoke): exporta uma conversa guardada em Markdown. Arg: id. Devolve ExportResult. */
  historyExport: 'history:export',

  /** chat → main (invoke): as sessões do Claude Code no terminal. Devolve SessionsSnapshot. */
  sessionsGet: 'sessions:get',
  /** main → chat: as sessões mudaram (a página pede de novo com sessionsGet). */
  sessionsChanged: 'sessions:changed',
  /** main → chat: mostrar a aba Sessões (chegou um pedido de uma sessão). */
  sessionsShow: 'sessions:show',
  /** chat → main: resposta a um pedido de uma sessão. Args: (sessão, pedido, SessionAnswer). */
  sessionsAnswer: 'sessions:answer',
  /** chat → main (invoke): trazer o terminal da sessão para a frente. Arg: sessão. */
  sessionsFocus: 'sessions:focus',
  /** chat → main: abrir a pasta da sessão no editor. Arg: sessão. */
  sessionsFolder: 'sessions:folder',
  /** chat → main: continuar a sessão no chat do Wisp. Arg: sessão. */
  sessionsContinue: 'sessions:continue',
  /** chat → main: tirar uma sessão encerrada da lista. Arg: sessão. */
  sessionsForget: 'sessions:forget',
  /** chat → main (invoke): o que instalar ou tirar os hooks muda. Arg: HooksAction. */
  hooksPreview: 'hooks:preview',
  /** chat → main (invoke): grava a mudança vista na prévia. Args: (HooksAction, impressão). */
  hooksApply: 'hooks:apply'
} as const

/** API que o preload expõe ao renderer como `window.wisp`. */
/** O print que a camada de recorte mostra (Fase 41). */
export interface AreaImage {
  /** Data URL do PNG. */
  url: string
  width: number
  height: number
}

/** Um retângulo em pixels da imagem do print. */
export interface AreaRect {
  x: number
  y: number
  width: number
  height: number
}

export interface WispApi {
  /** A camada de recorte (Fase 41). */
  area: {
    image(): Promise<AreaImage | null>
    done(rect: AreaRect | null): void
  }
  mascot: {
    /** Começa a arrastar o mascote; o offset é o ponto agarrado dentro da janela (px CSS). */
    dragStart(offsetX: number, offsetY: number): void
    dragEnd(): void
    click(): void
    /** Avisa que a página está pronta. Chame depois de registrar o onState. */
    ready(): void
    /** Registra quem recebe as mudanças de estado; devolve a função que cancela. */
    onState(listener: (view: MascotView) => void): () => void
    onPulse(listener: () => void): () => void
    onGaze(listener: (gaze: Gaze | null) => void): () => void
    onReact(listener: (reaction: MascotReaction) => void): () => void
    /** Uma emoção ou dança pedida, ou a dança da música (Fase 27). */
    onAct(listener: (act: MascotAct) => void): () => void
    onAccessory(listener: (accessory: Accessory | null) => void): () => void
    /** O avatar escolhido (o robô, o fantasminha). */
    onAvatar(listener: (avatar: AvatarName) => void): () => void
    /** Menos movimento pedido nas configurações (o do sistema vale sempre). */
    onMotion(listener: (reduce: boolean) => void): () => void
    /**
     * A ilha (null: fora dela): recolhida, espiando ou aberta, a linha de estado e, aberta, as
     * conversas, o pedido que espera e a música (Fase 37).
     */
    onIsland(listener: (island: MascotIsland) => void): () => void
    /** Um botão da ilha. */
    island(action: IslandAction): void
    /** Tocar um som com este volume (o main já conferiu se os sons estão ligados). */
    onSound(listener: (name: SoundName, volume: number) => void): () => void
    /** Um som da pasta do usuário chegou (bytes) ou saiu (null). */
    onCustomSound(listener: (name: SoundName, data: ArrayBuffer | null) => void): () => void
    /** O cursor entrou ou saiu de cima do mascote. */
    hover(inside: boolean): void
    /** O usuário mexeu com o mascote (conta como atividade: ele não cochila). */
    activity(): void
    /** Pede um som de reação; toca se os sons estiverem ligados. */
    playSound(name: SoundName): void
    /** Arquivos soltos no mascote: o painel abre com eles anexados. */
    drop(dropped: DroppedFiles): void
    /** Caminho no disco de um File solto ('' se não houver). */
    pathForFile(file: File): string
    /** Abre o menu do mascote (botão direito). */
    menu(): void
    /** O main pede para ouvir, parar de ouvir ou falar. */
    onVoice(listener: (command: VoiceCommand) => void): () => void
    /** O que a captura ouviu. */
    voiceEvent(event: VoiceCaptureEvent): void
    /** Em que pé está a voz (para o mascote mostrar que ouve). */
    onVoiceStatus(listener: (status: VoiceStatus) => void): () => void
  }
  chat: {
    /** Avisa que a página está pronta. Chame depois de registrar o onEvent. */
    ready(): void
    /** Manda uma mensagem com os anexos (caminhos: veja pathForFile e savePasted). */
    send(conversation: string, text: string, attachments: OutgoingAttachment[]): void
    /** Caminho no disco de um File vindo de um arraste ou do seletor de arquivos ('' se não houver). */
    pathForFile(file: File): string
    /** Guarda uma imagem colada num arquivo, para ela poder ser anexada. */
    savePasted(data: ArrayBuffer, type: string): Promise<PastedImage>
    stop(conversation: string): void
    /** Troca a última mensagem por outra: a conversa volta para antes dela (Fase 21). */
    editLast(
      conversation: string,
      text: string,
      attachments: OutgoingAttachment[]
    ): Promise<boolean>
    /** O que voltar ao turno `turn` faria nos arquivos (Fase 46). */
    rewindPreview(conversation: string, turn: number): Promise<RewindPreview>
    /** Volta a conversa para antes do turno `turn`; com `files`, os arquivos também (Fase 46). */
    rewind(
      conversation: string,
      turn: number,
      files: { path: string; hash: string }[] | null
    ): Promise<RewindResult>
    /** Uma aba nova com a conversa até o fim do turno `turn` (Fase 46). */
    fork(conversation: string, turn: number): Promise<boolean>
    /** Uma pergunta rápida com o contexto da conversa, sem entrar nela (Fase 46). */
    aside(conversation: string, question: string): Promise<AsideResult>
    /** Guarda o rascunho da caixa da aba. */
    saveDraft(conversation: string, text: string): void
    /** Exporta a conversa da aba em Markdown (o diálogo do sistema escolhe onde). */
    exportMarkdown(conversation: string): Promise<ExportResult>
    /** Recomeça a conversa de uma aba (Ctrl+K). */
    newConversation(conversation: string): void
    hide(): void
    /** Maximiza ou restaura a janela do painel. */
    maximize(): void
    /** A janela volta para perto do mascote (e para de lembrar onde você a deixou). */
    dock(): void
    onWindowState(listener: (state: WindowState) => void): () => void
    /**
     * Troca o modelo: um de MODEL_CHOICES, ou null para o padrão; numa conversa pela OpenRouter,
     * o id de um modelo de lá.
     */
    setModel(conversation: string, choice: string | null): void
    /** Troca o provedor da aba; a conversa recomeça (a atual fica no histórico). */
    setProvider(conversation: string, provider: Provider): void
    /** Compacta a conversa (o /compact do Claude Code), com instruções opcionais do que manter. */
    compact(conversation: string, instructions?: string): void
    /** A aba mostra o chat ou o Claude Code de verdade, num terminal (mesma conversa). */
    setView(conversation: string, view: ConversationView): void
    /** Troca o modo de permissão da conversa. */
    setMode(conversation: string, mode: PermissionMode): void
    answerPermission(id: string, decision: PermissionDecision): void
    /** Responde uma pergunta do Claude (texto da pergunta → resposta); null pula. */
    answerQuestion(id: string, answers: Record<string, string> | null): void
    /** Registra quem recebe os eventos das conversas; devolve a função que cancela. */
    onEvent(listener: (conversation: string, event: ChatEvent) => void): () => void
    /** O humor do mascote, para o avatar do cabeçalho. */
    onMood(listener: (state: MascotState) => void): () => void
    /** O painel acabou de aparecer. */
    onShown(listener: () => void): () => void
    /** Arquivos soltos no mascote, para anexar. */
    onAttach(listener: (dropped: DroppedFiles) => void): () => void
    /** O usuário está mexendo no painel (chame no máximo de tempos em tempos). */
    activity(): void
    /** Tira um print da tela (o painel sai da frente) e devolve os arquivos para anexar. */
    captureScreen(): Promise<DroppedFiles>
    /** Recorta uma área da tela (Fase 41) e devolve o recorte para anexar (vazio: desistiu). */
    captureArea(): Promise<DroppedFiles>
    /** Desfaz arquivos do card do fim do turno (Fase 42). */
    reviewUndo(
      conversation: string,
      turn: number,
      files: { path: string; hash: string }[]
    ): Promise<ReviewUndoResult>
    /** O que há de novo na área de transferência (null: nada a oferecer). */
    onClipboard(listener: (offer: ClipboardOffer | null) => void): () => void
    /** Usa o que foi copiado: o texto para a caixa ou um anexo. */
    takeClipboard(id: string): Promise<ClipboardUse>
    dismissClipboard(id: string): void
    /** O usuário copiou algo do painel. */
    copied(): void
    /** Um texto ditado para a caixa de mensagem. */
    onCompose(listener: (text: string) => void): () => void
  }
  /** O modo terminal: o Claude Code de verdade numa aba (Fase 17). */
  tui: {
    /** O que o terminal da conversa já mostrou (e sobe o processo, se preciso). */
    attach(conversation: string): Promise<string>
    /** O que foi digitado no terminal. */
    input(conversation: string, data: string): void
    /** O tamanho do terminal na página, em colunas e linhas. */
    resize(conversation: string, cols: number, rows: number): void
    /** A saída dos terminais (de qualquer conversa). */
    onData(listener: (conversation: string, data: string) => void): () => void
  }
  /** As abas e os painéis lado a lado. */
  tabs: {
    onState(listener: (state: TabsState) => void): () => void
    /** Uma conversa nova numa aba, no painel em foco. */
    create(): void
    close(id: string): void
    /** Mostra a aba no painel em foco (ou foca o painel onde ela já está). */
    show(id: string): void
    focus(pane: number): void
    /** Divide o painel em foco: ao lado ('row') ou embaixo ('column'). */
    split(dir?: 'row' | 'column'): void
    unsplit(pane: number): void
    /** Uma aba arrastada para o painel de outra: na borda divide, no meio troca. */
    drop(tab: string, target: string, zone: DropZone): void
    /** Novas proporções para a divisão no caminho dado (índices a partir da raiz). */
    resize(path: number[], sizes: number[]): void
    openSession(sessionId: string): void
    /** Os projetos das pastas de projetos, para abrir um numa aba. */
    projects(): Promise<FolderChoice[]>
    /** Uma conversa numa pasta (um projeto da lista, ou null para escolher), numa aba nova. */
    /** Com `worktree` (Fase 43), a conversa trabalha numa cópia do Git do projeto. */
    openFolder(path: string | null, worktree?: boolean): Promise<FolderResult>
    worktreeStatus(conversation: string): Promise<WorktreeStatus | null>
    worktreeJoin(conversation: string): Promise<WorktreeResult>
    worktreeDiscard(conversation: string): Promise<WorktreeResult>
  }
  /** As skills do Claude Code: listar, instalar de uma pasta e remover. */
  skills: {
    list(): Promise<SkillInfo[]>
    pick(): Promise<SkillPreview | { error: string } | null>
    install(): Promise<SkillResult>
    remove(name: string): Promise<SkillResult>
    openFolder(): void
  }
  /** A voz: o botão do microfone do painel. */
  voice: {
    /** Começa a ouvir; se já estiver ouvindo, termina e transcreve. */
    toggle(): void
    cancel(): void
    /** Grava 3 s e transcreve, para ver se a voz funciona (as configurações). */
    test(): Promise<VoiceTestResult>
    onStatus(listener: (status: VoiceStatus) => void): () => void
    onLevel(listener: (level: number) => void): () => void
  }
  /** Os sons do Wisp (o botão de mudo do painel). */
  sound: {
    get(): Promise<SoundSettings>
    set(enabled: boolean): void
    onChanged(listener: (settings: SoundSettings) => void): () => void
  }
  /** A agenda: o próximo compromisso, para o painel vazio (null: nenhum nas próximas horas). */
  agenda: {
    onNext(listener: (next: AgendaItem | null) => void): () => void
  }
  /** O resumo da semana: o cartão no topo do histórico. */
  summary: {
    get(): Promise<WeekSummaries | null>
    /** A notificação de segunda-feira pediu o resumo. */
    onShow(listener: () => void): () => void
  }
  /** As configurações (a tela de configurações e o modo demonstração). */
  /** A OpenRouter (experimental): os modelos e a chave, que fica no chaveiro do sistema. */
  openrouter: {
    models(): Promise<OpenRouterModelInfo[] | { error: string }>
    setKey(key: string): Promise<OpenRouterKeyResult>
    clearKey(): Promise<OpenRouterKeyResult>
  }
  /** As agendas por endereço (Fase 40): o endereço vai para o chaveiro e nunca volta. */
  calendar: {
    addLink(url: string, name: string): Promise<CalendarLinkResult>
    removeLink(id: string): Promise<CalendarLinkResult>
  }
  /** O diagnóstico e os primeiros passos (Fase 20). */
  diagnostics: {
    run(): Promise<DiagnosticsSnapshot>
    copy(): void
    issue(): void
    action(action: DiagnosticAction): Promise<PhoneResult>
    /** O main pediu uma tela (os primeiros passos na primeira vez, o Diagnóstico… do menu). */
    onView(listener: (view: PanelView) => void): () => void
    welcomeDone(): void
  }
  /** Aprovar pelo celular (Fase 18): o pareamento com o ntfy. */
  phone: {
    pair(server: string, token: string): Promise<PhonePairResult>
    link(): Promise<PhonePairResult>
    confirm(): Promise<PhoneResult>
    cancel(): void
    disable(): Promise<PhoneResult>
    unpair(): Promise<PhoneResult>
  }
  settings: {
    get(): Promise<SettingsSnapshot>
    set(patch: Partial<Settings> & { autostart?: boolean }): Promise<SettingsResult>
    onChanged(listener: (snapshot: SettingsSnapshot) => void): () => void
    /** Abre o config.json ou o registro no app padrão (ou mostra na pasta). */
    openFile(which: 'config' | 'log'): void
    /** Fecha e abre o Wisp de novo (para o idioma novo valer). */
    relaunch(): void
    /** Roda uma tarefa agendada agora, numa aba nova. */
    runTask(id: string): Promise<TaskResult>
    /** Mostra no mascote uma emoção ou uma dança da galeria (Fase 27). */
    previewMascot(preview: MascotPreview): void
    /** O menu do mascote pediu a tela de configurações. */
    onShow(listener: () => void): () => void
  }
  prompts: {
    list(): Promise<SavedPrompt[]>
    /** O texto do prompt com as variáveis da conversa; null se ele não existe. */
    expand(conversation: string, name: string): Promise<string | null>
  }
  /** Ver um arquivo no painel (Fase 34), só para ler. */
  files: {
    view(path: string): Promise<FileViewResult>
  }
  /** A pré-visualização (Fase 47): HTML, PDF, imagens e o localhost numa janela; Markdown no painel. */
  preview: {
    open(target: string, folder: string | null): Promise<PreviewResult>
    capture(): Promise<boolean>
    reload(): void
    close(): void
    get(): Promise<PreviewState>
    onState(listener: (state: PreviewState) => void): () => void
  }
  /** Levar o Wisp junto (Fase 31): exportar e importar. */
  portable: {
    export(withHistory: boolean): Promise<PortableResult>
    pick(): Promise<PortablePreview | { error: string } | null>
    import(): Promise<PortableResult>
  }
  /** Os servidores MCP do Claude Code (Fase 30). */
  mcp: {
    list(): Promise<McpSnapshot | null>
    preview(change: McpChange): Promise<McpPreview | { error: string }>
    apply(change: McpChange, fingerprint: string): Promise<McpApplyResult>
  }
  history: {
    list(): Promise<ConversationSummary[]>
    /**
     * Reabre a conversa numa aba (ou mostra a aba onde ela já está aberta). Com `at`, a busca na
     * conversa abre nessa mensagem.
     */
    open(id: string, at?: HistoryTarget): Promise<boolean>
    /** As conversas com o texto no título ou no que foi dito, com o trecho (Fase 29). */
    search(query: string): Promise<HistoryHit[]>
    remove(id: string): Promise<boolean>
    pin(id: string, pinned: boolean): Promise<boolean>
    exportMarkdown(id: string): Promise<ExportResult>
  }
  /** As sessões do Claude Code que rodam no terminal (aba Sessões). */
  sessions: {
    get(): Promise<SessionsSnapshot>
    /** Avisa que algo mudou (chame get de novo); devolve a função que cancela. */
    onChanged(listener: () => void): () => void
    /** O main pede para mostrar a aba (chegou um pedido). */
    onShow(listener: () => void): () => void
    answer(sessionId: string, requestId: string, answer: SessionAnswer): void
    /** Traz o terminal da sessão para a frente; false se não deu (o motivo vem em message). */
    focus(sessionId: string): Promise<{ ok: boolean; message?: string }>
    openFolder(sessionId: string): void
    continueInChat(sessionId: string): void
    forget(sessionId: string): void
    previewHooks(action: HooksAction): Promise<HookPreview | { error: string }>
    applyHooks(
      action: HooksAction,
      fingerprint: string
    ): Promise<{ ok: true; backupPath: string | null } | { error: string }>
  }
}
