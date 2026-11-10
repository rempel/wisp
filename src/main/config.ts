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
import { CONFIG_DIR, DATA_DIR } from './paths'
import { IS_WINDOWS } from './platform'
import { MAX_LINKS } from './calendar-links'
import type { CalendarLink } from './calendar-links'
import { PERMISSION_MODES } from '../shared/ipc'
import type { PermissionMode } from '../shared/ipc'
import { AVATARS, DEFAULT_AVATAR } from '../shared/avatars'
import { DANCES } from '../shared/emotions'
import type { Dance } from '../shared/emotions'
import type { AvatarName } from '../shared/avatars'
import { t } from '../shared/i18n'
import { LANGUAGE_SETTINGS } from '../shared/i18n'
import type { LanguageSetting } from '../shared/i18n'
import {
  MAX_PROMPT_TEXT,
  MAX_PROMPTS,
  MAX_TASKS,
  PROMPT_NAME,
  RESERVED_NAMES,
  TASK_TRIGGERS,
  TIME,
  defaultPrompts
} from '../shared/prompts'
import type { SavedPrompt, ScheduledTask } from '../shared/prompts'

export const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

const PointSchema = z.object({ x: z.number().int(), y: z.number().int() })

/**
 * Nome de modelo que o --model aceita: um apelido ("sonnet"), um nome completo, ou um modelo da
 * OpenRouter ("provedor/modelo", às vezes com ":free" ou "@versão" no fim).
 */
export const MODEL_NAME = /^[A-Za-z0-9~][\w.:/@[\]-]{0,99}$/
/** O nome de um servidor MCP no Claude Code (o mcp__nome__ das ferramentas dele). */
export const MCP_SERVER_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

export type Point = z.infer<typeof PointSchema>

