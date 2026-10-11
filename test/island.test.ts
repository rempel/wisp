// A geometria da ilha: a janela no centro do topo da área útil, e a cápsula (recolhida ou aberta)
// centralizada e colada no topo da janela.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ISLAND_COLLAPSED,
  ISLAND_EXPANDED,
  ISLAND_WINDOW,
  islandBounds,
  islandRect,
  islandShape
} from '../src/main/island'

test('a janela fica no centro do topo, abaixo da barra do sistema', () => {
  assert.deepEqual(islandBounds({ x: 0, y: 0, width: 1600, height: 900 }), {
    x: 630,
    y: 4,
    width: 340,
    height: 110
  })
  // Com uma barra de 32 px no topo, e num segundo monitor à direita.
  assert.deepEqual(islandBounds({ x: 1920, y: 32, width: 2560, height: 1408 }), {
    x: 1920 + 1110,
    y: 36,
    width: 340,
    height: 110
  })
})

test('a cápsula cabe na janela, centralizada e colada no topo', () => {
  for (const expanded of [false, true]) {
    const shape = islandShape(expanded)
    const size = expanded ? ISLAND_EXPANDED : ISLAND_COLLAPSED
    assert.equal(shape.width, size.width)
    assert.equal(shape.height, size.height)
    assert.equal(shape.y, 0)
    assert.equal(shape.x * 2 + shape.width, ISLAND_WINDOW.width)
    assert.ok(shape.height <= ISLAND_WINDOW.height)
  }
})

test('a cápsula na tela, para o painel abrir logo abaixo', () => {
  const window = { x: 630, y: 4, width: 340, height: 110 }
  assert.deepEqual(islandRect(window, false), { x: 700, y: 4, width: 200, height: 38 })
  assert.deepEqual(islandRect(window, true), { x: 640, y: 4, width: 320, height: 84 })
})
