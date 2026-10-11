// A ilha (Fase 14): no lugar do mascote flutuante, uma cápsula no centro do topo da tela, logo
// abaixo da barra do sistema, com o Wisp inteiro em miniatura e uma linha de estado. Aqui fica só
// a geometria: onde a janela fica e que parte dela continua viva (a cápsula, recolhida ou aberta).
// Quem decide quando ela abre é o mascot.ts; o desenho é da página do mascote.

interface Area {
  x: number
  y: number
  width: number
  height: number
}

/** A janela da ilha: cabe a cápsula aberta, com folga para o brilho (px). */
export const ISLAND_WINDOW = { width: 340, height: 110 }
/** A cápsula recolhida e a aberta (px); o CSS da página usa os mesmos números. */
export const ISLAND_COLLAPSED = { width: 200, height: 38 }
export const ISLAND_EXPANDED = { width: 320, height: 84 }
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

/**
 * A parte viva da janela: a cápsula (recolhida ou aberta), centralizada e colada no topo dela.
 * Fora disso, a janela não desenha nem pega cliques: o que está atrás (as abas de um navegador,
 * por exemplo) continua seu.
 */
export function islandShape(expanded: boolean): Area {
  const size = expanded ? ISLAND_EXPANDED : ISLAND_COLLAPSED
  return {
    x: Math.round((ISLAND_WINDOW.width - size.width) / 2),
    y: 0,
    width: size.width,
    height: size.height
  }
}

/** A cápsula na tela (para o painel abrir logo abaixo dela). */
export function islandRect(window: Area, expanded: boolean): Area {
  const shape = islandShape(expanded)
  return { x: window.x + shape.x, y: window.y + shape.y, width: shape.width, height: shape.height }
}
