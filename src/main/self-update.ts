// Atualizar com um clique (Fase 31), só no AppImage: com o clique em "Atualizar", o Wisp baixa o
// AppImage novo do release no GitHub, confere a assinatura dele (ed25519, com a chave pública que
// vem no próprio Wisp) e troca o arquivo. Sem a assinatura certa, nada é trocado. O .deb e o
// Flatpak continuam pela página da versão (quem instala é o gerenciador de pacotes).

import { createHash, createPublicKey, verify } from 'crypto'
import {
  accessSync,
  chmodSync,
  constants,
  createWriteStream,
  renameSync,
  rmSync,
  statSync
} from 'fs'
import { basename, dirname, isAbsolute } from 'path'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import type { InstallKind } from './launcher'
import { RELEASE_PUBLIC_KEY } from './release-key'
import type { Release, ReleaseAsset } from './updates'
import { t } from '../shared/i18n'

/** O nome da arquitetura no nome do AppImage (o do electron-builder). */
const ARCHES: Partial<Record<string, string>> = { x64: 'x86_64', arm64: 'arm64' }
/** Mais que isso não é um AppImage do Wisp. */
export const MAX_APPIMAGE_BYTES = 1024 * 1024 * 1024
/** A assinatura é uma linha em base64 (64 bytes). */
const MAX_SIGNATURE_BYTES = 4096
/** O arquivo que está sendo baixado, ao lado do AppImage (só troca no fim). */
export const PARTIAL_SUFFIX = '.wisp-new'

/** O nome do AppImage de uma versão nesta arquitetura; null se não há AppImage para ela. */
export function appImageName(version: string, arch: string = process.arch): string | null {
  const name = ARCHES[arch]
  return name ? `Wisp-${version}-${name}.AppImage` : null
}

/** O AppImage desta arquitetura e a assinatura dele, se a versão tem os dois. */
export function pickAssets(
  release: Release,
  arch: string = process.arch
): { image: ReleaseAsset; signature: ReleaseAsset } | null {
  const name = appImageName(release.version, arch)
  if (!name) return null
  const image = release.assets?.find((asset) => asset.name === name)
  const signature = release.assets?.find((asset) => asset.name === `${name}.sig`)
  return image && signature ? { image, signature } : null
}

/**
 * O que a assinatura cobre: o nome do arquivo (com a versão e a arquitetura, para uma assinatura
 * não servir a outro arquivo nem a uma versão mais velha) e o sha256 dele.
 */
export function signedMessage(name: string, sha256: string): Buffer {
  return Buffer.from(`wisp-release\n${name}\n${sha256}\n`, 'utf8')
}

/** A assinatura (base64) confere com o nome, o sha256 e a chave pública (PEM)? */
export function verifyRelease(
  name: string,
  sha256: string,
  signature: string,
  publicKey: string
): boolean {
  try {
    const bytes = Buffer.from(signature.trim(), 'base64')
    if (bytes.length !== 64) return false
    const key = createPublicKey(publicKey)
    if (key.asymmetricKeyType !== 'ed25519') return false
    return verify(null, signedMessage(name, sha256), key, bytes)
  } catch {
    return false
  }
}

/**
 * O arquivo a trocar: o AppImage que está rodando. Fora do pacote (os testes),
 * WISP_TEST_APPIMAGE faz as vezes dele.
 */
export function updateTarget(
  kind: InstallKind,
  packaged: boolean,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const path = kind === 'appimage' ? env.APPIMAGE : packaged ? undefined : env.WISP_TEST_APPIMAGE
  return path && isAbsolute(path) ? path : null
}

/** A chave pública que confere os AppImage; fora do pacote, WISP_TEST_RELEASE_KEY troca. */
export function releaseKey(packaged: boolean, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!packaged && env.WISP_TEST_RELEASE_KEY) return env.WISP_TEST_RELEASE_KEY
  return RELEASE_PUBLIC_KEY
}

export interface InstallOptions {
  /** O AppImage a trocar. */
  target: string
  /** A chave pública (PEM). */
  publicKey: string
  arch?: string
  fetch?: typeof fetch
  /** Troca o endereço de um arquivo (os testes servem os arquivos de um servidor local). */
  rewrite?(url: string): string
}

