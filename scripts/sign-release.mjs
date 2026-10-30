#!/usr/bin/env node
// Assina os AppImage e o instalador do Windows (Fase 36) de um release (Fase 31), no CI: para cada
// arquivo, grava ao lado um .sig com a assinatura ed25519 de "wisp-release\n<nome>\n<sha256>\n",
// com a chave privada do segredo WISP_RELEASE_KEY. Sem o segredo, avisa e sai sem erro: os
// arquivos saem sem assinatura e o Wisp leva à página da versão, como antes.
//
//   WISP_RELEASE_KEY="$(cat chave.pem)" node scripts/sign-release.mjs dist/*.AppImage dist/*-Setup-*.exe

import { createHash, createPrivateKey, sign } from 'crypto'
import { createReadStream, writeFileSync } from 'fs'
import { basename } from 'path'

const pem = process.env.WISP_RELEASE_KEY?.trim()
if (!pem) {
  console.log('Sem o segredo WISP_RELEASE_KEY: os arquivos saem sem assinatura.')
  process.exit(0)
}
const key = createPrivateKey(pem)
if (key.asymmetricKeyType !== 'ed25519') {
  console.error('A WISP_RELEASE_KEY não é uma chave ed25519.')
  process.exit(1)
}
const files = process.argv
  .slice(2)
  .filter((file) => file.endsWith('.AppImage') || /-Setup-[\w]+\.exe$/.test(file))
if (!files.length) {
  console.error('Nenhum .AppImage nem instalador para assinar.')
  process.exit(1)
}
for (const file of files) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  const sha256 = hash.digest('hex')
  const message = Buffer.from(`wisp-release\n${basename(file)}\n${sha256}\n`, 'utf8')
  writeFileSync(`${file}.sig`, sign(null, message, key).toString('base64') + '\n')
  console.log(`${basename(file)}: ${sha256}`)
}
