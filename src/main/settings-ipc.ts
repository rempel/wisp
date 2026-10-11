import { ipcMain, shell } from 'electron'
import type { WebContents } from 'electron'
import { homedir } from 'os'
import {
  checkSettings,
  CONFIG_PATH,
  configProblems,
  getConfig,
  isConfigWritable,
  notifyConfigChange,
  onConfigChange,
  updateConfig
} from './config'
import { LOG_PATH } from './log'
import { IPC, SETTINGS_KEYS } from '../shared/ipc'
import type { Settings, SettingsResult, SettingsSnapshot } from '../shared/ipc'

export interface SettingsOptions {
  /** O pedido veio da página do painel? */
  isSender(sender: WebContents): boolean
  /** Manda o estado novo para a página do painel. */
  send(snapshot: SettingsSnapshot): void
  /** Iniciar com o sistema: fica num arquivo à parte, fora do config.json. */
  autostart: { get(): boolean; set(enabled: boolean): string | null }
  /** Alguma configuração mudou (o menu da bandeja acompanha). */
  onChange?(): void
  /** Há uma chave da OpenRouter no chaveiro (o que se sabe até agora). */
  openrouterKey(): boolean | null
}

const tilde = (path: string): string =>
  path.startsWith(homedir() + '/') ? `~${path.slice(homedir().length)}` : path

/**
 * A tela de configurações do painel: lê e grava os campos do config.json que ela mostra. Cada
 * mudança é conferida campo a campo (com o motivo, em português, do que estiver errado), gravada
 * sem mexer no resto do arquivo e aplicada na hora, como uma edição no próprio arquivo.
 */
export function setupSettings(options: SettingsOptions): { notify(): void } {
  const snapshot = (): SettingsSnapshot => {
    const config = getConfig()
    const values = Object.fromEntries(
      SETTINGS_KEYS.map((key) => [key, config[key]])
    ) as unknown as Settings
    return {
      values,
      autostart: options.autostart.get(),
      configPath: tilde(CONFIG_PATH),
      logPath: tilde(LOG_PATH),
      problems: configProblems(),
      openrouterKey: options.openrouterKey()
    }
  }
  const notify = (): void => {
    options.send(snapshot())
    options.onChange?.()
  }
  // O arquivo editado à mão, o menu, a pílula da demonstração: a tela acompanha.
  onConfigChange(notify)

  ipcMain.handle(IPC.settingsGet, (event) => (options.isSender(event.sender) ? snapshot() : null))
  ipcMain.handle(IPC.settingsSet, (event, patch: unknown): SettingsResult => {
    if (!options.isSender(event.sender)) return { ok: false, field: '', message: 'pedido inválido' }
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return { ok: false, field: '', message: 'mudança inválida' }
    }
    const { autostart, ...fields } = patch as Record<string, unknown>
    const unknown = Object.keys(fields).find(
      (key) => !SETTINGS_KEYS.includes(key as keyof Settings)
    )
    if (unknown)
      return { ok: false, field: unknown, message: 'esta configuração não muda por aqui' }
    const checked = checkSettings(fields)
    if (!checked.ok) return checked
    if (Object.keys(checked.patch).length && !isConfigWritable()) {
      return {
        ok: false,
        field: '',
        message:
          'O config.json está com um erro e o Wisp não grava nele assim. Corrija o arquivo (ou ' +
          'apague-o, para voltar aos padrões) e tente de novo.'
      }
    }
    if (autostart !== undefined) {
      const problem = options.autostart.set(Boolean(autostart))
      if (problem) return { ok: false, field: 'autostart', message: problem }
    }
    if (Object.keys(checked.patch).length) {
      updateConfig(checked.patch)
      // Vale na hora, como uma edição no arquivo: atalhos, sons, demonstração…
      notifyConfigChange()
    } else {
      notify()
    }
    return { ok: true }
  })
  ipcMain.on(IPC.settingsOpenFile, (event, which: unknown) => {
    if (!options.isSender(event.sender)) return
    const path = which === 'log' ? LOG_PATH : CONFIG_PATH
    // Abre no app padrão do tipo; sem um (ou sem o arquivo ainda), mostra na pasta.
    void shell.openPath(path).then((error) => {
      if (error) shell.showItemInFolder(path)
    })
  })
  return { notify }
}
