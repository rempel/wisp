// A grade dos painéis (Fase 16): uma árvore de divisões, como no VS Code e no Konsole. Cada folha
// é um painel e mostra uma aba (pelo id dela; uma aba aparece em no máximo um painel). Cada
// divisão põe os filhos lado a lado ("row") ou um embaixo do outro ("column"), com as proporções
// de cada um (somam 1). Tudo aqui é puro: o main guarda e muda a árvore; a página desenha e
// manda os pedidos (dividir, arrastar uma aba, ajustar uma divisória).

export type Layout =
  | { type: 'leaf'; tab: string }
  | { type: 'split'; dir: 'row' | 'column'; sizes: number[]; children: Layout[] }

export type Side = 'left' | 'right' | 'top' | 'bottom'
/** Onde uma aba arrastada cai num painel: numa borda (divide ali) ou no meio (troca a aba). */
export type DropZone = Side | 'center'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** O tipo dos dados de uma aba arrastada da barra (para não confundir com arquivos). */
export const TAB_DRAG_TYPE = 'application/x-wisp-tab'

/** Quantos painéis a janela mostra, no máximo. */
export const MAX_PANES = 8
/** A menor proporção de um painel numa divisão. */
const MIN_SIZE = 0.08

export const leaf = (tab: string): Layout => ({ type: 'leaf', tab })

/** As abas à vista, na ordem da árvore (de cima para baixo, da esquerda para a direita). */
export function leaves(layout: Layout | null): string[] {
  if (!layout) return []
  return layout.type === 'leaf' ? [layout.tab] : layout.children.flatMap(leaves)
}

function fit(sizes: number[]): number[] {
  const clean = sizes.map((size) => (Number.isFinite(size) && size > 0 ? size : 0))
  const total = clean.reduce((a, b) => a + b, 0)
  if (total <= 0) return sizes.map(() => 1 / sizes.length)
  const shares = clean.map((size) => Math.max(MIN_SIZE, size / total))
  const sum = shares.reduce((a, b) => a + b, 0)
  return shares.map((share) => share / sum)
}

/**
 * A árvore arrumada: divisões com um filho só viram o filho, uma divisão dentro de outra na
 * mesma direção vira parte dela, e as proporções somam 1.
 */
export function normalize(layout: Layout): Layout {
  if (layout.type === 'leaf') return layout
  const children: Layout[] = []
  const sizes: number[] = []
  layout.children.forEach((child, i) => {
    const node = normalize(child)
    const size = layout.sizes[i] ?? 1 / layout.children.length
    if (node.type === 'split' && node.dir === layout.dir) {
      node.children.forEach((grand, j) => {
        children.push(grand)
        sizes.push(size * node.sizes[j])
      })
    } else {
      children.push(node)
      sizes.push(size)
    }
  })
  if (children.length === 1) return children[0]
  return { type: 'split', dir: layout.dir, sizes: fit(sizes), children }
}

/** O painel que mostrava `from` passa a mostrar `to`. */
export function replaceLeaf(layout: Layout, from: string, to: string): Layout {
  if (layout.type === 'leaf') return layout.tab === from ? leaf(to) : layout
  return { ...layout, children: layout.children.map((child) => replaceLeaf(child, from, to)) }
}

/** Tira o painel da aba; null se era o único. */
export function removeLeaf(layout: Layout, tab: string): Layout | null {
  if (layout.type === 'leaf') return layout.tab === tab ? null : layout
  const kept: { node: Layout; size: number }[] = []
  layout.children.forEach((child, i) => {
    const node = removeLeaf(child, tab)
    if (node) kept.push({ node, size: layout.sizes[i] })
  })
  if (!kept.length) return null
  return normalize({
    ...layout,
    children: kept.map((item) => item.node),
    sizes: fit(kept.map((item) => item.size))
  })
}

/**
 * Divide o painel de `target` e põe `tab` num painel novo, do lado pedido. Na mesma direção da
 * divisão em que ele está, o novo entra ao lado dele, com metade do espaço dele.
 */
export function splitLeaf(layout: Layout, target: string, tab: string, side: Side): Layout {
  const dir = side === 'left' || side === 'right' ? 'row' : 'column'
  const before = side === 'left' || side === 'top'
  const visit = (node: Layout): Layout => {
    if (node.type === 'leaf') {
      if (node.tab !== target) return node
      return {
        type: 'split',
        dir,
        sizes: [0.5, 0.5],
        children: before ? [leaf(tab), node] : [node, leaf(tab)]
      }
    }
    const index = node.children.findIndex((child) => child.type === 'leaf' && child.tab === target)
    if (index >= 0 && node.dir === dir) {
      const children = [...node.children]
      const sizes = [...node.sizes]
      const half = sizes[index] / 2
      sizes.splice(index, 1, half, half)
      children.splice(before ? index : index + 1, 0, leaf(tab))
      return { ...node, children, sizes }
    }
    return { ...node, children: node.children.map(visit) }
  }
  return normalize(visit(layout))
}

/**
 * Uma aba arrastada para o painel de `target`: na borda, divide ali (se a aba já estava à vista
 * em outro painel, ela sai de lá); no meio, o painel passa a mostrá-la (e, se ela estava à vista,
 * os dois painéis trocam de aba).
 */
export function dropTab(layout: Layout, tab: string, target: string, zone: DropZone): Layout {
  if (tab === target) return layout
  const visible = leaves(layout).includes(tab)
  if (zone === 'center') {
    if (!visible) return replaceLeaf(layout, target, tab)
    const swap = '\u0000troca'
    return replaceLeaf(replaceLeaf(replaceLeaf(layout, tab, swap), target, tab), swap, target)
  }
  const base = visible ? removeLeaf(layout, tab) : layout
  if (!base) return layout
  return splitLeaf(base, target, tab, zone)
}

