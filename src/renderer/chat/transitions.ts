// As transições entre telas e abas (as View Transitions do Chromium): a mudança do React acontece
// dentro de document.startViewTransition, e os elementos com o mesmo view-transition-name
// (styles/transitions.css) andam do lugar velho para o novo, em vez de trocar num corte seco. O
// tipo (view, tab, run…) vira uma classe vt-<tipo> no <html> enquanto ela roda, para o CSS
// escolher o efeito. Com menos animações (do sistema ou do Wisp), nada disso: a troca é na hora.
import { useCallback, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { flushSync } from 'react-dom'
import { reducedMotion } from '../common/appearance'

export type TransitionKind = 'view' | 'tab' | 'run' | 'run-tab' | 'layout'

let running: ViewTransition | null = null
let runningKind: TransitionKind | null = null
/** A troca da transição em curso, enquanto ela ainda não aconteceu (o Chromium a chama depois). */
let pending: (() => void) | null = null

/**
 * Faz `update` sem transição, mas depois de uma troca com transição que ainda não aconteceu (do
 * mesmo estado): senão, a de antes viria depois desta e traria o estado velho de volta.
 */
export function inOrder(update: () => void): void {
  pending?.()
  update()
}

/** Faz `update` (uma mudança de estado do React) com a transição dos elementos. */
export function withTransition(update: () => void, kind: TransitionKind): void {
  // As trocas acontecem na ordem: uma de antes que ainda não aconteceu acontece agora (senão,
  // pulada, ela viria depois desta e traria o estado velho de volta).
  pending?.()
  if (typeof document.startViewTransition !== 'function' || reducedMotion() || document.hidden) {
    update()
    return
  }
  // Uma troca no meio de outra: a de antes pula para o fim, e a nova começa dali.
  running?.skipTransition()
  const root = document.documentElement.classList
  const className = `vt-${kind}`
  root.add(className)
  let done = false
  const apply = (): void => {
    if (done) return
    done = true
    if (pending === apply) pending = null
    flushSync(update)
  }
  pending = apply
  const transition = document.startViewTransition(apply)
  // Pulada (outra começou por cima), ela rejeita as promessas: a troca em si já aconteceu.
  transition.ready.catch(() => undefined)
  transition.updateCallbackDone.catch(() => undefined)
  running = transition
  runningKind = kind
  void transition.finished.finally(() => {
    if (running === transition) {
      running = null
      runningKind = null
    }
    // A classe sai, a menos que uma transição do mesmo tipo tenha começado depois desta.
    if (runningKind !== kind) root.remove(className)
  })
}

/**
 * Um useState cuja troca (para um valor diferente) vem com a transição: o da tela do painel
 * (Início, conversa, Pentest…).
 */
export function useTransitionState<T>(
  initial: T,
  kind: TransitionKind
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(initial)
  const current = useRef(initial)
  const set = useCallback(
    (next: SetStateAction<T>) => {
      const target =
        typeof next === 'function' ? (next as (previous: T) => T)(current.current) : next
      if (Object.is(target, current.current)) return
      current.current = target
      withTransition(() => setValue(target), kind)
    },
    [kind]
  )
  return [value, set]
}

/** As abas à vista mudaram (outra aba, uma nova, uma a menos): a troca vem com a transição. */
export function panesChanged(before: string[], after: string[]): boolean {
  return before.length > 0 && before.join('\n') !== after.join('\n')
}
