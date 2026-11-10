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
  /** É o terminal que o Claude usa nesta conversa (Fase 57): ele roda e lê aqui, com você vendo. */
  claude?: boolean
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

/** Quantas abas o navegador da bancada tem, no máximo (Fase 59). */
export const MAX_PREVIEW_TABS = 6

/** As larguras de tela que o navegador da bancada oferece (Fase 61), em px. */
export const PREVIEW_WIDTHS = { phone: 390, tablet: 768 }

/** A largura pedida para a página: um inteiro razoável, ou null (o lugar todo). */
export function previewWidth(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.round(Math.min(2400, Math.max(240, value)))
}

/** Uma aba do navegador da bancada. */
export interface PreviewTab {
  id: number
  title: string
  active: boolean
  /** Os erros do console que ainda não foram para a conversa. */
  errors: number
}

/** A próxima largura do botão do navegador: o lugar todo, um celular, um tablet, e de volta. */
export function nextPreviewWidth(now: number | null | undefined): number | null {
  const widths: (number | null)[] = [null, PREVIEW_WIDTHS.phone, PREVIEW_WIDTHS.tablet]
  return widths[(widths.indexOf(now ?? null) + 1) % widths.length]
}

/** As linguagens de um bloco de código que são comandos de shell (o Rodar no terminal, Fase 63). */
export const SHELL_LANGUAGES = [
  'sh',
  'bash',
  'zsh',
  'shell',
  'console',
  'fish',
  'powershell',
  'ps1',
  'cmd',
  'bat'
]

/**
 * O comando de um bloco de shell, pronto para colar: sem o "$ " (ou "> ") do começo das linhas
 * e sem as linhas vazias das pontas.
 */
export function shellSnippet(code: string): string {
  return code
    .split('\n')
    .map((line) => line.replace(/^\s*[$>]\s+/, ''))
    .join('\n')
    .trim()
}
