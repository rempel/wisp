// Os idiomas (Fase 25): todo t('…') do código tem tradução no i18n-en.ts, com as mesmas
// variáveis, e nenhuma tradução sobra; o idioma vem do config.json ou do sistema; e o t()
// troca as variáveis nos dois idiomas.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { test } from 'node:test'
import { placeholders, survey } from '../scripts/i18n.mjs'
import { CONFIG_PATH, loadConfig } from '../src/main/config'
import { systemTag } from '../src/main/locale-init'
import {
  dateLocale,
  getLocale,
  resolveLocale,
  setLocale,
  systemLocale,
  t
} from '../src/shared/i18n'
import { EN } from '../src/shared/i18n-en'
import { SETTINGS_KEYS } from '../src/shared/ipc'

void HOME
const root = new URL('..', `file://${__filename}`).pathname.replace(/out\/$/, '')
const { used, dynamic, en } = survey(root)

test('idiomas: todo texto do código tem tradução para o inglês', () => {
  const missing = [...used].filter(([key]) => !(key in EN)).map(([key, where]) => `${where} ${key}`)
  assert.deepEqual(missing, [], 'rode npm run i18n para ver a lista')
  assert.ok(used.size > 1000, `só ${used.size} textos: o levantamento achou os arquivos?`)
})

test('idiomas: o dicionário lido do arquivo é o mesmo que o app carrega', () => {
  assert.equal(en.size, Object.keys(EN).length)
  for (const [key, value] of en) assert.equal(EN[key], value, key)
})

test('idiomas: as traduções têm as mesmas variáveis do português', () => {
  for (const [key, value] of Object.entries(EN)) {
    assert.deepEqual(placeholders(value), placeholders(key), `${key} → ${value}`)
  }
})

test('idiomas: nenhuma tradução sobra (menos as das chamadas com variável)', () => {
  // O único t() sem texto fixo: o escopo do "Permitir sempre", conversa ou sessão.
  assert.deepEqual(
    dynamic.map((where) => where.replace(/:\d+$/, '')),
    Array(dynamic.length).fill('src/renderer/chat/PermissionCard.tsx')
  )
  const scopes = new Set(['conversa', 'sessão'])
  const unused = Object.keys(EN).filter((key) => !used.has(key) && !scopes.has(key))
  assert.deepEqual(unused, [])
  for (const scope of scopes) assert.ok(scope in EN, scope)
})

test('idiomas: o t() troca as variáveis e cai no português sem tradução', () => {
  const before = getLocale()
  try {
    setLocale('pt')
    assert.equal(t('Passo {v1} de {total}', { v1: 2, total: 5 }), 'Passo 2 de 5')
    assert.equal(dateLocale(), 'pt-BR')
    setLocale('en')
    assert.equal(t('Passo {v1} de {total}', { v1: 2, total: 5 }), 'Step 2 of 5')
    assert.equal(
      t('Permitir sempre nesta {scope}', { scope: t('conversa') }),
      'Always allow in this conversation'
    )
    assert.equal(t('um texto que ninguém traduziu'), 'um texto que ninguém traduziu')
    // Uma variável que não veio fica como está, para o erro aparecer.
    assert.equal(t('Passo {v1} de {total}', { v1: 1 }), 'Step 1 of {total}')
    assert.equal(t('US$ {v1}', { v1: '0.50' }), '$0.50')
    assert.equal(dateLocale(), 'en-US')
  } finally {
    setLocale(before)
  }
})

test('idiomas: português para pt*, inglês para o resto, e a escolha do config vence', () => {
  assert.equal(systemLocale('pt_BR.UTF-8'), 'pt')
  assert.equal(systemLocale('pt_PT'), 'pt')
  assert.equal(systemLocale('pt'), 'pt')
  assert.equal(systemLocale('en_US.UTF-8'), 'en')
  assert.equal(systemLocale('de_DE.UTF-8'), 'en')
  assert.equal(systemLocale('C.UTF-8'), 'en')
  // "ptx" não é português.
  assert.equal(systemLocale('ptx'), 'en')
  // Sem nada no ambiente, o Wisp fica no idioma em que nasceu.
  assert.equal(systemLocale(undefined), 'pt')
  assert.equal(resolveLocale('auto', 'en_US.UTF-8'), 'en')
  assert.equal(resolveLocale('pt', 'en_US.UTF-8'), 'pt')
  assert.equal(resolveLocale('en', 'pt_BR.UTF-8'), 'en')
})

test('idiomas: LC_ALL vem antes de LC_MESSAGES, que vem antes de LANG', () => {
  assert.equal(systemTag({ LANG: 'pt_BR.UTF-8' }), 'pt_BR.UTF-8')
  assert.equal(systemTag({ LANG: 'pt_BR.UTF-8', LC_MESSAGES: 'en_US.UTF-8' }), 'en_US.UTF-8')
  assert.equal(
    systemTag({ LANG: 'pt_BR.UTF-8', LC_MESSAGES: 'en_US.UTF-8', LC_ALL: 'de_DE.UTF-8' }),
    'de_DE.UTF-8'
  )
  assert.equal(systemTag({ LANG: '' }), undefined)
})

test('idiomas: o language do config.json, com o padrão e um valor errado', () => {
  assert.ok((SETTINGS_KEYS as readonly string[]).includes('language'))
  mkdirSync(dirname(CONFIG_PATH), { recursive: true })
  writeFileSync(CONFIG_PATH, '{}')
  assert.equal(loadConfig().language, 'auto')
  writeFileSync(CONFIG_PATH, JSON.stringify({ language: 'en' }))
  assert.equal(loadConfig().language, 'en')
  writeFileSync(CONFIG_PATH, JSON.stringify({ language: 'klingon' }))
  assert.equal(loadConfig().language, 'auto')
})
