// O arquivo aberto no visualizador do painel (Fase 34): os cards abrem, o FileViewer mostra.
import { useSyncExternalStore } from 'react'

/** O caminho, a linha onde abrir e as linhas que a edição pôs. */
export interface FileTarget {
  path: string
  line: number
  changed: number[]
}

let current: FileTarget | null = null
const listeners = new Set<() => void>()
const notify = (): void => listeners.forEach((listener) => listener())

/** Abre um arquivo no visualizador do painel (o botão dos cards). */
export function openFileView(target: FileTarget): void {
  current = target
  notify()
}

/** Há um arquivo aberto: os atalhos do painel esperam (as teclas são do visualizador). */
export function fileViewOpen(): boolean {
  return current !== null
}

export function closeFileView(): void {
  current = null
  notify()
}

export function useFileTarget(): FileTarget | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current
  )
}
