#!/usr/bin/env node
// A chave que assina os AppImage (Fase 31): roda uma vez, na sua máquina. Gera o par ed25519,
// grava a chave pública em src/main/release-key.ts (ela vai no Wisp e confere cada download) e
// a privada num arquivo só seu, para pôr no segredo WISP_RELEASE_KEY do repositório:
//
//   node scripts/release-key.mjs [arquivo]     (padrão: ./wisp-release-key.pem)
//   gh secret set WISP_RELEASE_KEY < wisp-release-key.pem
//
// Guarde uma cópia da privada fora do repositório (um gerenciador de senhas): sem ela, as versões
// novas não se atualizam sozinhas nos AppImage que já têm a chave pública.

import { generateKeyPairSync } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'src/main/release-key.ts')
const out = resolve(process.argv[2] ?? 'wisp-release-key.pem')

if (existsSync(out)) {
  console.error(`${out} já existe: escolha outro arquivo (não sobrescrevo uma chave).`)
  process.exit(1)
}
const source = readFileSync(target, 'utf8')
if (!/RELEASE_PUBLIC_KEY: string \| null = null/.test(source)) {
  console.error(
    'O src/main/release-key.ts já tem uma chave pública. Trocar a chave faz os AppImage antigos ' +
      'pararem de se atualizar: se é isso mesmo, volte a linha para "= null" e rode de novo.'
  )
  process.exit(1)
}
const { publicKey, privateKey } = generateKeyPairSync('ed25519')
writeFileSync(out, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' })
const pem = publicKey.export({ type: 'spki', format: 'pem' }).trim()
writeFileSync(
  target,
  source.replace(
    /RELEASE_PUBLIC_KEY: string \| null = null/,
    `RELEASE_PUBLIC_KEY: string | null = \`${pem}\n\``
  )
)
console.log(`Chave pública gravada em ${target}.`)
console.log(`Chave privada em ${out} (só você lê). Agora:`)
console.log(`  gh secret set WISP_RELEASE_KEY < ${out}`)
console.log('e guarde uma cópia fora do repositório. Faça o commit do release-key.ts.')
