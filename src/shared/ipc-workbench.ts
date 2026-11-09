// A bancada (Fase 55): o navegador e o terminal ao lado da conversa, na mesma janela. O
// navegador é a pré-visualização da Fase 47, agora embutida; o terminal é o seu shell (não o
// Claude Code do modo terminal, que continua na aba da conversa).

/** As abas da bancada. */
export type WorkbenchTab = 'browser' | 'terminal'
export const WORKBENCH_TABS: WorkbenchTab[] = ['browser', 'terminal']

/** A largura da bancada na janela (px, antes do zoom do painel). */
export const WORKBENCH_WIDTH = { min: 300, initial: 520, max: 2400 }
/** Quantos terminais a bancada tem, no máximo. */
export const MAX_SHELLS = 4

/** Um terminal da bancada: o shell, numa pasta. */
export interface ShellInfo {
  id: string
  /** O nome da pasta em que ele abriu. */
  title: string
  cwd: string
  /** O shell saiu (o que ele mostrou continua na tela, até fechar). */
  exited: boolean
}

export interface WorkbenchState {
  open: boolean
  tab: WorkbenchTab
  width: number
  /** Os últimos endereços e arquivos abertos no navegador (o mais novo primeiro). */
  recent: string[]
  terminals: ShellInfo[]
}

/** O que a página pode mudar na bancada. */
export interface WorkbenchChange {
  open?: boolean
  tab?: WorkbenchTab
  width?: number
}

/** Onde o navegador aparece na página do painel (px da página, antes do zoom). */
export interface ViewBounds {
  x: number
  y: number
  width: number
  height: number
}

/** A largura que vale: um número inteiro dentro dos limites (senão, a de começo). */
export function workbenchWidth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return WORKBENCH_WIDTH.initial
  return Math.round(Math.min(WORKBENCH_WIDTH.max, Math.max(WORKBENCH_WIDTH.min, value)))
}

/** O menor espaço que sobra para as conversas quando a divisória é arrastada (px). */
const PANES_MIN = 320

/**
 * A largura da bancada com a divisória arrastada até `x`: `right` é a borda direita dela e
 * `total`, a largura do que ela divide com as conversas.
 */
export function draggedWidth(right: number, x: number, total: number): number {
  const most = Math.max(WORKBENCH_WIDTH.min, total - PANES_MIN)
  return Math.round(Math.min(most, Math.max(WORKBENCH_WIDTH.min, right - x)))
}
