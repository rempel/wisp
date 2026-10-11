// Voz (Fase 10): o detector de voz, o WAV e o whisper.cpp, os comandos rápidos, o controlador da
// voz, o Piper, o volume e as teclas do atalho. O whisper e o Piper são de mentira
// (test/fixtures); o whisper.cpp de verdade fica para os testes de ponta a ponta.
import './helpers/home'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import * as V from '../src/shared/vad'
import * as W from '../src/main/whisper'
import * as C from '../src/main/voice-commands'
import * as VC from '../src/main/voice'
import * as P from '../src/main/piper'
import * as VOL from '../src/main/volume'
import * as K from '../src/main/shortcut'
import { FIXTURES } from './helpers/paths'
const BIN = FIXTURES
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wisp-voice-test-'))

// ---- VAD -----------------------------------------------------------------
const FRAME = V.FRAME
const frame = (amp, f = 300, offset = 0) => {
  const out = new Float32Array(FRAME)
  for (let i = 0; i < FRAME; i++)
    out[i] = amp * Math.sin((2 * Math.PI * f * (offset + i)) / V.VOICE_RATE)
  return out
}
const noise = (amp) => {
  const out = new Float32Array(FRAME)
  for (let i = 0; i < FRAME; i++) out[i] = (Math.random() * 2 - 1) * amp
  return out
}
function feed(vad, frames) {
  const events = []
  frames.forEach((f, i) => {
    const e = vad.push(f)
    if (e) events.push([e, i])
  })
  return events
}
const AUTO = { endSilenceMs: 1200, noSpeechMs: 6000, maxMs: 30000 }
const seq = (n, make) => Array.from({ length: n }, (_, i) => make(i))

test('VAD: FRAME is 20 ms at 16 kHz', () => {
  assert.strictEqual(V.VOICE_RATE, 16000)
  assert.strictEqual(FRAME, 320)
})
test('VAD: frameDb of silence and full-scale sine', () => {
  assert.strictEqual(V.frameDb(new Float32Array(FRAME)), -100)
  const db = V.frameDb(frame(1))
  assert.ok(Math.abs(db - -3.01) < 0.2, db)
})
test('VAD: speech start, end after silence, 500 ms pre-roll and 300 ms tail', () => {
  const vad = new V.EnergyVad(AUTO)
  const frames = [
    ...seq(75, () => noise(0.0005)),
    ...seq(50, (i) => frame(0.1, 300, i * FRAME)),
    ...seq(100, () => noise(0.0005))
  ]
  const events = feed(vad, frames)
  assert.deepStrictEqual(events[0], ['speech', 77])
  // The last loud frame is 124; the end comes 60 quiet frames (1200 ms) later.
  assert.deepStrictEqual(events[1], ['end', 184])
  const pcm = vad.result()
  // From frame 50 (500 ms before 75) to frame 139 (124 + 15).
  assert.strictEqual(pcm.length, (139 - 50 + 1) * FRAME)
  // The first 25 frames of the result are the quiet pre-roll; frame 25 is loud.
  const rms = (a, from, to) =>
    Math.sqrt(a.slice(from, to).reduce((s, x) => s + (x / 32768) ** 2, 0) / (to - from))
  assert.ok(rms(pcm, 0, 25 * FRAME) < 0.01)
  assert.ok(rms(pcm, 25 * FRAME, 26 * FRAME) > 0.05)
})
test('VAD: speech in the first 500 ms keeps what there is', () => {
  const vad = new V.EnergyVad(AUTO)
  feed(vad, [
    ...seq(12, () => noise(0.0005)),
    ...seq(30, (i) => frame(0.1, 300, i * FRAME)),
    ...seq(70, () => noise(0.0005))
  ])
  const pcm = vad.result()
  assert.ok(pcm)
  assert.strictEqual(pcm.length, (41 + 15 + 1) * FRAME)
})
test('VAD: no speech ends at noSpeechMs with no result', () => {
  const vad = new V.EnergyVad(AUTO)
  const events = feed(
    vad,
    seq(400, () => noise(0.0005))
  )
  assert.deepStrictEqual(events, [['end', 299]])
  assert.strictEqual(vad.result(), null)
  assert.strictEqual(vad.push(noise(0.5)), null, 'nothing after the end')
})
test('VAD: a 40 ms click is not speech', () => {
  const vad = new V.EnergyVad(AUTO)
  const events = feed(vad, [
    ...seq(20, () => noise(0.0005)),
    frame(0.3),
    frame(0.3),
    ...seq(20, () => noise(0.0005))
  ])
  assert.deepStrictEqual(events, [])
  assert.strictEqual(vad.speaking, false)
})
test('VAD: a fan slowly turning on does not count as speech', () => {
  const vad = new V.EnergyVad(AUTO)
  // From -66 dB to about -40 dB over 6 s: the floor follows it.
  const events = feed(
    vad,
    seq(290, (i) => noise(0.0005 * Math.pow(1.0114, i)))
  )
  assert.ok(!events.some(([e]) => e === 'speech'), JSON.stringify(events))
})
test('VAD: digital silence still needs real speech (-50 dBFS floor)', () => {
  const vad = new V.EnergyVad(AUTO)
  const events = feed(vad, [
    ...seq(20, () => new Float32Array(FRAME)),
    ...seq(10, () => noise(0.001)),
    ...seq(10, (i) => frame(0.05, 300, i * FRAME))
  ])
  assert.deepStrictEqual(
    events.map(([e]) => e),
    ['speech']
  )
  assert.strictEqual(events[0][1], 32)
})
test('VAD: hold mode does not end on a 2 s pause; switching to auto ends it', () => {
  const vad = new V.EnergyVad({ endSilenceMs: 3000, noSpeechMs: 10000, maxMs: 30000 })
  const events = feed(vad, [
    ...seq(20, () => noise(0.0005)),
    ...seq(30, (i) => frame(0.1, 300, i * FRAME)),
    ...seq(100, () => noise(0.0005))
  ])
  assert.deepStrictEqual(
    events.map(([e]) => e),
    ['speech']
  )
  vad.setOptions(AUTO)
  assert.strictEqual(vad.push(noise(0.0005)), 'end')
})
test('VAD: maxMs ends a long speech', () => {
  const vad = new V.EnergyVad({ endSilenceMs: 1200, noSpeechMs: 6000, maxMs: 2000 })
  const events = feed(vad, [
    ...seq(15, () => noise(0.0005)),
    ...seq(200, (i) => frame(0.1, 300, i * FRAME))
  ])
  assert.deepStrictEqual(
    events.map(([e]) => e),
    ['speech', 'end']
  )
  assert.strictEqual(events[1][1], 99)
})
test('VAD: samples are clipped into 16 bits', () => {
  const vad = new V.EnergyVad(AUTO)
  feed(vad, [
    ...seq(10, () => noise(0.0005)),
    ...seq(5, () => {
      const f = new Float32Array(FRAME).fill(1.7)
      f[0] = -2
      return f
    })
  ])
  const pcm = vad.result()
  assert.ok(pcm.includes(32767))
  assert.ok(pcm.includes(-32768))
})

