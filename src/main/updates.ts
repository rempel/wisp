// O aviso de versão nova (Fase 20): desligado por padrão. Ligado (updateCheck), o Wisp confere
// a última versão publicada no GitHub uma vez por dia e avisa uma vez por versão. Nada é
// baixado nem instalado: o aviso leva à página da versão. A consulta não leva nada além do
// próprio pedido (sem token, sem identificação).

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { compareVersions } from './diagnostics'

/** A última versão publicada (WISP_RELEASES_URL troca, para os testes). */
export function releasesUrl(): string {
  return (
    process.env.WISP_RELEASES_URL || 'https://api.github.com/repos/rempel/wisp/releases/latest'
  ).trim()
}

/** De quanto em quanto tempo conferir (ms). */
export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000
/** Depois de abrir, quanto esperar a primeira conferência (ms): o Wisp abre sem rede. */
const FIRST_CHECK_MS = Number(process.env.WISP_TEST_UPDATE_FIRST_MS) || 60_000

export interface Release {
  version: string
  url: string
  /** Os arquivos da versão (Fase 31: o AppImage e a assinatura dele, para atualizar). */
  assets?: ReleaseAsset[]
}

export interface ReleaseAsset {
  name: string
  url: string
  size: number
}

/** Só os arquivos de um release do GitHub (o download, por https). */
const ASSET_URL = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/releases\/download\//

function parseAssets(value: unknown): ReleaseAsset[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((asset) => {
    const { name, browser_download_url: url, size } = (asset ?? {}) as Record<string, unknown>
    if (typeof name !== 'string' || typeof url !== 'string' || !ASSET_URL.test(url)) return []
    return [{ name, url, size: typeof size === 'number' ? size : 0 }]
  })
}

/** A versão de uma resposta do GitHub (/releases/latest); null se não serve. */
export function parseRelease(body: unknown): Release | null {
  if (!body || typeof body !== 'object') return null
  const {
    tag_name: tag,
    html_url: url,
    draft,
    prerelease,
    assets
  } = body as Record<string, unknown>
  if (draft || prerelease) return null
  if (typeof tag !== 'string' || !/^v?\d+\.\d+\.\d+$/.test(tag)) return null
  // Só a página da versão no GitHub: o aviso abre esse endereço no navegador.
  if (
    typeof url !== 'string' ||
    !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/releases\//.test(url)
  ) {
    return null
  }
  const files = parseAssets(assets)
  return { version: tag.replace(/^v/, ''), url, ...(files.length ? { assets: files } : {}) }
}

/** Pede a última versão; null sem rede ou sem uma versão que sirva. */
export async function latestRelease(fetcher: typeof fetch = fetch): Promise<Release | null> {
  try {
    const response = await fetcher(releasesUrl(), {
      headers: { accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(15_000)
    })
    if (!response.ok) return null
    return parseRelease(await response.json())
  } catch {
    return null
  }
}

interface State {
  /** Quando conferiu pela última vez (ms). */
  checkedAt: number
  /** A versão nova vista por último. */
  latest: Release | null
  /** A versão já avisada (cada uma avisa uma vez). */
  notified: string | null
}

export interface UpdateOptions {
  /** A versão deste Wisp. */
  current: string
  /** O aviso está ligado. */
  enabled(): boolean
  /** Onde guardar quando conferiu e o que já avisou. */
  stateFile: string
  /** Uma versão nova, ainda não avisada. */
  notify(release: Release): void
  fetch?: typeof fetch
  now?(): number
}

/** Confere uma vez por dia, com o aviso ligado. */
export class UpdateChecker {
  private timer: NodeJS.Timeout | null = null
  private state: State

  constructor(private readonly options: UpdateOptions) {
    this.state = this.load()
  }

  /** A versão nova conhecida (para o diagnóstico); null se não há ou o aviso está desligado. */
  available(): Release | null {
    const latest = this.state.latest
    if (!this.options.enabled() || !latest) return null
    return compareVersions(latest.version, this.options.current) > 0 ? latest : null
  }

  /** Liga, desliga ou reprograma, conforme a configuração. */
  schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (!this.options.enabled()) return
    const now = this.options.now?.() ?? Date.now()
    const due = this.state.checkedAt + CHECK_EVERY_MS - now
    this.timer = setTimeout(() => void this.check(), Math.max(due, FIRST_CHECK_MS))
    this.timer.unref?.()
  }

  /** Confere agora. */
  async check(): Promise<Release | null> {
    if (!this.options.enabled()) return null
    const release = await latestRelease(this.options.fetch)
    this.state.checkedAt = this.options.now?.() ?? Date.now()
    if (release) this.state.latest = release
    const newer = this.available()
    if (newer && this.state.notified !== newer.version) {
      this.state.notified = newer.version
      this.options.notify(newer)
    }
    this.save()
    this.schedule()
    return newer
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private load(): State {
    try {
      const data = JSON.parse(readFileSync(this.options.stateFile, 'utf8')) as Partial<State>
      return {
        checkedAt: typeof data.checkedAt === 'number' ? data.checkedAt : 0,
        latest: data.latest
          ? parseRelease({
              tag_name: data.latest.version,
              html_url: data.latest.url,
              assets: data.latest.assets?.map(({ name, url, size }) => ({
                name,
                browser_download_url: url,
                size
              }))
            })
          : null,
        notified: typeof data.notified === 'string' ? data.notified : null
      }
    } catch {
      return { checkedAt: 0, latest: null, notified: null }
    }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.options.stateFile), { recursive: true })
      const temp = `${this.options.stateFile}.tmp`
      writeFileSync(temp, JSON.stringify(this.state))
      renameSync(temp, this.options.stateFile)
    } catch (err) {
      console.warn('[wisp] não consegui guardar a conferência de versão:', err)
    }
  }
}
