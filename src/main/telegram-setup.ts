// O Telegram no app (Fase 85): a ficha do bot no chaveiro, o pareamento, as mensagens para a Wisp
// e as respostas, os áudios (o ffmpeg converte; o whisper ouve e o Piper fala), os cards e a
// entrega das tarefas e do batimento (o canal `telegram` da delivery.ts).

import { spawn } from 'child_process'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import { ATTACHMENTS_DIR } from './attachments'
import type { Chat } from './chat'
import { getConfig, notifyConfigChange, updateConfig } from './config'
import { channels, lastReply } from './delivery'
import { DATA_DIR } from './paths'
import type { Speech } from './piper'
import { findProgram } from './programs'
import { deleteSecret, readSecret, storeSecret } from './secrets'
import { DEFAULT_TELEGRAM_API, TelegramApi, TelegramBot } from './telegram'
import { IPC } from '../shared/ipc'
import type { ChatEvent, TelegramStatus } from '../shared/ipc'
import { t } from '../shared/i18n'

export const TELEGRAM_SECRET = 'telegram'
const STATE_FILE = join(DATA_DIR, 'telegram.json')
/** O maior áudio que o Wisp ouve (bytes do PCM a 16 kHz: uns 5 minutos). */
const MAX_PCM = 5 * 60 * 16_000 * 2

export interface TelegramOptions {
  chat: () => Chat | null
  isSender(sender: WebContents): boolean
  /** A tela de configurações acompanha. */
  notify(): void
  transcribe(pcm: Int16Array): Promise<string>
  synthesize(text: string): Promise<Speech>
  locked(): boolean
}

/** Roda o ffmpeg com a entrada dada e devolve a saída (lança o motivo, se não der). */
function ffmpeg(args: string[], input: Buffer): Promise<Buffer> {
  const binary = findProgram('ffmpeg', ['ffmpeg'])
  if (!binary) return Promise.reject(new Error(t('falta o ffmpeg (para converter os áudios)')))
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ['-hide_banner', '-loglevel', 'error', ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })
    const out: Buffer[] = []
    let size = 0
    let err = ''
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size <= MAX_PCM * 2) out.push(chunk)
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => (err = (err + chunk).slice(-500)))
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(err.trim() || `ffmpeg ${code}`))
    )
    child.stdin.on('error', () => {})
    child.stdin.end(input)
  })
}

function readOffset(): number {
  try {
    const data = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as { offset?: unknown }
    return typeof data.offset === 'number' ? data.offset : 0
  } catch {
    return 0
  }
}

function writeOffset(offset: number): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(`${STATE_FILE}.tmp`, JSON.stringify({ offset }), { mode: 0o600 })
    renameSync(`${STATE_FILE}.tmp`, STATE_FILE)
  } catch {
    // Sem como gravar: na próxima abertura, as mensagens já lidas voltam (o Telegram as guarda).
  }
}

