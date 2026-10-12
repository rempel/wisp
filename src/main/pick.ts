// Escolher uma pasta pelo diálogo do sistema. Nos testes de ponta a ponta, que não têm como
// clicar num diálogo nativo, WISP_TEST_PICK_FOLDER responde no lugar dele.

import { dialog } from 'electron'
import type { BrowserWindow } from 'electron'

export async function pickFolder(
  title: string,
  defaultPath: string | undefined,
  parent: BrowserWindow | null
): Promise<string | null> {
  const fake = process.env.WISP_TEST_PICK_FOLDER
  if (fake !== undefined) return fake || null
  const options = { title, defaultPath, properties: ['openDirectory' as const] }
  const picked = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  return picked.canceled ? null : (picked.filePaths[0] ?? null)
}
