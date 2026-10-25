// As skills nas configurações (Fase 15): listar, instalar de uma pasta (escolhida no diálogo do
// sistema, com uma prévia antes de copiar) e mandar para a lixeira.

import { ipcMain, shell } from 'electron'
import type { WebContents } from 'electron'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { pickFolder } from './pick'
import { claudeConfigDir, inspectSkill, installSkill, listSkills, SKILL_NAME } from './skills'
import { IPC } from '../shared/ipc'
import type { SkillInfo, SkillResult } from '../shared/ipc'

export function setupSkillsIpc(isSender: (sender: WebContents) => boolean): void {
  /** A pasta escolhida no diálogo: só ela pode ser instalada. */
  let picked: string | null = null
  ipcMain.handle(IPC.skillsList, (event): SkillInfo[] =>
    isSender(event.sender) ? listSkills() : []
  )
  ipcMain.handle(IPC.skillsPick, async (event) => {
    if (!isSender(event.sender)) return null
    picked = null
    const dir = await pickFolder('Escolha a pasta da skill (a que tem o SKILL.md)', undefined, null)
    if (!dir) return null
    try {
      const preview = inspectSkill(dir)
      picked = dir
      return preview
    } catch (err) {
      return { error: (err as Error).message }
    }
  })
  ipcMain.handle(IPC.skillsInstall, (event): SkillResult => {
    if (!isSender(event.sender) || !picked) {
      return { ok: false, message: 'Escolha a pasta da skill antes.' }
    }
    const dir = picked
    picked = null
    try {
      installSkill(dir)
    } catch (err) {
      return { ok: false, message: (err as Error).message }
    }
    return { ok: true, message: 'Instalada. Ela vale nas conversas novas (Ctrl+K).' }
  })
  ipcMain.handle(IPC.skillsRemove, async (event, name: unknown): Promise<SkillResult> => {
    if (!isSender(event.sender)) return { ok: false, message: 'pedido inválido' }
    // Só as pessoais, pelo nome: os plugins se removem pelo /plugin do Claude Code.
    if (typeof name !== 'string' || !SKILL_NAME.test(name)) {
      return { ok: false, message: 'Nome de skill inválido.' }
    }
    const skill = listSkills().find((item) => item.origin === 'personal' && item.name === name)
    if (!skill) return { ok: false, message: 'Essa skill não está nas suas skills pessoais.' }
    try {
      await shell.trashItem(skill.path)
    } catch (err) {
      return { ok: false, message: `Não consegui mandar para a lixeira: ${(err as Error).message}` }
    }
    return { ok: true, message: `"${name}" foi para a lixeira.` }
  })
  ipcMain.on(IPC.skillsOpenFolder, (event) => {
    if (!isSender(event.sender)) return
    const dir = join(claudeConfigDir(), 'skills')
    mkdirSync(dir, { recursive: true })
    void shell.openPath(dir)
  })
}
