// Quem fica com cada tecla no modo terminal: quase tudo vai para o Claude Code (o Esc
// interrompe, o Ctrl+K apaga a linha, o Ctrl+M é o Enter), menos os atalhos das abas, da grade
// e da paleta do Wisp, que continuam valendo com o foco no terminal.

interface Keys {
  key: string
  code: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

const ARROWS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])

/** Um atalho do Wisp que vale também com o foco no terminal (abas, grade). */
export function isWispTerminalShortcut(event: Keys): boolean {
  const ctrl = event.ctrlKey && !event.altKey && !event.metaKey
  const key = event.key.toLowerCase()
  if (ctrl && !event.shiftKey && (key === 't' || /^[1-9]$/.test(event.key))) return true
  if (ctrl && event.key === 'Tab') return true
  if (ctrl && event.code === 'Backslash') return true
  // A paleta de comandos (Fase 32): no terminal, o Ctrl+P é do Claude Code; o Ctrl+Shift+P, não.
  if (ctrl && event.shiftKey && key === 'p') return true
  return event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && ARROWS.has(event.key)
}

/** Alt+P: vai para o card que espera resposta (Fase 22). */
export function isCardShortcut(event: Keys): boolean {
  return (
    event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey && event.code === 'KeyP'
  )
}

/**
 * Tem card esperando resposta no painel de `target`? No terminal, o Alt+P só fica com o Wisp
 * nessa hora; no resto do tempo é do Claude Code (lá ele troca o modelo).
 */
export function cardWaiting(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('.pane')?.querySelector('.permission-pending') != null
  )
}

/** O evento veio do terminal (o foco está nele)? */
export function fromTerminal(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('.terminal-view') !== null
}
