// As emoções e as danças dos avatares (Fase 27), do ClaudeAnimationBase: a tabela (as 31 emoções
// do kit, cada uma com olhos, boca, cor e sinal que existem), o desenho de tudo no CSS dos dois
// avatares, o rosto de cada momento (a reação ganha da emoção, que ganha do estado, menos nos
// avisos), o susto da troca atuada, o tempo de cada pedido, o config.json e a ferramenta express,
// que o Claude usa sem pedir permissão.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { CONFIG_PATH, checkSettings, loadConfig } from '../src/main/config'
import { SAFE_TOOLS } from '../src/main/claude'
import { startDesktopServer } from '../src/main/mcp-server'
import {
  ANTICIPATION_MS,
  DANCE_MS,
  DANCES,
  EMOTES,
  EMOTIONS,
  EYES,
  FEEL_MS,
  FEELINGS,
  MAX_ACT_MS,
  MIX,
  MIX_MS,
  MOUTHS,
  REUSED_EMOTES,
  TAKE_MS,
  TINTS,
  danceLabel,
  emotionLabel,
  holdMs,
  isDance,
  isEmotion,
  mixDance,
  takeFrames
} from '../src/shared/emotions'
import { SETTINGS_KEYS } from '../src/shared/ipc'
import { emotionFace, faceFor, faceKey, takeOf } from '../src/renderer/mascot/face'

const ROOT = join(__dirname, '../..')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')
const CSS =
  read('src/renderer/mascot/mascot.css') +
  read('src/renderer/mascot/emotions.css') +
  read('src/renderer/mascot/avatars.css')

test('tabela: as 31 emoções do kit, cada uma com peças que existem', () => {
  assert.equal(EMOTIONS.length, 31)
  assert.equal(EYES.length, 24)
  assert.equal(MOUTHS.length, 16)
  assert.equal(DANCES.length, 12)
  for (const emotion of EMOTIONS) {
    const feeling = FEELINGS[emotion]
    const eyes = typeof feeling.eyes === 'string' ? [feeling.eyes] : feeling.eyes
    for (const eye of eyes) assert.ok(EYES.includes(eye), `${emotion}: olho ${eye}`)
    if (feeling.mouth) assert.ok(MOUTHS.includes(feeling.mouth), `${emotion}: boca`)
    if (feeling.emote) assert.ok(EMOTES.includes(feeling.emote), `${emotion}: sinal`)
    if (feeling.tint) assert.ok(TINTS.includes(feeling.tint), `${emotion}: cor`)
    assert.ok(feeling.take > 0 && feeling.take <= 1.3, `${emotion}: susto`)
    assert.ok(emotionLabel(emotion).length > 0)
  }
  // Os mesmos valores do kit (EMO, em src/clawd.js).
  assert.deepEqual(
    { ...FEELINGS.sad },
    {
      eyes: 'sad',
      mouth: 'frown',
      tint: 'blue',
      tintK: 0.35,
      blush: 0,
      gloom: 0.35,
      emote: 'cloud',
      take: 0.3,
      look: [0, 0.5]
    }
  )
  assert.equal(FEELINGS.surprised.fade, true)
  assert.equal(FEELINGS.surprised.take, 1.3)
  assert.deepEqual(FEELINGS.confused.eyes, ['narrow', 'wide'])
  assert.equal(FEELINGS.furious.tintK, 0.85)
  for (const dance of DANCES) assert.ok(danceLabel(dance).length > 0)
})

test('desenho: todo olho, boca, cor, sinal, emoção e dança tem CSS (e arte)', () => {
  for (const eye of EYES) {
    if (eye === 'normal' || eye === 'look') continue
    assert.match(CSS, new RegExp(`\\[data-eyes='${eye}'\\] \\.eye-${eye}\\b`), `olho ${eye}`)
  }
  assert.match(CSS, /\[data-eyes='narrow-wide'\] \.eye-narrow-wide/)
  for (const mouth of MOUTHS) {
    assert.match(CSS, new RegExp(`\\[data-mouth='${mouth}'\\] \\.m-${mouth}\\b`), `boca ${mouth}`)
  }
  for (const tint of TINTS) assert.match(CSS, new RegExp(`\\[data-tint='${tint}'\\]`), tint)
  for (const emotion of EMOTIONS) {
    if (emotion === 'neutral') continue
    assert.match(CSS, new RegExp(`\\[data-feel='${emotion}'\\]`), `corpo de ${emotion}`)
  }
  for (const dance of DANCES) {
    if (dance === 'mix') continue
    assert.match(CSS, new RegExp(`\\[data-dance='${dance}'\\] \\.groove`), `dança ${dance}`)
  }
  const emotes = read('src/renderer/mascot/Emotes.tsx')
  for (const emote of EMOTES) {
    if (REUSED_EMOTES.includes(emote)) {
      assert.match(CSS, new RegExp(`\\.emote-${emote} `), `sinal ${emote} (das reações)`)
    } else {
      assert.ok(emotes.includes(`case '${emote}':`), `sinal ${emote}`)
    }
  }
  // Os olhos novos estão desenhados no SVG.
  const face = read('src/renderer/mascot/FaceArt.tsx')
  for (const eye of EYES) {
    if (['normal', 'look', 'happy', 'closed', 'squeeze', 'angry', 'x', 'swirl'].includes(eye))
      continue
    assert.ok(face.includes(`eye-${eye}"`), `desenho do olho ${eye}`)
  }
})

