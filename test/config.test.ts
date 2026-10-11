// O ~/.config/wisp/config.json: criado com os padrões, cada campo inválido cai no próprio padrão,
// gravar não apaga o que o usuário escreveu, JSON quebrado nunca é sobrescrito, edição com o app
// aberto e config.json como link simbólico.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  CONFIG_PATH,
  configProblems,
  getConfig,
  loadConfig,
  onConfigChange,
  updateConfig
} from '../src/main/config'

const read = (): Record<string, unknown> => JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
let clock = Date.now() / 1000
/** Escreve o arquivo "à mão", com um mtime novo (o Wisp percebe a edição pelo mtime). */
function edit(content: string, path = CONFIG_PATH): void {
  writeFileSync(path, content)
  clock += 10
  utimesSync(path, clock, clock)
}

test('primeira vez: o arquivo nasce com os padrões', () => {
  assert.equal(CONFIG_PATH, join(HOME, '.config/wisp/config.json'))
  const config = loadConfig()
  assert.equal(config.claudePath, 'claude')
  assert.equal(config.permissionMode, 'default')
  assert.equal(read().editorCommand, 'code')
  assert.deepEqual(configProblems(), [])
})

test('um campo inválido cai no padrão dele, e o resto vale', () => {
  edit(
    JSON.stringify({
      editorCommand: 42,
      sound: false,
      permissionMode: 'bypassPermissions',
      minhaChave: 1
    })
  )
  const config = loadConfig()
  assert.equal(config.editorCommand, 'code')
  assert.equal(config.sound, false)
  // O modo que pula todas as permissões não existe no Wisp.
  assert.equal(config.permissionMode, 'default')
  assert.deepEqual(configProblems(), [
    '`editorCommand` tem um valor inválido; usei o padrão (`"code"`).',
    '`permissionMode` tem um valor inválido; usei o padrão (`"default"`).'
  ])
})

test('gravar troca só o que mudou: o que o usuário escreveu fica', () => {
  updateConfig({ sound: true, volume: 0.2 })
  const file = read()
  assert.equal(file.sound, true)
  assert.equal(file.volume, 0.2)
  assert.equal(file.editorCommand, 42)
  assert.equal(file.minhaChave, 1)
})

test('editado com o app aberto: relê e avisa quem acompanha', () => {
  let seen: number | null = null
  onConfigChange((config) => {
    seen = config.volume
  })
  edit(JSON.stringify({ ...read(), volume: 0.7 }))
  assert.equal(getConfig().volume, 0.7)
  assert.equal(seen, 0.7)
})

test('JSON quebrado: continua com a config anterior e não grava no arquivo', () => {
  edit('{ quebrado')
  assert.equal(getConfig().volume, 0.7)
  assert.match(configProblems()[0], /não é um JSON válido/)
  updateConfig({ volume: 0.1 })
  assert.equal(readFileSync(CONFIG_PATH, 'utf8'), '{ quebrado')
  assert.equal(getConfig().volume, 0.1, 'vale na memória')
})

test('config.json como link simbólico: grava no arquivo de destino', () => {
  const dotfiles = join(HOME, 'dotfiles')
  mkdirSync(dotfiles, { recursive: true })
  const target = join(dotfiles, 'wisp.json')
  writeFileSync(target, JSON.stringify({ sound: false }))
  rmSync(CONFIG_PATH)
  symlinkSync(target, CONFIG_PATH)
  loadConfig()
  updateConfig({ volume: 0.4 })
  assert.ok(lstatSync(CONFIG_PATH).isSymbolicLink(), 'continua um link')
  assert.deepEqual(JSON.parse(readFileSync(target, 'utf8')), { sound: false, volume: 0.4 })
})
