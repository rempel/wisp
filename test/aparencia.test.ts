// A aparência e a acessibilidade (Fase 22): os campos novos do config.json (tema, alto contraste,
// reduzir animações e o tamanho do painel), com os padrões e os limites, e o Alt+P, que no
// terminal só fica com o Wisp quando há um card esperando.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { test } from 'node:test'
import { CONFIG_PATH, configProblems, loadConfig, updateConfig } from '../src/main/config'
import { SETTINGS_KEYS } from '../src/shared/ipc'
import { isCardShortcut, isWispTerminalShortcut } from '../src/renderer/chat/terminal-keys'

void HOME

test('aparência: os padrões seguem o sistema, no tamanho normal', () => {
  const config = loadConfig()
  assert.equal(config.theme, 'system')
  assert.equal(config.highContrast, false)
  assert.equal(config.reduceMotion, false)
  assert.equal(config.panelZoom, 1)
  for (const key of ['theme', 'highContrast', 'reduceMotion', 'panelZoom']) {
    assert.ok((SETTINGS_KEYS as readonly string[]).includes(key), key)
  }
})

test('aparência: valores fora do lugar caem no padrão, com o aviso', () => {
  writeFileSync(CONFIG_PATH, JSON.stringify({ theme: 'roxo', panelZoom: 5, highContrast: true }))
  const config = loadConfig()
  assert.equal(config.theme, 'system')
  assert.equal(config.panelZoom, 1)
  assert.equal(config.highContrast, true)
  assert.deepEqual(configProblems(), [
    '`theme` tem um valor inválido; usei o padrão (`"system"`).',
    '`panelZoom` tem um valor inválido; usei o padrão (`1`).'
  ])
  writeFileSync(CONFIG_PATH, JSON.stringify({ panelZoom: 0.5 }))
  assert.equal(loadConfig().panelZoom, 1)
})

test('aparência: gravar o tema e o tamanho', () => {
  writeFileSync(CONFIG_PATH, '{}')
  loadConfig()
  updateConfig({ theme: 'dark', panelZoom: 1.3, reduceMotion: true })
  const saved = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
  assert.equal(saved.theme, 'dark')
  assert.equal(saved.panelZoom, 1.3)
  assert.equal(saved.reduceMotion, true)
})

test('Alt+P: só ele, e não é dos atalhos que o terminal sempre cede', () => {
  const press = (code: string, mods: Partial<Record<'ctrl' | 'shift' | 'alt', boolean>> = {}) => ({
    key: code.slice(3).toLowerCase(),
    code,
    ctrlKey: !!mods.ctrl,
    shiftKey: !!mods.shift,
    altKey: !!mods.alt,
    metaKey: false
  })
  assert.equal(isCardShortcut(press('KeyP', { alt: true })), true)
  assert.equal(isCardShortcut(press('KeyP', { alt: true, ctrl: true })), false)
  assert.equal(isCardShortcut(press('KeyP', { alt: true, shift: true })), false)
  assert.equal(isCardShortcut(press('KeyP')), false)
  assert.equal(isCardShortcut(press('KeyO', { alt: true })), false)
  // No terminal, sem card esperando, o Alt+P é do Claude Code (lá ele troca o modelo).
  assert.equal(isWispTerminalShortcut(press('KeyP', { alt: true })), false)
})
