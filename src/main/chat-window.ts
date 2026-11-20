// Onde o painel aparece (Fase 16): ao lado do mascote (ou embaixo da ilha), ou onde você o deixou,
// solto ou maximizado. A janela alarga com os painéis lado a lado da grade, e um "move" que não foi
// o Wisp quem fez passa a valer como o lugar dela.

import { screen } from 'electron'
import type { BrowserWindow, Rectangle } from 'electron'
import { columns, rows } from '../shared/layout'
import type { Layout } from '../shared/layout'
import type { SavedWindow } from './chat-tabs'
import { WORKBENCH_WIDTH } from '../shared/ipc-workbench'

/** Largura de cada painel (a janela cresce com a tela dividida) e altura da janela. */
export const PANE_WIDTH = 420
export const CHAT_HEIGHT = 600
/** Largura mínima de cada painel. */
export const PANE_MIN_WIDTH = 320
/** A menor altura de um painel na grade (px), para o tamanho mínimo da janela. */
const PANE_MIN_HEIGHT = 240
/** Distância entre o mascote e o painel. */
const GAP = 8
/** O mascote a menos disto do topo da tela (a ilha): o painel abre embaixo dele (px). */
const TOP_ANCHOR = 40
/** O modo completo (Fase 87): o tamanho da primeira vez e o menor. */
export const FULL_SIZE = { width: 1200, height: 800 }
export const FULL_MIN = { width: 760, height: 480 }

/** O painel compacto (ao lado do mascote) ou a janela completa, com a sidebar (Fase 87). */
export type WindowMode = 'compact' | 'full'

export class PanelPlacement {
  /** A janela: solta (onde você a deixou) ou ao lado do mascote. */
  window: SavedWindow = { detached: false, maximized: false }
  /** O modo (Fase 87) e onde a janela completa fica, à parte do painel compacto. */
  mode: WindowMode = 'compact'
  full: { bounds?: Rectangle; maximized: boolean } = { maximized: false }
  /** A largura de cada painel (você pode ter redimensionado) e quantos a janela mostra. */
  paneWidth = PANE_WIDTH
  shownPanes = 1
  /** A largura da bancada na janela (Fase 55); 0 com ela fechada. */
  side = 0
  /** Os limites que o próprio Wisp deu à janela por último (para saber se foi você que a mexeu). */
  private placedBounds: Rectangle | null = null
  private placedAt = 0

  /**
   * `anchor`: onde está o mascote. `changed`: o lugar da janela mudou (a página e o disco
   * acompanham).
   */
  constructor(
    private readonly anchor: () => Rectangle | null,
    private readonly changed: () => void
  ) {}

  /**
   * Coloca o painel ao lado do mascote (à esquerda, ou à direita se não couber), dentro da área
   * útil. `width`: a largura nova (a tela dividida mudou); sem ela, a de agora.
   */
  besideMascot(chat: BrowserWindow, width?: number): void {
    const mascot = this.anchor()
    if (!mascot) return
    const area = screen.getDisplayMatching(mascot).workArea
    const [currentWidth, currentHeight] = chat.getSize()
    const w = Math.min(width ?? currentWidth, area.width)
    const height = Math.min(currentHeight, area.height)
    const clamp = (value: number, min: number, max: number): number =>
      Math.min(Math.max(value, min), max)

    // Colado no topo da tela (a ilha): o painel abre logo abaixo, centralizado com ela.
    if (mascot.y - area.y < TOP_ANCHOR) {
      const below = Math.min(height, area.y + area.height - (mascot.y + mascot.height + GAP))
      chat.setBounds({
        x: clamp(Math.round(mascot.x + (mascot.width - w) / 2), area.x, area.x + area.width - w),
        y: mascot.y + mascot.height + GAP,
        width: w,
        height: Math.max(360, below)
      })
      return
    }
    let x = mascot.x - GAP - w
    if (x < area.x) x = mascot.x + mascot.width + GAP
    x = clamp(x, area.x, area.x + area.width - w)
    // Alinhado pela base do mascote, crescendo para cima.
    const y = clamp(mascot.y + mascot.height - height, area.y, area.y + area.height - height)
    chat.setBounds({ x, y, width: w, height })
    this.placed(chat)
  }

  /** O Wisp acabou de pôr a janela aqui: um "move" que chegar agora não foi você. */
  placed(chat: BrowserWindow): void {
    this.placedBounds = chat.getBounds()
    this.placedAt = Date.now()
  }

