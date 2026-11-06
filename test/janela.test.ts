// O mascote numa janela (Fase 48): a janela sob o ponto é a de cima que o contém, a da frente é
// a ativa (ou a de cima, com o Wisp na frente), a linha da caixa diz o título e o programa, e só
// contam as janelas da área de trabalho de agora.
import './helpers/home'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { onDesktop } from '../src/main/ewmh'
import type { XWindow } from '../src/main/ewmh'
import { frontWindow, windowAt, windowLine } from '../src/main/window-context'
import type { ContextWindow } from '../src/main/window-context'

const win = (title: string, x: number, y: number, active = false): ContextWindow => ({
  source: `window:${title}:0`,
  app: 'Editor',
  title,
  bounds: { x, y, width: 400, height: 300 },
  active
})

test('janela: a de cima que contém o ponto', () => {
  // Da mais à frente para a mais atrás: a "frente" cobre parte da "trás".
  const windows = [win('frente', 100, 100), win('trás', 0, 0, true)]
  assert.equal(windowAt(windows, { x: 150, y: 150 })?.title, 'frente')
  assert.equal(windowAt(windows, { x: 50, y: 50 })?.title, 'trás')
  assert.equal(windowAt(windows, { x: 450, y: 390 })?.title, 'frente')
  // A borda de baixo e da direita já é fora.
  assert.equal(windowAt(windows, { x: 500, y: 400 }), null)
  assert.equal(windowAt([], { x: 1, y: 1 }), null)
})

test('janela: a da frente', () => {
  assert.equal(frontWindow([win('a', 0, 0), win('b', 0, 0, true)])?.title, 'b')
  // O Wisp na frente (nenhuma ativa entre as outras): a de cima.
  assert.equal(frontWindow([win('a', 0, 0), win('b', 0, 0)])?.title, 'a')
  assert.equal(frontWindow([]), null)
})

test('janela: a linha da caixa', () => {
  assert.equal(
    windowLine(win('app.ts — Code', 0, 0)),
    'Na imagem, a janela "app.ts — Code" (Editor).'
  )
  assert.equal(windowLine({ ...win('Sem nome', 0, 0), app: '' }), 'Na imagem, a janela "Sem nome".')
})

test('janela: só as da área de trabalho de agora (ou de todas)', () => {
  const x = (desktop?: number): XWindow => ({
    id: 1,
    app: 'a',
    title: 't',
    minimized: false,
    active: false,
    ...(desktop !== undefined ? { desktop } : {})
  })
  assert.equal(onDesktop(x(1), 1), true)
  assert.equal(onDesktop(x(2), 1), false)
  assert.equal(onDesktop(x(0xffffffff), 1), true)
  assert.equal(onDesktop(x(), 1), true)
  assert.equal(onDesktop(x(2), undefined), true)
})
