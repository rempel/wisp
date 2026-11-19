// O Wisp no Telegram (Fase 85), contra uma Bot API de mentira (um servidor HTTP local): o
// pareamento (só com o código, e só o seu usuário depois), as mensagens para a Wisp e as
// respostas, os comandos, os áudios, as fotos, o que chegou com o Wisp fechado, os cards (Permitir
// uma vez e Negar, com as regras do ntfy) e os avisos das tarefas.
import './helpers/home'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import {
  commandPrompt,
  helpText,
  splitMessage,
  TelegramApi,
  TelegramBot
} from '../src/main/telegram'
import type { TelegramDeps, TgUpdate, TgUser } from '../src/main/telegram'

interface Sent {
  method: string
  body: Record<string, unknown>
}

/** Uma Bot API de mentira: guarda o que o Wisp mandou e devolve o que o teste pôs. */
async function fakeApi(): Promise<{
  base: string
  sent: Sent[]
  updates: TgUpdate[]
  close(): void
}> {
  const sent: Sent[] = []
  const updates: TgUpdate[] = []
  let messageId = 100
  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const url = req.url ?? ''
      if (url.startsWith('/file/')) {
        res.end(Buffer.from(`bytes de ${url.split('/').pop()}`))
        return
      }
      const method = url.split('/').pop() ?? ''
      const raw = Buffer.concat(chunks)
      let body: Record<string, unknown>
      try {
        body = JSON.parse(raw.toString('utf8'))
      } catch {
        body = { multipart: raw.length }
      }
      if (!url.startsWith('/botTOKEN:')) {
        res.writeHead(401).end(JSON.stringify({ ok: false, description: 'Unauthorized' }))
        return
      }
      sent.push({ method, body })
      const reply = (result: unknown): void => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, result }))
      }
      if (method === 'getMe') reply({ id: 1, first_name: 'Wisp', username: 'meu_wisp_bot' })
      else if (method === 'getUpdates') reply(updates.splice(0))
      else if (method === 'getFile') reply({ file_path: `voz/${String(body.file_id)}.oga` })
      else if (method === 'sendMessage') reply({ message_id: ++messageId })
      else reply(true)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  return { base: `http://127.0.0.1:${port}`, sent, updates, close: () => server.close() }
}

const NOW = 1_800_000_000_000
const ME = { id: 42, first_name: 'Gabriel', username: 'gabriel' }
const STRANGER = { id: 99, first_name: 'Outro' }
let nextUpdate = 1
const message = (from: { id: number }, fields: Record<string, unknown>, ageMs = 0): TgUpdate => ({
  update_id: nextUpdate++,
  message: {
    message_id: nextUpdate,
    date: Math.floor((NOW - ageMs) / 1000),
    from: from as TgUser,
    chat: { id: from.id },
    ...fields
  }
})

function bot(
  api: TelegramApi,
  overrides: Partial<TelegramDeps> = {}
): {
  bot: TelegramBot
  asked: [string, string[], boolean][]
  calls: string[]
  state: { user: number | null }
} {
  const asked: [string, string[], boolean][] = []
  const calls: string[] = []
  const state = { user: null as number | null }
  let offset = 0
  const instance = new TelegramBot({
    api: () => api,
    enabled: () => state.user !== null,
    user: () => state.user,
    paired: (user) => {
      state.user = user.id
      calls.push(`pareou ${user.id}`)
    },
    voiceReply: () => 'audio',
    ask: async (text, files, voice) => {
      asked.push([text, files.map((file) => file.path), voice])
      return `Resposta para: ${text}`
    },
    reset: () => calls.push('novo'),
    transcribe: async (ogg) => `transcrito (${ogg.toString('utf8')})`,
    speak: async (text) => Buffer.from(`ogg de ${text}`),
    save: (name, bytes) => {
      calls.push(`guardou ${name}: ${bytes.toString('utf8')}`)
      return `/anexos/${name}`
    },
    answer: (id, decision) => {
      calls.push(`${decision} ${id}`)
      return true
    },
    locked: () => false,
    afterMs: () => 60_000,
    offset: () => offset,
    setOffset: (next) => (offset = next),
    now: () => NOW,
    ...overrides
  })
  return { bot: instance, asked, calls, state }
}

