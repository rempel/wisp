// A conversa numa cópia (Fase 43) no painel: abrir um projeto numa cópia, ver o que mudou nela,
// juntar na pasta original e descartar. Cada pedido vem com o id da conversa; a cópia é a da
// pasta dela (nunca um caminho mandado pela página).

import { ipcMain } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { basename } from 'path'
import type { ChatTabs } from './chat-tabs'
import { tilde } from './folders'
import { findProgram } from './programs'
import { gitRunner, Worktrees } from './worktrees'
import type { Worktree } from './worktrees'
import { IPC } from '../shared/ipc'
import type { FolderChoice, WorktreeResult, WorktreeStatus } from '../shared/ipc'
import { t } from '../shared/i18n'

export interface WorktreesIpcOptions {
  fromChat(event: IpcMainEvent | IpcMainInvokeEvent): boolean
  tabs: ChatTabs
}

/** As cópias do painel, ou null sem o git (o menu das pastas não oferece a cópia). */
export function setupWorktrees(options: WorktreesIpcOptions): {
  worktrees: Worktrees | null
  /** As cópias guardadas que nenhuma aba abriu, para o menu das pastas. */
  saved(): FolderChoice[]
} {
  const git = findProgram('git', ['git'])
  const worktrees = git ? new Worktrees(gitRunner(git)) : null
  const { fromChat, tabs } = options
  const openDirs = (): Set<string> =>
    new Set(
      tabs
        .conversations()
        .map((conversation) => conversation.folder)
        .filter(Boolean) as string[]
    )
  // Ao abrir o Wisp, as cópias sem mudança e sem aba saem (depois que as abas voltaram).
  if (worktrees) {
    setTimeout(() => {
      const open = openDirs()
      void worktrees.tidy((dir) => open.has(dir)).catch(() => undefined)
    }, 5000)
  }

  const of = (event: IpcMainInvokeEvent, id: unknown): Worktree | null => {
    if (!worktrees || !fromChat(event) || typeof id !== 'string') return null
    return worktrees.byDir(tabs.conversationById(id)?.folder ?? null)
  }

  ipcMain.handle(IPC.worktreeStatus, async (event, id: unknown): Promise<WorktreeStatus | null> => {
    const worktree = of(event, id)
    if (!worktree || !worktrees) return null
    const base = { repo: tilde(worktree.repo), branch: worktree.branch }
    try {
      return { ...base, changes: await worktrees.changes(worktree) }
    } catch (err) {
      return { ...base, changes: [], error: (err as Error).message }
    }
  })
  ipcMain.handle(IPC.worktreeJoin, async (event, id: unknown): Promise<WorktreeResult> => {
    const worktree = of(event, id)
    if (!worktree || !worktrees)
      return { ok: false, message: t('Essa conversa não está numa cópia.') }
    try {
      const { files } = await worktrees.join(worktree)
      return {
        ok: true,
        message: files
          ? t('{files} {v2} na pasta original ({repo}), sem commit.', {
              files,
              v2: files === 1 ? t('arquivo entrou') : t('arquivos entraram'),
              repo: tilde(worktree.repo)
            })
          : t('Nada novo para juntar.')
      }
    } catch (err) {
      return { ok: false, message: (err as Error).message }
    }
  })
  ipcMain.handle(IPC.worktreeDiscard, async (event, id: unknown): Promise<WorktreeResult> => {
    const worktree = of(event, id)
    if (!worktree || !worktrees)
      return { ok: false, message: t('Essa conversa não está numa cópia.') }
    try {
      await worktrees.discard(worktree)
    } catch (err) {
      return { ok: false, message: (err as Error).message }
    }
    // A pasta da conversa não existe mais: a aba fecha (a conversa fica no histórico).
    tabs.close(id as string)
    return { ok: true, message: t('A cópia saiu.') }
  })

  return {
    worktrees,
    saved: () => {
      if (!worktrees) return []
      const open = openDirs()
      return worktrees
        .list()
        .filter((item) => !open.has(item.dir))
        .map((item) => ({
          name: t('{name} (cópia {branch})', { name: basename(item.repo), branch: item.branch }),
          display: tilde(item.dir),
          path: item.dir
        }))
    }
  }
}
