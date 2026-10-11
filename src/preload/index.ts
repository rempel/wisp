import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { IPC } from '../shared/ipc'
import type {
  Accessory,
  AgendaItem,
  ChatEvent,
  ClipboardOffer,
  DroppedFiles,
  Gaze,
  MascotDock,
  MascotReaction,
  MascotState,
  MascotView,
  SettingsSnapshot,
  SoundName,
  SoundSettings,
  TabsState,
  VoiceCommand,
  VoiceStatus,
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
  mascot: {
    dragStart: (offsetX, offsetY) => ipcRenderer.send(IPC.mascotDragStart, offsetX, offsetY),
    dragEnd: () => ipcRenderer.send(IPC.mascotDragEnd),
    click: () => ipcRenderer.send(IPC.mascotClick),
    ready: () => ipcRenderer.send(IPC.mascotReady),
    onState: (listener) => subscribe<[MascotView]>(IPC.mascotState, listener),
    onPulse: (listener) => subscribe<[]>(IPC.mascotPulse, listener),
    onGaze: (listener) => subscribe<[Gaze | null]>(IPC.mascotGaze, listener),
    onReact: (listener) => subscribe<[MascotReaction]>(IPC.mascotReact, listener),
    onAccessory: (listener) => subscribe<[Accessory | null]>(IPC.mascotAccessory, listener),
    onDock: (listener) => subscribe<[MascotDock]>(IPC.mascotDock, listener),
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
    newConversation: (conversation) => ipcRenderer.send(IPC.chatNew, conversation),
    hide: () => ipcRenderer.send(IPC.chatHide),
    setModel: (conversation, choice) => ipcRenderer.send(IPC.chatModel, conversation, choice),
    setMode: (conversation, mode) => ipcRenderer.send(IPC.chatMode, conversation, mode),
    answerPermission: (id, decision) => ipcRenderer.send(IPC.chatPermission, id, decision),
    answerQuestion: (id, answers) => ipcRenderer.send(IPC.chatAnswer, id, answers),
    onEvent: (listener) => subscribe<[string, ChatEvent]>(IPC.chatEvent, listener),
    onMood: (listener) => subscribe<[MascotState]>(IPC.chatMood, listener),
    onShown: (listener) => subscribe<[]>(IPC.chatShown, listener),
    onAttach: (listener) => subscribe<[DroppedFiles]>(IPC.chatAttach, listener),
    activity: () => ipcRenderer.send(IPC.chatActivity),
    captureScreen: () => ipcRenderer.invoke(IPC.chatCapture),
    onClipboard: (listener) => subscribe<[ClipboardOffer | null]>(IPC.chatClipboard, listener),
    takeClipboard: (id) => ipcRenderer.invoke(IPC.chatClipboardUse, id),
    dismissClipboard: (id) => ipcRenderer.send(IPC.chatClipboardDismiss, id),
    copied: () => ipcRenderer.send(IPC.chatCopied),
    onCompose: (listener) => subscribe<[string]>(IPC.chatCompose, listener)
  },
  tabs: {
    onState: (listener) => subscribe<[TabsState]>(IPC.tabsState, listener),
    create: () => ipcRenderer.send(IPC.tabsNew),
    close: (id) => ipcRenderer.send(IPC.tabsClose, id),
    show: (id) => ipcRenderer.send(IPC.tabsShow, id),
    focus: (pane) => ipcRenderer.send(IPC.tabsFocus, pane),
    split: () => ipcRenderer.send(IPC.tabsSplit),
    unsplit: (pane) => ipcRenderer.send(IPC.tabsUnsplit, pane),
    openSession: (sessionId) => ipcRenderer.send(IPC.tabsOpenSession, sessionId)
  },
  voice: {
    toggle: () => ipcRenderer.send(IPC.voiceToggle),
    cancel: () => ipcRenderer.send(IPC.voiceCancel),
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
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    set: (patch) => ipcRenderer.invoke(IPC.settingsSet, patch),
    onChanged: (listener) => subscribe<[SettingsSnapshot]>(IPC.settingsChanged, listener),
    openFile: (which) => ipcRenderer.send(IPC.settingsOpenFile, which),
    onShow: (listener) => subscribe<[]>(IPC.settingsShow, listener)
  },
  history: {
    list: () => ipcRenderer.invoke(IPC.historyList),
    open: (id) => ipcRenderer.invoke(IPC.historyOpen, id),
    remove: (id) => ipcRenderer.invoke(IPC.historyDelete, id)
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
