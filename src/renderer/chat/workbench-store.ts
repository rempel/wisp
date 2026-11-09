// A bancada (Fase 55), do lado da página: o estado que o main guarda e o abrir e fechar do botão
// do cabeçalho, do atalho e da paleta.
import { useEffect, useState } from 'react'
import type { WorkbenchState, WorkbenchTab } from '../../shared/ipc'

/** A bancada como o main a guarda (null até ele responder). */
export function useWorkbench(): WorkbenchState | null {
  const [state, setState] = useState<WorkbenchState | null>(null)
  useEffect(() => {
    void window.wisp.workbench.get().then((now) => now && setState(now))
    return window.wisp.workbench.onState(setState)
  }, [])
  return state
}

/** Foi você quem abriu a bancada agora (e não ela que voltou com o Wisp): o terminal pega o foco. */
let asked = false
export const askedForWorkbench = (): void => {
  asked = true
}
export const wasAsked = (): boolean => asked

/** Abre a bancada numa aba; na que já está à vista, fecha (o botão do cabeçalho, o atalho). */
export function toggleWorkbench(state: WorkbenchState | null, tab?: WorkbenchTab): void {
  if (!state) return
  asked = true
  if (state.open && (!tab || tab === state.tab)) window.wisp.workbench.set({ open: false })
  else window.wisp.workbench.set({ open: true, ...(tab ? { tab } : {}) })
}