const texts = (sent: Sent[]): string[] =>
  sent.filter((item) => item.method === 'sendMessage').map((item) => String(item.body.text))

test('telegram: as mensagens longas se dividem, e os comandos viram pedidos', () => {
  const long = Array.from({ length: 300 }, (_, i) => `linha ${i} com algum texto`).join('\n')
  const parts = splitMessage(long, 1000)
  assert.ok(parts.length > 5)
  assert.ok(parts.every((part) => part.length <= 1000))
  assert.equal(parts.join('\n'), long)
  assert.equal(commandPrompt('/agenda'), 'Quais são os meus compromissos de hoje e de amanhã?')
  assert.equal(commandPrompt('/tarefas@meu_wisp_bot'), 'Quais tarefas eu tenho agendadas?')
  assert.equal(commandPrompt('/lembrar comprar pão às 18h'), 'Me lembra: comprar pão às 18h')
  assert.equal(commandPrompt('/lembrar'), null)
  assert.equal(commandPrompt('/qualquer'), null)
  assert.match(helpText(), /\/novo/)
})

test('telegram: a API fala com o Telegram e nunca põe a ficha nos erros', async () => {
  const fake = await fakeApi()
  try {
    const api = new TelegramApi('TOKEN:abc', fake.base)
    assert.equal((await api.getMe()).username, 'meu_wisp_bot')
    assert.equal((await api.sendMessage(42, 'oi')).message_id, 101)
    assert.equal((await api.download('voz1')).toString('utf8'), 'bytes de voz1.oga')
    await api.sendVoice(42, Buffer.from('ogg'))
    assert.ok(
      fake.sent.some((item) => item.method === 'sendVoice' && Number(item.body.multipart) > 0)
    )
    const wrong = new TelegramApi('ERRADA:1', fake.base)
    await assert.rejects(
      wrong.getMe(),
      (err: Error) => /Unauthorized/.test(err.message) && !/ERRADA/.test(err.message)
    )
  } finally {
    fake.close()
  }
})

test('telegram: só o código pareia; depois, só o seu usuário é atendido', async () => {
  const fake = await fakeApi()
  try {
    const api = new TelegramApi('TOKEN:abc', fake.base)
    const { bot: instance, asked, calls, state } = bot(api)
    await instance.handle([message(STRANGER, { text: 'oi' })])
    assert.deepEqual(asked, [])
    assert.deepEqual(texts(fake.sent), [], 'sem pareamento, não responde a ninguém')
    const code = instance.newPairCode()
    assert.match(code, /^\d{6}$/)
    await instance.handle([
      message(ME, { text: '000000x' }),
      message(ME, { text: `/start ${code}` })
    ])
    assert.equal(state.user, 42)
    assert.deepEqual(calls, ['pareou 42'])
    assert.match(texts(fake.sent)[0], /^Pareado com o Wisp/)
    // O mesmo código não vale de novo, e quem não é você continua sem resposta.
    await instance.handle([message(STRANGER, { text: code }), message(STRANGER, { text: 'oi' })])
    assert.equal(state.user, 42)
    assert.deepEqual(asked, [])
  } finally {
    fake.close()
  }
})

