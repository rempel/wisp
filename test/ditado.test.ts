// Ditar em qualquer programa (Fase 53): as trocas ("dito = escrito", como palavras inteiras e sem
// ligar para maiúsculas), a leitura delas uma por linha, quem aperta o Ctrl+V em cada desktop e o
// caminho da voz: o ditado é o mesmo segurar para falar, e o texto vai para o programa da frente,
// sem os comandos rápidos nem a conversa (nem o "não" dos cards).
import './helpers/home'
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import { pasteCommand } from '../src/main/dictation'
import { Voice } from '../src/main/voice'
import type { VoiceDeps } from '../src/main/voice'
import { applyReplacements, parseReplacements } from '../src/shared/dictation'

test('ditado: as trocas', () => {
  const swaps = [
    { from: 'uisp', to: 'Wisp' },
    { from: 'cloud code', to: 'Claude Code' },
    { from: 'ponto', to: '.' }
  ]
  assert.equal(applyReplacements('abra o Uisp no cloud code', swaps), 'abra o Wisp no Claude Code')
  // Palavra inteira: "apontou" não vira "a.ou".
  assert.equal(applyReplacements('ele apontou', swaps), 'ele apontou')
  assert.equal(applyReplacements('  oi  ', []), 'oi')
  // Um caractere especial no dito não quebra a troca.
  assert.equal(applyReplacements('c++ é legal', [{ from: 'c++', to: 'C++' }]), 'C++ é legal')
})

test('ditado: as trocas uma por linha', () => {
  assert.deepEqual(
    parseReplacements('uisp = Wisp\ncloud code → Claude Code\n\nsem igual\nx -> y'),
    [
      { from: 'uisp', to: 'Wisp' },
      { from: 'cloud code', to: 'Claude Code' },
      { from: 'x', to: 'y' }
    ]
  )
  assert.equal(parseReplacements(Array(150).fill('a = b').join('\n')).length, 100)
})

// No Windows, o Ctrl+V é do próprio Windows (o PowerShell): este é o do Linux.
test(
  'ditado: quem aperta o Ctrl+V',
  { skip: process.platform === 'win32' && 'só no Linux' },
  () => {
    const bin = join(tmpdir(), `wisp-ditado-${process.pid}`)
    mkdirSync(bin, { recursive: true })
    for (const name of ['xdotool', 'wtype']) {
      writeFileSync(join(bin, name), '#!/bin/sh\n')
      chmodSync(join(bin, name), 0o755)
    }
    const saved = process.env.PATH
    process.env.PATH = bin
    try {
      assert.deepEqual(pasteCommand({ DISPLAY: ':0', PATH: bin })?.args, [
        'key',
        '--clearmodifiers',
        'ctrl+v'
      ])
      assert.deepEqual(pasteCommand({ XDG_SESSION_TYPE: 'wayland', PATH: bin })?.args, [
        '-M',
        'ctrl',
        'v',
        '-m',
        'ctrl'
      ])
      // Sem o X e sem os do Wayland, ninguém (o texto fica copiado).
      assert.equal(pasteCommand({ PATH: bin }), null)
    } finally {
      process.env.PATH = saved
    }
  }
)

test('ditado: o texto vai para o programa da frente, sem comandos nem conversa', async () => {
  const delivered: [string, string][] = []
  const quick: string[] = []
  const commands: { type: string; id?: number }[] = []
  const deps = {
    command: (c: { type: string; id?: number }) => commands.push(c),
    status: () => {},
    level: () => {},
    check: () => {},
    transcribe: async () => 'pausa a música',
    locked: () => false,
    pendingApprovals: () => 1,
    denyApprovals: () => assert.fail('o ditado não nega cards'),
    quickCommands: () => true,
    runQuick: async (_c: unknown, text: string) => {
      quick.push(text)
      return true
    },
    deliver: (text: string, source: string) => {
      delivered.push([text, source])
      return null
    },
    notice: () => {},
    activity: () => {},
    replies: () => false,
    synthesize: async () => ({ pcm: Buffer.alloc(8), rate: 22050 })
  } as unknown as VoiceDeps
  const voice = new Voice(deps)
  voice.press(true, 'dictation')
  const start = commands[0]
  assert.equal(start.type, 'start')
  await new Promise((resolve) => setTimeout(resolve, 400))
  voice.release()
  voice.handle({ type: 'audio', id: start.id as number, pcm: new Int16Array(3200).buffer })
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.deepEqual(delivered, [['pausa a música', 'dictation']])
  assert.deepEqual(quick, [])
})
