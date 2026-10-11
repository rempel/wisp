// O modo compacto: de que lado o mascote encosta, onde a janela fica e que faixa dela continua
// viva com ele guardado.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  dockedPosition,
  FULL_SHAPE,
  MASCOT_SIZE,
  nearestEdge,
  TAB_WIDTH,
  tabShape
} from '../src/main/dock'

const area = { x: 0, y: 32, width: 1600, height: 868 }
const box = (x: number, y = 400): { x: number; y: number; width: number; height: number } => ({
  x,
  y,
  width: MASCOT_SIZE,
  height: MASCOT_SIZE
})

test('a borda mais perto, pelo centro do mascote', () => {
  assert.equal(nearestEdge(box(1400), area), 'right')
  assert.equal(nearestEdge(box(100), area), 'left')
  assert.equal(nearestEdge(box(800 - 64 - 1), area), 'left')
  assert.equal(nearestEdge(box(800 - 64), area), 'right')
  // No segundo monitor, a conta é com a área dele.
  const second = { x: 1600, y: 0, width: 1920, height: 1080 }
  assert.equal(nearestEdge(box(1700), second), 'left')
})

test('encostado na borda, dentro da área útil (fora dos painéis do sistema)', () => {
  assert.deepEqual(dockedPosition('right', 400, area), { x: 1600 - MASCOT_SIZE, y: 400 })
  assert.deepEqual(dockedPosition('left', 400, area), { x: 0, y: 400 })
  assert.deepEqual(dockedPosition('left', 0, area), { x: 0, y: 32 }, 'abaixo da barra de cima')
  assert.deepEqual(dockedPosition('right', 2000, area), { x: 1472, y: 900 - MASCOT_SIZE })
  assert.deepEqual(dockedPosition('right', 400.6, area), { x: 1472, y: 401 })
})

test('guardado, só a faixa junto da borda continua viva', () => {
  assert.deepEqual(tabShape('right'), {
    x: MASCOT_SIZE - TAB_WIDTH,
    y: 4,
    width: TAB_WIDTH,
    height: 112
  })
  assert.equal(tabShape('left').x, 0)
  assert.deepEqual(FULL_SHAPE, { x: 0, y: 0, width: MASCOT_SIZE, height: MASCOT_SIZE })
})
