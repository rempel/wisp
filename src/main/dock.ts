// O modo compacto: o mascote mora na borda da tela, quase todo escondido, e espia. Aqui fica só a
// geometria (de que lado, onde a janela fica e que parte dela continua à vista); quem decide
// quando ele se esconde e quando espia é o mascot.ts.

export type DockEdge = 'left' | 'right'

interface Area {
  x: number
  y: number
  width: number
  height: number
}

/** O lado da janela do mascote (px). */
export const MASCOT_SIZE = 128
/** Quanto do mascote fica à vista, guardado na borda: um olho e a antena (px). */
export const TAB_WIDTH = 36
/** Quanto o desenho escorrega para fora da janela, guardado (px); o CSS usa o mesmo número. */
export const TUCK_SHIFT = 58
/** O tempo da animação de esconder e de espiar (ms); o CSS usa o mesmo número. */
export const SLIDE_MS = 280

/** A borda mais perto do mascote: a esquerda ou a direita da área útil do monitor. */
export function nearestEdge(bounds: Area, area: Area): DockEdge {
  const center = bounds.x + bounds.width / 2
  return center < area.x + area.width / 2 ? 'left' : 'right'
}

/** Onde a janela fica encostada na borda, na altura pedida (dentro da área útil). */
export function dockedPosition(edge: DockEdge, y: number, area: Area): { x: number; y: number } {
  return {
    x: edge === 'left' ? area.x : area.x + area.width - MASCOT_SIZE,
    y: Math.round(Math.min(Math.max(y, area.y), area.y + area.height - MASCOT_SIZE))
  }
}

/**
 * A parte da janela que continua viva com o mascote guardado: a faixa junto da borda, onde o olho
 * e a antena aparecem. Fora dela a janela não desenha nem pega cliques (o que estiver atrás
 * recebe), então a borda da tela continua sua.
 */
export function tabShape(edge: DockEdge): Area {
  return {
    x: edge === 'left' ? 0 : MASCOT_SIZE - TAB_WIDTH,
    y: 4,
    width: TAB_WIDTH,
    height: 112
  }
}

/** A janela inteira (o mascote à vista). */
export const FULL_SHAPE: Area = { x: 0, y: 0, width: MASCOT_SIZE, height: MASCOT_SIZE }
