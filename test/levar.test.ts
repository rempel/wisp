// Levar o Wisp junto (Fase 31): exportar as configurações e o histórico, ler um arquivo exportado
// (e recusar o que não é), a prévia (com os campos que mudam o que roda na máquina marcados) e
// importar sem apagar nada. E atualizar o AppImage com um clique: o arquivo certo da versão, a
// assinatura (a mesma do scripts/sign-release.mjs do CI), o download conferido e a troca.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { ROOT } from './helpers/paths'
import { loadConfig } from '../src/main/config'
import { readPins, setPinned } from '../src/main/history'
import { RELEASE_PUBLIC_KEY } from '../src/main/release-key'
import {
  applyPortable,
  buildExport,
  parsePortable,
  PORTABLE_KIND,
  previewPortable
} from '../src/main/portable'
import {
  appImageName,
  installRelease,
  pickAssets,
  releaseKey,
  SelfUpdater,
  signedMessage,
  updateTarget,
  verifyRelease
} from '../src/main/self-update'
import { parseRelease } from '../src/main/updates'
import type { Release } from '../src/main/updates'
import { SETTINGS_KEYS } from '../src/shared/ipc'

const ID_A = '0b6d6f8e-1c2a-4f5b-9d3e-7a8b9c0d1e2f'
const ID_B = '1c7e7a9f-2d3b-4a6c-8e4f-8b9c0d1e2f3a'

