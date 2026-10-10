import { useEffect, useState } from 'react'
import type { SessionsSnapshot } from '../../shared/ipc'

/** Os avisos de mudança chegam em rajadas (cada ferramenta de cada sessão): uma busca por vez. */
const REFRESH_MS = 150

/** As sessões do Claude Code no terminal, sempre atualizadas. */
export function useSessions(): SessionsSnapshot | null {
  const [snapshot, setSnapshot] = useState<SessionsSnapshot | null>(null)
  useEffect(() => {
    let alive = true
    let timer = 0
    const refresh = (): void => {
      void window.wisp.sessions.get().then((next) => {
        if (alive && next) setSnapshot(next)
      })
    }
    const off = window.wisp.sessions.onChanged(() => {
      if (timer) return
      timer = window.setTimeout(() => {
        timer = 0
        refresh()
      }, REFRESH_MS)
    })
    refresh()
    return () => {
      alive = false
      off()
      window.clearTimeout(timer)
    }
  }, [])
  return snapshot
}