test('desenho: parado, nada da Fase 27 anima no cochilo nem com menos movimento', () => {
  const emotions = read('src/renderer/mascot/emotions.css')
  // Os movimentos dependem do data-feel, do data-dance e dos sinais, que o cochilo não tem.
  assert.doesNotMatch(emotions, /state-sleeping/)
  assert.match(emotions, /:root\.reduce-motion \{[\s\S]*\.stage \.feel,[\s\S]*animation: none/)
  // Só transform e opacity nas animações contínuas.
  const keyframes = emotions.match(/@keyframes [\w-]+ \{[\s\S]*?\n\}/g) ?? []
  assert.ok(keyframes.length > 30)
  for (const block of keyframes) {
    const props = [...block.matchAll(/^\s+([a-z-]+):/gm)].map((match) => match[1])
    for (const prop of props) {
      assert.ok(['transform', 'opacity'].includes(prop), `${block.split('\n')[0]}: ${prop}`)
    }
  }
})

test('rosto: a reação ganha da emoção, que ganha do estado (menos nos avisos)', () => {
  const idle = faceFor('idle', null, null)
  assert.equal(idle.eyes, 'normal')
  assert.equal(idle.mouth, null, 'parado, o rosto de sempre: sem boca')
  assert.equal(idle.feel, null)
  assert.equal(faceFor('talking', null, null).mouth, 'open')
  assert.deepEqual(
    [faceFor('sleeping', null, null).eyes, faceFor('sleeping', null, null).mouth],
    ['closed', 'o']
  )
  assert.equal(faceFor('permission', null, null).eyes, 'shine')
  // A emoção pedida aparece trabalhando, falando, parado...
  const sad = faceFor('working', null, 'sad')
  assert.equal(sad.feel, 'sad')
  assert.equal(sad.emote, 'cloud')
  assert.equal(sad.tint, 'blue')
  assert.deepEqual(sad.look, [0, 0.5])
  // ... mas não num pedido de permissão, num erro ou no cochilo.
  for (const state of ['permission', 'error', 'sleeping'] as const) {
    assert.equal(faceFor(state, null, 'happy').feel, null, state)
  }
  // A reação (o clique) ganha de tudo.
  const poke = faceFor('idle', 'poke', 'love')
  assert.equal(poke.eyes, 'squeeze')
  assert.equal(poke.feel, null)
  assert.equal(faceFor('idle', 'annoyed', null).tint, 'flush')
  // O confuso tem um olho diferente do outro; o neutro não tem corpo próprio.
  assert.equal(emotionFace('confused').eyes, 'narrow-wide')
  assert.equal(emotionFace('playful').eyes, 'wink')
  assert.equal(emotionFace('neutral').feel, null)
  assert.notEqual(faceKey(faceFor('idle', null, null)), faceKey(faceFor('idle', null, 'happy')))
  assert.equal(faceKey(faceFor('idle', null, null)), faceKey(faceFor('idle', null, null)))
})

test('troca atuada: o susto do tamanho da emoção, antecipado e assentando', () => {
  const idle = faceFor('idle', null, null)
  const surprised = faceFor('idle', null, 'surprised')
  assert.equal(takeOf(idle, surprised), 1.3)
  assert.equal(takeOf(surprised, idle), FEELINGS.neutral.take, 'ao sair, o susto do neutro')
  assert.equal(takeOf(idle, faceFor('talking', null, null)), 0, 'estado para estado: na hora')

  const frames = takeFrames(1)
  const total = ANTICIPATION_MS + TAKE_MS
  assert.equal(frames[0].offset, 0)
  assert.equal(frames[frames.length - 1].offset, 1)
  for (let i = 1; i < frames.length; i++) {
    assert.ok((frames[i].offset as number) > (frames[i - 1].offset as number))
  }
  assert.equal(frames[0].transform, 'translateY(0px) scale(1, 1)')
  // No fim da antecipação, amassado em 12% do susto; o rosto troca ali.
  const swap = frames.find(
    (frame) => frame.offset === Math.round((ANTICIPATION_MS / total) * 1000) / 1000
  )
  assert.equal(swap?.transform, 'translateY(0px) scale(1.12, 0.88)')
  // Logo depois, estica e pula; e termina parado.
  const after = frames[frames.indexOf(swap!) + 1].transform as string
  assert.match(after, /translateY\(-\d/)
  assert.match(after, /scale\(0\.\d+, 1\.\d+\)/)
  assert.equal(frames[frames.length - 1].transform, 'translateY(0px) scale(1, 1)')
  // Metade do susto, metade do amassado.
  assert.equal(takeFrames(0.5)[3].transform, 'translateY(0px) scale(1.06, 0.94)')
})

test('tempo: quanto cada pedido fica, e a ordem do "de tudo um pouco"', () => {
  assert.equal(holdMs(undefined, FEEL_MS), FEEL_MS)
  assert.equal(holdMs(3, FEEL_MS), 3000)
  assert.equal(holdMs(0.2, FEEL_MS), 1000)
  assert.equal(holdMs(600, FEEL_MS), MAX_ACT_MS)
  assert.equal(holdMs(Number.NaN, DANCE_MS), DANCE_MS)
  assert.equal(mixDance(0), 'bounce')
  assert.equal(mixDance(MIX_MS - 1), 'bounce')
  assert.equal(mixDance(MIX_MS), MIX[1])
  assert.equal(mixDance(MIX_MS * MIX.length), 'bounce')
  assert.ok(isEmotion('cool') && !isEmotion('tango') && !isEmotion(3))
  assert.ok(isDance('shimmy') && !isDance('tango'))
})

test('config: a dança da música (padrão: de tudo um pouco)', () => {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true })
  writeFileSync(CONFIG_PATH, '{}')
  assert.equal(loadConfig().dance, 'mix')
  assert.ok((SETTINGS_KEYS as readonly string[]).includes('dance'))
  assert.equal(checkSettings({ dance: 'spin' }).ok, true)
  assert.equal(checkSettings({ dance: 'tango' }).ok, false)
  writeFileSync(CONFIG_PATH, JSON.stringify({ dance: 'tango', sound: false }))
  const config = loadConfig()
  assert.equal(config.dance, 'mix')
  assert.equal(config.sound, false)
})

