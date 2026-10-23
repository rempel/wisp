import { useEffect, useRef, useState } from 'react'
import type { JSX, KeyboardEvent, RefObject } from 'react'

// Buscar na conversa (Ctrl+F, Fase 21): os trechos que batem ficam marcados (a API de destaques
// do CSS, sem mexer no HTML das mensagens), e Enter e Shift+Enter andam entre eles.

const ALL = 'wisp-find'
const CURRENT = 'wisp-find-current'

/** Os trechos do texto de `root` que contêm `query` (sem diferenciar maiúsculas). */
function findRanges(root: HTMLElement, query: string): Range[] {
  const needle = query.toLocaleLowerCase('pt-BR')
  if (!needle) return []
  const ranges: Range[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.nodeValue ?? '').toLocaleLowerCase('pt-BR')
    for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + needle.length)) {
      const range = document.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + needle.length)
      ranges.push(range)
    }
  }
  return ranges
}

function paint(ranges: Range[], current: number): void {
  if (!('highlights' in CSS)) return
  CSS.highlights.set(ALL, new Highlight(...ranges))
  if (ranges[current]) CSS.highlights.set(CURRENT, new Highlight(ranges[current]))
  else CSS.highlights.delete(CURRENT)
}

function clear(): void {
  if (!('highlights' in CSS)) return
  CSS.highlights.delete(ALL)
  CSS.highlights.delete(CURRENT)
}

export function FindBar({
  root,
  onClose
}: {
  root: RefObject<HTMLElement | null>
  onClose: () => void
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [found, setFound] = useState({ count: 0, current: 0 })
  const ranges = useRef<Range[]>([])
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    return clear
  }, [])

  const show = (index: number): void => {
    const range = ranges.current[index]
    paint(ranges.current, index)
    setFound({ count: ranges.current.length, current: index })
    range?.startContainer.parentElement?.scrollIntoView({ block: 'center' })
  }

  const search = (value: string): void => {
    setQuery(value)
    ranges.current = root.current && value ? findRanges(root.current, value) : []
    if (!ranges.current.length) {
      clear()
      setFound({ count: 0, current: 0 })
      return
    }
    show(0)
  }

  const step = (direction: 1 | -1): void => {
    // A conversa pode ter crescido: busca de novo antes de andar.
    const before = found.current
    ranges.current = root.current && query ? findRanges(root.current, query) : []
    const count = ranges.current.length
    if (!count) return search(query)
    show((before + direction + count) % count)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      step(event.shiftKey ? -1 : 1)
    }
  }

  return (
    <div className="find-bar" role="search">
      <input
        ref={input}
        type="text"
        value={query}
        placeholder="Buscar na conversa"
        aria-label="Buscar na conversa"
        spellCheck={false}
        onChange={(event) => search(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <span className="find-count" role="status">
        {query ? (found.count ? `${found.current + 1} de ${found.count}` : 'nada') : ''}
      </span>
      <button
        type="button"
        className="icon-button"
        disabled={!found.count}
        onClick={() => step(-1)}
        title="Anterior (Shift+Enter)"
        aria-label="Anterior"
      >
        ↑
      </button>
      <button
        type="button"
        className="icon-button"
        disabled={!found.count}
        onClick={() => step(1)}
        title="Próximo (Enter)"
        aria-label="Próximo"
      >
        ↓
      </button>
      <button
        type="button"
        className="icon-button"
        onClick={onClose}
        title="Fechar (Esc)"
        aria-label="Fechar a busca"
      >
        ✕
      </button>
    </div>
  )
}
