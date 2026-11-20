// A interface completa (Fases 87 a 90): toda seção das configurações pertence a uma categoria (senão
// ela sumiria da tela), nenhuma está em duas, e a categoria guardada volta (ou a primeira).
import './helpers/home'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { ROOT } from './helpers/paths'
import { savedCategory, SETTINGS_CATEGORIES } from '../src/renderer/chat/settings-categories'

/** Os títulos dos <Section> das telas do painel, lidos do código. */
function sectionTitles(): string[] {
  const dir = join(ROOT, 'src/renderer/chat')
  const titles: string[] = []
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.tsx'))) {
    const text = readFileSync(join(dir, name), 'utf8')
    for (const match of text.matchAll(/<Section\s+title=(?:\{t\('([^']+)'\)\}|"([^"]+)")/g)) {
      titles.push(match[1] ?? match[2])
    }
  }
  return titles
}

test('configurações: toda seção tem uma categoria, e só uma', () => {
  const titles = sectionTitles()
  assert.ok(titles.length >= 16, `achou ${titles.length} seções`)
  // As de dentro de outros componentes também (os prompts e as tarefas usam a mesma <Section>).
  for (const extra of ['Prompts salvos', 'Tarefas agendadas']) {
    if (!titles.includes(extra)) titles.push(extra)
  }
  for (const title of titles) {
    const owners = SETTINGS_CATEGORIES.filter((category) => category.sections().includes(title))
    assert.equal(owners.length, 1, `"${title}" está em ${owners.length} categorias`)
  }
  // Nenhuma categoria vazia, nem com uma seção que não existe.
  for (const category of SETTINGS_CATEGORIES) {
    assert.ok(category.sections().length > 0, category.id)
    for (const section of category.sections()) {
      assert.ok(titles.includes(section), `${category.id}: "${section}" não existe`)
    }
  }
})

test('configurações: a categoria guardada volta, e uma desconhecida cai na primeira', () => {
  const store = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value)
  }
  assert.equal(savedCategory(), 'geral')
  store.set('wisp.config.categoria', 'fora')
  assert.equal(savedCategory(), 'fora')
  store.set('wisp.config.categoria', 'nao-existe')
  assert.equal(savedCategory(), 'geral')
})