test('telegram: a mensagem vai para a Wisp e a resposta volta; os comandos e o ocupado', async () => {
  const fake = await fakeApi()
  try {
    const api = new TelegramApi('TOKEN:abc', fake.base)
    const { bot: instance, asked, calls, state } = bot(api)
    state.user = 42
    await instance.handle([
      message(ME, { text: 'Que horas são em Tóquio?' }),
      message(ME, { text: '/agenda' }),
      message(ME, { text: '/novo' }),
      message(ME, { text: '/ajuda' }),
      message(ME, { text: '/inventado' })
    ])
    assert.deepEqual(
      asked.map(([text]) => text),
      ['Que horas são em Tóquio?', 'Quais são os meus compromissos de hoje e de amanhã?']
    )
    assert.deepEqual(calls, ['novo'])
    const replies = texts(fake.sent)
    assert.equal(replies[0], 'Resposta para: Que horas são em Tóquio?')
    assert.equal(replies[2], 'Conversa nova na Wisp.')
    assert.match(replies[3], /^Sou o Wisp/)
    assert.match(replies[4], /^Não conheço esse comando/)
    // A Wisp ocupada: avisa para mandar de novo.
    const busy = bot(api, { ask: async () => null })
    busy.state.user = 42
    fake.sent.length = 0
    await busy.bot.handle([message(ME, { text: 'oi' })])
    assert.match(texts(fake.sent)[0], /Ainda estou respondendo/)
  } finally {
    fake.close()
  }
})

test('telegram: áudio vira texto (e a resposta, áudio); foto e arquivo viram anexos', async () => {
  const fake = await fakeApi()
  try {
    const api = new TelegramApi('TOKEN:abc', fake.base)
    const { bot: instance, asked, calls, state } = bot(api)
    state.user = 42
    await instance.handle([message(ME, { voice: { file_id: 'voz9' } })])
    assert.deepEqual(asked[0], ['transcrito (bytes de voz9.oga)', [], true])
    assert.ok(
      fake.sent.some((item) => item.method === 'sendVoice'),
      'pergunta em áudio, resposta em áudio'
    )
    assert.equal(
      texts(fake.sent).length,
      0,
      'e só em áudio, no modo "áudio quando você manda áudio"'
    )
    fake.sent.length = 0
    await instance.handle([
      message(ME, {
        caption: 'O que é isto?',
        photo: [
          { file_id: 'pequena', width: 90, height: 90 },
          { file_id: 'grande', width: 1280, height: 960 }
        ]
      }),
      message(ME, { document: { file_id: 'doc1', file_name: '../../relatório final.pdf' } })
    ])
    assert.match(calls.join('\n'), /guardou telegram-\d+\.jpg: bytes de grande\.oga/)
    assert.match(
      calls.join('\n'),
      /guardou \.\._\.\._relat_rio final\.pdf|guardou .*relat.rio final\.pdf/
    )
    assert.equal(asked[1][0], 'O que é isto?')
    assert.equal(asked[1][1].length, 1)
    assert.equal(asked[2][0], '', 'só o arquivo, sem texto')
    assert.ok(texts(fake.sent).length >= 2, 'texto pergunta, texto responde')
    // Sem o Piper ou o ffmpeg, a resposta a um áudio vai em texto.
    const mute = bot(api, { speak: async () => null })
    mute.state.user = 42
    fake.sent.length = 0
    await mute.bot.handle([message(ME, { voice: { file_id: 'v2' } })])
    assert.equal(texts(fake.sent).length, 1)
    // Um áudio que não deu para ouvir.
    const deaf = bot(api, {
      transcribe: async () => {
        throw new Error('falta o ffmpeg')
      }
    })
    deaf.state.user = 42
    fake.sent.length = 0
    await deaf.bot.handle([message(ME, { voice: { file_id: 'v3' } })])
    assert.match(texts(fake.sent)[0], /Não consegui ouvir o áudio: falta o ffmpeg/)
  } finally {
    fake.close()
  }
})

test('telegram: o que chegou com o Wisp fechado: o recente é respondido, o velho vira resumo', async () => {
  const fake = await fakeApi()
  try {
    const api = new TelegramApi('TOKEN:abc', fake.base)
    const { bot: instance, asked, state } = bot(api)
    state.user = 42
    await instance.handle([
      message(ME, { text: 'Isto é de ontem' }, 20 * 60 * 60_000),
      message(ME, { text: 'Me lembra de comprar pão' }, 2 * 60 * 60_000)
    ])
    assert.deepEqual(
      asked.map(([text]) => text),
      ['Me lembra de comprar pão']
    )
    const replies = texts(fake.sent)
    assert.match(replies[0], /há mais de 12 horas:\n• Isto é de ontem/)
    assert.equal(replies[1], 'Eu estava desligado; respondendo agora.')
    assert.equal(replies[2], 'Resposta para: Me lembra de comprar pão')
  } finally {
    fake.close()
  }
})