export interface WispConfig {
  claudePath: string
  editorCommand: string
  projectRoots: string[]
  mascotPosition: Point | null
  extraAllowedTools: string[]
  /**
   * Os servidores MCP do seu Claude Code (os do usuário, no ~/.claude.json) que entram nas
   * conversas do Wisp (Fase 30), pelo nome. Os outros ficam de fora.
   */
  enabledMcpServers: string[]
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
  /** O avatar do Wisp: "fogo" (o fogo-fátuo), "geleca" ou "fantasma" (o fantasminha). */
  avatar: AvatarName
  /** A dança de quando toca música (Fase 27): uma das do kit, ou "mix" (de tudo um pouco). */
  dance: Dance
  /** O tema do painel: o do sistema, ou sempre claro ou escuro (Fase 22). */
  theme: ThemeSetting
  /** Cores de alto contraste no painel (além do que o sistema pedir). */
  highContrast: boolean
  /** Menos movimento no painel e no mascote, mesmo com o sistema animando. */
  reduceMotion: boolean
  /** O tamanho do painel (texto e tudo), de 0.7 a 2 (Ctrl+mais e Ctrl+menos). */
  panelZoom: number
  /**
   * Minutos sem uso até a aba dormir (Fase 23): o Claude Code dela sai e volta pela sessão na
   * próxima mensagem. 0: nunca.
   */
  tabSleepMinutes: number
  /**
   * Com o painel escondido, o card que espera também vira uma notificação do sistema com
   * Permitir e Negar (Fase 24), com as regras do celular.
   */
  notifyApprovals: boolean
  /**
   * Com o "não perturbe" do desktop ligado, o Wisp não manda notificações nem toca sons (Fase 32);
   * os cards esperam no painel.
   */
  quietWithDnd: boolean
  /** O idioma da interface (Fase 25): o do sistema, português ou inglês. Vale ao abrir de novo. */
  language: LanguageSetting
  /** Atalho global que abre e fecha o painel (formato do Electron); null desliga. */
  shortcut: string | null
  /** Atalho global que abre a paleta de comandos (Fase 32); null desliga. */
  paletteShortcut: string | null
  /** Atalho global que abre a ilha no Perguntar (Fase 38; só com a ilha ligada); null desliga. */
  islandShortcut: string | null
  /** Atalho global que recorta uma área da tela para uma conversa (Fase 41); null desliga. */
  areaShortcut: string | null
  /** Atalho global que leva o texto selecionado para uma conversa (Fase 45); null desliga. */
  selectionShortcut: string | null
  /** Atalho global que mostra a janela da frente ao Wisp (Fase 48); null desliga. */
  windowShortcut: string | null
  /** Atalho global do ditado em qualquer programa (Fase 53, segurar); null desliga. */
  dictationShortcut: string | null
  /** As trocas do ditado (Fase 53): o que o whisper escreve e o que você quer. */
  dictationReplacements: { from: string; to: string }[]
  /** As horas de silêncio (Fase 52): de `from` a `to` (HH:MM) o Wisp fica quieto; null desliga. */
  quietHours: { from: string; to: string } | null
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
  /** A ilha aberta recolhe depois disto (segundos) sem o cursor nela (Fase 37): 10, 15 ou 30. */
  islandAutoClose: number
  /** Passar o cursor na ilha a abre inteira, sem o clique. */
  islandHoverOpen: boolean
  /**
   * A ilha mostra as capas que os players dão pela internet (a do Spotify no Linux). Desligado: só
   * as capas locais (no Windows, elas vêm do próprio sistema).
   */
  islandCovers: boolean
  /** Alertas do GitHub (CI e revisões dos seus PRs), pelo `gh` já logado. Desligado por padrão. */
  github: boolean
  /** Os avisos de CI do GitLab, pelo glab (Fase 52). */
  gitlab: boolean
  /** Conversar pelo celular, numa página da rede local (Fase 54). */
  phoneChat: boolean
  /** Agenda: os próximos compromissos (Evolution Data Server e .ics). Desligada por padrão. */
  calendar: boolean
  /** Arquivos .ics, ou pastas com eles (vdirsyncer), além das agendas do GNOME. */
  calendarFiles: string[]
  /**
   * As agendas por endereço iCal (Fase 40): só o id e o nome. O endereço fica no chaveiro do
   * sistema (calendar-links.ts) e muda pela tela de configurações.
   */
  calendarLinks: CalendarLink[]
  /** Minutos antes de um compromisso para o Wisp avisar; 0 não avisa. */
  calendarAlertMinutes: number
  /** Guarda as contagens da semana (sem conteúdo) e mostra o resumo na segunda-feira. */
  weeklySummary: boolean
  /** Avisa ao passar de 80% e de 95% das janelas do plano (Fase 41). */
  usageAlerts: boolean
  /** No fim de cada resposta que editou arquivos, o card com o que mudou e o desfazer (Fase 42). */
  turnReview: boolean
  /** O navegador da bancada abre páginas da internet, além do que é desta máquina (Fase 58). */
  previewWeb: boolean
  /** O "Perguntar ao Wisp" no menu do gerenciador de arquivos (Fase 64). */
  fileManagerMenu: boolean
  /** No Windows, o comando `wisp` no PATH do seu usuário (Fase 67). */
  commandInPath: boolean
  /** No Linux, o Wisp na busca do desktop (KRunner e GNOME), para o que começa com "wisp" (Fase 72). */
  desktopSearch: boolean
  /** A extensão do Wisp para o GNOME Shell: as janelas no GNOME com Wayland (Fase 70). */
  gnomeExtension: boolean
  /**
   * Por onde as conversas novas vão (experimental): "subscription", o seu Claude Code com a
   * assinatura (o padrão); ou "openrouter", a API da OpenRouter com a sua chave (no chaveiro do
   * sistema) e o modelo de openrouterModel. Cada aba troca o seu.
   */
  provider: 'subscription' | 'openrouter'
  /** O modelo da OpenRouter ("provedor/modelo"); null até escolher um. */
  openrouterModel: string | null
  /**
   * O endereço de um servidor de modelos na sua máquina ou rede (Ollama, LM Studio), com a API
   * compatível com a da Anthropic (Fase 66). Com ele, as conversas pelo outro provedor vão para
   * lá, e não para a OpenRouter. null: a OpenRouter.
   */
  localModelsUrl: string | null
  /**
   * Aprovar pelo celular (Fase 18), pelo ntfy. Liga só depois de o celular responder ao teste do
   * pareamento (pela tela de configurações); os tópicos ficam no chaveiro do sistema.
   */
  phoneApprovals: boolean
  /** O servidor do ntfy do pareamento (o público, ou um seu). */
  phoneServer: string
  /** Segundos que um card espera antes de ir para o celular; 0: só com a tela bloqueada. */
  phoneAfterSeconds: number
  /** Confere uma vez por dia se saiu uma versão nova do Wisp (no GitHub). Desligado por padrão. */
  updateCheck: boolean
  /** Os prompts salvos (Fase 26): /nome no menu da barra, com as variáveis preenchidas na hora. */
  prompts: SavedPrompt[]
  /** As tarefas agendadas (Fase 26): um prompt num horário, numa aba nova, sempre no modo Pedir. */
  scheduledTasks: ScheduledTask[]
}

