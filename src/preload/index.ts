import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { IPC } from '../shared/ipc'
import type { AvatarName } from '../shared/avatars'
import type { MascotAct } from '../shared/emotions'
import type {
  Accessory,
  AgendaItem,
  ChatEvent,
  ClipboardOffer,
  DroppedFiles,
  Gaze,
  MascotIsland,
  MascotReaction,
  MascotState,
  MascotView,
  PanelView,
  SettingsSnapshot,
  SoundName,
  SoundSettings,
  TabsState,
  VoiceCommand,
  VoiceStatus,
  WindowState,
  WispApi
} from '../shared/ipc'

/** Liga um listener a um canal do main e devolve a função que o desliga. */
function subscribe<T extends unknown[]>(
  channel: string,
  listener: (...args: T) => void
): () => void {
  const handler = (_: IpcRendererEvent, ...args: unknown[]): void => listener(...(args as T))
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

// API mínima exposta ao renderer: só funções específicas, nunca o ipcRenderer cru.
const api: WispApi = {
  area: {
    image: () => ipcRenderer.invoke(IPC.areaImage),
    done: (rect) => ipcRenderer.send(IPC.areaDone, rect)
  },
  mascot: {
    dragStart: (offsetX, offsetY) => ipcRenderer.send(IPC.mascotDragStart, offsetX, offsetY),
    dragEnd: () => ipcRenderer.send(IPC.mascotDragEnd),
    click: () => ipcRenderer.send(IPC.mascotClick),
    ready: () => ipcRenderer.send(IPC.mascotReady),
    onState: (listener) => subscribe<[MascotView]>(IPC.mascotState, listener),
    onPulse: (listener) => subscribe<[]>(IPC.mascotPulse, listener),
    onGaze: (listener) => subscribe<[Gaze | null]>(IPC.mascotGaze, listener),
    onReact: (listener) => subscribe<[MascotReaction]>(IPC.mascotReact, listener),
    onAct: (listener) => subscribe<[MascotAct]>(IPC.mascotAct, listener),
    onAccessory: (listener) => subscribe<[Accessory | null]>(IPC.mascotAccessory, listener),
    onAvatar: (listener) => subscribe<[AvatarName]>(IPC.mascotAvatar, listener),
    onMotion: (listener) => subscribe<[boolean]>(IPC.mascotMotion, listener),
    onIsland: (listener) => subscribe<[MascotIsland]>(IPC.mascotIsland, listener),
    island: (action) => ipcRenderer.send(IPC.islandAction, action),
    onSound: (listener) => subscribe<[SoundName, number]>(IPC.mascotSound, listener),
    // Os bytes chegam como Uint8Array (o Buffer do main); a página quer o ArrayBuffer.
    onCustomSound: (listener) =>
      subscribe<[SoundName, Uint8Array | null]>(IPC.mascotCustomSound, (name, data) =>
        listener(
          name,
          data
            ? (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
            : null
        )
      ),
    hover: (inside) => ipcRenderer.send(IPC.mascotHover, inside),
    activity: () => ipcRenderer.send(IPC.mascotActivity),
    playSound: (name) => ipcRenderer.send(IPC.soundPlay, name),
    drop: (dropped) => ipcRenderer.send(IPC.mascotDrop, dropped),
    pathForFile: (file) => webUtils.getPathForFile(file),
    menu: () => ipcRenderer.send(IPC.mascotMenu),
    onVoice: (listener) => subscribe<[VoiceCommand]>(IPC.voiceCommand, listener),
    voiceEvent: (event) => ipcRenderer.send(IPC.voiceEvent, event),
    onVoiceStatus: (listener) => subscribe<[VoiceStatus]>(IPC.voiceStatus, listener)
  },
  chat: {
    ready: () => ipcRenderer.send(IPC.chatReady),
    send: (conversation, text, attachments) =>
      ipcRenderer.send(IPC.chatSend, conversation, text, attachments),
    pathForFile: (file) => webUtils.getPathForFile(file),
    savePasted: (data, type) => ipcRenderer.invoke(IPC.chatPaste, data, type),
    stop: (conversation) => ipcRenderer.send(IPC.chatStop, conversation),
    editLast: (conversation, text, attachments) =>
      ipcRenderer.invoke(IPC.chatEditLast, conversation, text, attachments),
    rewindPreview: (conversation, turn) =>
      ipcRenderer.invoke(IPC.chatRewindPreview, conversation, turn),
    rewind: (conversation, turn, files) =>
      ipcRenderer.invoke(IPC.chatRewind, conversation, turn, files),
    fork: (conversation, turn) => ipcRenderer.invoke(IPC.chatFork, conversation, turn),
    aside: (conversation, question) => ipcRenderer.invoke(IPC.chatAside, conversation, question),
    saveDraft: (conversation, text) => ipcRenderer.send(IPC.chatDraft, conversation, text),
    exportMarkdown: (conversation) => ipcRenderer.invoke(IPC.chatExport, conversation),
    newConversation: (conversation) => ipcRenderer.send(IPC.chatNew, conversation),
    hide: () => ipcRenderer.send(IPC.chatHide),
    maximize: () => ipcRenderer.send(IPC.windowMaximize),
    dock: () => ipcRenderer.send(IPC.windowDock),
    onWindowState: (listener) => subscribe<[WindowState]>(IPC.windowState, listener),
    setModel: (conversation, choice) => ipcRenderer.send(IPC.chatModel, conversation, choice),
    compact: (conversation, instructions) =>
      ipcRenderer.send(IPC.chatCompact, conversation, instructions ?? ''),
    setView: (conversation, view) => ipcRenderer.send(IPC.chatView, conversation, view),
    setProvider: (conversation, provider) =>
      ipcRenderer.send(IPC.chatProvider, conversation, provider),
    setMode: (conversation, mode) => ipcRenderer.send(IPC.chatMode, conversation, mode),
    answerPermission: (id, decision) => ipcRenderer.send(IPC.chatPermission, id, decision),
    answerQuestion: (id, answers) => ipcRenderer.send(IPC.chatAnswer, id, answers),
    onEvent: (listener) => subscribe<[string, ChatEvent]>(IPC.chatEvent, listener),
    onMood: (listener) => subscribe<[MascotState]>(IPC.chatMood, listener),
    onShown: (listener) => subscribe<[]>(IPC.chatShown, listener),
    onAttach: (listener) => subscribe<[DroppedFiles]>(IPC.chatAttach, listener),
    activity: () => ipcRenderer.send(IPC.chatActivity),
    captureScreen: () => ipcRenderer.invoke(IPC.chatCapture),
    captureArea: () => ipcRenderer.invoke(IPC.chatCaptureArea),
    reviewUndo: (conversation, turn, files) =>
      ipcRenderer.invoke(IPC.chatReviewUndo, conversation, turn, files),
    onClipboard: (listener) => subscribe<[ClipboardOffer | null]>(IPC.chatClipboard, listener),
    takeClipboard: (id) => ipcRenderer.invoke(IPC.chatClipboardUse, id),
    dismissClipboard: (id) => ipcRenderer.send(IPC.chatClipboardDismiss, id),
    copied: () => ipcRenderer.send(IPC.chatCopied),
    onCompose: (listener) => subscribe<[string]>(IPC.chatCompose, listener)
  },
  tui: {
    attach: (conversation) => ipcRenderer.invoke(IPC.tuiAttach, conversation),
    input: (conversation, data) => ipcRenderer.send(IPC.tuiInput, conversation, data),
    resize: (conversation, cols, rows) => ipcRenderer.send(IPC.tuiResize, conversation, cols, rows),
    onData: (listener) => subscribe<[string, string]>(IPC.tuiData, listener)
  },
  tabs: {
    onState: (listener) => subscribe<[TabsState]>(IPC.tabsState, listener),
    create: () => ipcRenderer.send(IPC.tabsNew),
    close: (id) => ipcRenderer.send(IPC.tabsClose, id),
    show: (id) => ipcRenderer.send(IPC.tabsShow, id),
    focus: (pane) => ipcRenderer.send(IPC.tabsFocus, pane),
    split: (dir) => ipcRenderer.send(IPC.tabsSplit, dir ?? 'row'),
    drop: (tab, target, zone) => ipcRenderer.send(IPC.tabsDrop, tab, target, zone),
    resize: (path, sizes) => ipcRenderer.send(IPC.tabsResize, path, sizes),
    unsplit: (pane) => ipcRenderer.send(IPC.tabsUnsplit, pane),
    openSession: (sessionId) => ipcRenderer.send(IPC.tabsOpenSession, sessionId),
    projects: () => ipcRenderer.invoke(IPC.tabsProjects),
    openFolder: (path, worktree) => ipcRenderer.invoke(IPC.tabsOpenFolder, path, worktree === true),
    worktreeStatus: (conversation) => ipcRenderer.invoke(IPC.worktreeStatus, conversation),
    worktreeJoin: (conversation) => ipcRenderer.invoke(IPC.worktreeJoin, conversation),
    worktreeDiscard: (conversation) => ipcRenderer.invoke(IPC.worktreeDiscard, conversation)
  },
  voice: {
    toggle: () => ipcRenderer.send(IPC.voiceToggle),
    cancel: () => ipcRenderer.send(IPC.voiceCancel),
    test: () => ipcRenderer.invoke(IPC.voiceTest),
    onStatus: (listener) => subscribe<[VoiceStatus]>(IPC.voiceStatus, listener),
    onLevel: (listener) => subscribe<[number]>(IPC.voiceLevel, listener)
  },
  sound: {
    get: () => ipcRenderer.invoke(IPC.soundGet),
    set: (enabled) => ipcRenderer.send(IPC.soundSet, enabled),
    onChanged: (listener) => subscribe<[SoundSettings]>(IPC.soundChanged, listener)
  },
  agenda: {
    onNext: (listener) => subscribe<[AgendaItem | null]>(IPC.agendaNext, listener)
  },
  summary: {
    get: () => ipcRenderer.invoke(IPC.summaryGet),
    onShow: (listener) => subscribe<[]>(IPC.summaryShow, listener)
  },
  skills: {
    list: () => ipcRenderer.invoke(IPC.skillsList),
    pick: () => ipcRenderer.invoke(IPC.skillsPick),
    install: () => ipcRenderer.invoke(IPC.skillsInstall),
    remove: (name) => ipcRenderer.invoke(IPC.skillsRemove, name),
    openFolder: () => ipcRenderer.send(IPC.skillsOpenFolder)
  },
  openrouter: {
    models: () => ipcRenderer.invoke(IPC.openrouterModels),
    setKey: (key) => ipcRenderer.invoke(IPC.openrouterSetKey, key),
    clearKey: () => ipcRenderer.invoke(IPC.openrouterClearKey)
  },
  calendar: {
    addLink: (url, name) => ipcRenderer.invoke(IPC.calendarAddLink, url, name),
    removeLink: (id) => ipcRenderer.invoke(IPC.calendarRemoveLink, id)
  },
  diagnostics: {
    run: () => ipcRenderer.invoke(IPC.diagnosticsRun),
    copy: () => ipcRenderer.send(IPC.diagnosticsCopy),
    issue: () => ipcRenderer.send(IPC.diagnosticsIssue),
    action: (action) => ipcRenderer.invoke(IPC.diagnosticsAction, action),
    onView: (listener) => subscribe<[PanelView]>(IPC.panelView, listener),
    welcomeDone: () => ipcRenderer.send(IPC.welcomeDone)
  },
  phone: {
    pair: (server, token) => ipcRenderer.invoke(IPC.phonePair, server, token),
    link: () => ipcRenderer.invoke(IPC.phoneLink),
    confirm: () => ipcRenderer.invoke(IPC.phoneConfirm),
    cancel: () => ipcRenderer.send(IPC.phoneCancel),
    disable: () => ipcRenderer.invoke(IPC.phoneDisable),
    unpair: () => ipcRenderer.invoke(IPC.phoneUnpair)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    set: (patch) => ipcRenderer.invoke(IPC.settingsSet, patch),
    onChanged: (listener) => subscribe<[SettingsSnapshot]>(IPC.settingsChanged, listener),
    openFile: (which) => ipcRenderer.send(IPC.settingsOpenFile, which),
    relaunch: () => ipcRenderer.send(IPC.settingsRelaunch),
    runTask: (id) => ipcRenderer.invoke(IPC.settingsRunTask, id),
    previewMascot: (preview) => ipcRenderer.send(IPC.mascotPreview, preview),
    onShow: (listener) => subscribe<[]>(IPC.settingsShow, listener)
  },
  prompts: {
    list: () => ipcRenderer.invoke(IPC.promptsList),
    expand: (conversation, name) => ipcRenderer.invoke(IPC.promptsExpand, conversation, name)
  },
  files: {
    view: (path) => ipcRenderer.invoke(IPC.filesView, path)
  },
  portable: {
    export: (withHistory) => ipcRenderer.invoke(IPC.portableExport, withHistory),
    pick: () => ipcRenderer.invoke(IPC.portablePick),
    import: () => ipcRenderer.invoke(IPC.portableImport)
  },
  mcp: {
    list: () => ipcRenderer.invoke(IPC.mcpList),
    preview: (change) => ipcRenderer.invoke(IPC.mcpPreview, change),
    apply: (change, fingerprint) => ipcRenderer.invoke(IPC.mcpApply, change, fingerprint)
  },
  history: {
    list: () => ipcRenderer.invoke(IPC.historyList),
    open: (id, at) => ipcRenderer.invoke(IPC.historyOpen, id, at),
    search: (query) => ipcRenderer.invoke(IPC.historySearch, query),
    remove: (id) => ipcRenderer.invoke(IPC.historyDelete, id),
    pin: (id, pinned) => ipcRenderer.invoke(IPC.historyPin, id, pinned),
    exportMarkdown: (id) => ipcRenderer.invoke(IPC.historyExport, id)
  },
  sessions: {
    get: () => ipcRenderer.invoke(IPC.sessionsGet),
    onChanged: (listener) => subscribe<[]>(IPC.sessionsChanged, listener),
    onShow: (listener) => subscribe<[]>(IPC.sessionsShow, listener),
    answer: (sessionId, requestId, answer) =>
      ipcRenderer.send(IPC.sessionsAnswer, sessionId, requestId, answer),
    focus: (sessionId) => ipcRenderer.invoke(IPC.sessionsFocus, sessionId),
    openFolder: (sessionId) => ipcRenderer.send(IPC.sessionsFolder, sessionId),
    continueInChat: (sessionId) => ipcRenderer.send(IPC.sessionsContinue, sessionId),
    forget: (sessionId) => ipcRenderer.send(IPC.sessionsForget, sessionId),
    previewHooks: (action) => ipcRenderer.invoke(IPC.hooksPreview, action),
    applyHooks: (action, fingerprint) => ipcRenderer.invoke(IPC.hooksApply, action, fingerprint)
  }
}

contextBridge.exposeInMainWorld('wisp', api)
