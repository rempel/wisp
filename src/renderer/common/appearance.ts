// A aparência das páginas (Fase 22): menos movimento e alto contraste viram classes no <html>
// (reduce-motion, contrast), ligadas pelo que o sistema pede (as media queries) ou pelas
// configurações do Wisp. O CSS usa só as classes, então as duas fontes valem igual.

const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
const contrast = window.matchMedia('(prefers-contrast: more)')
let forcedMotion = false
let forcedContrast = false
const listeners = new Set<() => void>()

function apply(): void {
  const root = document.documentElement.classList
  root.toggle('reduce-motion', forcedMotion || motion.matches)
  root.toggle('contrast', forcedContrast || contrast.matches)
  for (const listener of listeners) listener()
}

motion.addEventListener('change', apply)
contrast.addEventListener('change', apply)
apply()

/** Menos movimento: o do sistema, ou o pedido nas configurações. */
export function reducedMotion(): boolean {
  return forcedMotion || motion.matches
}

/** Alto contraste: o do sistema, ou o pedido nas configurações. */
export function highContrast(): boolean {
  return forcedContrast || contrast.matches
}

/** Avisa quando a aparência muda (para o que não segue o CSS, como o terminal). */
export function onAppearance(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** O que as configurações pedem, além do sistema. */
export function setAppearance(options: { reduceMotion?: boolean; highContrast?: boolean }): void {
  if (options.reduceMotion !== undefined) forcedMotion = options.reduceMotion
  if (options.highContrast !== undefined) forcedContrast = options.highContrast
  apply()
}
