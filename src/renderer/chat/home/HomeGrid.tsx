// A grade do Início (Fase 93): os blocos à vista, na ordem e no tamanho guardados. Na edição, a alça
// arrasta (o bloco segue o ponteiro e uma barra mostra onde ele cai; a ordem muda ao soltar), o
// canto muda o tamanho e o olho esconde. Pelo teclado, na alça: as setas mudam de lugar e, com
// Shift, o tamanho.
import { useEffect, useRef, useState } from 'react'
import type { JSX, KeyboardEvent, PointerEvent, ReactNode } from 'react'
import type { HomeBlockLayout } from '../../../shared/ipc'
import {
  blockSpec,
  columnsFor,
  COLUMNS,
  GAP_PX,
  moveBlock,
  resizeBlock,
  ROW_PX,
  setHidden,
  spanFor,
  stepBlock
} from './layout'
import { EyeOffIcon, GripIcon, ResizeIcon } from './icons-home'
import { t } from '../../../shared/i18n'

export interface GridBlock {
  title: string
  render: () => ReactNode
}

interface Drag {
  kind: 'move' | 'resize'
  id: string
  pointer: number
  x: number
  y: number
  w: number
  h: number
}

export function HomeGrid({
  layout,
  editing,
  blocks,
  onChange
}: {
  layout: HomeBlockLayout[]
  editing: boolean
  blocks: Record<string, GridBlock>
  /** Uma mudança; `done`: acabou (guarda), senão é só o que se vê durante o arraste. */
  onChange: (layout: HomeBlockLayout[], done: boolean) => void
}): JSX.Element {
  const grid = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1200)
  const drag = useRef<Drag | null>(null)
  const latest = useRef(layout)
  /** O bloco sendo arrastado ou redimensionado (o estado, para a página redesenhar). */
  const [active, setActive] = useState<{ id: string; kind: Drag['kind'] } | null>(null)
  /** Arrastando: onde o bloco cai (antes ou depois de qual) e quanto o ponteiro andou. */
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  useEffect(() => {
    latest.current = layout
  }, [layout])

  useEffect(() => {
    const element = grid.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const columns = columnsFor(width)
  const columnPx = (width - GAP_PX * (columns - 1)) / columns
  const change = (next: HomeBlockLayout[], done: boolean): void => {
    latest.current = next
    onChange(next, done)
  }

  const start = (event: PointerEvent, kind: Drag['kind'], item: HomeBlockLayout): void => {
    if (!editing || event.button !== 0) return
    event.preventDefault()
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    drag.current = {
      kind,
      id: item.id,
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      w: item.w,
      h: item.h
    }
    setActive({ id: item.id, kind })
    setOffset({ x: 0, y: 0 })
    setDrop(null)
  }

  const move = (event: PointerEvent): void => {
    const current = drag.current
    if (!current || current.pointer !== event.pointerId) return
    if (current.kind === 'resize') {
      // Cada coluna (de 12) a mais ou a menos que o ponteiro andou.
      const perColumn = ((columnPx + GAP_PX) * columns) / COLUMNS
      const w = current.w + Math.round((event.clientX - current.x) / perColumn)
      const h = current.h + Math.round((event.clientY - current.y) / (ROW_PX + GAP_PX))
      const before = latest.current.find((item) => item.id === current.id)
      if (before && (before.w !== w || before.h !== h)) {
        const next = resizeBlock(latest.current, current.id, w, h)
        const after = next.find((item) => item.id === current.id)
        if (after && (after.w !== before.w || after.h !== before.h)) change(next, false)
      }
      return
    }
    // Arrastando: o bloco segue o ponteiro; o que está embaixo dele, e de que lado, é onde cai.
    setOffset({ x: event.clientX - current.x, y: event.clientY - current.y })
    const under = document
      .elementsFromPoint(event.clientX, event.clientY)
      .map((element) => element.closest<HTMLElement>('[data-block]'))
      .find((element) => element && element.dataset.block !== current.id)
    const target = under?.dataset.block
    if (!under || !target) {
      setDrop(null)
      return
    }
    const rect = under.getBoundingClientRect()
    setDrop({ id: target, after: event.clientX > rect.left + rect.width / 2 })
  }

  const end = (event: PointerEvent): void => {
    const current = drag.current
    if (!current || current.pointer !== event.pointerId) return
    drag.current = null
    setActive(null)
    setDrop(null)
    setOffset({ x: 0, y: 0 })
    const next =
      current.kind === 'move' && drop
        ? moveBlock(latest.current, current.id, drop.id, drop.after)
        : latest.current
    change(next, true)
  }

  const keys = (event: KeyboardEvent, item: HomeBlockLayout): void => {
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1]
    }
    const arrow = arrows[event.key]
    if (!arrow) return
    event.preventDefault()
    if (event.shiftKey) {
      change(resizeBlock(layout, item.id, item.w + arrow[0], item.h + arrow[1]), true)
    } else {
      const step = arrow[0] + arrow[1]
      change(stepBlock(layout, item.id, step < 0 ? -1 : 1), true)
    }
  }

  const shown = layout.filter((item) => !item.hidden && blocks[item.id])
  return (
    <div
      ref={grid}
      className={`home-grid${editing ? ' editing' : ''}`}
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridAutoRows: `${ROW_PX}px`
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {shown.map((item) => {
        const block = blocks[item.id]
        const spec = blockSpec(item.id)
        return (
          <section
            key={item.id}
            data-block={item.id}
            className={`home-block${active?.id === item.id ? (active.kind === 'move' ? ' dragging' : ' resizing') : ''}${
              drop?.id === item.id ? (drop.after ? ' drop-after' : ' drop-before') : ''
            }`}
            aria-label={block.title}
            style={{
              gridColumn: `span ${spanFor(item.w, columns)}`,
              gridRow: `span ${item.h}`,
              transform:
                active?.id === item.id && active.kind === 'move'
                  ? `translate(${offset.x}px, ${offset.y}px)`
                  : undefined
            }}
          >
            {block.render()}
            {editing && (
              <div className="home-block-edit">
                <button
                  type="button"
                  className="home-block-grip"
                  title={t('Arraste para mudar de lugar (setas; com Shift, o tamanho)')}
                  aria-label={t('Mover {block} (setas; com Shift, o tamanho)', {
                    block: block.title
                  })}
                  aria-roledescription={t('bloco móvel')}
                  aria-describedby={`tamanho-${item.id}`}
                  onPointerDown={(event) => start(event, 'move', item)}
                  onKeyDown={(event) => keys(event, item)}
                >
                  <GripIcon />
                </button>
                <span id={`tamanho-${item.id}`} className="home-block-size">
                  {item.w}×{item.h}
                </span>
                <button
                  type="button"
                  className="home-block-hide"
                  title={t('Esconder')}
                  aria-label={t('Esconder {block}', { block: block.title })}
                  onClick={() => change(setHidden(layout, item.id, true), true)}
                >
                  <EyeOffIcon />
                </button>
              </div>
            )}
            {editing && spec && (
              <span
                className="home-block-resize"
                role="presentation"
                title={t('Arraste para mudar o tamanho')}
                onPointerDown={(event) => start(event, 'resize', item)}
              >
                <ResizeIcon />
              </span>
            )}
          </section>
        )
      })}
    </div>
  )
}
