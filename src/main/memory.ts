// A memória à vista (Fase 65): os CLAUDE.md que o Claude Code lê em toda conversa (o seu, o do
// espaço do Wisp e os do projeto da conversa em foco), para ver e editar pelo painel. Como em
// todo arquivo de configuração do usuário: a prévia mostra o diff antes, o arquivo velho ganha
// um backup ao lado e gravar só vale se o arquivo ainda estiver como na prévia.

import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { backupFile, stamp } from './backup'
import { usableFolder } from './folders'
import { DATA_DIR, expandHome } from './paths'
import { claudeConfigDir } from './skills'
import { wholeFileDiff } from '../shared/diff'
import { IPC } from '../shared/ipc'
import type { AgentPreview, AgentResult, MemoryFile, MemoryId } from '../shared/ipc'
import { t } from '../shared/i18n'

/** O maior arquivo de memória que o painel mostra e grava. */
const MAX_MEMORY = 200_000
export const MEMORY_IDS: MemoryId[] = ['user', 'workspace', 'project', 'project-dir', 'local']

/** Onde fica cada arquivo de memória (null: a conversa não está numa pasta de projeto). */
export function memoryPath(
  id: MemoryId,
  folder: string | null,
  configDir = claudeConfigDir(),
  dataDir = DATA_DIR
): string | null {
  if (id === 'user') return join(configDir, 'CLAUDE.md')
  if (id === 'workspace') return join(dataDir, 'workspace', 'CLAUDE.md')
  const root = folder ? usableFolder(expandHome(folder)) : null
  if (!root) return null
  if (id === 'project') return join(root, 'CLAUDE.md')
  if (id === 'project-dir') return join(root, '.claude', 'CLAUDE.md')
  return join(root, 'CLAUDE.local.md')
}

function current(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

const fingerprintOf = (text: string | null): string =>
  text === null ? 'novo' : createHash('sha256').update(text).digest('hex').slice(0, 16)

/** Os arquivos de memória, com o texto de cada um (os que não existem vêm vazios). */
export function listMemory(
  folder: string | null,
  configDir = claudeConfigDir(),
  dataDir = DATA_DIR
): MemoryFile[] {
  return MEMORY_IDS.flatMap((id) => {
    const path = memoryPath(id, folder, configDir, dataDir)
    if (!path) return []
    const text = current(path)
    return [
      {
        id,
        path,
        exists: text !== null,
        text: (text ?? '').slice(0, MAX_MEMORY),
        tooBig: (text?.length ?? 0) > MAX_MEMORY
      }
    ]
  })
}

/** O que gravar o texto muda (o diff do arquivo), antes de gravar. */
export function previewMemory(
  id: MemoryId,
  folder: string | null,
  text: string,
  configDir = claudeConfigDir(),
  dataDir = DATA_DIR
): AgentPreview | { error: string } {
  const path = memoryPath(id, folder, configDir, dataDir)
  if (!path) return { error: t('Esta conversa não está numa pasta de projeto.') }
  if (text.length > MAX_MEMORY) return { error: t('O texto é grande demais para a memória.') }
  const before = current(path)
  if ((before?.length ?? 0) > MAX_MEMORY) {
    return { error: t('Este arquivo é grande demais para editar pelo painel.') }
  }
  // Um arquivo de texto acaba com uma quebra de linha.
  const after = text.trim() ? text.replace(/\s+$/, '') + '\n' : ''
  return {
    path,
    exists: before !== null,
    diff: wholeFileDiff(before ?? '', after),
    fingerprint: fingerprintOf(before),
    unchanged: (before ?? '') === after
  }
}

/** Grava a memória, se o arquivo ainda estiver como na prévia (com o backup do velho). */
export function saveMemory(
  id: MemoryId,
  folder: string | null,
  text: string,
  fingerprint: string,
  configDir = claudeConfigDir(),
  dataDir = DATA_DIR
): AgentResult {
  const preview = previewMemory(id, folder, text, configDir, dataDir)
  if ('error' in preview) return { ok: false, message: preview.error }
  if (preview.fingerprint !== fingerprint) {
    return { ok: false, message: t('O arquivo mudou depois da prévia: veja o que muda de novo.') }
  }
  try {
    mkdirSync(dirname(preview.path), { recursive: true })
    const backup = existsSync(preview.path)
      ? backupFile(preview.path, `${preview.path}.backup-wisp-${stamp()}`)
      : null
    const after = text.trim() ? text.replace(/\s+$/, '') + '\n' : ''
    const temp = `${preview.path}.wisp-tmp`
    writeFileSync(temp, after, { mode: 0o644 })
    renameSync(temp, preview.path)
    return {
      ok: true,
      message: backup
        ? t('Gravado. O arquivo de antes ficou em {backup}.', { backup })
        : t('Criado. O Claude Code o lê nas conversas novas (Ctrl+K).')
    }
  } catch (err) {
    return {
      ok: false,
      message: t('Não consegui gravar: {message}', { message: (err as Error).message })
    }
  }
}

const isId = (value: unknown): value is MemoryId => MEMORY_IDS.includes(value as MemoryId)
const folderOf = (folder: unknown): string | null =>
  typeof folder === 'string' && folder ? folder : null

/** O IPC da memória: só o painel pede. */
export function setupMemoryIpc(isSender: (sender: WebContents) => boolean): void {
  ipcMain.handle(IPC.memoryList, (event, folder: unknown): MemoryFile[] =>
    isSender(event.sender) ? listMemory(folderOf(folder)) : []
  )
  ipcMain.handle(IPC.memoryPreview, (event, id: unknown, folder: unknown, text: unknown) => {
    if (!isSender(event.sender) || !isId(id) || typeof text !== 'string') {
      return { error: t('pedido inválido') }
    }
    return previewMemory(id, folderOf(folder), text)
  })
  ipcMain.handle(
    IPC.memorySave,
    (event, id: unknown, folder: unknown, text: unknown, fingerprint: unknown): AgentResult => {
      if (
        !isSender(event.sender) ||
        !isId(id) ||
        typeof text !== 'string' ||
        typeof fingerprint !== 'string'
      ) {
        return { ok: false, message: t('pedido inválido') }
      }
      return saveMemory(id, folderOf(folder), text, fingerprint)
    }
  )
}
