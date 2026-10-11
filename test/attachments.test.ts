// Anexos: a cópia para a pasta da conversa (nomes limpos, sem sobrescrever, limites, avisos), o
// bloco <anexos> da mensagem, as imagens coladas e a limpeza do que ficou velho.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  ATTACHMENTS_DIR,
  cleanOldAttachments,
  copyAttachments,
  isThumbnail,
  savePasted,
  withAttachments
} from '../src/main/attachments'

const SESSION = '0f2c7a52-3c4b-4d7e-9a1b-2c3d4e5f6a7b'
const src = join(HOME, 'origem')
mkdirSync(src, { recursive: true })
const file = (name: string, content = 'conteúdo'): string => {
  const path = join(src, name)
  writeFileSync(path, content)
  return path
}

test('copia para a pasta da conversa, sem sobrescrever', async () => {
  const notes = file('notas.txt', 'um')
  const first = await copyAttachments([notes], SESSION)
  writeFileSync(notes, 'dois')
  const second = await copyAttachments([notes], SESSION)
  assert.deepEqual(first.problems, [])
  assert.equal(first.paths[0], join(ATTACHMENTS_DIR, SESSION, 'notas.txt'))
  assert.equal(second.paths[0], join(ATTACHMENTS_DIR, SESSION, 'notas (2).txt'))
  assert.equal(readFileSync(first.paths[0], 'utf8'), 'um')
  assert.equal(readFileSync(second.paths[0], 'utf8'), 'dois')
  assert.equal(statSync(join(ATTACHMENTS_DIR, SESSION)).mode & 0o777, 0o700)
})

test('nomes limpos: sem controles, quebras de linha, direção do texto e < >', async () => {
  const tricky = file('a‮bad<x>\n.txt')
  const { paths } = await copyAttachments([tricky], SESSION)
  assert.equal(paths[0].split('/').pop(), 'a_bad_x__.txt')
})

test('o que fica de fora vira aviso: pasta, arquivo sumido, caminho relativo', async () => {
  const folder = join(src, 'pasta')
  mkdirSync(folder)
  const { paths, problems } = await copyAttachments(
    [folder, join(src, 'sumiu.txt'), 'relativo.txt', file('ok.txt')],
    SESSION
  )
  assert.equal(paths.length, 1)
  assert.deepEqual(problems, [
    '"pasta" não é um arquivo: pastas não podem ser anexadas.',
    'Não consegui anexar "sumiu.txt": o arquivo não existe mais.',
    'Não consegui anexar "relativo.txt": caminho inválido.'
  ])
})

test('no máximo 20 arquivos por mensagem', async () => {
  const many = Array.from({ length: 22 }, (_, i) => file(`f${i}.txt`))
  const { paths, problems } = await copyAttachments(many, SESSION)
  assert.equal(paths.length, 20)
  assert.deepEqual(problems, ['Só os 20 primeiros anexos foram enviados.'])
})

test('o bloco <anexos> no fim da mensagem', () => {
  assert.equal(withAttachments('oi', []), 'oi')
  assert.equal(withAttachments('  veja  ', ['/a/b.png']), 'veja\n\n<anexos>\n- /a/b.png\n</anexos>')
  assert.equal(withAttachments('', ['/a/b.png']), '<anexos>\n- /a/b.png\n</anexos>')
})

test('imagem colada: vira arquivo, e a cópia enviada tira o arquivo de espera', async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
  const pasted = await savePasted(png, 'image/png', new Date(2026, 9, 10, 14, 32, 1))
  assert.equal(pasted.name, 'imagem-colada-2026-10-10-143201.png')
  await assert.rejects(savePasted(png, 'image/svg+xml'), /só dá para colar imagens/)
  const { paths } = await copyAttachments([pasted.path], SESSION)
  assert.ok(existsSync(paths[0]))
  assert.ok(!existsSync(pasted.path))
})

test('miniaturas: só data URLs de imagem pequenos', () => {
  assert.ok(isThumbnail('data:image/webp;base64,AAAA'))
  assert.ok(!isThumbnail('data:text/html;base64,AAAA'))
  assert.ok(!isThumbnail('https://exemplo.com/a.png'))
  assert.ok(!isThumbnail(`data:image/png;base64,${'A'.repeat(200_000)}`))
})

test('limpeza: conversas com mais de 7 dias e colados com mais de 1 dia', async () => {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const old = join(ATTACHMENTS_DIR, '11111111-2222-4333-8444-555555555555')
  const recent = join(ATTACHMENTS_DIR, '66666666-7777-4888-9999-000000000000')
  const other = join(ATTACHMENTS_DIR, 'nao-e-sessao')
  for (const dir of [old, recent, other]) mkdirSync(dir, { recursive: true })
  const at = (path: string, ms: number): void => utimesSync(path, ms / 1000, ms / 1000)
  at(old, now - 8 * day)
  at(recent, now - 2 * day)
  at(other, now - 30 * day)
  const pasted = await savePasted(new Uint8Array([1]), 'image/png')
  at(pasted.path, now - 2 * day)
  await cleanOldAttachments(now)
  assert.ok(!existsSync(old))
  assert.ok(existsSync(recent))
  assert.ok(existsSync(other), 'pastas que não são de conversas ficam')
  assert.ok(!existsSync(pasted.path))
  assert.ok(readdirSync(ATTACHMENTS_DIR).includes(SESSION))
})
