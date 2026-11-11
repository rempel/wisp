// A bancada (Fase 55): o navegador (a pré-visualização da Fase 47) e os terminais ao lado da
// conversa, na mesma janela. Aqui fica o que ela guarda (aberta ou não, a aba, a largura e os
// últimos endereços, em bancada.json) e o IPC dela; a página desenha e manda os pedidos. A
// janela ao lado do mascote alarga quando a bancada abre, como faz com os painéis da grade.

import { ipcMain } from 'electron'
import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getConfig } from './config'
import { launchConfigs, waitForPort } from './launch'
import { DATA_DIR } from './paths'
import { setupPreview } from './preview'
import type { PreviewControl } from './preview'
import { Shells } from './shells'
import { IPC } from '../shared/ipc'
import type { DroppedFiles, LaunchConfig, WorkbenchChange, WorkbenchState } from '../shared/ipc'
import { WORKBENCH_TABS, workbenchWidth } from '../shared/ipc-workbench'
import { t } from '../shared/i18n'

const FILE = join(DATA_DIR, 'bancada.json')
/** Quantos endereços abertos por último a bancada lembra. */
const MAX_RECENT = 5

export interface WorkbenchHost {
  /** O IPC veio da página do painel? */
  isSender(sender: WebContents): boolean
  /** A janela do painel (null: ainda não abriu). */
  window(): BrowserWindow | null
  /** Um print do navegador, para a conversa em foco. */
  attach(dropped: DroppedFiles): void
  /**
   * A largura que a bancada ocupa na janela (0: fechada). `grow`: a janela ao lado do mascote
   * alarga ou estreita junto (abrir e fechar); sem ele, só a divisão muda (a divisória).
   */
  sideWidth(px: number, grow: boolean): void
  /** A pasta de uma conversa (null: sem pasta, ou a conversa já fechou). */
  folderOf(conversation: string | undefined): string | null
  /** Um texto para a caixa da conversa em foco (o elemento apontado, os erros do console). */
  compose(text: string): void
}

/**
 * O que o Claude faz na bancada, pelas ferramentas do servidor `desktop` (Fase 57): abre, vê e
 * mexe na página do navegador embutido, e roda e lê no terminal dele (um por conversa).
 */
export interface WorkbenchControl {
  preview: PreviewControl
  /** A pasta da conversa, para um caminho relativo. */
  folderOf(conversation: string | undefined): string | null
  /** Roda um comando no terminal do Claude da conversa; devolve a saída até ela assentar. */
  terminalRun(
    conversation: string | undefined,
    command: string,
    waitMs: number
  ): Promise<string | { error: string }>
  /** As últimas linhas do terminal do Claude da conversa (null: ele ainda não abriu um). */
  terminalRead(conversation: string | undefined, lines: number): string | null
}

type Saved = Pick<WorkbenchState, 'open' | 'tab' | 'width' | 'recent'>

/** O que estava guardado, conferido (um arquivo estragado ou de outra versão não derruba nada). */
export function restoreWorkbench(saved: unknown): Saved {
  const value = (saved && typeof saved === 'object' ? saved : {}) as Record<string, unknown>
  const recent = Array.isArray(value.recent) ? value.recent : []
  return {
    open: value.open === true,
    tab: WORKBENCH_TABS.find((tab) => tab === value.tab) ?? 'browser',
    width: workbenchWidth(value.width),
    recent: recent
      .filter((item): item is string => typeof item === 'string' && item.length <= 4096)
      .slice(0, MAX_RECENT)
  }
}

/** O endereço aberto agora vai para a frente dos últimos (sem repetir). */
export function withRecent(recent: string[], input: string): string[] {
  return [input, ...recent.filter((item) => item !== input)].slice(0, MAX_RECENT)
}

