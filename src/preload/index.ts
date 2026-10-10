import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { IPC } from '../shared/ipc'
import type { ChatEvent, WispApi } from '../shared/ipc'

// API mínima exposta ao renderer: só funções específicas, nunca o ipcRenderer cru.
const api: WispApi = {
  mascot: {
    dragStart: (offsetX, offsetY) => ipcRenderer.send(IPC.mascotDragStart, offsetX, offsetY),
    dragEnd: () => ipcRenderer.send(IPC.mascotDragEnd),
    click: () => ipcRenderer.send(IPC.mascotClick)
  },
  chat: {
    ready: () => ipcRenderer.send(IPC.chatReady),
    send: (text) => ipcRenderer.send(IPC.chatSend, text),
    stop: () => ipcRenderer.send(IPC.chatStop),
    newConversation: () => ipcRenderer.send(IPC.chatNew),
    hide: () => ipcRenderer.send(IPC.chatHide),
    answerPermission: (id, decision) => ipcRenderer.send(IPC.chatPermission, id, decision),
    onEvent: (listener) => {
      const handler = (_: IpcRendererEvent, event: ChatEvent): void => listener(event)
      ipcRenderer.on(IPC.chatEvent, handler)
      return () => ipcRenderer.removeListener(IPC.chatEvent, handler)
    }
  }
}

contextBridge.exposeInMainWorld('wisp', api)