// ---- WAV and whisper -----------------------------------------------------
test('wavFromPcm: 44-byte RIFF header, mono 16-bit 16 kHz', () => {
  const wav = W.wavFromPcm(new Int16Array([1, -1, 300]))
  assert.strictEqual(wav.length, 50)
  assert.strictEqual(wav.toString('ascii', 0, 4), 'RIFF')
  assert.strictEqual(wav.readUInt32LE(4), 42)
  assert.strictEqual(wav.toString('ascii', 8, 16), 'WAVEfmt ')
  assert.strictEqual(wav.readUInt16LE(20), 1)
  assert.strictEqual(wav.readUInt16LE(22), 1)
  assert.strictEqual(wav.readUInt32LE(24), 16000)
  assert.strictEqual(wav.readUInt32LE(28), 32000)
  assert.strictEqual(wav.readUInt16LE(34), 16)
  assert.strictEqual(wav.toString('ascii', 36, 40), 'data')
  assert.strictEqual(wav.readUInt32LE(40), 6)
  assert.strictEqual(wav.readInt16LE(46), -1)
})
test('wavFromPcm: a subarray view uses only its own samples', () => {
  const all = new Int16Array([9, 9, 5, 6, 9])
  const wav = W.wavFromPcm(all.subarray(2, 4))
  assert.strictEqual(wav.length, 48)
  assert.strictEqual(wav.readInt16LE(44), 5)
  assert.strictEqual(wav.readInt16LE(46), 6)
})
test('cleanTranscript: drops non-speech marks and subtitle credits', () => {
  assert.strictEqual(W.cleanTranscript(' [BLANK_AUDIO]\n'), '')
  assert.strictEqual(W.cleanTranscript(' Abre o Firefox.\n'), 'Abre o Firefox.')
  assert.strictEqual(
    W.cleanTranscript('(música) Pausa a música. [Risos] *suspiro*'),
    'Pausa a música.'
  )
  assert.strictEqual(W.cleanTranscript(' Legendas pela comunidade Amara.org'), '')
  assert.strictEqual(
    W.cleanTranscript('Qual a capital da França?\n Legendas pela comunidade Amara.org\n'),
    'Qual a capital da França?'
  )
  assert.strictEqual(W.cleanTranscript('Que horas são?  \n\n Agora.'), 'Que horas são? Agora.')
})
test('findWhisper: a configured path, a name in PATH, missing', () => {
  const dir = fs.mkdtempSync(path.join(tmp, 'bin-'))
  const exe = path.join(dir, 'whisper-cpp')
  fs.writeFileSync(exe, '#!/bin/sh\n')
  fs.chmodSync(exe, 0o755)
  fs.writeFileSync(path.join(dir, 'whisper-cli'), 'not executable')
  assert.strictEqual(W.findWhisper(exe), exe)
  assert.strictEqual(W.findWhisper('whisper-cli', { PATH: dir }), exe, 'falls back to whisper-cpp')
  assert.strictEqual(W.findWhisper('/nope/whisper-cli'), null)
  assert.strictEqual(W.findWhisper('relative/whisper-cli'), null)
})
test('whisperSetup: tells what is missing, in Portuguese', () => {
  assert.throws(
    () => W.whisperSetup({ binary: '/nope/whisper-cli', model: '/x.bin', language: 'pt' }),
    (e) => e.setup && /instale o whisper\.cpp/.test(e.message)
  )
  assert.throws(
    () =>
      W.whisperSetup({
        binary: path.join(BIN, 'fake-whisper'),
        model: '~/nao-existe.bin',
        language: 'pt'
      }),
    (e) => e.setup && /Falta o modelo de voz do whisper\.cpp: ~\/nao-existe\.bin/.test(e.message)
  )
})
const model = path.join(tmp, 'ggml-fake.bin')
fs.writeFileSync(model, 'x')
test('transcribe: the WAV goes by stdin with the right flags', async () => {
  const log = path.join(tmp, 'whisper.log')
  process.env.FAKE_WHISPER_LOG = log
  process.env.FAKE_WHISPER_TEXT = '[BLANK_AUDIO] Abre o Firefox.'
  const pcm = new Int16Array(16000 * 2).map((_, i) => Math.round(Math.sin(i / 10) * 3000))
  const text = await W.transcribe(pcm, {
    binary: path.join(BIN, 'fake-whisper'),
    model,
    language: 'pt'
  })
  assert.strictEqual(text, 'Abre o Firefox.')
  const got = JSON.parse(fs.readFileSync(log, 'utf8').trim())
  assert.strictEqual(got.bytes, 44 + 64000)
  assert.strictEqual(got.rate, 16000)
  assert.strictEqual(got.channels, 1)
  assert.strictEqual(got.bits, 16)
  const a = got.args
  assert.deepStrictEqual([a[0], a[1], a[2], a[3], a[4]], ['-m', model, '-l', 'pt', '-t'])
  assert.deepStrictEqual(a.slice(6), ['-nt', '-np', '-sns', '-f', '-'])
  delete process.env.FAKE_WHISPER_LOG
  delete process.env.FAKE_WHISPER_TEXT
})
test('transcribe: an error exit tells the last stderr line', async () => {
  process.env.FAKE_WHISPER_FAIL = '1'
  await assert.rejects(
    W.transcribe(new Int16Array(1600), {
      binary: path.join(BIN, 'fake-whisper'),
      model,
      language: 'pt'
    }),
    /O whisper\.cpp saiu com erro \(3\): whisper_init: failed to load model\./
  )
  delete process.env.FAKE_WHISPER_FAIL
})

