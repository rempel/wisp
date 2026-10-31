// O que os cartões da ilha usam: o botão que volta para o main, os textos e o relógio.

import { useEffect, useState } from 'react'
import { t } from '../../../shared/i18n'
import type {
  IslandAction,
  IslandMusic,
  IslandRepeat,
  IslandTaskState,
  MascotIsland
} from '../../../shared/ipc'

export type Island = NonNullable<MascotIsland>

/** Um botão da ilha: vai para o main. */
export const act = (action: IslandAction): void => window.wisp.mascot.island(action)

/** O estado de uma conversa ou sessão, numa palavra. */
export function stateLabel(state: IslandTaskState): string {
  switch (state) {
    case 'working':
      return t('trabalhando')
    case 'waiting':
      return t('esperando você')
    case 'done':
      return t('pronto')
    case 'error':
      return t('deu erro')
    default:
      return t('parado')
  }
}

/** "3:07" (ou "1:02:03"). */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

/** Onde a música está agora: a posição lida, mais o tempo desde então (tocando). */
export function positionNow(music: IslandMusic, now = Date.now()): number {
  const base = music.positionMs ?? 0
  const played = music.status === 'Playing' ? Math.max(0, now - music.at) : 0
  return Math.min(music.durationMs ?? Infinity, base + played)
}

export const NEXT_REPEAT: Record<IslandRepeat, IslandRepeat> = {
  none: 'list',
  list: 'track',
  track: 'none'
}

/** Re-renderiza de tempos em tempos enquanto `on` (a barra da música, os botões armando). */
export function useTick(on: boolean, ms: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    const timer = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(timer)
  }, [on, ms])
  return now
}