export function setupTelegram(options: TelegramOptions): {
  bot: TelegramBot
  onChatEvent(event: ChatEvent): void
  dispose(): void
} {
  const base = process.env.WISP_TELEGRAM_API || DEFAULT_TELEGRAM_API
  let api: TelegramApi | null = null
  let botName: string | null = null
  let offset = readOffset()
  // As respostas da Wisp que o Telegram espera, pela conversa.
  const waiting = new Map<string, (text: string) => void>()

  const load = async (): Promise<void> => {
    try {
      const token = await readSecret(TELEGRAM_SECRET)
      api = token ? new TelegramApi(token, base) : null
    } catch (err) {
      console.warn(`[wisp] telegram: não consegui ler a ficha (${(err as Error).message})`)
      api = null
    }
    options.notify()
  }

  const bot = new TelegramBot({
    api: () => api,
    enabled: () => getConfig().telegram && getConfig().telegramUser !== null,
    user: () => getConfig().telegramUser,
    paired: (user) => {
      updateConfig({
        telegram: true,
        telegramUser: user.id,
        telegramUserName: user.username ? `@${user.username}` : (user.first_name ?? String(user.id))
      })
      notifyConfigChange()
      options.notify()
    },
    voiceReply: () => getConfig().telegramVoiceReply,
    ask: (text, files, voice) =>
      new Promise((resolve) => {
        const chat = options.chat()
        const id = chat?.sendToMain(text, files, voice) ?? null
        if (!id) {
          resolve(null)
          return
        }
        waiting.set(id, resolve)
      }),
    reset: () => options.chat()?.resetMain(),
    transcribe: async (ogg) => {
      const raw = await ffmpeg(
        ['-i', 'pipe:0', '-f', 's16le', '-ac', '1', '-ar', '16000', 'pipe:1'],
        ogg
      )
      const pcm = new Int16Array(
        raw.buffer,
        raw.byteOffset,
        Math.floor(Math.min(raw.length, MAX_PCM) / 2)
      )
      return options.transcribe(pcm)
    },
    speak: async (text) => {
      try {
        const speech = await options.synthesize(text.slice(0, 1500))
        return await ffmpeg(
          [
            '-f',
            's16le',
            '-ar',
            String(speech.rate),
            '-ac',
            '1',
            '-i',
            'pipe:0',
            '-c:a',
            'libopus',
            '-f',
            'ogg',
            'pipe:1'
          ],
          speech.pcm
        )
      } catch {
        return null
      }
    },
    save: (name, bytes) => {
      const dir = join(ATTACHMENTS_DIR, 'telegram')
      mkdirSync(dir, { recursive: true, mode: 0o700 })
      const path = join(dir, `${Date.now()}-${name}`)
      writeFileSync(path, bytes, { mode: 0o600 })
      return path
    },
    answer: (id, decision) => options.chat()?.answerRemote(id, decision, 'phone') ?? false,
    locked: options.locked,
    afterMs: () => getConfig().phoneAfterSeconds * 1000,
    offset: () => offset,
    setOffset: (next) => {
      offset = next
      writeOffset(next)
    },
    log: (message) => console.warn(`[wisp] telegram: ${message}`)
  })

  options.chat()?.onTurnEnd((conversation) => {
    const resolve = waiting.get(conversation.id)
    if (!resolve) return
    waiting.delete(conversation.id)
    resolve(lastReply(conversation.history.events()))
  })
  // As tarefas e o batimento entregam aqui também (Fase 83).
  channels.telegram = (title, text) => void bot.notify(title, text).catch(() => undefined)

  void load().then(() => bot.start())

  const status = (): TelegramStatus => {
    const config = getConfig()
    return {
      hasToken: api !== null,
      botName,
      enabled: config.telegram,
      user:
        config.telegramUser !== null
          ? (config.telegramUserName ?? String(config.telegramUser))
          : null,
      voiceReply: config.telegramVoiceReply
    }
  }

  ipcMain.handle(IPC.telegramStatus, async (event) => {
    if (!options.isSender(event.sender)) return null
    if (api && !botName)
      botName = await api
        .getMe()
        .then((me) => (me.username ? `@${me.username}` : (me.first_name ?? null)))
        .catch(() => null)
    return status()
  })
  ipcMain.handle(IPC.telegramToken, async (event, token: unknown) => {
    if (!options.isSender(event.sender)) return { ok: false, message: t('pedido inválido') }
    const value = typeof token === 'string' ? token.trim() : ''
    if (!/^\d{5,15}:[\w-]{30,60}$/.test(value)) {
      return {
        ok: false,
        message: t('Isso não parece a ficha de um bot (números, dois-pontos e letras).')
      }
    }
    const candidate = new TelegramApi(value, base)
    try {
      const me = await candidate.getMe()
      await storeSecret(TELEGRAM_SECRET, 'Wisp: bot do Telegram', value)
      api = candidate
      botName = me.username ? `@${me.username}` : (me.first_name ?? null)
      options.notify()
      return {
        ok: true,
        message: t('Bot {name} guardado. Agora, pareie o seu usuário.', { name: botName ?? '' })
      }
    } catch (err) {
      return {
        ok: false,
        message: t('O Telegram recusou a ficha: {error}', { error: (err as Error).message })
      }
    }
  })
  ipcMain.handle(IPC.telegramPair, (event) => {
    if (!options.isSender(event.sender) || !api) return null
    return bot.newPairCode()
  })
  ipcMain.handle(IPC.telegramForget, async (event) => {
    if (!options.isSender(event.sender)) return false
    await deleteSecret(TELEGRAM_SECRET).catch(() => undefined)
    api = null
    botName = null
    updateConfig({ telegram: false, telegramUser: null, telegramUserName: null })
    notifyConfigChange()
    options.notify()
    return true
  })

  return {
    bot,
    onChatEvent: (event) => {
      if (event.type === 'permission-request') bot.request(event.id, event.toolName, event.input)
      else if (event.type === 'permission-resolved') bot.resolved(event.id)
    },
    dispose: () => {
      bot.dispose()
      delete channels.telegram
    }
  }
}