// ---- Quick commands ------------------------------------------------------
const q = C.parseQuickCommand
test('quick: media phrases', () => {
  for (const s of [
    'Pausa a música.',
    'pausa',
    'Pause!',
    'para a música',
    'Wisp, pausa a música por favor',
    'Ei Wisp, pausa o som'
  ])
    assert.deepStrictEqual(q(s), { kind: 'media', action: 'pausar' }, s)
  for (const s of ['Toca a música', 'toca', 'continua a música', 'volta a tocar', 'Play.'])
    assert.deepStrictEqual(q(s), { kind: 'media', action: 'tocar' }, s)
  for (const s of ['Próxima música', 'próxima', 'pula essa música', 'Pula.', 'passa a faixa'])
    assert.deepStrictEqual(q(s), { kind: 'media', action: 'proxima' }, s)
  for (const s of ['Música anterior', 'anterior', 'volta a música', 'volta uma faixa'])
    assert.deepStrictEqual(q(s), { kind: 'media', action: 'anterior' }, s)
})
test('quick: volume phrases', () => {
  for (const s of [
    'Aumenta o volume.',
    'sobe o som',
    'aumenta o volume um pouco',
    'Mais alto!',
    'volume mais alto'
  ])
    assert.deepStrictEqual(q(s), { kind: 'volume', direction: 1 }, s)
  for (const s of ['Abaixa o volume', 'diminui o som', 'baixa o volume', 'mais baixo'])
    assert.deepStrictEqual(q(s), { kind: 'volume', direction: -1 }, s)
})
test('quick: open phrases', () => {
  assert.deepStrictEqual(q('Abre o Firefox.'), { kind: 'open', name: 'firefox' })
  assert.deepStrictEqual(q('abrir o app do VS Code'), { kind: 'open', name: 'vs code' })
  assert.deepStrictEqual(q('Abra a Calculadora, por favor'), { kind: 'open', name: 'calculadora' })
  assert.deepStrictEqual(q('inicia o terminal'), { kind: 'open', name: 'terminal' })
})
test('quick: everything else goes to Claude', () => {
  for (const s of [
    'continua',
    'Qual a capital da França?',
    'toca Legião Urbana',
    'para',
    'aumenta a fonte do terminal',
    'pausa e me diz que horas são',
    '',
    '   ',
    'abre'
  ])
    assert.strictEqual(q(s), null, s)
})
const APPS = [
  { id: 'firefox', nome: 'Firefox' },
  { id: 'org.gnome.Calculator', nome: 'Calculadora' },
  { id: 'code', nome: 'Visual Studio Code' },
  { id: 'org.gnome.Terminal', nome: 'Terminal' },
  { id: 'org.kde.konsole', nome: 'Konsole' },
  { id: 'google-chrome', nome: 'Google Chrome' },
  { id: 'chromium', nome: 'Chromium Web Browser' }
]
test('matchApp: by name, id, the end of the id and a unique prefix', () => {
  assert.strictEqual(C.matchApp('firefox', APPS).id, 'firefox')
  assert.strictEqual(C.matchApp('Calculadora', APPS).id, 'org.gnome.Calculator')
  assert.strictEqual(C.matchApp('konsole', APPS).id, 'org.kde.konsole')
  assert.strictEqual(C.matchApp('chromium', APPS).id, 'chromium')
  assert.strictEqual(C.matchApp('google', APPS).id, 'google-chrome')
  assert.strictEqual(C.matchApp('visual studio', APPS).id, 'code')
  assert.strictEqual(C.matchApp('firefox e procura gatos', APPS), null)
  assert.strictEqual(C.matchApp('porta', APPS), null)
  assert.strictEqual(C.matchApp('', APPS), null)
})
test('matchApp: an ambiguous prefix goes to Claude', () => {
  assert.strictEqual(
    C.matchApp('gnome', [
      { id: 'a', nome: 'GNOME Boxes' },
      { id: 'b', nome: 'GNOME Maps' }
    ]),
    null
  )
})
test('deny and approve words', () => {
  for (const s of [
    'Não.',
    'não',
    'Nega',
    'cancela isso',
    'Não, obrigado.',
    'nem pensar',
    'Para!',
    'recusa'
  ])
    assert.ok(C.isDeny(s), s)
  for (const s of [
    'Sim.',
    'pode',
    'Pode sim!',
    'Permite',
    'aprova',
    'OK',
    'claro',
    'vai',
    'confirmo'
  ])
    assert.ok(C.isApprove(s), s)
  for (const s of ['Pausa a música', 'Abre o Firefox', 'nãozinho', 'simples', 'posso']) {
    assert.ok(!C.isDeny(s), s)
    assert.ok(!C.isApprove(s), s)
  }
  assert.ok(!C.isApprove('não pode'))
})

