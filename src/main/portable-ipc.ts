// Levar o Wisp junto nas configurações (Fase 31): exportar para um arquivo (escolhido no diálogo
// do sistema) e importar, com a prévia antes e o backup do config.json.

import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { backupFile, stamp } from './backup'
import { CONFIG_PATH, getConfig, notifyConfigChange, updateConfig } from './config'
import { tilde } from './folders'
import { pickOpenFile, pickSaveFile, userDir } from './pick'
import {
  applyPortable,
  buildExport,
  fingerprintOf,
  MAX_PORTABLE_BYTES,
  parsePortable,
  previewPortable
} from './portable'
import { IPC } from '../shared/ipc'
import type { PortablePreview, PortableResult } from '../shared/ipc'
import { t } from '../shared/i18n'

export interface PortableIpcOptions {
  isSender(sender: WebContents): boolean
  version: string
}

const FILTERS = [{ name: 'Wisp', extensions: ['json'] }]

/** O arquivo, se não for grande demais; uma string diz o problema. */
function readPortable(path: string): string | { error: string } {
  try {
    if (statSync(path).size > MAX_PORTABLE_BYTES) {
      return { error: t('O arquivo é grande demais para ser do Wisp.') }
    }
    return readFileSync(path, 'utf8')
  } catch (err) {
    return { error: (err as Error).message }
  }
}

export function setupPortableIpc({ isSender, version }: PortableIpcOptions): void {
  /** O arquivo da prévia: só ele é importado, e só se não mudou. */
  let pending: { path: string; fingerprint: string } | null = null

  ipcMain.handle(
    IPC.portableExport,
    async (event, withHistory: unknown): Promise<PortableResult> => {
      if (!isSender(event.sender)) return null
      const today = new Date().toISOString().slice(0, 10)
      const path = await pickSaveFile(
        t('Exportar o Wisp'),
        join(userDir('documents'), `wisp-${today}.json`),
        FILTERS,
        null
      )
      if (!path) return null
      const history = withHistory === true
      try {
        writeFileSync(path, JSON.stringify(buildExport(getConfig(), version, history)), {
          mode: 0o600
        })
        // Um arquivo que já existia mantém as permissões dele: este fica só seu.
        chmodSync(path, 0o600)
      } catch (err) {
        return { ok: false, message: (err as Error).message }
      }
      return {
        ok: true,
        message:
          t('Exportado para {path}.', { path: tilde(path) }) +
          (history ? t(' Ele tem as suas conversas: guarde com cuidado.') : '')
      }
    }
  )

  ipcMain.handle(
    IPC.portablePick,
    async (event): Promise<PortablePreview | { error: string } | null> => {
      if (!isSender(event.sender)) return null
      pending = null
      const path = await pickOpenFile(t('Importar para o Wisp'), FILTERS, null)
      if (!path) return null
      const text = readPortable(path)
      if (typeof text !== 'string') return text
      const parsed = parsePortable(text)
      if (typeof parsed === 'string') return { error: parsed }
      const fingerprint = fingerprintOf(text)
      pending = { path, fingerprint }
      return {
        file: tilde(path),
        fingerprint,
        ...previewPortable(parsed.file, getConfig(), parsed.ignored)
      }
    }
  )

  ipcMain.handle(IPC.portableImport, async (event): Promise<PortableResult> => {
    if (!isSender(event.sender)) return null
    if (!pending) return { ok: false, message: t('Escolha o arquivo antes.') }
    const { path, fingerprint } = pending
    pending = null
    const text = readPortable(path)
    if (typeof text !== 'string') return { ok: false, message: text.error }
    if (fingerprintOf(text) !== fingerprint) {
      return { ok: false, message: t('O arquivo mudou desde a prévia: escolha de novo.') }
    }
    const parsed = parsePortable(text)
    if (typeof parsed === 'string') return { ok: false, message: parsed }
    let backup: string | null = null
    try {
      if (existsSync(CONFIG_PATH)) {
        backup = backupFile(CONFIG_PATH, `${CONFIG_PATH}.backup-wisp-${stamp()}`)
      }
      const { patch, conversations } = applyPortable(parsed.file, getConfig())
      updateConfig(patch)
      notifyConfigChange()
      return {
        ok: true,
        message:
          t(
            'Importado: as configurações, os prompts e as tarefas. Conversas novas: {conversations}.',
            {
              conversations
            }
          ) +
          (backup ? t(' O config.json anterior ficou em {backup}.', { backup: tilde(backup) }) : '')
      }
    } catch (err) {
      return { ok: false, message: (err as Error).message }
    }
  })
}
