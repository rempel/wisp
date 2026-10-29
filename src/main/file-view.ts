// Ver um arquivo no painel (Fase 34): o arquivo que um card do Claude leu ou mudou, aberto no
// editor do VS Code, só para ler. O main lê com limites: um arquivo de verdade (pelo caminho real,
// depois dos links), de até VIEW_LIMIT, de texto, e nunca um dos arquivos de segredos (os que o
// Claude só lê com aprovação), nem por um link que aponte para um deles.

import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import { readFileSync, realpathSync, statSync } from 'fs'
import { homedir } from 'os'
import { isAbsolute } from 'path'
import { isSensitivePath } from './claude-settings'
import { IPC } from '../shared/ipc'
import type { FileViewResult } from '../shared/ipc'
import { t } from '../shared/i18n'

/** O maior arquivo que o painel mostra. */
export const VIEW_LIMIT = 2 * 1024 * 1024

const fail = (message: string): FileViewResult => ({ ok: false, message })

/** O texto do arquivo para o visualizador, ou por que ele não aparece. */
export function readForView(path: unknown, home = homedir()): FileViewResult {
  if (typeof path !== 'string' || !isAbsolute(path)) return fail(t('Caminho inválido.'))
  const secret = fail(t('Este arquivo guarda segredos: o painel não mostra.'))
  if (isSensitivePath(path, home)) return secret
  let real: string
  try {
    real = realpathSync(path)
  } catch {
    return fail(t('O arquivo não existe (ou não dá para ler).'))
  }
  if (isSensitivePath(real, home)) return secret
  try {
    const stat = statSync(real)
    if (!stat.isFile()) return fail(t('Não é um arquivo.'))
    if (stat.size > VIEW_LIMIT) {
      return fail(
        t('O arquivo é grande demais para ver aqui ({size} MB).', {
          size: (stat.size / 1024 / 1024).toFixed(1)
        })
      )
    }
    const buffer = readFileSync(real)
    if (buffer.subarray(0, 8192).includes(0)) return fail(t('É um arquivo binário.'))
    return { ok: true, text: buffer.toString('utf8') }
  } catch (err) {
    return fail((err as Error).message)
  }
}

export function setupFileViewIpc(isSender: (sender: WebContents) => boolean): void {
  ipcMain.handle(IPC.filesView, (event, path: unknown): FileViewResult => {
    if (!isSender(event.sender)) return fail(t('Caminho inválido.'))
    return readForView(path)
  })
}