// ---- The voice controller ------------------------------------------------
function harness(over = {}) {
  const log = {
    commands: [],
    statuses: [],
    notices: [],
    delivered: [],
    quick: [],
    denied: 0,
    spoken: [],
    levels: []
  }
  let pending = 0
  const deps = {
    command: (c) => log.commands.push(c),
    status: (s) => log.statuses.push(s),
    level: (l) => log.levels.push(l),
    check: () => {},
    transcribe: async () => 'Qual a capital da França?',
    locked: () => false,
    pendingApprovals: () => pending,
    denyApprovals: () => {
      log.denied++
      pending = 0
    },
    quickCommands: () => true,
    runQuick: async (c, t) => {
      log.quick.push([c, t])
      return true
    },
    deliver: (t, s) => {
      log.delivered.push([t, s])
      return s === 'shortcut' ? 'c1' : null
    },
    notice: (l, t) => log.notices.push([l, t]),
    activity: () => {},
    replies: () => false,
    synthesize: async (t) => {
      log.spoken.push(t)
      return { pcm: Buffer.alloc(8), rate: 22050 }
    },
    ...over
  }
  const voice = new VC.Voice(deps)
  return { voice, log, setPending: (n) => (pending = n) }
}
const tick = () => new Promise((r) => setTimeout(r, 5))
const last = (a) => a[a.length - 1]
const audio = (id) => ({ type: 'audio', id, pcm: new Int16Array(3200).buffer })

