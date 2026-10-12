// A grade dos painéis (shared/layout.ts): dividir em qualquer direção, tirar um painel, arrastar
// uma aba para a borda ou o meio de um painel, ajustar as proporções, achar o vizinho e ler uma
// árvore que veio do disco.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  columns,
  dropTab,
  leaf,
  leaves,
  neighbor,
  normalize,
  removeLeaf,
  resize,
  rows,
  sanitize,
  splitLeaf,
  zoneAt
} from '../src/shared/layout'
import type { Layout } from '../src/shared/layout'

const round = (layout: Layout): unknown =>
  JSON.parse(
    JSON.stringify(layout, (key, value) =>
      key === 'sizes' ? value.map((n: number) => Math.round(n * 1000) / 1000) : value
    )
  )

test('dividir: ao lado, embaixo, e na mesma direção entra ao lado com metade do espaço', () => {
  let layout = splitLeaf(leaf('a'), 'a', 'b', 'right')
  assert.deepEqual(round(layout), {
    type: 'split',
    dir: 'row',
    sizes: [0.5, 0.5],
    children: [leaf('a'), leaf('b')]
  })
  layout = splitLeaf(layout, 'a', 'c', 'right')
  assert.deepEqual(leaves(layout), ['a', 'c', 'b'])
  assert.deepEqual(round(layout), {
    type: 'split',
    dir: 'row',
    sizes: [0.25, 0.25, 0.5],
    children: [leaf('a'), leaf('c'), leaf('b')]
  })
  layout = splitLeaf(layout, 'b', 'd', 'bottom')
  assert.deepEqual(round(layout), {
    type: 'split',
    dir: 'row',
    sizes: [0.25, 0.25, 0.5],
    children: [
      leaf('a'),
      leaf('c'),
      { type: 'split', dir: 'column', sizes: [0.5, 0.5], children: [leaf('b'), leaf('d')] }
    ]
  })
  assert.equal(columns(layout), 3)
  assert.equal(rows(layout), 2)
  layout = splitLeaf(layout, 'd', 'e', 'top')
  assert.deepEqual(leaves(layout), ['a', 'c', 'b', 'e', 'd'])
  assert.equal(rows(layout), 3)
})

test('tirar um painel: a divisão de um filho só some, e as proporções se ajustam', () => {
  const layout = splitLeaf(splitLeaf(leaf('a'), 'a', 'b', 'right'), 'b', 'c', 'bottom')
  const without = removeLeaf(layout, 'c')
  assert.deepEqual(round(without as Layout), {
    type: 'split',
    dir: 'row',
    sizes: [0.5, 0.5],
    children: [leaf('a'), leaf('b')]
  })
  assert.deepEqual(removeLeaf(removeLeaf(without as Layout, 'a') as Layout, 'b'), null)
  // Uma divisão na mesma direção dentro de outra vira parte dela.
  assert.deepEqual(
    leaves(
      normalize({
        type: 'split',
        dir: 'row',
        sizes: [0.5, 0.5],
        children: [
          leaf('a'),
          { type: 'split', dir: 'row', sizes: [0.5, 0.5], children: [leaf('b'), leaf('c')] }
        ]
      })
    ),
    ['a', 'b', 'c']
  )
})

test('arrastar uma aba: borda divide, meio troca; uma aba à vista muda de lugar', () => {
  let layout = splitLeaf(leaf('a'), 'a', 'b', 'right')
  // Uma aba escondida (c) na borda de baixo do painel de a.
  layout = dropTab(layout, 'c', 'a', 'bottom')
  assert.deepEqual(leaves(layout), ['a', 'c', 'b'])
  // A aba b, já à vista, para cima do painel de a: sai de onde estava.
  layout = dropTab(layout, 'b', 'a', 'top')
  assert.deepEqual(round(layout), {
    type: 'split',
    dir: 'column',
    sizes: [0.25, 0.25, 0.5],
    children: [leaf('b'), leaf('a'), leaf('c')]
  })
  // No meio: troca com outra à vista; uma escondida toma o lugar.
  assert.deepEqual(leaves(dropTab(layout, 'b', 'c', 'center')), ['c', 'a', 'b'])
  assert.deepEqual(leaves(dropTab(layout, 'z', 'a', 'center')), ['b', 'z', 'c'])
  assert.equal(dropTab(layout, 'a', 'a', 'left'), layout)
})

test('ajustar uma divisória: as proporções somam 1, com um mínimo', () => {
  const layout = splitLeaf(splitLeaf(leaf('a'), 'a', 'b', 'right'), 'b', 'c', 'bottom')
  const wider = resize(layout, [], [0.7, 0.3]) as Extract<Layout, { type: 'split' }>
  assert.deepEqual(
    wider.sizes.map((n) => Math.round(n * 100)),
    [70, 30]
  )
  const inner = resize(layout, [1], [0, 5]) as Extract<Layout, { type: 'split' }>
  const sizes = (inner.children[1] as Extract<Layout, { type: 'split' }>).sizes
  assert.ok(sizes[0] > 0.05 && Math.abs(sizes[0] + sizes[1] - 1) < 1e-9, String(sizes))
  assert.equal(resize(layout, [], [1, 1, 1]), layout, 'quantidade errada não muda nada')
  assert.equal(resize(layout, [5], [1, 1]).type, 'split')
})

test('o vizinho de cada painel, para os atalhos', () => {
  // a | (b sobre c)
  const layout = splitLeaf(splitLeaf(leaf('a'), 'a', 'b', 'right'), 'b', 'c', 'bottom')
  assert.equal(neighbor(layout, 'a', 'right'), 'b')
  assert.equal(neighbor(layout, 'c', 'left'), 'a')
  assert.equal(neighbor(layout, 'b', 'bottom'), 'c')
  assert.equal(neighbor(layout, 'c', 'top'), 'b')
  assert.equal(neighbor(layout, 'a', 'left'), null)
  assert.equal(neighbor(layout, 'x', 'left'), null)
})

test('a zona de soltar: bordas de 25% e o meio', () => {
  assert.equal(zoneAt(10, 100, 400, 200), 'left')
  assert.equal(zoneAt(390, 100, 400, 200), 'right')
  assert.equal(zoneAt(200, 10, 400, 200), 'top')
  assert.equal(zoneAt(200, 190, 400, 200), 'bottom')
  assert.equal(zoneAt(200, 100, 400, 200), 'center')
})

test('uma árvore de fora: só o formato certo, abas válidas, sem repetidas, até 8', () => {
  const valid = (tab: string): boolean => tab !== 'morta'
  assert.equal(sanitize(null, valid), null)
  assert.deepEqual(sanitize({ type: 'leaf', tab: 'a' }, valid), leaf('a'))
  assert.deepEqual(
    sanitize(
      {
        type: 'split',
        dir: 'row',
        sizes: ['x', 2],
        children: [
          { type: 'leaf', tab: 'morta' },
          { type: 'leaf', tab: 'a' },
          { type: 'leaf', tab: 'a' }
        ]
      },
      valid
    ),
    leaf('a')
  )
  assert.equal(sanitize({ type: 'split', dir: 'diagonal', children: [] }, valid), null)
  const many = {
    type: 'split',
    dir: 'row',
    sizes: [],
    children: Array.from({ length: 12 }, (_, i) => ({ type: 'leaf', tab: `t${i}` }))
  }
  assert.equal(leaves(sanitize(many, valid)).length, 8)
})
