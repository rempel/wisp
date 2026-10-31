// A ilha (Fase 14; aberta e interativa na Fase 37): no lugar do mascote flutuante, uma cápsula no
// centro do topo da tela, logo abaixo da barra do sistema, com o Wisp inteiro em miniatura e uma
// linha de estado. Aqui fica só a geometria: onde a janela fica e que parte dela continua viva (a
// cápsula recolhida, espiando ou aberta). Quem decide quando ela abre é o island-state.ts; o
// desenho é da página do mascote.

import { ISLAND_OPEN_HEIGHT, ISLAND_OPEN_MAX, ISLAND_OPEN_WIDTH } from '../shared/ipc-island'
import type { IslandMode } from '../shared/ipc-island'

interface Area {
  x: number
  y: number
  width: number
  height: number
}

/** A janela da ilha: cabe a ilha aberta mais alta, com folga para o brilho (px). */
export const ISLAND_WINDOW = { width: ISLAND_OPEN_WIDTH + 40, height: ISLAND_OPEN_MAX + 20 }
/** A cápsula recolhida e espiando (px); o CSS da página usa os mesmos números. */
export const ISLAND_COLLAPSED = { width: 236, height: 38 }
export const ISLAND_EXPANDED = { width: 340, height: 84 }
/** Distância da cápsula até a barra do sistema (px). */
export const ISLAND_TOP_GAP = 4
/** O tempo da animação de abrir e fechar (ms); o CSS usa o mesmo número. */
export const ISLAND_ANIMATION_MS = 220

/** A janela da ilha: centralizada no topo da área útil do monitor. */
export function islandBounds(area: Area): Area {
  return {
    x: Math.round(area.x + (area.width - ISLAND_WINDOW.width) / 2),
    y: area.y + ISLAND_TOP_GAP,
    width: ISLAND_WINDOW.width,
    height: ISLAND_WINDOW.height
  }
}

/** O tamanho da cápsula em cada modo (a aberta, com a altura do que ela mostra). */
export function islandSize(
  mode: IslandMode,
  openHeight = ISLAND_OPEN_HEIGHT
): { width: number; height: number } {
  if (mode === 'open') return { width: ISLAND_OPEN_WIDTH, height: openHeight }
  return mode === 'peek' ? ISLAND_EXPANDED : ISLAND_COLLAPSED
}

/**
 * A parte viva da janela: a cápsula, centralizada e colada no topo dela. Fora disso, a janela não
 * desenha nem pega cliques: o que está atrás (as abas de um navegador, por exemplo) continua seu.
 */
export function islandShape(mode: IslandMode, openHeight = ISLAND_OPEN_HEIGHT): Area {
  const size = islandSize(mode, openHeight)
  return {
    x: Math.round((ISLAND_WINDOW.width - size.width) / 2),
    y: 0,
    width: size.width,
    height: size.height
  }
}

/** A cápsula na tela (para o painel abrir logo abaixo dela). */
export function islandRect(window: Area, mode: IslandMode): Area {
  const shape = islandShape(mode)
  return { x: window.x + shape.x, y: window.y + shape.y, width: shape.width, height: shape.height }
}