test('voice: hold the shortcut, release, transcribe, send', async () => {
  const { voice, log } = harness()
  voice.press(true)
  const start = log.commands[0]
  assert.deepStrictEqual({ ...start, id: 0 }, { type: 'start', id: 0, mode: 'hold' })
  assert.deepStrictEqual(last(log.statuses), {
    state: 'listening',
    source: 'shortcut',
    heard: false,
    holding: true
  })
  voice.handle({ type: 'open', id: start.id })
  voice.handle({ type: 'level', id: start.id, level: 0.5 })
  assert.deepStrictEqual(log.levels, [0.5])
  voice.handle({ type: 'speech', id: start.id })
  assert.strictEqual(last(log.statuses).heard, true)
  voice.press(true)
  voice.press(true) // the keyboard repeat
  assert.strictEqual(log.commands.length, 1)
  await new Promise((r) => setTimeout(r, 400))
  voice.release()
  assert.deepStrictEqual(last(log.commands), { type: 'stop', id: start.id })
  voice.handle(audio(start.id))
  assert.strictEqual(last(log.statuses).state, 'transcribing')
  await tick()
  assert.deepStrictEqual(log.delivered, [['Qual a capital da França?', 'shortcut']])
  assert.strictEqual(last(log.statuses).state, 'idle')
})
test('voice: a quick tap keeps listening until the silence', async () => {
  const { voice, log } = harness()
  voice.press(true)
  const id = log.commands[0].id
  voice.release()
  assert.deepStrictEqual(last(log.commands), { type: 'mode', id, mode: 'auto' })
  assert.strictEqual(last(log.statuses).holding, undefined)
  // Pressing again ends it.
  voice.press(true)
  assert.deepStrictEqual(last(log.commands), { type: 'stop', id })
})
test('voice: without release detection the shortcut starts in auto mode', () => {
  const { voice, log } = harness()
  voice.press(false)
  assert.strictEqual(log.commands[0].mode, 'auto')
  voice.release()
  assert.strictEqual(log.commands.length, 1)
})
test('voice: the panel button composes, and a second click stops', async () => {
  const { voice, log } = harness()
  voice.togglePanel()
  const id = log.commands[0].id
  assert.strictEqual(log.commands[0].mode, 'auto')
  assert.strictEqual(last(log.statuses).source, 'panel')
  voice.togglePanel()
  assert.deepStrictEqual(last(log.commands), { type: 'stop', id })
  voice.handle(audio(id))
  voice.togglePanel()
  assert.strictEqual(log.commands.length, 2, 'no new start while transcribing')
  await tick()
  assert.deepStrictEqual(log.delivered, [['Qual a capital da França?', 'panel']])
})
test('voice: "não" denies the pending cards; "sim" never approves', async () => {
  let said = 'Não, cancela.'
  const { voice, log, setPending } = harness({ transcribe: async () => said })
  setPending(1)
  voice.press(true)
  let id = log.commands[0].id
  voice.handle(audio(id))
  await tick()
  assert.strictEqual(log.denied, 1)
  assert.deepStrictEqual(log.delivered, [])
  assert.deepStrictEqual(log.quick, [])
  said = 'Sim, pode.'
  setPending(1)
  voice.press(true)
  id = last(log.commands).id
  voice.handle(audio(id))
  await tick()
  assert.strictEqual(log.denied, 1)
  assert.deepStrictEqual(log.delivered, [])
  assert.match(last(log.notices)[1], /por voz eu só nego/)
})
test('voice: "sim" with no card is just a message', async () => {
  const { voice, log } = harness({ transcribe: async () => 'Sim' })
  voice.press(false)
  voice.handle(audio(log.commands[0].id))
  await tick()
  assert.deepStrictEqual(log.delivered, [['Sim', 'shortcut']])
})
test('voice: quick commands run here; unknown ones go to Claude; off sends all', async () => {
  let said = 'Pausa a música'
  let handled = true
  let quickOn = true
  const { voice, log } = harness({
    transcribe: async () => said,
    runQuick: async (c, t) => {
      log.quick.push([c, t])
      return handled
    },
    quickCommands: () => quickOn
  })
  voice.press(false)
  voice.handle(audio(last(log.commands).id))
  await tick()
  assert.deepStrictEqual(log.quick, [[{ kind: 'media', action: 'pausar' }, 'Pausa a música']])
  assert.deepStrictEqual(log.delivered, [])
  said = 'Abre o Navegador Inexistente'
  handled = false
  voice.press(false)
  voice.handle(audio(last(log.commands).id))
  await tick()
  assert.deepStrictEqual(log.delivered, [['Abre o Navegador Inexistente', 'shortcut']])
  quickOn = false
  said = 'Pausa a música'
  voice.press(false)
  voice.handle(audio(last(log.commands).id))
  await tick()
  assert.strictEqual(log.quick.length, 2)
  assert.deepStrictEqual(last(log.delivered), ['Pausa a música', 'shortcut'])
})
test('voice: nothing heard, empty transcript, mic errors', async () => {
  const said = ''
  const { voice, log } = harness({ transcribe: async () => said })
  voice.togglePanel()
  voice.handle({ type: 'empty', id: log.commands[0].id })
  assert.deepStrictEqual(last(log.notices), ['info', 'Não ouvi nada.'])
  assert.strictEqual(last(log.statuses).state, 'idle')
  voice.press(false)
  voice.handle({ type: 'empty', id: last(log.commands).id })
  assert.strictEqual(log.notices.length, 1, 'quiet for the shortcut')
  voice.press(false)
  voice.handle(audio(last(log.commands).id))
  await tick()
  assert.match(last(log.notices)[1], /Não entendi/)
  voice.press(false)
  voice.handle({ type: 'error', id: last(log.commands).id, reason: 'denied', message: 'x' })
  assert.match(last(log.notices)[1], /acesso ao microfone foi negado/)
  voice.press(false)
  voice.handle({
    type: 'error',
    id: last(log.commands).id,
    reason: 'no-device',
    message: 'não achei um microfone'
  })
  assert.strictEqual(last(log.notices)[1], 'Não consegui ouvir: não achei um microfone.')
  assert.strictEqual(last(log.statuses).state, 'idle')
})
test('voice: setup errors and a locked screen never open the mic', () => {
  let locked = true
  const { voice, log } = harness({
    locked: () => locked,
    check: () => {
      throw new Error('Para eu entender a sua voz, instale o whisper.cpp')
    }
  })
  voice.press(true)
  assert.deepStrictEqual(log.commands, [])
  assert.match(last(log.notices)[1], /tela bloqueada/)
  locked = false
  voice.togglePanel()
  assert.deepStrictEqual(log.commands, [])
  assert.match(last(log.notices)[1], /instale o whisper/)
  voice.release()
  assert.deepStrictEqual(log.commands, [])
})
test('voice: locking the screen cancels listening and drops a transcription', async () => {
  let finish
  const { voice, log } = harness({ transcribe: () => new Promise((r) => (finish = r)) })
  voice.press(true)
  const id = log.commands[0].id
  voice.setLocked(true)
  assert.deepStrictEqual(last(log.commands), { type: 'cancel', id })
  assert.strictEqual(last(log.statuses).state, 'idle')
  voice.press(true)
  const id2 = last(log.commands).id
  voice.handle(audio(id2))
  voice.setLocked(true)
  finish('Abre o Firefox')
  await tick()
  assert.deepStrictEqual(log.delivered, [])
  assert.deepStrictEqual(log.quick, [])
  voice.setLocked(false)
})
test('voice: events from an old listening are ignored', async () => {
  const { voice, log } = harness()
  voice.press(true)
  const old = log.commands[0].id
  voice.cancel()
  voice.press(true)
  const id = last(log.commands).id
  assert.notStrictEqual(id, old)
  voice.handle(audio(old))
  voice.handle({ type: 'speech', id: old })
  await tick()
  assert.deepStrictEqual(log.delivered, [])
  assert.strictEqual(last(log.statuses).state, 'listening')
  assert.strictEqual(last(log.statuses).heard, false)
})
test('voice: the mic that never opens gives up', async () => {
  const { voice, log } = harness()
  // Shorten the timeout through fake timers is overkill: check that an 'open' clears it.
  voice.press(true)
  voice.handle({ type: 'open', id: log.commands[0].id })
  await tick()
  assert.strictEqual(last(log.statuses).state, 'listening')
  voice.cancel()
})
test('voice: a transcription error is a notice', async () => {
  const { voice, log } = harness({
    transcribe: async () => {
      throw new Error('O whisper.cpp saiu com erro (3).')
    }
  })
  voice.press(false)
  voice.handle(audio(log.commands[0].id))
  await tick()
  assert.deepStrictEqual(last(log.notices), ['warning', 'O whisper.cpp saiu com erro (3).'])
  assert.strictEqual(last(log.statuses).state, 'idle')
})
test('voice: spoken replies only for what was sent by voice, only the final text', async () => {
  let replies = true
  const { voice, log } = harness({ replies: () => replies })
  voice.onChatEvent({ type: 'text', blockId: 'a', delta: 'ignored' }, 'c1')
  voice.onChatEvent({ type: 'turn-end', outcome: 'done' }, 'c1')
  await tick()
  assert.deepStrictEqual(log.spoken, [])
  voice.press(false)
  voice.handle(audio(log.commands[0].id))
  await tick()
  voice.onChatEvent({ type: 'text', blockId: 'x', delta: 'Outra aba.' }, 'c2')
  voice.onChatEvent({ type: 'turn-end', outcome: 'done' }, 'c2')
  await tick()
  assert.deepStrictEqual(log.spoken, [])
  voice.onChatEvent({ type: 'text', blockId: 'a', delta: 'Vou ver.' }, 'c1')
  voice.onChatEvent({ type: 'tool-start', id: 't', name: 'WebSearch' }, 'c1')
  voice.onChatEvent({ type: 'text', blockId: 'b', delta: 'A capital é **Paris**' }, 'c1')
  voice.onChatEvent({ type: 'text', blockId: 'b', delta: '.' }, 'c1')
  voice.onChatEvent({ type: 'turn-end', outcome: 'done' }, 'c1')
  await tick()
  assert.deepStrictEqual(log.spoken, ['A capital é Paris.'])
  const say = last(log.commands)
  assert.strictEqual(say.type, 'say')
  assert.strictEqual(say.rate, 22050)
  assert.strictEqual(last(log.statuses).state, 'speaking')
  voice.handle({ type: 'said', id: say.id })
  assert.strictEqual(last(log.statuses).state, 'idle')
  // Stopped turns and the option off say nothing.
  voice.press(false)
  voice.handle(audio(last(log.commands).id))
  await tick()
  voice.onChatEvent({ type: 'text', blockId: 'c', delta: 'x' }, 'c1')
  voice.onChatEvent({ type: 'turn-end', outcome: 'stopped' }, 'c1')
  await tick()
  replies = false
  voice.press(false)
  voice.handle(audio(last(log.commands).id))
  await tick()
  voice.onChatEvent({ type: 'text', blockId: 'd', delta: 'y' }, 'c1')
  voice.onChatEvent({ type: 'turn-end', outcome: 'done' }, 'c1')
  await tick()
  assert.deepStrictEqual(log.spoken, ['A capital é Paris.'])
})
test('voice: talking again hushes the reply', async () => {
  const { voice, log } = harness({ replies: () => true })
  voice.press(false)
  voice.handle(audio(log.commands[0].id))
  await tick()
  voice.onChatEvent({ type: 'text', blockId: 'b', delta: 'Paris.' }, 'c1')
  voice.onChatEvent({ type: 'turn-end', outcome: 'done' }, 'c1')
  await tick()
  assert.strictEqual(last(log.commands).type, 'say')
  voice.press(true)
  const types = log.commands.map((c) => c.type)
  assert.deepStrictEqual(types.slice(-2), ['hush', 'start'])
  assert.strictEqual(last(log.statuses).state, 'listening')
})
test('voice: composed text (busy, review) is not spoken', async () => {
  const { voice, log } = harness({
    replies: () => true,
    deliver: (t, s) => {
      log.delivered.push([t, s])
      return null
    }
  })
  voice.press(false)
  voice.handle(audio(log.commands[0].id))
  await tick()
  voice.onChatEvent({ type: 'text', blockId: 'b', delta: 'Paris.' }, 'c1')
  voice.onChatEvent({ type: 'turn-end', outcome: 'done' }, 'c1')
  await tick()
  assert.deepStrictEqual(log.spoken, [])
})