/** A resposta do servidor MCP, no que o teste olha. */
interface RpcReply {
  result?: {
    tools?: {
      name: string
      annotations: { readOnlyHint?: boolean }
      inputSchema: { properties: Record<string, { enum?: string[] }> }
    }[]
    content?: { text: string }[]
    isError?: boolean
  }
  error?: unknown
}

test('express: a ferramenta do Claude, liberada, que só mexe no mascote', async () => {
  assert.ok(SAFE_TOOLS.includes('mcp__desktop__express'))
  process.env.XDG_RUNTIME_DIR = join(HOME, 'run')
  const calls: unknown[] = []
  const server = await startDesktopServer({
    requestApproval: async () => ({ allow: false, message: 'não' }),
    notify: () => undefined,
    projectRoots: () => [],
    editorCommand: () => 'code',
    express: (act) => calls.push(act)
  })
  try {
    const desktop = JSON.parse(readFileSync(server.configFor('t1'), 'utf8')).mcpServers.desktop
    const rpc = async (method: string, params: unknown): Promise<RpcReply> => {
      const res = await fetch(desktop.url, {
        method: 'POST',
        headers: {
          ...desktop.headers,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream'
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
      })
      const body = await res.text()
      const line = body.split('\n').find((l) => l.startsWith('data:'))
      return JSON.parse(line ? line.slice(5) : body)
    }
    const list = await rpc('tools/list', {})
    const tool = list.result?.tools?.find((item) => item.name === 'express')
    assert.ok(tool, 'a ferramenta aparece')
    assert.equal(tool.annotations.readOnlyHint, true)
    assert.ok(tool.inputSchema.properties.emocao.enum?.includes('starstruck'))
    assert.ok(tool.inputSchema.properties.danca.enum?.includes('shimmy'))

    const ok = await rpc('tools/call', { name: 'express', arguments: { emocao: 'proud' } })
    assert.equal(ok.result?.content?.[0].text, 'ok')
    await rpc('tools/call', { name: 'express', arguments: { danca: 'roof', segundos: 3 } })
    assert.deepEqual(calls, [
      { emotion: 'proud', dance: undefined, seconds: undefined },
      { emotion: undefined, dance: 'roof', seconds: 3 }
    ])
    const empty = await rpc('tools/call', { name: 'express', arguments: {} })
    assert.equal(empty.result?.isError, true)
    const bad = await rpc('tools/call', { name: 'express', arguments: { emocao: 'tango' } })
    assert.ok(bad.result?.isError || bad.error, 'uma emoção que não existe é recusada')
    assert.equal(calls.length, 2)
  } finally {
    server.close()
  }
})
