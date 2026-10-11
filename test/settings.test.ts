// A tela de configurações: cada mudança é conferida campo a campo, com o motivo em português, e o
// campo de atalho só aceita o que serve de atalho global.
import './helpers/home'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkSettings } from '../src/main/config'
import { acceleratorOf } from '../src/renderer/chat/accelerator'

test('mudanças válidas passam, já no formato do arquivo', () => {
  assert.deepEqual(checkSettings({ sound: false, volume: 0.25 }), {
    ok: true,
    patch: { sound: false, volume: 0.25 }
  })
  assert.deepEqual(checkSettings({ projectRoots: ['~/projetos', '~/trabalho'] }), {
    ok: true,
    patch: { projectRoots: ['~/projetos', '~/trabalho'] }
  })
  assert.deepEqual(checkSettings({ model: null, demo: true }), {
    ok: true,
    patch: { model: null, demo: true }
  })
})

test('um valor errado: recusado, com o campo e o motivo', () => {
  assert.deepEqual(checkSettings({ volume: 3 }), {
    ok: false,
    field: 'volume',
    message: 'O volume vai de 0 a 1.'
  })
  const editor = checkSettings({ editorCommand: '   ' })
  assert.equal(editor.ok, false)
  assert.ok(!editor.ok && /comando do editor/.test(editor.message))
  const model = checkSettings({ model: 'sonnet; rm -rf ~' })
  assert.ok(!model.ok && model.field === 'model')
  const minutes = checkSettings({ sleepAfterMinutes: -1 })
  assert.ok(!minutes.ok && minutes.field === 'sleepAfterMinutes')
  const mode = checkSettings({ permissionMode: 'bypassPermissions' })
  assert.ok(!mode.ok && mode.field === 'permissionMode', 'o modo sem perguntas não existe aqui')
})

test('o que não é um campo da config não passa', () => {
  assert.equal(checkSettings(null).ok, false)
  assert.equal(checkSettings([]).ok, false)
  assert.deepEqual(checkSettings({ inventado: 1 }), {
    ok: false,
    field: 'inventado',
    message: 'campo desconhecido'
  })
  assert.equal(checkSettings({ __proto__: { sound: false } }).ok, true, 'o protótipo não conta')
})

const key = (
  code: string,
  modifiers: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>> = {}
): string | null =>
  acceleratorOf({
    key: '',
    code,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...modifiers
  })

test('o campo de atalho: o formato do Electron, pela tecla física', () => {
  assert.equal(key('KeyW', { ctrlKey: true, altKey: true }), 'Ctrl+Alt+W')
  assert.equal(key('Space', { metaKey: true }), 'Super+Space')
  assert.equal(key('Digit1', { ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+1')
  assert.equal(key('Slash', { altKey: true }), 'Alt+/')
  assert.equal(key('F9'), 'F9', 'as teclas de função valem sozinhas')
  assert.equal(key('F12', { shiftKey: true }), 'Shift+F12')
})

test('o campo de atalho: o que não serve fica esperando', () => {
  assert.equal(key('ControlLeft', { ctrlKey: true }), null, 'só o modificador')
  assert.equal(key('KeyA'), null, 'uma letra sozinha roubaria a tecla')
  assert.equal(key('KeyA', { shiftKey: true }), null, 'Shift não basta')
  assert.equal(key('Escape', { ctrlKey: true }), null)
})
