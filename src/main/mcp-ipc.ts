// Os servidores MCP nas configurações (Fase 30): a lista, a prévia de pôr ou tirar um e a
// gravação, com o backup. Pôr um pelo Wisp já o liga nas conversas do Wisp; tirar desliga e
// esquece as ferramentas dele que estavam liberadas.

import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import { getConfig, notifyConfigChange, updateConfig } from './config'
import { listProjects } from './desktop'
import { applyMcp, checkChange, mcpSnapshot, previewMcp } from './mcp-servers'
import type { ClaudeRunner } from './mcp-servers'
import { IPC } from '../shared/ipc'
import type { McpApplyResult } from '../shared/ipc'
import { t } from '../shared/i18n'

export interface McpIpcOptions {
  isSender(sender: WebContents): boolean
  /** Roda o `claude` (o `claude mcp add-json` e o `remove`). */
  run: ClaudeRunner
}

export function setupMcpIpc({ isSender, run }: McpIpcOptions): void {
  ipcMain.handle(IPC.mcpList, (event) => {
    if (!isSender(event.sender)) return null
    const { enabledMcpServers, projectRoots } = getConfig()
    return mcpSnapshot(enabledMcpServers, listProjects(projectRoots))
  })
  ipcMain.handle(IPC.mcpPreview, (event, value: unknown) => {
    if (!isSender(event.sender)) return { error: t('pedido inválido') }
    const change = checkChange(value)
    return typeof change === 'string' ? { error: change } : previewMcp(change)
  })
  ipcMain.handle(
    IPC.mcpApply,
    async (event, value: unknown, fingerprint: unknown): Promise<McpApplyResult> => {
      if (!isSender(event.sender) || typeof fingerprint !== 'string') {
        return { ok: false, message: t('pedido inválido') }
      }
      const change = checkChange(value)
      if (typeof change === 'string') return { ok: false, message: change }
      const result = await applyMcp(change, fingerprint, run)
      if (!result.ok) return result
      const { enabledMcpServers, extraAllowedTools } = getConfig()
      if (change.action === 'add') {
        const name = change.server.name
        updateConfig({ enabledMcpServers: [...new Set([...enabledMcpServers, name])] })
      } else {
        const prefix = `mcp__${change.name}__`
        updateConfig({
          enabledMcpServers: enabledMcpServers.filter((name) => name !== change.name),
          extraAllowedTools: extraAllowedTools.filter((tool) => !tool.startsWith(prefix))
        })
      }
      notifyConfigChange()
      return result
    }
  )
}
