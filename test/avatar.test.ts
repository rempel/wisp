// Os avatares (Fase 19; o fogo-fátuo e a geleca, Fase 39): o campo da configuração, quem usava a
// gotinha passando para o fogo-fátuo, e o submenu Avatar do menu da bandeja e do mascote (o mesmo
// menu), com o escolhido marcado e a troca pelo clique.
import './helpers/home'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { test } from 'node:test'
import type { MenuItemConstructorOptions } from 'electron'
import {
  checkSettings,
  CONFIG_PATH,
  configProblems,
  loadConfig,
  updateConfig
} from '../src/main/config'
import { menuTemplate } from '../src/main/menu'
import type { TrayActions } from '../src/main/menu'
import { AVATAR_LABELS, AVATARS } from '../src/shared/avatars'
import type { AvatarName } from '../src/shared/avatars'

test('avatar: the settings field', () => {
  assert.deepEqual(checkSettings({ avatar: 'fantasma' }), {
    ok: true,
    patch: { avatar: 'fantasma' }
  })
  assert.equal(checkSettings({ avatar: 'geleca' }).ok, true)
  assert.equal(checkSettings({ avatar: 'fogo' }).ok, true)
  // A gotinha robô saiu (Fase 39).
  assert.equal(checkSettings({ avatar: 'robo' }).ok, false)
  assert.equal(checkSettings({ avatar: 'dragao' }).ok, false)
  assert.equal(checkSettings({ avatar: null }).ok, false)
  // Cada avatar tem um nome para o menu e as configurações.
  for (const avatar of AVATARS) assert.ok(AVATAR_LABELS[avatar])
})

test('avatar: o fogo-fátuo por padrão, e quem usava a gotinha passa para ele sem aviso', () => {
  assert.equal(loadConfig().avatar, 'fogo')
  mkdirSync(dirname(CONFIG_PATH), { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify({ avatar: 'robo', sound: false }))
  const config = loadConfig()
  assert.equal(config.avatar, 'fogo')
  assert.equal(config.sound, false)
  assert.deepEqual(configProblems(), [])
  // Na próxima gravação, o arquivo fica com o novo.
  updateConfig({ volume: 0.3 })
  assert.equal(JSON.parse(readFileSync(CONFIG_PATH, 'utf8')).avatar, 'fogo')
})

test('avatar: the menu has the choice, with the current one checked', () => {
  let current: AvatarName = 'fogo'
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
    openDiagnostics: () => {},
    openPalette: () => {},
    quiet: () => false,
    focusEndsAt: () => null,
    startFocus: () => {},
    stopFocus: () => {},
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
      ['Fogo-fátuo', 'radio', true],
      ['Geleca', 'radio', false],
      ['Fantasminha', 'radio', false]
    ]
  )
  ;(submenu()[1].click as () => void)()
  ;(submenu()[2].click as () => void)()
  assert.deepEqual(chosen, ['geleca', 'fantasma'])
  assert.deepEqual(
    submenu().map((item) => item.checked),
    [false, false, true]
  )
})