function conversation(dir: string, id: string, title: string): void {
  mkdirSync(dir, { recursive: true })
  const lines = [
    { type: 'conversa', v: 1, id, createdAt: 1, title },
    { type: 'user', text: `olá de ${title}` }
  ]
  writeFileSync(join(dir, `${id}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
}

test('exportar leva as configurações e, se pedido, as conversas e as fixadas', () => {
  const dir = join(HOME, 'export', 'conversas')
  const pins = join(HOME, 'export', 'fixadas.json')
  conversation(dir, ID_A, 'Primeira')
  writeFileSync(join(dir, 'lixo.txt'), 'não é conversa')
  setPinned(ID_A, true, pins)
  const config = { ...loadConfig(), editorCommand: 'code', voiceReplies: true }

  const plain = buildExport(config, '0.9.0', false, dir, pins)
  assert.equal(plain.tipo, PORTABLE_KIND)
  assert.equal(plain.versao, '0.9.0')
  assert.equal(plain.configuracoes.editorCommand, 'code')
  assert.equal(plain.configuracoes.voiceReplies, true)
  assert.equal(plain.conversas, undefined)
  // Só os campos da tela de configurações.
  assert.deepEqual(Object.keys(plain.configuracoes).sort(), [...SETTINGS_KEYS].sort())

  const full = buildExport(config, '0.9.0', true, dir, pins)
  assert.equal(full.conversas?.length, 1)
  assert.equal(full.conversas?.[0].id, ID_A)
  assert.equal(full.conversas?.[0].linhas.length, 2)
  assert.deepEqual(full.fixadas, [ID_A])
  // Ida e volta: o que sai lê de novo.
  const parsed = parsePortable(JSON.stringify(full))
  assert.ok(typeof parsed !== 'string')
  assert.deepEqual(parsed.ignored, [])
  assert.equal(parsed.file.conversas?.length, 1)
})

test('ler um arquivo recusa o que não é do Wisp e deixa de fora os campos desconhecidos', () => {
  assert.match(parsePortable('não é json') as string, /JSON/)
  assert.match(parsePortable('{"tipo":"outro"}') as string, /não foi exportado/)
  assert.match(parsePortable(`{"tipo":"${PORTABLE_KIND}","v":2}`) as string, /versão/)
  assert.match(
    parsePortable(`{"tipo":"${PORTABLE_KIND}","v":1,"configuracoes":[]}`) as string,
    /configurações/
  )
  // Um campo que não vale (o mesmo conferir da tela de configurações).
  const bad = parsePortable(
    JSON.stringify({ tipo: PORTABLE_KIND, v: 1, configuracoes: { volume: 'alto' } })
  )
  assert.equal(typeof bad, 'string')
  // Uma conversa com o cabeçalho de outra (ou um id que vira caminho) estraga o arquivo todo.
  for (const conversas of [
    [{ id: ID_A, linhas: [JSON.stringify({ type: 'conversa', id: ID_B, title: 'x' })] }],
    [{ id: '../../.bashrc', linhas: ['{}'] }],
    [{ id: ID_A, linhas: [] }]
  ]) {
    const result = parsePortable(
      JSON.stringify({ tipo: PORTABLE_KIND, v: 1, configuracoes: {}, conversas })
    )
    assert.match(result as string, /histórico/)
  }
  const newer = parsePortable(
    JSON.stringify({
      tipo: PORTABLE_KIND,
      v: 1,
      versao: '9.0.0',
      configuracoes: { voiceReplies: true, campoDoFuturo: 1 },
      fixadas: [ID_A, 'nada']
    })
  )
  assert.ok(typeof newer !== 'string')
  assert.deepEqual(newer.ignored, ['campoDoFuturo'])
  assert.deepEqual(newer.file.configuracoes, { voiceReplies: true })
  assert.deepEqual(newer.file.fixadas, [ID_A])
})

test('a prévia marca os campos sensíveis e conta prompts, tarefas e conversas', () => {
  const dir = join(HOME, 'previa', 'conversas')
  conversation(dir, ID_A, 'Já está aqui')
  const current = {
    ...loadConfig(),
    prompts: [{ name: 'diff', text: 'antigo' }],
    scheduledTasks: []
  }
  const parsed = parsePortable(
    JSON.stringify({
      tipo: PORTABLE_KIND,
      v: 1,
      versao: '0.9.0',
      em: '2026-10-20T10:00:00.000Z',
      configuracoes: {
        voiceReplies: !current.voiceReplies,
        editorCommand: 'rm -rf ~',
        extraAllowedTools: ['Bash'],
        theme: current.theme,
        prompts: [
          { name: 'diff', text: 'novo' },
          { name: 'resumo', text: 'Resuma' }
        ],
        scheduledTasks: [
          {
            id: 'manha',
            name: 'Manhã',
            prompt: 'Bom dia',
            time: '08:00',
            days: [1],
            folder: null,
            enabled: true
          }
        ]
      },
      conversas: [
        { id: ID_A, linhas: [JSON.stringify({ type: 'conversa', id: ID_A, title: 'a' })] },
        { id: ID_B, linhas: [JSON.stringify({ type: 'conversa', id: ID_B, title: 'b' })] }
      ]
    })
  )
  assert.ok(typeof parsed !== 'string')
  const preview = previewPortable(parsed.file, current, parsed.ignored, dir)
  const keys = Object.fromEntries(preview.changes.map((c) => [c.key, c]))
  // O que não muda não aparece; prompts e tarefas são contados à parte.
  assert.equal(keys.theme, undefined)
  assert.equal(keys.prompts, undefined)
  assert.equal(keys.voiceReplies.sensitive, false)
  assert.equal(keys.editorCommand.sensitive, true)
  assert.equal(keys.editorCommand.after, 'rm -rf ~')
  assert.equal(keys.extraAllowedTools.sensitive, true)
  assert.deepEqual(preview.prompts, { added: 1, replaced: 1 })
  assert.deepEqual(preview.tasks, { added: 1, replaced: 0 })
  assert.deepEqual(preview.conversations, { added: 1, present: 1 })
  assert.equal(preview.versao, '0.9.0')
})

test('importar junta prompts e tarefas, grava só as conversas novas e as fixa', () => {
  const dir = join(HOME, 'importar', 'conversas')
  const pins = join(HOME, 'importar', 'fixadas.json')
  conversation(dir, ID_A, 'Minha')
  const before = readFileSync(join(dir, `${ID_A}.jsonl`), 'utf8')
  const current = {
    ...loadConfig(),
    prompts: [
      { name: 'diff', text: 'antigo' },
      { name: 'meu', text: 'só meu' }
    ]
  }
  const header = (id: string, title: string): string =>
    JSON.stringify({ type: 'conversa', id, title })
  const parsed = parsePortable(
    JSON.stringify({
      tipo: PORTABLE_KIND,
      v: 1,
      configuracoes: { voiceReplies: true, prompts: [{ name: 'diff', text: 'novo' }] },
      conversas: [
        { id: ID_A, linhas: [header(ID_A, 'Do arquivo')] },
        { id: ID_B, linhas: [header(ID_B, 'Nova'), '{"type":"user","text":"oi"}'] }
      ],
      fixadas: [ID_B]
    })
  )
  assert.ok(typeof parsed !== 'string')
  const { patch, conversations } = applyPortable(parsed.file, current, dir, pins)
  assert.equal(conversations, 1)
  assert.equal(patch.voiceReplies, true)
  assert.deepEqual(patch.prompts, [
    { name: 'diff', text: 'novo' },
    { name: 'meu', text: 'só meu' }
  ])
  // A conversa que já estava aqui fica como estava.
  assert.equal(readFileSync(join(dir, `${ID_A}.jsonl`), 'utf8'), before)
  const added = join(dir, `${ID_B}.jsonl`)
  assert.equal(readFileSync(added, 'utf8').split('\n')[0], header(ID_B, 'Nova'))
  assert.equal(statSync(added).mode & 0o777, 0o600)
  assert.deepEqual([...readPins(pins)], [ID_B])
  assert.deepEqual(readdirSync(dir).sort(), [`${ID_A}.jsonl`, `${ID_B}.jsonl`].sort())
})

// ---- Atualizar com um clique ----

const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const PUBLIC = publicKey.export({ type: 'spki', format: 'pem' }).toString()
const PRIVATE = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
const signFor = (name: string, bytes: Buffer): string =>
  sign(null, signedMessage(name, sha256(bytes)), privateKey).toString('base64')

const BASE = 'https://github.com/rempel/wisp/releases/download/v0.9.0'
function release(files: { name: string; size?: number }[]): Release {
  const parsed = parseRelease({
    tag_name: 'v0.9.0',
    html_url: 'https://github.com/rempel/wisp/releases/tag/v0.9.0',
    assets: [
      ...files.map(({ name, size }) => ({
        name,
        browser_download_url: `${BASE}/${name}`,
        size: size ?? 0
      })),
      // De fora do GitHub: nunca entra.
      { name: 'x', browser_download_url: 'http://exemplo.com/x', size: 1 }
    ]
  })
  assert.ok(parsed)
  return parsed
}

/** Um fetch de mentira que serve os arquivos pelo nome. */
function serve(files: Record<string, Buffer | string>): typeof fetch {
  return (async (input: string | URL) => {
    const name = String(input).split('/').pop()!
    const body = files[name]
    if (body === undefined) return new Response('não', { status: 404 })
    return new Response(typeof body === 'string' ? body : new Uint8Array(body))
  }) as typeof fetch
}

test('o AppImage certo da versão e a assinatura dele', () => {
  assert.equal(appImageName('0.9.0', 'x64'), 'Wisp-0.9.0-x86_64.AppImage')
  assert.equal(appImageName('0.9.0', 'arm64'), 'Wisp-0.9.0-arm64.AppImage')
  assert.equal(appImageName('0.9.0', 'ia32'), null)
  const both = release([
    { name: 'Wisp-0.9.0-x86_64.AppImage' },
    { name: 'Wisp-0.9.0-x86_64.AppImage.sig' },
    { name: 'Wisp-0.9.0-arm64.AppImage' },
    { name: 'wisp_0.9.0_amd64.deb' }
  ])
  assert.equal(both.assets?.length, 4)
  assert.equal(pickAssets(both, 'x64')?.image.name, 'Wisp-0.9.0-x86_64.AppImage')
  // Sem a assinatura, não há o que atualizar.
  assert.equal(pickAssets(both, 'arm64'), null)

  const bytes = Buffer.from('um appimage')
  const name = 'Wisp-0.9.0-x86_64.AppImage'
  const signature = signFor(name, bytes)
  assert.equal(verifyRelease(name, sha256(bytes), signature, PUBLIC), true)
  // A mesma assinatura não serve para outro arquivo, outra versão ou outro conteúdo.
  assert.equal(verifyRelease('Wisp-0.8.0-x86_64.AppImage', sha256(bytes), signature, PUBLIC), false)
  assert.equal(verifyRelease(name, sha256(Buffer.from('outro')), signature, PUBLIC), false)
  const other = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' })
  assert.equal(verifyRelease(name, sha256(bytes), signature, other.toString()), false)
  assert.equal(verifyRelease(name, sha256(bytes), 'lixo', PUBLIC), false)
  // Uma chave que não é ed25519 não confere nada.
  const rsa = generateKeyPairSync('rsa', { modulusLength: 1024 }).publicKey.export({
    type: 'spki',
    format: 'pem'
  })
  assert.equal(verifyRelease(name, sha256(bytes), signature, rsa.toString()), false)
})

test('o arquivo a trocar e a chave: os de teste só fora do pacote', () => {
  const env = {
    APPIMAGE: '/opt/Wisp.AppImage',
    WISP_TEST_APPIMAGE: '/tmp/x',
    WISP_TEST_RELEASE_KEY: 'k'
  }
  assert.equal(updateTarget('appimage', true, env), '/opt/Wisp.AppImage')
  assert.equal(updateTarget('package', true, env), null)
  assert.equal(updateTarget('flatpak', true, env), null)
  assert.equal(updateTarget('dev', false, env), '/tmp/x')
  assert.equal(updateTarget('dev', false, { WISP_TEST_APPIMAGE: 'relativo' }), null)
  assert.equal(releaseKey(false, env), 'k')
  // Empacotado, só a chave que veio no Wisp.
  assert.equal(releaseKey(true, env), RELEASE_PUBLIC_KEY)
})

test('atualizar baixa, confere a assinatura e só então troca o arquivo', async () => {
  const dir = join(HOME, 'appimage')
  mkdirSync(dir, { recursive: true })
  const target = join(dir, 'Wisp.AppImage')
  writeFileSync(target, 'versão velha', { mode: 0o755 })
  const name = 'Wisp-0.9.0-x86_64.AppImage'
  const bytes = Buffer.from('#!/bin/sh\necho nova\n')
  const rel = release([{ name, size: bytes.length }, { name: `${name}.sig` }])
  const options = { target, publicKey: PUBLIC, arch: 'x64' }

  // Uma assinatura de outro conteúdo: nada muda, e o baixado vai embora.
  const forged = await installRelease(rel, {
    ...options,
    fetch: serve({ [name]: bytes, [`${name}.sig`]: signFor(name, Buffer.from('outro')) })
  })
  assert.equal(forged.ok, false)
  assert.match((forged as { message: string }).message, /assinatura/)
  assert.equal(readFileSync(target, 'utf8'), 'versão velha')
  assert.deepEqual(readdirSync(dir), ['Wisp.AppImage'])

  // Maior que o tamanho do release: para no meio.
  const big = await installRelease(rel, {
    ...options,
    fetch: serve({ [name]: Buffer.concat([bytes, bytes]), [`${name}.sig`]: signFor(name, bytes) })
  })
  assert.equal(big.ok, false)
  assert.equal(readFileSync(target, 'utf8'), 'versão velha')
  assert.deepEqual(readdirSync(dir), ['Wisp.AppImage'])

  // Sem o arquivo no servidor.
  const missing = await installRelease(rel, { ...options, fetch: serve({}) })
  assert.match((missing as { message: string }).message, /404/)

  // Uma versão sem o AppImage assinado.
  const unsigned = await installRelease(release([{ name }]), { ...options, fetch: serve({}) })
  assert.match((unsigned as { message: string }).message, /página da versão/)

  // Certo: troca, executável.
  let relaunched = ''
  const updater = new SelfUpdater({
    ...options,
    fetch: serve({ [name]: bytes, [`${name}.sig`]: signFor(name, bytes) + '\n' }),
    relaunch: (path) => (relaunched = path)
  })
  assert.equal(updater.installed(), null)
  const [first, second] = await Promise.all([updater.install(rel), updater.install(rel)])
  assert.deepEqual([first, second], [{ ok: true }, { ok: true }])
  assert.equal(readFileSync(target, 'utf8'), bytes.toString())
  assert.equal(statSync(target).mode & 0o777, 0o755)
  assert.deepEqual(readdirSync(dir), ['Wisp.AppImage'])
  assert.equal(updater.installed(), '0.9.0')
  updater.restart()
  assert.equal(relaunched, target)
})

test('o scripts/sign-release.mjs do CI assina como o Wisp confere', () => {
  const dir = join(HOME, 'dist')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'Wisp-0.9.0-x86_64.AppImage')
  writeFileSync(file, Buffer.alloc(300_000, 7))
  const script = join(ROOT, 'scripts/sign-release.mjs')
  // Sem o segredo: avisa e não assina.
  execFileSync(process.execPath, [script, file], { env: { PATH: process.env.PATH } })
  assert.equal(existsSync(`${file}.sig`), false)
  execFileSync(process.execPath, [script, file], {
    env: { PATH: process.env.PATH, WISP_RELEASE_KEY: PRIVATE }
  })
  const signature = readFileSync(`${file}.sig`, 'utf8')
  assert.equal(
    verifyRelease('Wisp-0.9.0-x86_64.AppImage', sha256(readFileSync(file)), signature, PUBLIC),
    true
  )
})

test('o scripts/release-key.mjs grava a chave pública e não troca uma que já existe', () => {
  const root = join(HOME, 'chave')
  mkdirSync(join(root, 'scripts'), { recursive: true })
  mkdirSync(join(root, 'src/main'), { recursive: true })
  const script = join(root, 'scripts/release-key.mjs')
  writeFileSync(script, readFileSync(join(ROOT, 'scripts/release-key.mjs')))
  const source = join(root, 'src/main/release-key.ts')
  writeFileSync(
    source,
    readFileSync(join(ROOT, 'src/main/release-key.ts'), 'utf8').replace(
      /RELEASE_PUBLIC_KEY: string \| null = [^\n]*(\n[^\n]*)*$/,
      'RELEASE_PUBLIC_KEY: string | null = null\n'
    )
  )
  const pem = join(root, 'chave.pem')
  execFileSync(process.execPath, [script, pem], { cwd: root, stdio: 'pipe' })
  assert.equal(statSync(pem).mode & 0o777, 0o600)
  const written = readFileSync(source, 'utf8')
  const key = /`(-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----\n)`/.exec(written)?.[1]
  assert.ok(key)
  const name = 'Wisp-1.0.0-x86_64.AppImage'
  const bytes = Buffer.from('conteúdo')
  const signature = sign(
    null,
    signedMessage(name, sha256(bytes)),
    readFileSync(pem, 'utf8')
  ).toString('base64')
  assert.equal(verifyRelease(name, sha256(bytes), signature, key), true)
  // De novo: não sobrescreve a chave privada nem troca a pública.
  assert.throws(() => execFileSync(process.execPath, [script, pem], { stdio: 'pipe' }))
  assert.throws(() =>
    execFileSync(process.execPath, [script, join(root, 'outra.pem')], { stdio: 'pipe' })
  )
  assert.equal(readFileSync(source, 'utf8'), written)
  assert.equal(existsSync(join(root, 'outra.pem')), false)
})
