import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { IPC } from '../shared/ipc'
import type {
  Accessory,
  ChatEvent,
  ClipboardOffer,
  DroppedFiles,
  Gaze,
  MascotReaction,
  MascotState,
  MascotView,
  SoundName,
  SoundSettings,
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
    menu: () => ipcRenderer.send(IPC.mascotMenu)
  },
  chat: {
    ready: () => ipcRenderer.send(IPC.chatReady),
    send: (text, attachments) => ipcRenderer.send(IPC.chatSend, text, attachments),
    pathForFile: (file) => webUtils.getPathForFile(file),
    savePasted: (data, type) => ipcRenderer.invoke(IPC.chatPaste, data, type),
    stop: () => ipcRenderer.send(IPC.chatStop),
    newConversation: () => ipcRenderer.send(IPC.chatNew),
    hide: () => ipcRenderer.send(IPC.chatHide),
    setModel: (choice) => ipcRenderer.send(IPC.chatModel, choice),
    answerPermission: (id, decision) => ipcRenderer.send(IPC.chatPermission, id, decision),
    answerQuestion: (id, answers) => ipcRenderer.send(IPC.chatAnswer, id, answers),
    onEvent: (listener) => subscribe<[ChatEvent]>(IPC.chatEvent, listener),
    onMood: (listener) => subscribe<[MascotState]>(IPC.chatMood, listener),
    onShown: (listener) => subscribe<[]>(IPC.chatShown, listener),
    onAttach: (listener) => subscribe<[DroppedFiles]>(IPC.chatAttach, listener),
    activity: () => ipcRenderer.send(IPC.chatActivity),
    captureScreen: () => ipcRenderer.invoke(IPC.chatCapture),
    onClipboard: (listener) => subscribe<[ClipboardOffer | null]>(IPC.chatClipboard, listener),
    takeClipboard: (id) => ipcRenderer.invoke(IPC.chatClipboardUse, id),
    dismissClipboard: (id) => ipcRenderer.send(IPC.chatClipboardDismiss, id),
    copied: () => ipcRenderer.send(IPC.chatCopied)
  },
  sound: {
    get: () => ipcRenderer.invoke(IPC.soundGet),
    set: (enabled) => ipcRenderer.send(IPC.soundSet, enabled),
    onChanged: (listener) => subscribe<[SoundSettings]>(IPC.soundChanged, listener)
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