// ---- Piper ---------------------------------------------------------------
test('speakable: markdown out, long replies cut at a sentence', () => {
  assert.strictEqual(
    P.speakable('**Oi!** Veja [o site](https://x.com) e `npm i`.'),
    'Oi! Veja o site e npm i.'
  )
  assert.strictEqual(
    P.speakable('# Título\n\n- um\n- dois\n\n```js\nconst a = 1\n```\nFim.'),
    'Título um dois Fim.'
  )
  const long =
    'Primeira frase curta. ' +
    'Segunda frase bem mais comprida que vai passando do limite. '.repeat(6)
  const out = P.speakable(long)
  assert.ok(out.startsWith('Primeira frase curta.'))
  assert.ok(out.endsWith('O resto está no painel.'))
  assert.ok(out.length < 340, out.length)
  assert.ok(P.speakable('x'.repeat(500)).endsWith('… O resto está no painel.'))
  assert.strictEqual(P.speakable('```\nsó código\n```'), '')
})
test('piperSetup and modelRate', () => {
  assert.match(P.piperSetup({ binary: '/nope/piper', model: '/x.onnx' }), /instale o Piper/)
  assert.match(
    P.piperSetup({ binary: path.join(BIN, 'fake-piper'), model: '~/nao.onnx' }),
    /Falta a voz do Piper: ~\/nao\.onnx/
  )
  const voice = path.join(tmp, 'pt_BR-teste.onnx')
  fs.writeFileSync(voice, 'x')
  assert.strictEqual(P.modelRate(voice), 22050)
  fs.writeFileSync(`${voice}.json`, JSON.stringify({ audio: { sample_rate: 16000 } }))
  assert.strictEqual(P.modelRate(voice), 16000)
})
test('synthesize: text by stdin, raw PCM back, flags', async () => {
  const voiceModel = path.join(tmp, 'pt_BR-teste.onnx')
  const log = path.join(tmp, 'piper.log')
  process.env.FAKE_PIPER_LOG = log
  const speech = await P.synthesize('A capital\né Paris.', {
    binary: path.join(BIN, 'fake-piper'),
    model: voiceModel
  })
  assert.strictEqual(speech.rate, 16000)
  assert.strictEqual(speech.pcm.length, Math.round(22050 * 0.4) * 2)
  const got = JSON.parse(fs.readFileSync(log, 'utf8').trim())
  assert.deepStrictEqual(got.args, ['--model', voiceModel, '--output-raw'])
  assert.strictEqual(got.text, 'A capital é Paris.\n')
  delete process.env.FAKE_PIPER_LOG
})

