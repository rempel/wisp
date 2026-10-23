import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { highContrast, onAppearance } from '../common/appearance'
import { cardWaiting, isCardShortcut, isWispTerminalShortcut } from './terminal-keys'

/**
 * As cores do terminal: sempre escuro, como o tema padrão do Claude Code (o tema dele pensa num
 * fundo escuro), com as cores do Wisp. No alto contraste (Fase 22), preto e branco puros.
 */
const THEME = {
  background: '#0b1418',
  foreground: '#e2f1f4',
  cursor: '#22d3ee',
  cursorAccent: '#0b1418',
  selectionBackground: '#1d4552'
}
const CONTRAST_THEME = {
  background: '#000000',
  foreground: '#ffffff',
  cursor: '#ffff00',
  cursorAccent: '#000000',
  selectionBackground: '#3a3a00'
}
const theme = (): typeof THEME => (highContrast() ? CONTRAST_THEME : THEME)

/**
 * O modo terminal de uma aba (Fase 17): o Claude Code de verdade, pelo xterm.js. O que se digita
 * vai para o processo no main; a saída chega pelo IPC. Ao abrir (ou trocar de aba), a tela
 * volta com o que o terminal já tinha mostrado.
 */
export function TerminalView({
  conversation,
  focused
}: {
  conversation: string
  focused: boolean
}): JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const term = useRef<Terminal | null>(null)

  useEffect(() => {
    const element = host.current
    if (!element) return
    const terminal = new Terminal({
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--mono').trim(),
      fontSize: 13,
      lineHeight: 1.15,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: false,
      theme: theme()
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(element)
    term.current = terminal
    // Os atalhos das abas e da grade continuam do Wisp; Ctrl+Shift+C copia a seleção.
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true
      if (isWispTerminalShortcut(event)) return false
      if (isCardShortcut(event) && cardWaiting(element)) return false
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'c') {
        const selection = terminal.getSelection()
        if (selection) {
          void navigator.clipboard.writeText(selection)
          window.wisp.chat.copied()
        }
        return false
      }
      return true
    })
    let alive = true
    const pending: string[] = []
    let attached = false
    // A saída que chega antes da tela antiga voltar espera por ela.
    const offData = window.wisp.tui.onData((id, data) => {
      if (id !== conversation) return
      if (attached) terminal.write(data)
      else pending.push(data)
    })
    void window.wisp.tui.attach(conversation).then((snapshot) => {
      if (!alive) return
      if (snapshot) terminal.write(snapshot)
      for (const data of pending.splice(0)) terminal.write(data)
      attached = true
    })
    const input = terminal.onData((data) => window.wisp.tui.input(conversation, data))
    const offAppearance = onAppearance(() => (terminal.options.theme = theme()))
    const resize = (): void => {
      if (!element.clientWidth || !element.clientHeight) return
      try {
        fit.fit()
      } catch {
        return
      }
      window.wisp.tui.resize(conversation, terminal.cols, terminal.rows)
    }
    const observer = new ResizeObserver(() => requestAnimationFrame(resize))
    observer.observe(element)
    resize()
    return () => {
      alive = false
      observer.disconnect()
      offData()
      offAppearance()
      input.dispose()
      terminal.dispose()
      term.current = null
    }
  }, [conversation])

  // Em foco (clique, troca de aba), o cursor vai para o terminal.
  useEffect(() => {
    if (focused) term.current?.focus()
  }, [focused])

  return <div className="terminal-view" ref={host} />
}
