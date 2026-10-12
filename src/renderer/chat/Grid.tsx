import { useRef, useState } from 'react'
import type { JSX, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { TAB_DRAG_TYPE, zoneAt } from '../../shared/layout'
import type { DropZone, Layout } from '../../shared/layout'

const ZONE_LABEL: Record<DropZone, string> = {
  left: 'À esquerda',
  right: 'À direita',
  top: 'Em cima',
  bottom: 'Embaixo',
  center: 'Neste painel'
}

/**
 * A grade dos painéis: as divisões da árvore (lado a lado ou um embaixo do outro), com
 * divisórias que se arrastam (duplo clique iguala os tamanhos). Enquanto uma aba é arrastada da
 * barra, cada painel mostra onde ela cai: numa borda, divide ali; no meio, troca a aba.
 */
export function Grid({
  layout,
  renderPane,
  draggingTab
}: {
  layout: Layout
  renderPane: (tab: string) => ReactNode
  draggingTab: string | null
}): JSX.Element {
  // As proporções de uma divisória sendo arrastada, antes de irem para o main (caminho → tamanhos).
  const [live, setLive] = useState<Map<string, number[]>>(() => new Map())

  const render = (node: Layout, path: number[]): ReactNode => {
    if (node.type === 'leaf') {
      return <Cell tab={node.tab} draggingTab={draggingTab} render={renderPane} />
    }
    const key = path.join('.')
    const sizes = live.get(key) ?? node.sizes
    return (
      <SplitView
        dir={node.dir}
        sizes={sizes}
        onLive={(next) =>
          setLive((current) => {
            const copy = new Map(current)
            if (next) copy.set(key, next)
            else copy.delete(key)
            return copy
          })
        }
        onCommit={(next) => window.wisp.tabs.resize(path, next)}
      >
        {node.children.map((child, i) => (
          <div key={leafKey(child, i)} className="grid-item">
            {render(child, [...path, i])}
          </div>
        ))}
      </SplitView>
    )
  }
  return <div className="grid">{render(layout, [])}</div>
}

/** Uma chave estável: a primeira aba de cada ramo (os painéis não se remontam ao mudar a grade). */
function leafKey(node: Layout, index: number): string {
  let current = node
  while (current.type === 'split') current = current.children[0]
  return `${current.tab}:${index}`
}

function SplitView({
  dir,
  sizes,
  children,
  onLive,
  onCommit
}: {
  dir: 'row' | 'column'
  sizes: number[]
  children: ReactNode[]
  onLive: (sizes: number[] | null) => void
  onCommit: (sizes: number[]) => void
}): JSX.Element {
  const root = useRef<HTMLDivElement>(null)

  const startDrag = (index: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = root.current?.getBoundingClientRect()
    if (!box) return
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const total = dir === 'row' ? box.width : box.height
    const start = dir === 'row' ? event.clientX : event.clientY
    const base = [...sizes]
    const pair = base[index] + base[index + 1]
    let current = base
    const move = (e: PointerEvent): void => {
      const delta = ((dir === 'row' ? e.clientX : e.clientY) - start) / total
      const min = Math.min(0.08, pair / 2)
      const left = Math.min(Math.max(base[index] + delta, min), pair - min)
      current = [...base]
      current[index] = left
      current[index + 1] = pair - left
      onLive(current)
    }
    const up = (): void => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
      onCommit(current)
      onLive(null)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  }

  const items: ReactNode[] = []
  children.forEach((child, i) => {
    items.push(
      <div key={`c${i}`} className="grid-slot" style={{ flex: `${sizes[i]} 1 0` }}>
        {child}
      </div>
    )
    if (i < children.length - 1) {
      items.push(
        <div
          key={`d${i}`}
          className={`grid-divider grid-divider-${dir}`}
          role="separator"
          aria-orientation={dir === 'row' ? 'vertical' : 'horizontal'}
          title="Arraste para ajustar; duplo clique iguala"
          onPointerDown={startDrag(i)}
          onDoubleClick={() => onCommit(sizes.map(() => 1 / sizes.length))}
        />
      )
    }
  })
  return (
    <div ref={root} className={`grid-split grid-${dir}`}>
      {items}
    </div>
  )
}

/** Um painel da grade, com as zonas de soltar enquanto uma aba é arrastada. */
function Cell({
  tab,
  draggingTab,
  render
}: {
  tab: string
  draggingTab: string | null
  render: (tab: string) => ReactNode
}): JSX.Element {
  const [zone, setZone] = useState<DropZone | null>(null)
  const dropping = draggingTab !== null && draggingTab !== tab
  return (
    <div className="grid-cell" data-tab={tab}>
      {render(tab)}
      {dropping && (
        <div
          className="tab-drop"
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes(TAB_DRAG_TYPE)) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            const box = event.currentTarget.getBoundingClientRect()
            setZone(
              zoneAt(event.clientX - box.left, event.clientY - box.top, box.width, box.height)
            )
          }}
          onDragLeave={() => setZone(null)}
          onDrop={(event) => {
            const dragged = event.dataTransfer.getData(TAB_DRAG_TYPE) || draggingTab
            event.preventDefault()
            const box = event.currentTarget.getBoundingClientRect()
            const where = zoneAt(
              event.clientX - box.left,
              event.clientY - box.top,
              box.width,
              box.height
            )
            setZone(null)
            if (dragged) window.wisp.tabs.drop(dragged, tab, where)
          }}
        >
          {zone && (
            <div className={`drop-zone drop-${zone}`}>
              <span>{ZONE_LABEL[zone]}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