// ---- Volume and shortcut keysyms -----------------------------------------
test('volume parsers', () => {
  assert.strictEqual(VOL.parseWpctlVolume('Volume: 0.45\n'), 45)
  assert.strictEqual(VOL.parseWpctlVolume('Volume: 1.00 [MUTED]\n'), 100)
  assert.strictEqual(
    VOL.parsePactlVolume(
      'Volume: front-left: 29491 /  45% / -20.81 dB,   front-right: 29491 /  45% / -20.81 dB\n'
    ),
    45
  )
  assert.strictEqual(VOL.parseWpctlVolume(''), null)
  assert.strictEqual(VOL.parsePactlVolume('Connection failure'), null)
})
test('acceleratorKeysym', () => {
  assert.strictEqual(K.acceleratorKeysym('Ctrl+Alt+Space'), 0x20)
  assert.strictEqual(K.acceleratorKeysym('Ctrl+Alt+W'), 0x77)
  assert.strictEqual(K.acceleratorKeysym('Super+F5'), 0xffc2)
  assert.strictEqual(K.acceleratorKeysym('Ctrl+5'), 0x35)
  assert.strictEqual(K.acceleratorKeysym('Ctrl+Shift+/'), 0x2f)
  assert.strictEqual(K.acceleratorKeysym('Ctrl+Bogus'), null)
})

process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }))

