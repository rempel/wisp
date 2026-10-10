import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
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

// Cada campo cai no próprio padrão quando está ausente ou inválido, para que um
// erro de digitação num campo não descarte o resto da config.
function field<T>(key: keyof WispConfig, schema: z.ZodType<T>, fallback: () => T): z.ZodType<T> {
  return schema.catch((ctx) => {
    if (ctx.input !== undefined) {
      const reason = ctx.error.issues[0]?.message
      console.warn(`[wisp] config: valor inválido em "${key}" (${reason}); usando o padrão.`)
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

export function loadConfig(): WispConfig {
  let text: string
  try {
    text = readFileSync(CONFIG_PATH, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      config = defaults()
      fileData = { ...defaults() }
      writeFile()
      console.log(`[wisp] config criada em ${CONFIG_PATH}`)
    } else {
      writable = false
      console.warn(`[wisp] não consegui ler ${CONFIG_PATH}; usando os padrões.`, err)
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
        'Usando os padrões; o arquivo não será sobrescrito até ser corrigido.'
    )
    return config
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    writable = false
    console.warn(`[wisp] ${CONFIG_PATH} deveria conter um objeto JSON; usando os padrões.`)
    return config
  }

  fileData = json as Record<string, unknown>
  config = ConfigSchema.parse(fileData)
  return config
}

export function getConfig(): WispConfig {
  return config
}

export function updateConfig(patch: Partial<WispConfig>): void {
  config = { ...config, ...patch }
  if (!writable) return
  fileData = { ...fileData, ...patch }
  writeFile()
}

function writeFile(): void {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true })
    // Escreve num temporário e renomeia, para nunca deixar um config.json pela metade.
    const tmp = `${CONFIG_PATH}.tmp`
    writeFileSync(tmp, JSON.stringify(fileData, null, 2) + '\n', 'utf8')
    renameSync(tmp, CONFIG_PATH)
  } catch (err) {
    console.warn(`[wisp] não consegui salvar ${CONFIG_PATH}:`, err)
  }
}
