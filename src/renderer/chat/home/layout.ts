// A arrumação dos blocos do Início (Fase 93): o catálogo (cada bloco com o tamanho padrão, o mínimo e
// o máximo), a arrumação padrão (a do modelo C) e as mudanças, todas puras: mover, redimensionar,
// esconder, mostrar. Guardada no config.json (homeLayout); o que vier de lá é conferido aqui.
import type { HomeBlockLayout } from '../../../shared/ipc'

/** A grade tem 12 colunas; a altura conta em linhas de ROW_PX, com GAP_PX entre elas. */
export const COLUMNS = 12
export const ROW_PX = 56
export const GAP_PX = 16

export interface BlockSpec {
  id: string
  w: number
  h: number
  minW: number
  minH: number
  maxW: number
  maxH: number
  /** Escondido na arrumação padrão (fica na lista Blocos, para mostrar). */
  hidden?: boolean
}

const spec = (
  id: string,
  w: number,
  h: number,
  min: [number, number] = [2, 2],
  hidden = false
): BlockSpec => ({ id, w, h, minW: min[0], minH: min[1], maxW: COLUMNS, maxH: 10, hidden })

/** Os blocos, na ordem padrão. Os escondidos de início ficam no fim. */
export const BLOCKS: BlockSpec[] = [
  spec('precisa', 12, 2, [4, 2]),
  spec('calendario', 3, 5, [3, 4]),
  spec('agenda', 4, 5, [3, 3]),
  spec('batimento', 2, 5, [2, 3]),
  spec('uso', 3, 5, [3, 3]),
  spec('tarefas', 5, 6, [3, 3]),
  spec('agendado', 4, 6, [3, 3]),
  spec('anotacoes', 3, 6, [2, 3]),
  spec('conversas', 5, 5, [3, 3]),
  spec('semana-wisp', 7, 5, [4, 3]),
  spec('semana', 8, 6, [6, 4], true),
  spec('a-seguir', 4, 4, [3, 3], true),
  spec('quadro', 8, 6, [6, 4], true),
  spec('github', 4, 4, [3, 3], true),
  spec('hoje-wisp', 4, 6, [3, 3], true),
  spec('atividade', 5, 4, [4, 3], true),
  spec('habitos', 6, 5, [4, 3], true),
  spec('foco', 3, 5, [2, 4], true),
  spec('musica', 4, 3, [3, 2], true),
  spec('clima', 3, 4, [2, 3], true)
]

const byId = new Map(BLOCKS.map((block) => [block.id, block]))
export const blockSpec = (id: string): BlockSpec | undefined => byId.get(id)

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.round(value)))

/** A arrumação padrão. */
export function defaultLayout(): HomeBlockLayout[] {
  return BLOCKS.map((block) => ({ id: block.id, w: block.w, h: block.h, hidden: !!block.hidden }))
}

/**
 * A arrumação guardada, conferida: sem blocos repetidos nem desconhecidos, os tamanhos dentro do
 * permitido, e os blocos novos (de uma versão depois da arrumação) no fim, como no padrão.
 */
export function resolveLayout(saved: HomeBlockLayout[] | null | undefined): HomeBlockLayout[] {
  if (!saved?.length) return defaultLayout()
  const seen = new Set<string>()
  const out: HomeBlockLayout[] = []
  for (const item of saved) {
    const block = byId.get(item.id)
    if (!block || seen.has(item.id)) continue
    seen.add(item.id)
    out.push({
      id: item.id,
      w: clamp(item.w, block.minW, block.maxW),
      h: clamp(item.h, block.minH, block.maxH),
      hidden: !!item.hidden
    })
  }
  for (const block of BLOCKS) {
    if (!seen.has(block.id)) {
      out.push({ id: block.id, w: block.w, h: block.h, hidden: !!block.hidden })
    }
  }
  return out
}

/** Põe o bloco antes (ou depois) de outro. */
export function moveBlock(
  layout: HomeBlockLayout[],
  id: string,
  target: string,
  after: boolean
): HomeBlockLayout[] {
  if (id === target) return layout
  const moving = layout.find((item) => item.id === id)
  if (!moving) return layout
  const rest = layout.filter((item) => item.id !== id)
  const at = rest.findIndex((item) => item.id === target)
  if (at < 0) return layout
  rest.splice(after ? at + 1 : at, 0, moving)
  return rest
}

/** Passa o bloco para antes (-1) ou depois (+1) do vizinho à vista. */
export function stepBlock(layout: HomeBlockLayout[], id: string, step: -1 | 1): HomeBlockLayout[] {
  const shown = layout.filter((item) => !item.hidden)
  const at = shown.findIndex((item) => item.id === id)
  const next = shown[at + step]
  if (at < 0 || !next) return layout
  return moveBlock(layout, id, next.id, step > 0)
}

/** Muda o tamanho, dentro do mínimo e do máximo do bloco. */
export function resizeBlock(
  layout: HomeBlockLayout[],
  id: string,
  w: number,
  h: number
): HomeBlockLayout[] {
  const block = byId.get(id)
  if (!block) return layout
  return layout.map((item) =>
    item.id === id
      ? { ...item, w: clamp(w, block.minW, block.maxW), h: clamp(h, block.minH, block.maxH) }
      : item
  )
}

/** Esconde ou mostra; o bloco vai para o fim (um que volta aparece depois dos outros). */
export function setHidden(
  layout: HomeBlockLayout[],
  id: string,
  hidden: boolean
): HomeBlockLayout[] {
  const item = layout.find((entry) => entry.id === id)
  if (!item || item.hidden === hidden) return layout
  return [...layout.filter((entry) => entry.id !== id), { ...item, hidden }]
}

/** Quantas colunas cabem na largura (a grade se ajusta numa janela estreita). */
export function columnsFor(width: number): number {
  return width >= 820 ? 12 : width >= 560 ? 6 : 2
}

/** A largura do bloco nas colunas que cabem (de 12 para 6 ou 2). */
export function spanFor(w: number, columns: number): number {
  return Math.max(1, Math.min(columns, Math.round((w * columns) / COLUMNS)))
}

/** A altura em px de um bloco de `h` linhas. */
export const heightFor = (h: number): number => h * ROW_PX + (h - 1) * GAP_PX
