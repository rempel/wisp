// A voz, de ponta a ponta, com o microfone falso do Chromium (tocando um WAV gerado aqui) e um
// whisper.cpp falso que imita uma versão antiga: não conhece o -sns nem lê a entrada padrão. O
// "Testar voz" das configurações grava 3 s e mostra o que entendeu, sem mandar nada para a
// conversa; o botão do microfone do painel escreve na caixa; e o registro conta como foi a
// transcrição (segundos, pico, tempo), nunca o que foi dito. Uso: node e2e/voice.mjs.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, ROOT, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const SAID = 'Testando a voz do Wisp.'
const home = testHome({
  whisperPath: join(ROOT, 'test/fixtures/fake-whisper'),
  whisperModel: '~/ggml-base.bin'
})
writeFileSync(join(home.home, 'ggml-base.bin'), 'modelo de mentira')

/** Um WAV de 16 kHz: 1 s de um tom (a "fala") e 2 s de silêncio, que o Chromium toca em loop. */
function toneWav(path) {
  const rate = 16000
  const pcm = new Int16Array(rate * 3)
  for (let i = 0; i < rate; i++)
    pcm[i] = Math.round(Math.sin((2 * Math.PI * 300 * i) / rate) * 9000)
  const data = Buffer.from(pcm.buffer)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(data.length, 40)
  writeFileSync(path, Buffer.concat([header, data]))
}
const wav = join(home.home, 'fala.wav')
toneWav(wav)
const whisperLog = join(home.home, 'whisper.log')

const mascot = await startApp(
  home,
  { FAKE_WHISPER_OLD: '1', FAKE_WHISPER_TEXT: SAID, FAKE_WHISPER_LOG: whisperLog },
  [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-audio-capture=${wav}`
  ]
)
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)

console.log('== Testar voz, nas configurações')
await ev(`document.querySelector('.header .icon-button[aria-label="Configurações"]').click()`)
await waitFor(() => ev(`!!document.querySelector('.voice-test button')`), 5000)
await ev(`document.querySelector('.voice-test button').click()`)
const recording = await waitFor(
  () => ev(`document.querySelector('.voice-test button').textContent === 'Gravando…'`),
  3000
)
check('V1 o botão mostra que está gravando', recording)
const result = await waitFor(
  () => ev(`document.querySelector('.voice-test-result')?.innerText ?? null`),
  15000
)
check('V2 mostra o que entendeu', result?.includes(`“${SAID}”`), result)
check(
  'V3 e quanto gravou, o pico e o tempo',
  /3,0 s gravados, pico de -\d+ dB, transcritos em \d+,\d s/.test(result ?? ''),
  result
)
check('V4 sem dica: o som chegou bem', !/Quase não chegou/.test(result ?? ''), result)

console.log('== O microfone do painel')
await ev(`document.querySelector('.header .icon-button[aria-label="Configurações"]').click()`)
await waitFor(() => ev(`!!document.querySelector('.pane .composer .mic')`), 5000)
await sleep(300)
await ev(`document.querySelector('.pane .composer .mic').click()`)
const draft = await waitFor(
  () => ev(`document.querySelector('.pane .composer textarea').value || null`),
  15000
)
check('V5 o que foi dito vai para a caixa', draft === SAID, draft)
check(
  'V6 nada foi mandado para a conversa',
  (await ev(`document.querySelectorAll('.pane .msg.user').length`)) === 0
)

console.log('== O whisper.cpp antigo e o registro')
const calls = readFileSync(whisperLog, 'utf8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l))
check(
  'V7 sem o -sns e com o áudio num arquivo',
  calls.length === 2 && calls.every((c) => !c.args.includes('-sns') && c.args.at(-1) !== '-'),
  JSON.stringify(calls.map((c) => c.args.slice(-3)))
)
check(
  'V8 o arquivo do áudio já foi apagado',
  readdirSync(join(home.runtime, 'wisp')).every((name) => !name.startsWith('voz-'))
)
await stopApp()
const log = readFileSync(join(home.home, '.local/state/wisp/wisp.log'), 'utf8')
check(
  'V9 o registro diz o que este whisper.cpp não aceita',
  /não conhece -sns/.test(log) && /não lê o stdin/.test(log),
  log
)
check(
  'V10 e como foi cada transcrição',
  (log.match(/voz: \d+\.\d s de áudio, pico de -\d+ dB/g) ?? []).length === 2,
  log
)
check('V11 mas nunca o que foi dito', !log.includes('Testando'))
check(
  'V12 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
