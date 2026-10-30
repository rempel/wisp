// Os segredos do Wisp no Windows (Fase 35): a chave da OpenRouter e o pareamento do celular
// cifrados pelo próprio Windows (DPAPI, pelo safeStorage do Electron), que só abre na conta do
// usuário que cifrou. Cada segredo fica num arquivo em %LOCALAPPDATA%\Wisp\Segredos, com o nome
// tirado de um hash (o nome do segredo não vira caminho). Nada vai para o config.json nem para o
// registro.

import { safeStorage } from 'electron'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { DATA_DIR } from './paths'
import { t } from '../shared/i18n'

/** Onde ficam os segredos cifrados. */
export const SECRETS_DIR = join(DATA_DIR, 'Segredos')

const fileOf = (name: string, dir: string): string =>
  join(dir, `${createHash('sha256').update(name).digest('hex').slice(0, 32)}.bin`)

/** O que cifra e decifra: o DPAPI do Windows (trocável nos testes). */
export interface Cipher {
  available(): boolean
  encrypt(text: string): Buffer
  decrypt(data: Buffer): string
}

export const dpapi: Cipher = {
  available: () => safeStorage.isEncryptionAvailable(),
  encrypt: (text) => safeStorage.encryptString(text),
  decrypt: (data) => safeStorage.decryptString(data)
}

/** O erro de quando o Windows não cifra (ou não decifra) o segredo. */
export class WindowsSecretError extends Error {}

function cipherOf(cipher: Cipher): Cipher {
  if (!cipher.available()) {
    throw new WindowsSecretError(t('O Windows não deixou cifrar o segredo (DPAPI indisponível).'))
  }
  return cipher
}

export function hasWindowsSecret(name: string, dir = SECRETS_DIR): boolean {
  return existsSync(fileOf(name, dir))
}

export function readWindowsSecret(
  name: string,
  dir = SECRETS_DIR,
  cipher: Cipher = dpapi
): string | null {
  const file = fileOf(name, dir)
  if (!existsSync(file)) return null
  try {
    return cipherOf(cipher).decrypt(readFileSync(file))
  } catch (err) {
    if (err instanceof WindowsSecretError) throw err
    // Cifrado noutra conta (ou noutra máquina): o Windows não decifra.
    throw new WindowsSecretError(
      t('O Windows não decifrou o segredo ({message}); guarde-o de novo.', {
        message: (err as Error).message
      })
    )
  }
}

/** Guarda (ou troca) um segredo: o arquivo novo entra inteiro, no lugar do velho. */
export function storeWindowsSecret(
  name: string,
  value: string,
  dir = SECRETS_DIR,
  cipher: Cipher = dpapi
): void {
  const data = cipherOf(cipher).encrypt(value)
  mkdirSync(dir, { recursive: true })
  const file = fileOf(name, dir)
  const temporary = `${file}.novo`
  writeFileSync(temporary, data)
  renameSync(temporary, file)
}

export function deleteWindowsSecret(name: string, dir = SECRETS_DIR): void {
  rmSync(fileOf(name, dir), { force: true })
}