export function setupWorkbench(host: WorkbenchHost): {
  control: WorkbenchControl
  dispose(): void
} {
  let saved: unknown = null
  try {
    saved = JSON.parse(readFileSync(FILE, 'utf8'))
  } catch {
    // Primeira vez (ou um arquivo estragado): a bancada começa fechada.
  }
  let state = restoreWorkbench(saved)
  if (state.open) host.sideWidth(state.width, true)

  const send = (): void => {
    const win = host.window()
    if (win && !win.isDestroyed()) win.webContents.send(IPC.workbenchState, snapshot())
  }
  const shells = new Shells({
    data(id, chunk) {
      const win = host.window()
      if (win && !win.isDestroyed()) win.webContents.send(IPC.shellData, id, chunk)
    },
    changed: send
  })
  const snapshot = (): WorkbenchState => ({ ...state, terminals: shells.list() })

  let saveTimer: NodeJS.Timeout | null = null
  const save = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = null
    try {
      mkdirSync(DATA_DIR, { recursive: true })
      writeFileSync(FILE, JSON.stringify(state), { mode: 0o600 })
    } catch (err) {
      console.warn('[wisp] não consegui guardar a bancada:', err)
    }
  }
  const changed = (): void => {
    send()
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(save, 500)
  }

  function apply(change: WorkbenchChange): void {
    const before = state
    state = {
      ...state,
      open: typeof change.open === 'boolean' ? change.open : state.open,
      tab: WORKBENCH_TABS.find((tab) => tab === change.tab) ?? state.tab,
      width: change.width === undefined ? state.width : workbenchWidth(change.width)
    }
    if (state.open !== before.open) host.sideWidth(state.open ? state.width : 0, true)
    else if (state.open && state.width !== before.width) host.sideWidth(state.width, false)
    changed()
  }

  const from = (event: IpcMainEvent | IpcMainInvokeEvent): boolean => host.isSender(event.sender)

  const preview = setupPreview({
    isSender: host.isSender,
    window: host.window,
    attach: host.attach,
    compose: host.compose,
    opened(input) {
      state = { ...state, recent: withRecent(state.recent, input) }
      apply({ open: true, tab: 'browser' })
    },
    web: () => getConfig().previewWeb,
    toggle() {
      apply({ open: false })
      host.window()?.webContents.focus()
    }
  })

  ipcMain.handle(IPC.workbenchGet, (event): WorkbenchState | null =>
    from(event) ? snapshot() : null
  )
  ipcMain.on(IPC.workbenchSet, (event, change: unknown) => {
    if (from(event) && change && typeof change === 'object') apply(change as WorkbenchChange)
  })
  ipcMain.handle(IPC.shellCreate, (event, folder: unknown): string | { error: string } => {
    if (!from(event)) return { error: t('pedido inválido') }
    return shells.create(typeof folder === 'string' ? folder : null)
  })
  // Subir o projeto com um clique (Fase 75): o comando confirmado, se ainda for o da pasta.
  ipcMain.handle(IPC.launchList, (event, folder: unknown): LaunchConfig[] =>
    from(event) && typeof folder === 'string' ? launchConfigs(folder) : []
  )
  ipcMain.handle(IPC.launchRun, (event, folder: unknown, command: unknown): string | null => {
    if (!from(event) || typeof folder !== 'string' || typeof command !== 'string') {
      return t('pedido inválido')
    }
    const config = launchConfigs(folder).find((item) => item.command === command)
    if (!config) return t('Esse comando não é mais o da pasta: confira de novo.')
    const id = shells.launch(folder, config.command)
    if (typeof id !== 'string') return id.error
    apply({ open: true, tab: 'terminal' })
    const port = config.port
    if (port) {
      void waitForPort(port).then((up) => {
        if (up) preview.open(`localhost:${port}`, null)
      })
    }
    return null
  })
  // Rodar no terminal (Fase 63): o comando de um bloco de código é colado, sem enviar.
  ipcMain.handle(IPC.shellPaste, (event, text: unknown, folder: unknown): string | null => {
    if (!from(event) || typeof text !== 'string' || !text.trim()) return null
    const id = shells.paste(
      text.slice(0, 20_000),
      typeof folder === 'string' ? folder : host.folderOf(undefined)
    )
    if (typeof id !== 'string') return id.error
    apply({ open: true, tab: 'terminal' })
    return null
  })
  ipcMain.on(IPC.shellClose, (event, id: unknown) => {
    if (from(event) && typeof id === 'string') shells.close(id)
  })
  ipcMain.handle(IPC.shellAttach, (event, id: unknown): string =>
    from(event) && typeof id === 'string' ? shells.attach(id) : ''
  )
  ipcMain.on(IPC.shellInput, (event, id: unknown, data: unknown) => {
    if (from(event) && typeof id === 'string' && typeof data === 'string') shells.input(id, data)
  })
  ipcMain.on(IPC.shellResize, (event, id: unknown, cols: unknown, rows: unknown) => {
    if (from(event) && typeof id === 'string') shells.resize(id, Number(cols), Number(rows))
  })

  /** Sem a conversa (um pedido de fora de uma aba), o terminal do Claude é um só. */
  const ownerOf = (conversation: string | undefined): string => conversation ?? 'claude'
  const control: WorkbenchControl = {
    preview,
    folderOf: host.folderOf,
    async terminalRun(conversation, command, waitMs) {
      const id = shells.forOwner(ownerOf(conversation), host.folderOf(conversation))
      if (typeof id !== 'string') return id
      // O terminal aparece: o que o Claude roda fica à vista.
      apply({ open: true, tab: 'terminal' })
      return shells.run(id, command, waitMs)
    },
    terminalRead(conversation, lines) {
      const id = shells.ownedBy(ownerOf(conversation))
      return id ? shells.tail(id, lines) : null
    }
  }

  return {
    control,
    dispose() {
      if (saveTimer) save()
      shells.dispose()
    }
  }
}
