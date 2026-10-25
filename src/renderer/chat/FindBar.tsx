import { useEffect, useRef, useState } from 'react'
import type { JSX, KeyboardEvent, RefObject } from 'react'
import type { HistoryTarget } from '../../shared/ipc'
import { fold, foldMap } from '../../shared/fold'
import { t } from '../../shared/i18n'

// Buscar na conversa (Ctrl+F, Fase 21): os trechos que batem ficam marcados (a API de destaques
// do CSS, sem mexer no HTML das mensagens), e Enter e Shift+Enter andam entre eles. Sem
// diferenciar maiúsculas nem acentos; aberta pela busca do histórico (Fase 29), começa no trecho
// da mensagem achada.

const ALL = 'wisp-find'
const CURRENT = 'wisp-find-current'

/** Os trechos do texto de `root` que contêm `query` (sem diferenciar maiúsculas nem acentos). */
function findRanges(root: HTMLElement, query: string): Range[] {
  const needle = fold(query)
  if (!needle) return []
  const ranges: Range[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const { folded, at } = foldMap(node.nodeValue ?? '')
    for (let i = folded.indexOf(needle); i >= 0; i = folded.indexOf(needle, i + needle.length)) {
      const range = document.createRange()
      range.setStart(node, at[i])
      range.setEnd(node, at[i + needle.length])
      ranges.push(range)
    }
  }
  return ranges
}

/** A mensagem achada no histórico, na conversa da página: a n-ésima sua ou o texto do Claude. */
function targetElement(root: HTMLElement, target: HistoryTarget): HTMLElement | null {
  if (target.kind === 'text') return root.querySelector(`[data-item="${CSS.escape(target.id)}"]`)
  return root.querySelectorAll<HTMLElement>('.user-turn')[target.n] ?? null
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
  target = null,
  onClose
}: {
  root: RefObject<HTMLElement | null>
  /** Abrir no trecho desta mensagem (a busca do histórico). */
  target?: HistoryTarget | null
  onClose: () => void
}): JSX.Element {
  const [query, setQuery] = useState(target?.term ?? '')
  const [found, setFound] = useState({ count: 0, current: 0 })
  const ranges = useRef<Range[]>([])
  const input = useRef<HTMLInputElement>(null)

  const show = (index: number): void => {
    const range = ranges.current[index]
    paint(ranges.current, index)
    setFound({ count: ranges.current.length, current: index })
    range?.startContainer.parentElement?.scrollIntoView({ block: 'center' })
  }

  /**
   * Marca o termo e começa no trecho dentro da mensagem achada. Uma frase partida pelo Markdown
   * (um negrito no meio) não aparece inteira na página: aí vale a primeira palavra dela.
   */
  const jump = (at: HistoryTarget): void => {
    const page = root.current
    if (!page) return
    const element = targetElement(page, at)
    const terms = [at.term, at.term.split(/\s+/)[0]]
    for (const term of terms) {
      const all = findRanges(page, term)
      const index = element ? all.findIndex((range) => element.contains(range.startContainer)) : 0
      if (index < 0 && term !== terms.at(-1)) continue
      setQuery(term)
      ranges.current = all
      if (all.length) show(Math.max(0, index))
      else element?.scrollIntoView({ block: 'center' })
      return
    }
  }

  useEffect(() => {
    input.current?.focus()
    // A conversa acabou de chegar: a mensagem aparece no próximo quadro.
    const frame = target ? requestAnimationFrame(() => jump(target)) : 0
    return () => {
      cancelAnimationFrame(frame)
      clear()
    }
    // Só ao abrir: uma busca nova do histórico abre outra barra (a key no Pane).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        placeholder={t('Buscar na conversa')}
        aria-label={t('Buscar na conversa')}
        spellCheck={false}
        onChange={(event) => search(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <span className="find-count" role="status">
        {query ? (found.count ? `${found.current + 1} de ${found.count}` : t('nada')) : ''}
      </span>
      <button
        type="button"
        className="icon-button"
        disabled={!found.count}
        onClick={() => step(-1)}
        title={t('Anterior (Shift+Enter)')}
        aria-label={t('Anterior')}
      >
        ↑
      </button>
      <button
        type="button"
        className="icon-button"
        disabled={!found.count}
        onClick={() => step(1)}
        title={t('Próximo (Enter)')}
        aria-label={t('Próximo')}
      >
        ↓
      </button>
      <button
        type="button"
        className="icon-button"
        onClick={onClose}
        title={t('Fechar (Esc)')}
        aria-label={t('Fechar a busca')}
      >
        ✕
      </button>
    </div>
  )
}
