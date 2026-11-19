// A conversa principal (Fase 82): a aba Wisp sempre existe, é a primeira e não fecha; não é
// usada como "aba vazia" para outra coisa; volta marcada; o histórico a marca; a personalidade
// e o diário do dia para o prompt dela.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { ChatTabs } from '../src/main/chat-tabs'
import type { Conversation } from '../src/main/conversation'
import { History } from '../src/main/history'
import { PersonalMemory } from '../src/main/personal-memory'

/** Uma conversa de mentira: o que as abas olham. */
function fakeConversation(): Conversation {
  return {
    id: randomUUID(),
    history: { main: false, anonymous: false },
    title: null,
    project: null,
    folder: null,
    busy: false,
    historyId: null,
    mode: 'default',
    view: 'chat',
    draft: '',
    dispose: () => undefined
  } as unknown as Conversation
}

function makeTabs(): { tabs: ChatTabs; closed: Conversation[] } {
  const closed: Conversation[] = []
  const tabs = new ChatTabs({
    makeConversation: () => fakeConversation(),
    closed: (conversation) => closed.push(conversation),
    changed: () => undefined
  })
  return { tabs, closed }
}

test('Wisp: abre sempre com a aba principal, a primeira, que não fecha', () => {
  const { tabs, closed } = makeTabs()
  tabs.restore(null, () => fakeConversation())
  assert.equal(tabs.list.length, 1, 'a Wisp é a única aba da primeira vez')
  const main = tabs.main()
  assert.equal(main.history.main, true)
  assert.equal(tabs.list[0].id, main.id)
  const state = tabs.state()
  const info = state.tabs[0]
  assert.equal(info.kind === 'chat' && info.main, true)
  assert.equal(info.title, 'Wisp')
  // Fechar a Wisp não faz nada; as outras fecham.
  tabs.close(main.id)
  assert.equal(tabs.list.length, 1)
  assert.equal(closed.length, 0)
  const other = tabs.addChat()
  assert.equal(tabs.list.length, 2)
  tabs.close(other.id)
  assert.equal(closed.length, 1)
  assert.equal(tabs.main().id, main.id, 'continua a mesma')
})

test('Wisp: não é a "aba vazia" de outra coisa, e volta marcada e primeira', () => {
  const { tabs } = makeTabs()
  tabs.restore(null, () => fakeConversation())
  const main = tabs.main()
  tabs.show(main.id)
  assert.equal(tabs.emptyFocused(), null, 'a Wisp vazia não serve para reabrir outra conversa')
  const fresh = tabs.fresh()
  assert.notEqual(fresh.id, main.id)
  // Guardada e trazida de volta: a marca volta (pelo restoreChat do chat.ts) e ela é a primeira.
  const saved = tabs.snapshot({ detached: false, maximized: false })
  const entry = saved.tabs.find((tab) => tab.kind === 'chat' && tab.main)
  assert.ok(entry, 'a Wisp vai marcada para o disco')
  const again = makeTabs().tabs
  const restored = { tabs: [...saved.tabs].reverse(), focused: 0, v: 2 as const }
  again.restore(restored, (item) => {
    const conversation = fakeConversation()
    if (item.main) conversation.history.main = true
    return conversation
  })
  assert.equal(again.list.length, 2)
  const first = again.list[0]
  assert.ok(first.kind === 'chat' && first.conversation.history.main, 'a Wisp é a primeira')
  // Duas marcadas (um arquivo mexido): só a primeira continua sendo.
  const twice = makeTabs().tabs
  twice.restore({ tabs: [entry!, entry!], focused: 0, v: 2 }, () => {
    const conversation = fakeConversation()
    conversation.history.main = true
    return conversation
  })
  assert.equal(twice.conversations().filter((item) => item.history.main).length, 1)
})

test('Wisp: o histórico marca os dias dela e sabe quando a conversa começou', () => {
  const history = new History(join(HOME, 'conversas-wisp'))
  history.main = true
  assert.equal(history.startedAt, null)
  history.user(randomUUID(), 'bom dia', [], false)
  assert.ok(history.startedAt && Date.now() - history.startedAt < 5000)
  const id = history.currentId()!
  history.flush()
  const summary = history.list().find((item) => item.id === id)
  assert.equal(summary?.main, true)
  history.record({ type: 'reset' })
  assert.equal(history.startedAt, null)
  assert.equal(history.main, true, 'a marca é da aba: continua depois do Ctrl+K')
  const saved = history.load(id)!
  history.continue(saved)
  assert.equal(history.startedAt, saved.createdAt)
})

test('Wisp: a personalidade nasce com o jeito de sempre e vale o que você escrever', () => {
  const memory = new PersonalMemory(join(HOME, 'memoria-personalidade'))
  const first = memory.personality()
  const file = readFileSync(memory.personalityPath, 'utf8')
  assert.match(file, /^# Personalidade\n/)
  assert.match(file, /- Fala em português do Brasil/)
  assert.match(first, /<personalidade>[\s\S]*Fala em português do Brasil[\s\S]*<\/personalidade>/)
  assert.ok(first.includes(memory.personalityPath), 'diz onde está o arquivo')
  assert.match(first, /ferramenta Edit/)
  assert.doesNotMatch(first, /<!--/)
  writeFileSync(memory.personalityPath, '# Personalidade\n\n- Fala de um jeito bem informal.\n')
  const edited = memory.personality()
  assert.match(edited, /bem informal/)
  assert.doesNotMatch(edited, /breve e direta/)
})

test('Wisp: o diário de ontem (ou do último dia) e o de hoje vão para o prompt dela', () => {
  const now = new Date(2026, 10, 19, 9, 0).getTime()
  const memory = new PersonalMemory(join(HOME, 'memoria-dia'), () => now)
  assert.match(memory.dayContext(), /a aba Wisp/)
  assert.doesNotMatch(memory.dayContext(), /## /, 'sem diário, só a explicação')
  mkdirSync(join(memory.dir, 'diario'), { recursive: true })
  writeFileSync(memory.path('diario', '2026-11-15'), '# 15\n\n- 10:00 Começou o relatório\n')
  writeFileSync(memory.path('diario', '2026-11-17'), '# 17\n\n- 18:00 Ficou faltando a revisão\n')
  writeFileSync(memory.path('diario', '2026-11-19'), '# 19\n\n- 08:30 Abriu o dia\n')
  const context = memory.dayContext()
  assert.match(context, /## O diário de 2026-11-17\n# 17\n\n- 18:00 Ficou faltando a revisão/)
  assert.doesNotMatch(context, /Começou o relatório/, 'só o último dia antes de hoje')
  assert.match(context, /## O diário de hoje \(2026-11-19\)[\s\S]*Abriu o dia/)
})