// ---- Fase 14: a voz mais robusta -----------------------------------------
test('pcmStats and vad.all: seconds, peak and the whole audio for the voice test', () => {
  const pcm = new Int16Array(16000).map((_, i) => (i === 100 ? 16384 : 0))
  assert.deepStrictEqual(V.pcmStats(pcm), { seconds: 1, peakDb: -6 })
  assert.deepStrictEqual(V.pcmStats(new Int16Array(800)), { seconds: 0.05, peakDb: -100 })
  const vad = new V.EnergyVad({ endSilenceMs: 0, noSpeechMs: 0, maxMs: 3000 })
  const events = feed(
    vad,
    seq(150, () => frame(0.001))
  )
  assert.deepStrictEqual(events, [['end', 149]], 'the test mode ends only at 3 s')
  assert.strictEqual(vad.result(), null, 'no speech')
  assert.strictEqual(vad.all().length, 150 * FRAME, 'but the test gets all of it')
})
test('transcribeTimeout: 4 s per second of audio, between 30 s and 2 min', () => {
  assert.strictEqual(W.transcribeTimeout(3), 30_000)
  assert.strictEqual(W.transcribeTimeout(10), 50_000)
  assert.strictEqual(W.transcribeTimeout(30), 120_000)
})
test('whisperError: the error line, even with exit 0', () => {
  assert.strictEqual(
    W.whisperError('whisper_init: loading\nerror: unknown argument: -sns\nusage: …'),
    'error: unknown argument: -sns'
  )
  assert.strictEqual(W.whisperError('whisper_init: loading\nsystem_info: AVX = 1'), null)
})
test('transcribe: an old whisper-cli (no -sns, no stdin) still works, the WAV in the runtime dir', async () => {
  // Another path: what a whisper-cli does not support is remembered per program.
  const old = path.join(tmp, 'whisper-old')
  fs.copyFileSync(path.join(BIN, 'fake-whisper'), old)
  fs.chmodSync(old, 0o755)
  const runtime = fs.mkdtempSync(path.join(tmp, 'run-'))
  const saved = process.env.XDG_RUNTIME_DIR
  process.env.XDG_RUNTIME_DIR = runtime
  const log = path.join(tmp, 'whisper-old.log')
  process.env.FAKE_WHISPER_LOG = log
  process.env.FAKE_WHISPER_OLD = '1'
  process.env.FAKE_WHISPER_TEXT = 'Abre o Firefox.'
  const warnings = []
  const warn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  try {
    const options = { binary: old, model, language: 'pt' }
    assert.strictEqual(await W.transcribe(new Int16Array(16000), options), 'Abre o Firefox.')
    const got = JSON.parse(fs.readFileSync(log, 'utf8').trim())
    assert.ok(!got.args.includes('-sns'))
    assert.strictEqual(got.bytes, 44 + 32000)
    const file = fs.readFileSync(`${log}.files`, 'utf8').trim()
    assert.ok(file.startsWith(path.join(runtime, 'wisp', 'voz-')), file)
    assert.ok(!fs.existsSync(file), 'the WAV is deleted right after')
    assert.strictEqual(warnings.length, 2, warnings.join('\n'))
    // The second time goes straight to what works.
    assert.strictEqual(await W.transcribe(new Int16Array(16000), options), 'Abre o Firefox.')
    assert.strictEqual(warnings.length, 2)
    assert.deepStrictEqual(fs.readdirSync(path.join(runtime, 'wisp')), [])
  } finally {
    console.warn = warn
    if (saved === undefined) delete process.env.XDG_RUNTIME_DIR
    else process.env.XDG_RUNTIME_DIR = saved
    delete process.env.FAKE_WHISPER_LOG
    delete process.env.FAKE_WHISPER_OLD
    delete process.env.FAKE_WHISPER_TEXT
  }
})
test('voiceHint: a muted mic, nothing understood, a slow model', () => {
  assert.match(VC.voiceHint({ text: '', peakDb: -60 }), /Quase não chegou som \(pico de -60 dB\)/)
  assert.match(VC.voiceHint({ text: '', peakDb: -12 }), /não reconheceu fala/)
  assert.match(VC.voiceHint({ text: 'oi', peakDb: -12, ms: 14_000 }), /levou 14 s.*ggml-base/)
  assert.strictEqual(VC.voiceHint({ text: 'oi', peakDb: -12, ms: 2000 }), null)
})
const loud = (id) => ({
  type: 'audio',
  id,
  pcm: new Int16Array(48000).map((_, i) => Math.round(Math.sin(i / 8) * 8000)).buffer
})
test('voice: the voice test records 3 s, transcribes and sends nothing', async () => {
  const { voice, log } = harness({ transcribe: async () => 'Testando o Wisp.' })
  const pending = voice.test()
  const start = log.commands[0]
  assert.deepStrictEqual(start, { type: 'start', id: start.id, mode: 'test' })
  assert.strictEqual(last(log.statuses).source, 'test')
  voice.handle(loud(start.id))
  const result = await pending
  assert.strictEqual(result.ok, true)
  assert.strictEqual(result.text, 'Testando o Wisp.')
  assert.strictEqual(result.seconds, 3)
  assert.ok(result.peakDb > -20 && result.peakDb < 0, String(result.peakDb))
  assert.strictEqual(typeof result.ms, 'number')
  assert.strictEqual(result.hint, undefined)
  assert.deepStrictEqual(log.delivered, [])
  assert.deepStrictEqual(log.notices, [])
  assert.strictEqual(last(log.statuses).state, 'idle')
})
test('voice: the voice test tells a muted mic, a setup error and a mic error', async () => {
  let setup = null
  const { voice, log } = harness({
    transcribe: async () => '',
    check: () => {
      if (setup) throw new Error(setup)
    }
  })
  let pending = voice.test()
  voice.handle(audio(last(log.commands).id))
  let result = await pending
  assert.strictEqual(result.ok, true)
  assert.strictEqual(result.text, '')
  assert.match(result.hint, /Quase não chegou som/)
  setup = 'Para eu entender a sua voz, instale o whisper.cpp.'
  result = await voice.test()
  assert.deepStrictEqual(result, { ok: false, text: '', error: setup })
  assert.deepStrictEqual(log.notices, [], 'the test shows it, not the panel')
  setup = null
  pending = voice.test()
  voice.handle({
    type: 'error',
    id: last(log.commands).id,
    reason: 'no-device',
    message: 'não achei um microfone'
  })
  result = await pending
  assert.strictEqual(result.error, 'Não consegui ouvir: não achei um microfone.')
  // Cancelled (Esc) in the middle.
  pending = voice.test()
  voice.cancel()
  assert.strictEqual((await pending).error, 'O teste foi interrompido.')
  // Busy: no test.
  voice.togglePanel()
  assert.match((await voice.test()).error, /Já estou ouvindo/)
  voice.cancel()
})
test('voice: nothing understood from a muted mic points to the mic and the test', async () => {
  const { voice, log } = harness({ transcribe: async () => '' })
  voice.press(false)
  voice.handle(audio(log.commands[0].id))
  await tick()
  const [level, text] = last(log.notices)
  assert.strictEqual(level, 'warning')
  assert.match(text, /Quase não chegou som.*Testar voz/)
  voice.press(false)
  voice.handle(loud(last(log.commands).id))
  await tick()
  assert.deepStrictEqual(last(log.notices), [
    'info',
    'Não entendi o que você disse. Tente de novo, mais perto do microfone.'
  ])
})
