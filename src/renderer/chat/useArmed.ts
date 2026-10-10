import { useCallback, useEffect, useRef } from 'react'

/**
 * Por quanto tempo os botões de um card recém-aparecido ignoram cliques. O card pode surgir
 * embaixo do cursor no meio de um clique em outra coisa, e um "Permitir" acidental não tem volta.
 */
export const ARM_DELAY_MS = 600

/** Diz se o card já está "armado", isto é, se passou o tempo de segurança desde que apareceu. */
export function useArmed(): () => boolean {
  const shownAt = useRef<number | null>(null)
  // Marcado depois de o card aparecer na tela.
  useEffect(() => {
    shownAt.current = performance.now()
  }, [])
  return useCallback(
    () => shownAt.current !== null && performance.now() - shownAt.current >= ARM_DELAY_MS,
    []
  )
}