test('telegram: os cards chegam com Permitir uma vez e Negar, e só você responde', async () => {
  const fake = await fakeApi()
  try {
    const api = new TelegramApi('TOKEN:abc', fake.base)
    const { bot: instance, calls, state } = bot(api)
    state.user = 42
    // Conversando pelo Telegram: o card vai na hora.
    await instance.handle([message(ME, { text: 'abre o projeto' })])
    fake.sent.length = 0
    instance.request('card1', 'Bash', { command: 'ls -la' })
    await new Promise((resolve) => setTimeout(resolve, 100))
    const card = fake.sent.find((item) => item.method === 'sendMessage')
    assert.ok(card)
    assert.match(String(card.body.text), /O Claude quer rodar um comando\n\nls -la/)
    const buttons = (
      card.body.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] }
    ).inline_keyboard[0]
    assert.deepEqual(
      buttons.map((button) => button.text),
      ['Permitir uma vez', 'Negar']
    )
    // Outro usuário apertando: nada acontece.
    await instance.handle([
      {
        update_id: nextUpdate++,
        callback_query: { id: 'q0', from: STRANGER, data: buttons[0].callback_data }
      }
    ])
    assert.deepEqual(calls, [])
    await instance.handle([
      {
        update_id: nextUpdate++,
        callback_query: { id: 'q1', from: ME, data: buttons[0].callback_data }
      }
    ])
    assert.deepEqual(calls, ['allow card1'])
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.ok(
      fake.sent.some(
        (item) => item.method === 'editMessageText' && item.body.text === 'Permitido (uma vez).'
      )
    )
    // Apertar de novo: já foi.
    await instance.handle([
      {
        update_id: nextUpdate++,
        callback_query: { id: 'q2', from: ME, data: buttons[0].callback_data }
      }
    ])
    assert.deepEqual(calls, ['allow card1'])
    // Um comando com segredos: só dá para negar.
    fake.sent.length = 0
    instance.request('card2', 'Bash', { command: 'cat ~/.ssh/id_ed25519' })
    await new Promise((resolve) => setTimeout(resolve, 100))
    const secret = fake.sent.find((item) => item.method === 'sendMessage')
    const only = (secret?.body.reply_markup as { inline_keyboard: { text: string }[][] })
      .inline_keyboard[0]
    assert.deepEqual(
      only.map((button) => button.text),
      ['Negar']
    )
    // Respondido no computador: a mensagem diz, e os botões somem.
    instance.resolved('card2')
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.ok(
      fake.sent.some(
        (item) =>
          item.method === 'editMessageText' && item.body.text === 'Respondido no computador.'
      )
    )
    instance.dispose()
  } finally {
    fake.close()
  }
})

test('telegram: sem conversa recente, o card espera; os avisos das tarefas vão para você', async () => {
  const fake = await fakeApi()
  try {
    const api = new TelegramApi('TOKEN:abc', fake.base)
    const { bot: instance, state } = bot(api, { afterMs: () => 50 })
    state.user = 42
    instance.request('card3', 'Edit', { file_path: '/home/x/app.ts' })
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(texts(fake.sent).length, 0, 'ainda esperando o tempo')
    await new Promise((resolve) => setTimeout(resolve, 150))
    assert.match(texts(fake.sent)[0], /O Claude quer editar um arquivo\n\napp\.ts/)
    assert.equal(await instance.notify('Batimento das 08:00', 'Reunião às 9h'), true)
    assert.equal(texts(fake.sent)[1], 'Batimento das 08:00\n\nReunião às 9h')
    state.user = null
    assert.equal(await instance.notify('x', 'y'), false, 'sem pareamento, não manda')
    instance.dispose()
  } finally {
    fake.close()
  }
})