  /**
   * Põe a janela onde ela deve aparecer: onde você a deixou (solta, ou maximizada), ou ao lado do
   * mascote. Uma posição que não cabe mais em nenhum monitor volta para perto do mascote.
   */
  place(chat: BrowserWindow, layout: Layout | null): void {
    if (this.mode === 'full') return this.placeFull(chat)
    const bounds = this.window.bounds
    if (this.window.detached && bounds) {
      const area = screen.getDisplayMatching(bounds).workArea
      const visible =
        bounds.x < area.x + area.width - 80 &&
        bounds.x + bounds.width > area.x + 80 &&
        bounds.y < area.y + area.height - 60 &&
        bounds.y + 40 > area.y
      if (visible) {
        chat.setBounds({
          ...bounds,
          width: Math.min(bounds.width, area.width),
          height: Math.min(bounds.height, area.height)
        })
        this.placed(chat)
        if (this.window.maximized && !chat.isMaximized()) chat.maximize()
        return
      }
      this.window = { detached: false, maximized: false }
      this.changed()
    }
    this.besideMascot(chat, this.paneWidth * columns(layout) + this.side)
  }

  /**
   * A janela completa (Fase 87): onde você a deixou (se ainda couber num monitor) ou, da primeira
   * vez, uns 1200 × 800 no meio da tela do mascote.
   */
  private placeFull(chat: BrowserWindow): void {
    chat.setMinimumSize(FULL_MIN.width, FULL_MIN.height)
    const saved = this.full.bounds
    const fits =
      saved &&
      screen.getAllDisplays().some(({ workArea: area }) => {
        return (
          saved.x < area.x + area.width - 80 &&
          saved.x + saved.width > area.x + 80 &&
          saved.y < area.y + area.height - 60 &&
          saved.y + 40 > area.y
        )
      })
    let bounds: Rectangle
    if (saved && fits) {
      const area = screen.getDisplayMatching(saved).workArea
      bounds = {
        ...saved,
        width: Math.min(saved.width, area.width),
        height: Math.min(saved.height, area.height)
      }
    } else {
      const mascot = this.anchor()
      const area = (mascot ? screen.getDisplayMatching(mascot) : screen.getPrimaryDisplay())
        .workArea
      const width = Math.min(FULL_SIZE.width, area.width - 40)
      const height = Math.min(FULL_SIZE.height, area.height - 40)
      bounds = {
        x: Math.round(area.x + (area.width - width) / 2),
        y: Math.round(area.y + (area.height - height) / 2),
        width,
        height
      }
    }
    chat.setBounds(bounds)
    this.placed(chat)
    if (this.full.maximized && !chat.isMaximized()) chat.maximize()
  }

  /**
   * Troca o modo (Fase 87): a janela sai de maximizada e vai para o lugar do modo novo. O tamanho
   * mínimo acompanha.
   */
  setMode(chat: BrowserWindow | null, mode: WindowMode, layout: Layout | null): void {
    if (mode === this.mode) return
    this.mode = mode
    this.changed()
    if (!chat) return
    if (chat.isMaximized()) {
      this.switching = true
      chat.unmaximize()
      this.switching = false
    }
    if (mode === 'compact') {
      const [minWidth, minHeight] = this.minimumSize(chat, layout)
      chat.setMinimumSize(minWidth, minHeight)
    }
    this.place(chat, layout)
  }

  /** Trocando de modo: o "unmaximize" que vem daí não é seu. */
  private switching = false

  /** Volta para perto do mascote (o botão da página). */
  dock(chat: BrowserWindow, layout: Layout | null): void {
    this.window = { detached: false, maximized: false }
    if (chat.isMaximized()) chat.unmaximize()
    this.besideMascot(chat, this.paneWidth * columns(layout) + this.side)
    this.changed()
  }

  /** O tamanho mínimo da janela para a grade caber (sem passar do monitor). */
  minimumSize(chat: BrowserWindow, layout: Layout | null): [number, number] {
    const area = screen.getDisplayMatching(chat.getBounds()).workArea
    if (this.mode === 'full') {
      return [Math.min(FULL_MIN.width, area.width), Math.min(FULL_MIN.height, area.height)]
    }
    return [
      Math.min(
        PANE_MIN_WIDTH * columns(layout) + (this.side ? WORKBENCH_WIDTH.min : 0),
        area.width
      ),
      Math.min(Math.max(360, PANE_MIN_HEIGHT * rows(layout) + 90), area.height)
    ]
  }

  /**
   * A grade mudou. Ao lado do mascote, a janela alarga ou estreita conforme os painéis lado a
   * lado, respeitando a largura que você deu a cada um. Solta ou maximizada, ela fica como está:
   * dividir reparte o espaço.
   */
  resizeForPanes(chat: BrowserWindow, layout: Layout | null): void {
    const [minWidth, minHeight] = this.minimumSize(chat, layout)
    chat.setMinimumSize(minWidth, minHeight)
    const cols = columns(layout)
    if (this.shownPanes === cols) return
    if (this.mode === 'full' || this.window.detached || chat.isMaximized()) {
      this.shownPanes = cols
      return
    }
    const [width] = chat.getSize()
    this.paneWidth = Math.max(PANE_MIN_WIDTH, Math.round((width - this.side) / this.shownPanes))
    this.shownPanes = cols
    this.besideMascot(chat, this.paneWidth * cols + this.side)
  }

