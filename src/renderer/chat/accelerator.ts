// Um atalho de teclado apertado no campo de atalho, no formato do Electron ("Ctrl+Alt+W").

interface KeyInfo {
  key: string
  code: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

/** As teclas que viram o nome do Electron pelo `code` (independe do layout e do Shift). */
const BY_CODE: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert'
}

/**
 * O atalho no formato do Electron, ou null enquanto ele não está completo (só modificadores) ou
 * não serve: sem Ctrl, Alt ou Super, só as teclas de função (F1…F24) valem sozinhas, para o
 * atalho global não roubar uma tecla comum.
 */
export function acceleratorOf(event: KeyInfo): string | null {
  const key = /^Key[A-Z]$/.test(event.code)
    ? event.code.slice(3)
    : /^Digit\d$/.test(event.code)
      ? event.code.slice(5)
      : /^F\d{1,2}$/.test(event.code)
        ? event.code
        : (BY_CODE[event.code] ?? null)
  if (!key) return null
  const modifiers = [
    event.ctrlKey ? 'Ctrl' : null,
    event.altKey ? 'Alt' : null,
    event.shiftKey ? 'Shift' : null,
    event.metaKey ? 'Super' : null
  ].filter((part): part is string => part !== null)
  const strong = event.ctrlKey || event.altKey || event.metaKey
  if (!strong && !/^F\d{1,2}$/.test(key)) return null
  return [...modifiers, key].join('+')
}
