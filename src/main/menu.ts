// O menu da bandeja e do botão direito do mascote (os dois são o mesmo), sem o Electron em
// volta, para os testes montarem e clicarem nele.

import type { MenuItemConstructorOptions } from 'electron'
import { AVATAR_LABELS, AVATARS } from '../shared/avatars'
import type { AvatarName } from '../shared/avatars'

export interface TrayActions {
  mascotVisible(): boolean
  setMascotVisible(visible: boolean): void
  newConversation(): void
  /** O avatar escolhido, e trocar (o submenu Avatar). */
  avatar(): AvatarName
  setAvatar(avatar: AvatarName): void
  compactEnabled(): boolean
  setCompactEnabled(enabled: boolean): void
  soundEnabled(): boolean
  setSoundEnabled(enabled: boolean): void
  autostartEnabled(): boolean
  setAutostartEnabled(enabled: boolean): void
  demoEnabled(): boolean
  setDemoEnabled(enabled: boolean): void
  /** Abre a tela de configurações no painel. */
  openSettings(): void
  /** Abre o diagnóstico no painel (Fase 20). */
  openDiagnostics(): void
  /** O atalho global, para o menu mostrar ("Ctrl+Alt+W"); null sem atalho. */
  shortcutLabel(): string | null
  /** O atalho de voz ("Ctrl+Alt+Space"); null sem atalho. */
  voiceShortcutLabel(): string | null
  openConfig(): void
  quit(): void
}

export function menuTemplate(
  actions: TrayActions,
  refresh: () => void
): MenuItemConstructorOptions[] {
  const visible = actions.mascotVisible()
  return [
    {
      label: visible ? 'Ocultar mascote' : 'Mostrar mascote',
      click: () => {
        actions.setMascotVisible(!visible)
        refresh()
      }
    },
    {
      label: 'Avatar',
      submenu: AVATARS.map((name) => ({
        label: AVATAR_LABELS[name],
        type: 'radio' as const,
        checked: actions.avatar() === name,
        click: () => actions.setAvatar(name)
      }))
    },
    {
      label: 'Ilha no topo',
      type: 'checkbox',
      checked: actions.compactEnabled(),
      click: (item) => actions.setCompactEnabled(item.checked)
    },
    { label: 'Nova conversa', click: () => actions.newConversation() },
    {
      label: 'Sons',
      type: 'checkbox',
      checked: actions.soundEnabled(),
      click: (item) => actions.setSoundEnabled(item.checked)
    },
    {
      label: 'Iniciar com o sistema',
      type: 'checkbox',
      checked: actions.autostartEnabled(),
      click: (item) => {
        actions.setAutostartEnabled(item.checked)
        refresh()
      }
    },
    {
      label: 'Modo demonstração',
      type: 'checkbox',
      checked: actions.demoEnabled(),
      click: (item) => actions.setDemoEnabled(item.checked)
    },
    { label: 'Configurações…', click: () => actions.openSettings() },
    { label: 'Diagnóstico…', click: () => actions.openDiagnostics() },
    { label: 'Abrir config.json', click: () => actions.openConfig() },
    { type: 'separator' },
    {
      label: actions.shortcutLabel()
        ? `Atalho: ${actions.shortcutLabel()}`
        : 'Atalho: wisp --toggle (veja o README)',
      enabled: false
    },
    ...(actions.voiceShortcutLabel()
      ? [{ label: `Falar: ${actions.voiceShortcutLabel()} (segure)`, enabled: false }]
      : []),
    { type: 'separator' },
    { label: 'Sair', click: () => actions.quit() }
  ]
}