  /**
   * A bancada abriu, fechou ou mudou de largura (Fase 55). Com `grow` (abrir e fechar), a janela
   * ao lado do mascote alarga ou estreita, e os painéis ficam como estavam; sem ele (a divisória
   * arrastada), a janela fica e os painéis é que cedem. Solta ou maximizada, ela não muda.
   */
  setSide(chat: BrowserWindow | null, layout: Layout | null, side: number, grow: boolean): void {
    if (this.side === side) return
    this.side = side
    if (!chat) return
    const [minWidth, minHeight] = this.minimumSize(chat, layout)
    chat.setMinimumSize(minWidth, minHeight)
    if (this.mode === 'full' || this.window.detached || chat.isMaximized()) return
    const cols = columns(layout)
    if (grow) return this.besideMascot(chat, this.paneWidth * cols + side)
    const [width] = chat.getSize()
    this.paneWidth = Math.max(PANE_MIN_WIDTH, Math.round((width - side) / cols))
  }

  /**
   * Acompanha a janela nova: você moveu ou redimensionou (ela passa a reabrir ali), maximizou
   * (reabre maximizada) ou restaurou (volta ao que era antes, solta ou ao lado do mascote).
   */
  watch(chat: BrowserWindow, layout: () => Layout | null): void {
    // Espera parar (o arraste manda muitos) e confere.
    let settle: NodeJS.Timeout | null = null
    const moved = (): void => {
      if (settle) clearTimeout(settle)
      settle = setTimeout(() => {
        settle = null
        if (Date.now() - this.placedAt > 250) this.noticeMoved(chat)
        else this.placed(chat)
      }, 450)
    }
    chat.on('move', moved)
    chat.on('resize', moved)
    let detachedBefore = false
    chat.on('maximize', () => {
      if (this.mode === 'full') {
        this.full = { ...this.full, maximized: true }
        this.changed()
        return
      }
      detachedBefore = this.window.detached
      this.window = {
        detached: true,
        maximized: true,
        bounds: this.window.bounds ?? this.placedBounds ?? undefined
      }
      this.changed()
    })
    chat.on('unmaximize', () => {
      if (this.switching) return
      if (this.mode === 'full') {
        this.full = { ...this.full, maximized: false }
        this.changed()
        return
      }
      this.window = { ...this.window, maximized: false, detached: detachedBefore }
      this.changed()
    })
    chat.once('ready-to-show', () => {
      const [minWidth, minHeight] = this.minimumSize(chat, layout())
      chat.setMinimumSize(minWidth, minHeight)
    })
  }

  /**
   * A janela mexeu: se não foi o Wisp (os limites diferem dos que ele deu), foi você. A partir
   * daí, ela reabre onde você a deixou.
   */
  private noticeMoved(chat: BrowserWindow): void {
    if (!chat.isVisible() || chat.isMaximized() || chat.isMinimized()) return
    const bounds = chat.getBounds()
    const near = (a: number, b: number): boolean => Math.abs(a - b) <= 6
    const placed = this.placedBounds
    if (
      placed &&
      near(bounds.x, placed.x) &&
      near(bounds.y, placed.y) &&
      near(bounds.width, placed.width) &&
      near(bounds.height, placed.height)
    ) {
      return
    }
    this.placedBounds = bounds
    if (this.mode === 'full') {
      this.full = { ...this.full, bounds }
      this.changed()
      return
    }
    this.window = { detached: true, maximized: false, bounds }
    this.changed()
  }

  /** O lugar guardado da última vez (com limites que fazem sentido; senão, ao lado do mascote). */
  restore(saved: unknown): void {
    if (!saved || typeof saved !== 'object') return
    const window = saved as Partial<SavedWindow>
    const bounds = window.bounds
    const sane =
      bounds &&
      [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) &&
      bounds.width >= PANE_MIN_WIDTH &&
      bounds.height >= 300
    this.window = {
      detached: window.detached === true && !!sane,
      maximized: window.maximized === true,
      ...(sane ? { bounds } : {})
    }
    // A janela completa (Fase 87).
    const full = window.full
    const fullBounds = full?.bounds
    const fullSane =
      fullBounds &&
      [fullBounds.x, fullBounds.y, fullBounds.width, fullBounds.height].every(Number.isFinite) &&
      fullBounds.width >= FULL_MIN.width &&
      fullBounds.height >= FULL_MIN.height
    this.full = { maximized: full?.maximized === true, ...(fullSane ? { bounds: fullBounds } : {}) }
  }

  /** O que vai para o disco: o lugar do compacto e o da janela completa. */
  saved(): SavedWindow {
    return { ...this.window, full: this.full }
  }
}