export const THEME_SETTINGS = ['system', 'light', 'dark'] as const
export type ThemeSetting = (typeof THEME_SETTINGS)[number]

export const ACCESSORY_SETTINGS = ['auto', 'none', 'christmas', 'summer'] as const
export type AccessorySetting = (typeof ACCESSORY_SETTINGS)[number]

function defaults(): WispConfig {
  return {
    claudePath: 'claude',
    editorCommand: 'code',
    projectRoots: ['~/projetos'],
    mascotPosition: null,
    extraAllowedTools: [],
    enabledMcpServers: [],
    model: null,
    permissionMode: 'default',
    sound: true,
    volume: 0.5,
    sleepAfterMinutes: 3,
    accessory: 'auto',
    avatar: DEFAULT_AVATAR,
    dance: 'mix',
    theme: 'system',
    highContrast: false,
    reduceMotion: false,
    panelZoom: 1,
    tabSleepMinutes: 20,
    notifyApprovals: true,
    quietWithDnd: true,
    language: 'auto',
    shortcut: 'Ctrl+Alt+W',
    paletteShortcut: 'Ctrl+Alt+P',
    islandShortcut: 'Ctrl+Alt+K',
    areaShortcut: 'Ctrl+Alt+R',
    selectionShortcut: 'Ctrl+Alt+E',
    windowShortcut: 'Ctrl+Alt+J',
    dictationShortcut: null,
    dictationReplacements: [],
    quietHours: null,
    clipboardChip: true,
    terminalCommand: null,
    browserAutomation: false,
    browserExecutable: null,
    voiceShortcut: 'Ctrl+Alt+Space',
    voiceReview: false,
    whisperPath: 'whisper-cli',
    // No Windows, na pasta de dados do Wisp (%LOCALAPPDATA%\Wisp\Voz).
    whisperModel: IS_WINDOWS
      ? join(DATA_DIR, 'Voz', 'ggml-small.bin')
      : '~/.local/share/wisp/voz/ggml-small.bin',
    voiceLanguage: 'pt',
    quickCommands: true,
    voiceReplies: false,
    piperPath: 'piper',
    piperModel: IS_WINDOWS
      ? join(DATA_DIR, 'Voz', 'pt_BR-faber-medium.onnx')
      : '~/.local/share/wisp/voz/pt_BR-faber-medium.onnx',
    demo: false,
    compact: false,
    islandAutoClose: 15,
    islandHoverOpen: false,
    islandCovers: false,
    github: false,
    gitlab: false,
    phoneChat: false,
    calendar: false,
    calendarFiles: [],
    calendarLinks: [],
    calendarAlertMinutes: 10,
    weeklySummary: true,
    usageAlerts: true,
    turnReview: true,
    previewWeb: true,
    fileManagerMenu: false,
    commandInPath: false,
    desktopSearch: false,
    gnomeExtension: false,
    provider: 'subscription',
    openrouterModel: null,
    localModelsUrl: null,
    phoneApprovals: false,
    phoneServer: 'https://ntfy.sh',
    phoneAfterSeconds: 60,
    updateCheck: false,
    prompts: defaultPrompts(),
    scheduledTasks: []
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
        t('`{key}` tem um valor inválido; usei o padrão (`{v2}`).', {
          key,
          v2: JSON.stringify(fallback())
        })
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
  enabledMcpServers: z.array(z.string().regex(MCP_SERVER_NAME)),
  // Só letras, números e . _ - : [ ]: apelidos ("sonnet") e nomes completos ("claude-sonnet-5-5").
  model: z.string().regex(MODEL_NAME).nullable(),
  permissionMode: z.enum(PERMISSION_MODES),
  sound: z.boolean(),
  volume: z.number().min(0).max(1),
  sleepAfterMinutes: z.number().min(0),
  accessory: z.enum(ACCESSORY_SETTINGS),
  avatar: z.enum(AVATARS),
  dance: z.enum(DANCES),
  theme: z.enum(THEME_SETTINGS),
  highContrast: z.boolean(),
  reduceMotion: z.boolean(),
  panelZoom: z.number().min(0.7).max(2),
  tabSleepMinutes: z.number().int().min(0).max(1440),
  notifyApprovals: z.boolean(),
  quietWithDnd: z.boolean(),
  language: z.enum(LANGUAGE_SETTINGS),
  shortcut: z.string().max(60).nullable(),
  paletteShortcut: z.string().max(60).nullable(),
  islandShortcut: z.string().max(60).nullable(),
  areaShortcut: z.string().max(60).nullable(),
  selectionShortcut: z.string().max(60).nullable(),
  windowShortcut: z.string().max(60).nullable(),
  dictationShortcut: z.string().max(60).nullable(),
  dictationReplacements: z
    .array(z.object({ from: z.string().min(1).max(100), to: z.string().max(200) }))
    .max(100),
  quietHours: z
    .object({
      from: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      to: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    })
    .nullable(),
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
  islandAutoClose: z.union([z.literal(10), z.literal(15), z.literal(30)]),
  islandHoverOpen: z.boolean(),
  islandCovers: z.boolean(),
  github: z.boolean(),
  gitlab: z.boolean(),
  phoneChat: z.boolean(),
  calendar: z.boolean(),
  calendarFiles: z.array(z.string().trim().min(1).max(500)).max(20),
  calendarLinks: z
    .array(
      z.object({ id: z.string().regex(/^[0-9a-f]{8}$/), name: z.string().trim().min(1).max(80) })
    )
    .max(MAX_LINKS)
    .refine((links) => new Set(links.map((link) => link.id)).size === links.length),
  calendarAlertMinutes: z.number().int().min(0).max(240),
  weeklySummary: z.boolean(),
  usageAlerts: z.boolean(),
  turnReview: z.boolean(),
  previewWeb: z.boolean(),
  fileManagerMenu: z.boolean(),
  commandInPath: z.boolean(),
  desktopSearch: z.boolean(),
  gnomeExtension: z.boolean(),
  provider: z.enum(['subscription', 'openrouter']),
  openrouterModel: z.string().regex(MODEL_NAME).nullable(),
  localModelsUrl: z
    .string()
    .regex(/^https?:\/\/[\w.-]+(:\d{1,5})?(\/[\w./-]*)?$/)
    .max(200)
    .nullable(),
  phoneApprovals: z.boolean(),
  phoneServer: z
    .string()
    .max(300)
    .regex(/^https?:\/\/[^\s?#@]+$/, t('precisa ser um endereço http(s)')),
  phoneAfterSeconds: z.number().int().min(0).max(3600),
  updateCheck: z.boolean(),
  prompts: z
    .array(
      z.object({
        name: z
          .string()
          .regex(PROMPT_NAME)
          .refine((name) => !RESERVED_NAMES.includes(name)),
        text: z.string().trim().min(1).max(MAX_PROMPT_TEXT)
      })
    )
    .max(MAX_PROMPTS)
    .refine((list) => new Set(list.map((prompt) => prompt.name)).size === list.length),
  scheduledTasks: z
    .array(
      z.object({
        id: z.string().regex(/^[\w-]{1,40}$/),
        name: z.string().trim().min(1).max(80),
        prompt: z.string().trim().min(1).max(MAX_PROMPT_TEXT),
        trigger: z.enum(TASK_TRIGGERS).optional(),
        watch: z.string().trim().min(1).max(500).nullable().optional(),
        time: z.string().regex(TIME),
        days: z.array(z.number().int().min(0).max(6)).max(7),
        folder: z.string().trim().min(1).max(500).nullable(),
        enabled: z.boolean()
      })
    )
    .max(MAX_TASKS)
    .refine((list) => new Set(list.map((task) => task.id)).size === list.length)
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
  const current = loaded ? t('a configuração anterior') : t('os padrões')
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
      setProblems([t('Não consegui ler o arquivo; usei {current}.', { current })])
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
      t('O arquivo não é um JSON válido (`{message}`). Usei {current} e não ', {
        message: (err as Error).message,
        current
      }) + t('vou gravar nele até você corrigir.')
    ])
    return config
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    writable = false
    console.warn(`[wisp] ${CONFIG_PATH} deveria conter um objeto JSON; usando ${current}.`)
    setProblems([
      t('O arquivo deveria conter um objeto JSON (`{ ... }`); usei {current}.', { current })
    ])
    return config
  }

  fileData = json as Record<string, unknown>
  // A gotinha robô saiu na Fase 39: quem a usava passa para o fogo-fátuo, sem o aviso de um valor
  // inválido (e o arquivo fica com o novo na próxima gravação).
  if (fileData.avatar === 'robo') fileData.avatar = DEFAULT_AVATAR
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
  claudePath: t('Diga o comando ou o caminho do Claude Code.'),
  editorCommand: t('Diga o comando do editor (code, codium…).'),
  projectRoots: t('Uma pasta por linha.'),
  extraAllowedTools: t('Um nome de ferramenta por linha.'),
  enabledMcpServers: t('Os nomes dos servidores: letras, números, - e _.'),
  model: t('Só letras, números e . _ - : (um apelido como sonnet ou o nome completo).'),
  openrouterModel: t('O id do modelo na OpenRouter, como aparece no site: provedor/modelo.'),
  localModelsUrl: t('Um endereço http ou https, como http://localhost:11434.'),
  volume: t('O volume vai de 0 a 1.'),
  sleepAfterMinutes: t('Um número de minutos, 0 ou mais (0 desliga o cochilo).'),
  tabSleepMinutes: t('Um número inteiro de minutos, de 0 a 1440 (0: as abas nunca dormem).'),
  shortcut: t('O atalho tem no máximo 60 caracteres.'),
  paletteShortcut: t('O atalho tem no máximo 60 caracteres.'),
  islandShortcut: t('O atalho tem no máximo 60 caracteres.'),
  areaShortcut: t('O atalho tem no máximo 60 caracteres.'),
  selectionShortcut: t('O atalho tem no máximo 60 caracteres.'),
  windowShortcut: t('O atalho tem no máximo 60 caracteres.'),
  dictationShortcut: t('O atalho tem no máximo 60 caracteres.'),
  dictationReplacements: t('Até 100 trocas, cada uma com o dito (até 100 caracteres) e o escrito.'),
  quietHours: t('Dois horários HH:MM (ex.: 22:00 e 08:00), ou null.'),
  voiceShortcut: t('O atalho tem no máximo 60 caracteres.'),
  terminalCommand: t('O comando do terminal tem no máximo 300 caracteres.'),
  voiceLanguage: t('Um código de idioma (pt, en, es…) ou auto.'),
  calendarFiles: t('Um arquivo .ics ou uma pasta por linha (até 20).'),
  calendarLinks: t('Até 10 agendas por endereço, cada uma com um id e um nome.'),
  calendarAlertMinutes: t('Um número inteiro de minutos, de 0 a 240 (0 não avisa).'),
  prompts: t(
    'Cada prompt precisa de um nome (letras minúsculas, números e hífens, sem repetir nem usar compact ou clear) e de um texto (até 4.000 caracteres).'
  ),
  scheduledTasks: t(
    'Cada tarefa precisa de um nome, de um prompt e de uma hora (HH:MM); até 20 tarefas.'
  )
}

/**
 * Confere uma mudança vinda da tela de configurações: só campos conhecidos, cada um no formato
 * dele. Devolve o motivo (em português) do primeiro campo errado.
 */
export function checkSettings(
  patch: unknown
): { ok: true; patch: Partial<WispConfig> } | { ok: false; field: string; message: string } {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ok: false, field: '', message: t('mudança inválida') }
  }
  const checked: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(FIELDS, key))
      return { ok: false, field: key, message: t('campo desconhecido') }
    const result = FIELDS[key as keyof WispConfig].safeParse(value)
    if (!result.success) {
      return {
        ok: false,
        field: key,
        message: EXPECTED[key as keyof WispConfig] ?? t('valor inválido')
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
