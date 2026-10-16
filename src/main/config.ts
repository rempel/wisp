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
import { PERMISSION_MODES } from '../shared/ipc'
import type { PermissionMode } from '../shared/ipc'

export const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

const PointSchema = z.object({ x: z.number().int(), y: z.number().int() })

/**
 * Nome de modelo que o --model aceita: um apelido ("sonnet"), um nome completo, ou um modelo da
 * OpenRouter ("provedor/modelo", às vezes com ":free" ou "@versão" no fim).
 */
export const MODEL_NAME = /^[A-Za-z0-9~][\w.:/@[\]-]{0,99}$/

export type Point = z.infer<typeof PointSchema>

export interface WispConfig {
  claudePath: string
  editorCommand: string
  projectRoots: string[]
  mascotPosition: Point | null
  extraAllowedTools: string[]
  /** Modelo do Claude (apelido como "sonnet" ou nome completo); null usa o padrão do Claude Code. */
  model: string | null
  /**
   * O modo de permissão com que cada conversa nova começa: "default" (pede), "acceptEdits",
   * "plan" ou "auto". Cada aba troca o seu na pílula de modo (ou com Shift+Tab).
   */
  permissionMode: PermissionMode
  /** Sons do Wisp ligados. */
  sound: boolean
  /** Volume dos sons, de 0 a 1. */
  volume: number
  /** Minutos sem nada acontecer (e com o cursor longe) até o mascote cochilar; 0 desliga. */
  sleepAfterMinutes: number
  /** Acessórios por data: "auto" segue o calendário, "none" desliga; ou um fixo. */
  accessory: AccessorySetting
  /** Atalho global que abre e fecha o painel (formato do Electron); null desliga. */
  shortcut: string | null
  /** O painel oferece um chip para usar o que você copiou. */
  clipboardChip: boolean
  /**
   * O terminal que o Claude abre ("kitty", "konsole --workdir {dir}"); null escolhe sozinho pelo
   * desktop.
   */
  terminalCommand: string | null
  /** O Claude pode controlar um navegador separado (Playwright). Desligado por padrão. */
  browserAutomation: boolean
  /** O navegador para isso (um Chrome ou Chromium); null procura sozinho. */
  browserExecutable: string | null
  /** Atalho global de voz: segure enquanto fala (ou toque e fale); null desliga. */
  voiceShortcut: string | null
  /** O que for dito pelo atalho vai para a caixa de mensagem, para revisar, em vez de seguir direto. */
  voiceReview: boolean
  /** O programa do whisper.cpp (nome no PATH ou caminho). */
  whisperPath: string
  /** O modelo do whisper.cpp (um ggml-*.bin). */
  whisperModel: string
  /** O idioma da fala ("pt", "en"…) ou "auto". */
  voiceLanguage: string
  /** Comandos rápidos por voz, sem o Claude: música, volume e abrir apps. */
  quickCommands: boolean
  /** O Wisp fala as respostas do que foi pedido por voz (Piper). */
  voiceReplies: boolean
  /** O programa do Piper (nome no PATH ou caminho). */
  piperPath: string
  /** A voz do Piper (o .onnx; o .onnx.json fica ao lado). */
  piperModel: string
  /**
   * Modo demonstração: as respostas vêm de gravações, e nada roda de verdade. Para ver o Wisp
   * funcionando antes de instalar o Claude Code ou de fazer login.
   */
  demo: boolean
  /**
   * A ilha (o nome no arquivo ficou do modo compacto da Fase 13): no lugar do mascote flutuante,
   * uma cápsula no centro do topo da tela, que abre com o cursor ou quando tem algo a mostrar.
   */
  compact: boolean
  /** Alertas do GitHub (CI e revisões dos seus PRs), pelo `gh` já logado. Desligado por padrão. */
  github: boolean
  /** Agenda: os próximos compromissos (Evolution Data Server e .ics). Desligada por padrão. */
  calendar: boolean
  /** Arquivos .ics, ou pastas com eles (vdirsyncer), além das agendas do GNOME. */
  calendarFiles: string[]
  /** Minutos antes de um compromisso para o Wisp avisar; 0 não avisa. */
  calendarAlertMinutes: number
  /** Guarda as contagens da semana (sem conteúdo) e mostra o resumo na segunda-feira. */
  weeklySummary: boolean
  /**
   * Por onde as conversas novas vão (experimental): "subscription", o seu Claude Code com a
   * assinatura (o padrão); ou "openrouter", a API da OpenRouter com a sua chave (no chaveiro do
   * sistema) e o modelo de openrouterModel. Cada aba troca o seu.
   */
  provider: 'subscription' | 'openrouter'
  /** O modelo da OpenRouter ("provedor/modelo"); null até escolher um. */
  openrouterModel: string | null
  /**
   * Aprovar pelo celular (Fase 18), pelo ntfy. Liga só depois de o celular responder ao teste do
   * pareamento (pela tela de configurações); os tópicos ficam no chaveiro do sistema.
   */
  phoneApprovals: boolean
  /** O servidor do ntfy do pareamento (o público, ou um seu). */
  phoneServer: string
  /** Segundos que um card espera antes de ir para o celular; 0: só com a tela bloqueada. */
  phoneAfterSeconds: number
}