export type InstallResult = { ok: true } | { ok: false; message: string }

/** Confere que dá para trocar o arquivo antes de baixar 100 MB. */
function checkTarget(target: string): string | null {
  try {
    if (!statSync(target).isFile()) return t('{file} não é um arquivo.', { file: target })
    accessSync(dirname(target), constants.W_OK)
    return null
  } catch {
    return t('Não tenho como gravar na pasta de {file}: baixe pela página da versão.', {
      file: basename(target)
    })
  }
}

async function get(url: string, options: InstallOptions): Promise<Response> {
  const response = await (options.fetch ?? fetch)(options.rewrite?.(url) ?? url, {
    signal: AbortSignal.timeout(10 * 60_000)
  })
  if (!response.ok || !response.body) {
    throw new Error(t('O download falhou ({status}).', { status: response.status }))
  }
  return response
}

/** Até `limit` bytes da resposta, como texto; mais que isso é um erro. */
async function smallText(response: Response, limit: number): Promise<string> {
  const text = await response.text()
  if (Buffer.byteLength(text) > limit) throw new Error(t('A assinatura veio grande demais.'))
  return text
}

/**
 * Baixa o AppImage da versão, confere a assinatura e só então troca o arquivo (rename no mesmo
 * lugar: quem já está rodando continua no arquivo antigo até fechar).
 */
export async function installRelease(
  release: Release,
  options: InstallOptions
): Promise<InstallResult> {
  const assets = pickAssets(release, options.arch)
  if (!assets) {
    return {
      ok: false,
      message: t('A versão {version} não tem o AppImage assinado: baixe pela página da versão.', {
        version: release.version
      })
    }
  }
  const problem = checkTarget(options.target)
  if (problem) return { ok: false, message: problem }
  const { image, signature } = assets
  const limit = image.size > 0 ? Math.min(image.size, MAX_APPIMAGE_BYTES) : MAX_APPIMAGE_BYTES
  const partial = options.target + PARTIAL_SUFFIX
  try {
    const sig = await smallText(await get(signature.url, options), MAX_SIGNATURE_BYTES)
    const response = await get(image.url, options)
    const hash = createHash('sha256')
    let received = 0
    const count = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        received += chunk.length
        if (received > limit) return done(new Error(t('O arquivo veio maior que o esperado.')))
        hash.update(chunk)
        done(null, chunk)
      }
    })
    await pipeline(
      Readable.fromWeb(response.body as import('stream/web').ReadableStream),
      count,
      createWriteStream(partial, { mode: 0o700 })
    )
    if (image.size > 0 && received !== image.size) {
      throw new Error(t('O download veio pela metade.'))
    }
    if (!verifyRelease(image.name, hash.digest('hex'), sig, options.publicKey)) {
      throw new Error(t('A assinatura não confere: o arquivo baixado foi descartado.'))
    }
    chmodSync(partial, 0o755)
    renameSync(partial, options.target)
    return { ok: true }
  } catch (err) {
    rmSync(partial, { force: true })
    return { ok: false, message: (err as Error).message }
  }
}

/** O AppImage que se atualiza: um download por vez, e a versão que já ficou no lugar. */
export class SelfUpdater {
  private done: string | null = null
  private running: Promise<InstallResult> | null = null

  constructor(private readonly options: InstallOptions & { relaunch(target: string): void }) {}

  /** A versão já trocada, que entra quando o Wisp abrir de novo. */
  installed(): string | null {
    return this.done
  }

  /** Baixa, confere e troca (um segundo clique espera o primeiro). */
  async install(release: Release): Promise<InstallResult> {
    if (this.done === release.version) return { ok: true }
    this.running ??= installRelease(release, this.options).finally(() => {
      this.running = null
    })
    const result = await this.running
    if (result.ok) this.done = release.version
    return result
  }

  /** Abre o AppImage novo (e fecha este). */
  restart(): void {
    this.options.relaunch(this.options.target)
  }
}
