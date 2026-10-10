import {
  chmodSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync
} from 'fs'
import { join } from 'path'
import { z } from 'zod'
import { CONFIG_DIR } from './paths'

export const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

const PointSchema = z.object({ x: z.number().int(), y: z.number().int() })

export type Point = z.infer<typeof PointSchema>

export interface WispConfig {
  claudePath: string
  editorCommand: string
  projectRoots: string[]
  mascotPosition: Point | null
  extraAllowedTools: string[]
}

function defaults(): WispConfig {
  return {
    claudePath: 'claude',
    editorCommand: 'code',
    projectRoots: ['~/projetos'],
    mascotPosition: null,
    extraAllowedTools: []
  }
}

// Problemas da última leitura, em português, para o chat mostrar: quem abre o app pelo menu não
// vê o terminal. Os campos inválidos se acumulam aqui enquanto o schema lê o arquivo.
let problems: string[] = []
let fieldProblems: string[] = []
let problemsListener: ((problems: string[]) => void) | null = null

/** O que estava errado no config.json na última leitura (vazio se nada). */
export function configProblems(): string[] {
  return problems
}

/** Avisa quando os problemas mudam (o arquivo foi editado com o app aberto). */
export function onConfigProblems(listener: (problems: string[]) => void): void {
  problemsListener = listener
}

function setProblems(next: string[]): void {
  const changed = next.join('\n') !== problems.join('\n')
  problems = next
  if (changed) problemsListener?.(next)
}

// Cada campo cai no próprio padrão quando está ausente ou inválido, para que um
// erro de digitação num campo não descarte o resto da config.
function field<T>(key: keyof WispConfig, schema: z.ZodType<T>, fallback: () => T): z.ZodType<T> {
  return schema.catch((ctx) => {
    if (ctx.input !== undefined) {
      const reason = ctx.error.issues[0]?.message
      console.warn(`[wisp] config: valor inválido em "${key}" (${reason}); usando o padrão.`)
      fieldProblems.push(
        `\`${key}\` tem um valor inválido; usei o padrão (\`${JSON.stringify(fallback())}\`).`
      )
    }
    return fallback()
  })
}

const ConfigSchema = z.object({
  claudePath: field('claudePath', z.string().min(1), () => defaults().claudePath),
  editorCommand: field('editorCommand', z.string().min(1), () => defaults().editorCommand),
  projectRoots: field('projectRoots', z.array(z.string()), () => defaults().projectRoots),
  mascotPosition: field('mascotPosition', PointSchema.nullable(), () => null),
  extraAllowedTools: field('extraAllowedTools', z.array(z.string()), () => [])
})

let config: WispConfig = defaults()
// Conteúdo do arquivo como foi lido. Ao salvar, só as chaves alteradas são trocadas:
// valores que o usuário escreveu (mesmo inválidos) e chaves desconhecidas são preservados.
let fileData: Record<string, unknown> = {}
// Fica false quando o arquivo existe mas não deu para ler: nesse caso nunca o sobrescrevemos.
let writable = true
// Já houve uma leitura válida (senão, o que vale são os padrões).
let loaded = false
// mtime do arquivo na última leitura ou escrita. Se mudar, o usuário editou o arquivo.
let seenMtime: number | null = null

function mtimeOf(path: string): number | null {
  try {
    return statSync(path).mtimeMs
  } catch {
    return null
  }
}

export function loadConfig(): WispConfig {
  seenMtime = mtimeOf(CONFIG_PATH)
  const current = loaded ? 'a configuração anterior' : 'os padrões'
  let text: string
  try {
    text = readFileSync(CONFIG_PATH, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      config = defaults()
      fileData = { ...defaults() }
      writeFile()
      console.log(`[wisp] config criada em ${CONFIG_PATH}`)
      setProblems([])
    } else {
      writable = false
      console.warn(`[wisp] não consegui ler ${CONFIG_PATH}; usando ${current}.`, err)
      setProblems([`Não consegui ler o arquivo; usei ${current}.`])
    }
    return config
  }

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (err) {
    writable = false
    console.warn(
      `[wisp] ${CONFIG_PATH} não é um JSON válido (${(err as Error).message}). ` +
        `Usando ${current}; o arquivo não será sobrescrito até ser corrigido.`
    )
    setProblems([
      `O arquivo não é um JSON válido (\`${(err as Error).message}\`). Usei ${current} e não ` +
        'vou gravar nele até você corrigir.'
    ])
    return config
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    writable = false
    console.warn(`[wisp] ${CONFIG_PATH} deveria conter um objeto JSON; usando ${current}.`)
    setProblems([`O arquivo deveria conter um objeto JSON (\`{ ... }\`); usei ${current}.`])
    return config
  }

  fileData = json as Record<string, unknown>
  fieldProblems = []
  config = ConfigSchema.parse(fileData)
  setProblems(fieldProblems)
  writable = true
  loaded = true
  return config
}

/** Relê o arquivo se ele mudou desde a última leitura (o usuário pode editá-lo com o app aberto). */
function refresh(): void {
  const mtime = mtimeOf(CONFIG_PATH)
  if (mtime !== null && mtime !== seenMtime) loadConfig()
}

export function getConfig(): WispConfig {
  refresh()
  return config
}

export function updateConfig(patch: Partial<WispConfig>): void {
  // Relê antes, para não desfazer uma edição feita no arquivo com o app aberto.
  refresh()
  config = { ...config, ...patch }
  if (!writable) return
  fileData = { ...fileData, ...patch }
  writeFile()
}

/**
 * Onde gravar: o destino do link, se o config.json for um (quem guarda dotfiles num repositório
 * costuma ligar o arquivo para lá). Renomear por cima do link o trocaria por um arquivo comum.
 */
function writeTarget(): string {
  try {
    return realpathSync(CONFIG_PATH)
  } catch {
    return CONFIG_PATH
  }
}

function writeFile(): void {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true })
    const target = writeTarget()
    // Escreve num temporário e renomeia, para nunca deixar um config.json pela metade, mantendo
    // as permissões que o arquivo já tinha.
    let mode: number | null = null
    try {
      mode = statSync(target).mode & 0o777
    } catch {
      // Arquivo novo: fica com as permissões padrão.
    }
    const tmp = `${target}.tmp`
    writeFileSync(tmp, JSON.stringify(fileData, null, 2) + '\n', 'utf8')
    if (mode !== null) chmodSync(tmp, mode)
    renameSync(tmp, target)
    seenMtime = mtimeOf(CONFIG_PATH)
  } catch (err) {
    console.warn(`[wisp] não consegui salvar ${CONFIG_PATH}:`, err)
  }
}