/** Novas proporções para a divisão no caminho `path` (índices dos filhos, a partir da raiz). */
export function resize(layout: Layout, path: number[], sizes: number[]): Layout {
  if (layout.type === 'leaf') return layout
  if (!path.length) {
    if (sizes.length !== layout.children.length) return layout
    return { ...layout, sizes: fit(sizes) }
  }
  const [head, ...rest] = path
  if (!layout.children[head]) return layout
  const children = [...layout.children]
  children[head] = resize(children[head], rest, sizes)
  return { ...layout, children }
}

/** Onde cada painel fica, numa caixa (por padrão, 0 a 1 nos dois sentidos). */
export function rects(
  layout: Layout,
  box: Rect = { x: 0, y: 0, w: 1, h: 1 },
  out = new Map<string, Rect>()
): Map<string, Rect> {
  if (layout.type === 'leaf') {
    out.set(layout.tab, box)
    return out
  }
  let offset = 0
  layout.children.forEach((child, i) => {
    const size = layout.sizes[i]
    const part =
      layout.dir === 'row'
        ? { x: box.x + offset * box.w, y: box.y, w: size * box.w, h: box.h }
        : { x: box.x, y: box.y + offset * box.h, w: box.w, h: size * box.h }
    offset += size
    rects(child, part, out)
  })
  return out
}

/** O painel vizinho de `tab` na direção pedida (o mais perto, entre os que encostam). */
export function neighbor(layout: Layout, tab: string, side: Side): string | null {
  const all = rects(layout)
  const from = all.get(tab)
  if (!from) return null
  const eps = 1e-6
  let best: { tab: string; score: number } | null = null
  for (const [other, r] of all) {
    if (other === tab) continue
    let gap: number
    let overlap: number
    if (side === 'left' || side === 'right') {
      gap = side === 'left' ? from.x - (r.x + r.w) : r.x - (from.x + from.w)
      overlap = Math.min(from.y + from.h, r.y + r.h) - Math.max(from.y, r.y)
    } else {
      gap = side === 'top' ? from.y - (r.y + r.h) : r.y - (from.y + from.h)
      overlap = Math.min(from.x + from.w, r.x + r.w) - Math.max(from.x, r.x)
    }
    if (gap < -eps || overlap <= eps) continue
    const score = gap * 10 - overlap
    if (!best || score < best.score) best = { tab: other, score }
  }
  return best?.tab ?? null
}

/** Quantos painéis lado a lado (no máximo) e um embaixo do outro: para o tamanho da janela. */
export function columns(layout: Layout | null): number {
  if (!layout || layout.type === 'leaf') return 1
  const counts = layout.children.map(columns)
  return layout.dir === 'row' ? counts.reduce((a, b) => a + b, 0) : Math.max(...counts)
}

export function rows(layout: Layout | null): number {
  if (!layout || layout.type === 'leaf') return 1
  const counts = layout.children.map(rows)
  return layout.dir === 'column' ? counts.reduce((a, b) => a + b, 0) : Math.max(...counts)
}

/** A zona de soltar sob o cursor num painel (x e y dentro dele): bordas de 25%, ou o meio. */
export function zoneAt(x: number, y: number, w: number, h: number): DropZone {
  const fx = x / w
  const fy = y / h
  const edges: [DropZone, number][] = [
    ['left', fx],
    ['right', 1 - fx],
    ['top', fy],
    ['bottom', 1 - fy]
  ]
  const [zone, distance] = edges.reduce((a, b) => (b[1] < a[1] ? b : a))
  return distance < 0.25 ? zone : 'center'
}

/**
 * Uma árvore que veio de fora (o disco, a página): só o formato certo, abas válidas, sem
 * repetidas e até MAX_PANES. null se não sobrar nada.
 */
export function sanitize(value: unknown, valid: (tab: string) => boolean): Layout | null {
  const seen = new Set<string>()
  const visit = (node: unknown, depth: number): Layout | null => {
    if (!node || typeof node !== 'object' || depth > 12) return null
    const n = node as Record<string, unknown>
    if (n.type === 'leaf') {
      if (typeof n.tab !== 'string' || !valid(n.tab) || seen.has(n.tab)) return null
      if (seen.size >= MAX_PANES) return null
      seen.add(n.tab)
      return leaf(n.tab)
    }
    if (n.type !== 'split' || (n.dir !== 'row' && n.dir !== 'column')) return null
    if (!Array.isArray(n.children)) return null
    const sizes = Array.isArray(n.sizes) ? n.sizes : []
    const kept: { node: Layout; size: number }[] = []
    n.children.forEach((child, i) => {
      const node = visit(child, depth + 1)
      const size = Number(sizes[i])
      if (node) kept.push({ node, size: Number.isFinite(size) && size > 0 ? size : 1 })
    })
    if (!kept.length) return null
    return {
      type: 'split',
      dir: n.dir,
      sizes: fit(kept.map((item) => item.size)),
      children: kept.map((item) => item.node)
    }
  }
  const tree = visit(value, 0)
  return tree ? normalize(tree) : null
}

/** A árvore com as abas trocadas por outra coisa (os índices delas, para o disco). */
export function mapLeaves<T>(layout: Layout, map: (tab: string) => T): unknown {
  if (layout.type === 'leaf') return { type: 'leaf', tab: map(layout.tab) }
  return { ...layout, children: layout.children.map((child) => mapLeaves(child, map)) }
}