export const ACCESSORY_SETTINGS = ['auto', 'none', 'christmas', 'summer'] as const
export type AccessorySetting = (typeof ACCESSORY_SETTINGS)[number]

function defaults(): WispConfig {
  return {
    claudePath: 'claude',
    editorCommand: 'code',
    projectRoots: ['~/projetos'],
    mascotPosition: null,
    extraAllowedTools: [],
    model: null,
    permissionMode: 'default',
    sound: true,
    volume: 0.5,
    sleepAfterMinutes: 3,
    accessory: 'auto',
    shortcut: 'Ctrl+Alt+W',
    clipboardChip: true,
    terminalCommand: null,
    browserAutomation: false,
    browserExecutable: null,
    voiceShortcut: 'Ctrl+Alt+Space',
    voiceReview: false,
    whisperPath: 'whisper-cli',
    whisperModel: '~/.local/share/wisp/voz/ggml-small.bin',
    voiceLanguage: 'pt',
    quickCommands: true,
    voiceReplies: false,
    piperPath: 'piper',
    piperModel: '~/.local/share/wisp/voz/pt_BR-faber-medium.onnx',
    demo: false,
    compact: false,
    github: false,
    calendar: false,
    calendarFiles: [],
    calendarAlertMinutes: 10,
    weeklySummary: true,
    provider: 'subscription',
    openrouterModel: null,
    phoneApprovals: false,
    phoneServer: 'https://ntfy.sh',
    phoneAfterSeconds: 60
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

const changeListeners: ((config: WispConfig) => void)[] = []

/**
 * Avisa quando o arquivo é relido depois de editado com o app aberto (o que acontece na próxima
 * vez que alguém pede a config).
 */
export function onConfigChange(listener: (config: WispConfig) => void): void {
  changeListeners.push(listener)
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

/**
 * O formato de cada campo. Na leitura do arquivo, um valor inválido cai no padrão do campo (sem
 * descartar o resto); na tela de configurações, ele é recusado com o motivo.
 */
const FIELDS: { [K in keyof WispConfig]: z.ZodType<WispConfig[K]> } = {
  claudePath: z.string().trim().min(1),
  editorCommand: z.string().trim().min(1),
  projectRoots: z.array(z.string()),
  mascotPosition: PointSchema.nullable(),
  extraAllowedTools: z.array(z.string()),
  // Só letras, números e . _ - : [ ]: apelidos ("sonnet") e nomes completos ("claude-sonnet-5-5").
  model: z.string().regex(MODEL_NAME).nullable(),
  permissionMode: z.enum(PERMISSION_MODES),
  sound: z.boolean(),
  volume: z.number().min(0).max(1),
  sleepAfterMinutes: z.number().min(0),
  accessory: z.enum(ACCESSORY_SETTINGS),
  shortcut: z.string().max(60).nullable(),
  clipboardChip: z.boolean(),
  terminalCommand: z.string().max(300).nullable(),
  browserAutomation: z.boolean(),
  browserExecutable: z.string().max(500).nullable(),
  voiceShortcut: z.string().max(60).nullable(),
  voiceReview: z.boolean(),
  whisperPath: z.string().min(1).max(500),
  whisperModel: z.string().min(1).max(500),
  // Um código de idioma do whisper.cpp ("pt", "en", "zh"…) ou "auto".
  voiceLanguage: z.string().regex(/^(?:[a-z]{2,3}|auto)$/),
  quickCommands: z.boolean(),
  voiceReplies: z.boolean(),
  piperPath: z.string().min(1).max(500),
  piperModel: z.string().min(1).max(500),
  demo: z.boolean(),
  compact: z.boolean(),
  github: z.boolean(),
  calendar: z.boolean(),
  calendarFiles: z.array(z.string().trim().min(1).max(500)).max(20),
  calendarAlertMinutes: z.number().int().min(0).max(240),
  weeklySummary: z.boolean(),
  provider: z.enum(['subscription', 'openrouter']),
  openrouterModel: z.string().regex(MODEL_NAME).nullable(),
  phoneApprovals: z.boolean(),
  phoneServer: z
    .string()
    .max(300)
    .regex(/^https?:\/\/[^\s?#@]+$/, 'precisa ser um endereço http(s)'),
  phoneAfterSeconds: z.number().int().min(0).max(3600)
}

const ConfigSchema = z.object(
  Object.fromEntries(
    (Object.keys(FIELDS) as (keyof WispConfig)[]).map((key) => [
      key,
      field(key, FIELDS[key] as z.ZodType<unknown>, () => defaults()[key])
    ])
  )
)

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
  config = ConfigSchema.parse(fileData) as unknown as WispConfig
  setProblems(fieldProblems)
  writable = true
  loaded = true
  return config
}

/** Relê o arquivo se ele mudou desde a última leitura (o usuário pode editá-lo com o app aberto). */
function refresh(): void {
  const mtime = mtimeOf(CONFIG_PATH)
  if (mtime === null || mtime === seenMtime) return
  loadConfig()
  for (const listener of changeListeners) listener(config)
}

export function getConfig(): WispConfig {
  refresh()
  return config
}

/** O que cada campo espera, para o aviso de um valor recusado na tela de configurações. */
const EXPECTED: Partial<Record<keyof WispConfig, string>> = {
  claudePath: 'Diga o comando ou o caminho do Claude Code.',
  editorCommand: 'Diga o comando do editor (code, codium…).',
  projectRoots: 'Uma pasta por linha.',
  extraAllowedTools: 'Um nome de ferramenta por linha.',
  model: 'Só letras, números e . _ - : (um apelido como sonnet ou o nome completo).',
  openrouterModel: 'O id do modelo na OpenRouter, como aparece no site: provedor/modelo.',
  volume: 'O volume vai de 0 a 1.',
  sleepAfterMinutes: 'Um número de minutos, 0 ou mais (0 desliga o cochilo).',
  shortcut: 'O atalho tem no máximo 60 caracteres.',
  voiceShortcut: 'O atalho tem no máximo 60 caracteres.',
  terminalCommand: 'O comando do terminal tem no máximo 300 caracteres.',
  voiceLanguage: 'Um código de idioma (pt, en, es…) ou auto.',
  calendarFiles: 'Um arquivo .ics ou uma pasta por linha (até 20).',
  calendarAlertMinutes: 'Um número inteiro de minutos, de 0 a 240 (0 não avisa).'
}

/**
 * Confere uma mudança vinda da tela de configurações: só campos conhecidos, cada um no formato
 * dele. Devolve o motivo (em português) do primeiro campo errado.
 */
export function checkSettings(
  patch: unknown
): { ok: true; patch: Partial<WispConfig> } | { ok: false; field: string; message: string } {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ok: false, field: '', message: 'mudança inválida' }
  }
  const checked: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(FIELDS, key)) return { ok: false, field: key, message: 'campo desconhecido' }
    const result = FIELDS[key as keyof WispConfig].safeParse(value)
    if (!result.success) {
      return {
        ok: false,
        field: key,
        message: EXPECTED[key as keyof WispConfig] ?? 'valor inválido'
      }
    }
    checked[key] = result.data
  }
  return { ok: true, patch: checked as Partial<WispConfig> }
}

/** Dá para gravar no config.json? (Não, se ele existe mas não é um JSON válido.) */
export function isConfigWritable(): boolean {
  return writable
}

/** Avisa quem acompanha a config, depois de uma mudança feita pelo próprio app. */
export function notifyConfigChange(): void {
  for (const listener of changeListeners) listener(config)
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
