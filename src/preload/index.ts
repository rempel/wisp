import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { WispApi } from '../shared/ipc'

// API mínima exposta ao renderer: só funções específicas, nunca o ipcRenderer cru.
const api: WispApi = {
  mascot: {
    dragStart: (offsetX, offsetY) => ipcRenderer.send(IPC.mascotDragStart, offsetX, offsetY),
    dragEnd: () => ipcRenderer.send(IPC.mascotDragEnd),
    click: () => ipcRenderer.send(IPC.mascotClick)
  }
}

contextBridge.exposeInMainWorld('wisp', api)
