// Os avatares (Fase 19): o campo da configuração e o submenu Avatar do menu da bandeja e do
// mascote (o mesmo menu), com o escolhido marcado e a troca pelo clique.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { MenuItemConstructorOptions } from 'electron'
import { checkSettings } from '../src/main/config'
import { menuTemplate } from '../src/main/menu'
import type { TrayActions } from '../src/main/menu'
import { AVATAR_LABELS, AVATARS } from '../src/shared/avatars'
import type { AvatarName } from '../src/shared/avatars'

test('avatar: the settings field', () => {
  assert.deepEqual(checkSettings({ avatar: 'fantasma' }), {
    ok: true,
    patch: { avatar: 'fantasma' }
  })
  assert.equal(checkSettings({ avatar: 'robo' }).ok, true)
  assert.equal(checkSettings({ avatar: 'dragao' }).ok, false)
  assert.equal(checkSettings({ avatar: null }).ok, false)
  // Cada avatar tem um nome para o menu e as configurações.
  for (const avatar of AVATARS) assert.ok(AVATAR_LABELS[avatar])
})

test('avatar: the menu has the choice, with the current one checked', () => {
  let current: AvatarName = 'robo'
  const chosen: AvatarName[] = []
  const actions: TrayActions = {
    avatar: () => current,
    setAvatar: (avatar) => {
      chosen.push(avatar)
      current = avatar
    },
    mascotVisible: () => true,
    setMascotVisible: () => {},
    newConversation: () => {},
    compactEnabled: () => false,
    setCompactEnabled: () => {},
    soundEnabled: () => true,
    setSoundEnabled: () => {},
    autostartEnabled: () => false,
    setAutostartEnabled: () => {},
    demoEnabled: () => false,
    setDemoEnabled: () => {},
    openSettings: () => {},
    shortcutLabel: () => 'Ctrl+Alt+W',
    voiceShortcutLabel: () => null,
    openConfig: () => {},
    quit: () => {}
  }
  const submenu = (): MenuItemConstructorOptions[] =>
    menuTemplate(actions, () => {}).find((item) => item.label === 'Avatar')
      ?.submenu as MenuItemConstructorOptions[]
  assert.deepEqual(
    submenu().map((item) => [item.label, item.type, item.checked]),
    [
      ['Robô (a gotinha)', 'radio', true],
      ['Fantasminha', 'radio', false]
    ]
  )
  const ghost = submenu()[1]
  ;(ghost.click as () => void)()
  assert.deepEqual(chosen, ['fantasma'])
  assert.deepEqual(
    submenu().map((item) => item.checked),
    [false, true]
  )
})
