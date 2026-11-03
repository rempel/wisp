// Recortar uma área (Fase 41): o retângulo que a página manda é conferido contra a imagem (dentro
// dela, inteiro, com um tamanho mínimo; um arrasto para cima e para a esquerda vale), e o print é
// o da tela do cursor (no Wayland, o único que o portal dá).
import './helpers/home'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clampArea, shotUnderCursor } from '../src/main/area-capture'
import type { ScreenImage } from '../src/main/screenshot'

const size = { width: 1920, height: 1080 }

test('o retângulo do recorte: dentro da imagem, inteiro e com um tamanho mínimo', () => {
  assert.deepEqual(clampArea({ x: 10.4, y: 20.6, width: 100, height: 50 }, size), {
    x: 10,
    y: 21,
    width: 100,
    height: 50
  })
  // Arrastado para cima e para a esquerda (largura negativa).
  assert.deepEqual(clampArea({ x: 300, y: 300, width: -100, height: -40 }, size), {
    x: 200,
    y: 260,
    width: 100,
    height: 40
  })
  // Passando da borda (a faixa preta em volta do print): fica o que é imagem.
  assert.deepEqual(clampArea({ x: -50, y: 1000, width: 200, height: 500 }, size), {
    x: 0,
    y: 1000,
    width: 150,
    height: 80
  })
  // Um clique, fora da imagem, ou o que não é um retângulo: nada.
  assert.equal(clampArea({ x: 5, y: 5, width: 2, height: 2 }, size), null)
  assert.equal(clampArea({ x: 2000, y: 0, width: 100, height: 100 }, size), null)
  assert.equal(clampArea({ x: 0, y: 0, width: Infinity, height: 10 }, size), null)
  assert.equal(clampArea({ x: '0', y: 0, width: 10, height: 10 }, size), null)
  assert.equal(clampArea(null, size), null)
})

test('o print do recorte: o da tela do cursor, ou o único', () => {
  const shot = (displayId?: number): ScreenImage =>
    ({ image: null, ...(displayId ? { displayId } : {}) }) as unknown as ScreenImage
  const shots = [shot(1), shot(2)]
  assert.equal(shotUnderCursor(shots, 2), shots[1])
  assert.equal(shotUnderCursor(shots, 9), shots[0])
  const portal = [shot()]
  assert.equal(shotUnderCursor(portal, 1), portal[0])
  assert.equal(shotUnderCursor([], 1), null)
})
