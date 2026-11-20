// O que os blocos do Início dividem (Fase 94): o resumo do dia (home:snapshot), o uso do plano, as
// conversas recentes, as abas e o estado de cada conversa, e o abrir de outra tela.
import { createContext, useContext } from 'react'
import type { ConversationSummary, HomeSnapshot, PlanUsage, TabsState } from '../../../shared/ipc'
import type { ChatState } from '../state'
import type { ChatView } from '../ChatHeader'

export interface HomeData {
  snapshot: HomeSnapshot | null
  usage: PlanUsage | null
  recent: ConversationSummary[]
  tabs: TabsState
  conversations: Map<string, ChatState>
  onView: (view: ChatView) => void
  /** Abre uma conversa (e a aba dela). */
  openConversation: (id: string) => void
  /** Mostra uma aba aberta. */
  showTab: (id: string) => void
  /** A hora de agora, que muda a cada minuto (os blocos que leem algo de fora releem). */
  now: number
  /** Um bloco mudou algo que outro mostra (o resumo é relido). */
  refresh: () => void
}

export const HomeContext = createContext<HomeData | null>(null)

export function useHome(): HomeData {
  const data = useContext(HomeContext)
  if (!data) throw new Error('useHome fora do Início')
  return data
}
