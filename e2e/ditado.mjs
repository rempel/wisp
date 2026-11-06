// Ditar em qualquer programa (Fase 53), de ponta a ponta no X: o atalho do ditado de verdade
// (Ctrl+Alt+D, pelo xdotool), o microfone falso do Chromium e um whisper.cpp falso; o que foi
// "dito", com as trocas aplicadas, vai para a área de transferência e o Wisp aperta o Ctrl+V (um
// xdotool de mentira, no PATH do app, anota o que estava copiado na hora); depois, a área de
// transferência volta a ser a de antes. Nada vai para a conversa.
// Uso: node e2e/ditado.mjs (veja e2e/run.sh); precisa do xdotool e do xclip.
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, ROOT, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

let xdotool = ''
try {
  xdotool = execFileSync('which', ['xdotool']).toString().trim()
  execFileSync('xclip', ['-version'], { stdio: 'ignore' })
} catch {
  console.log('sem o xdotool ou o xclip: pulado')
  process.exit(0)
}

const { check, failed } = checks()
const home = testHome({
  whisperPath: join(ROOT, 'test/fixtures/fake-whisper'),
  whisperModel: '~/ggml-base.bin',
  dictationShortcut: 'Ctrl+Alt+D',
  dictationReplacements: [{ from: 'uisp', to: 'Wisp' }]
})
writeFileSync(join(home.home, 'ggml-base.bin'), 'modelo de mentira')

// Um tom de 1 s e 2 s de silêncio: a "fala" e o fim dela.
const rate = 16000
const pcm = new Int16Array(rate * 3)
for (let i = 0; i < rate; i++) pcm[i] = Math.round(Math.sin((2 * Math.PI * 300 * i) / rate) * 9000)
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
const wav = join(home.home, 'fala.wav')
writeFileSync(wav, Buffer.concat([header, data]))

// O xdotool de mentira do app: anota os argumentos e o que estava copiado.
const bin = join(home.home, 'bin')
mkdirSync(bin, { recursive: true })
const pasted = join(home.home, 'colado.log')
writeFileSync(
  join(bin, 'xdotool'),
  `#!/bin/sh\necho "$*|$(xclip -o -selection clipboard)" >> ${JSON.stringify(pasted)}\n`
)
chmodSync(join(bin, 'xdotool'), 0o755)

const copy = (text) =>
  spawnSync('xclip', ['-selection', 'clipboard', '-i'], {
    input: text,
    stdio: ['pipe', 'ignore', 'ignore'],
    timeout: 5000
  })
const clipboardNow = () =>
  spawnSync('xclip', ['-o', '-selection', 'clipboard'], { encoding: 'utf8', timeout: 5000 }).stdout

const mascot = await startApp(
  home,
  { FAKE_WHISPER_TEXT: 'abra o uisp, por favor', PATH: `${bin}:${process.env.PATH}` },
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
copy('o que estava copiado')
await sleep(500)

console.log('== Segurar o atalho, falar e soltar')
execFileSync(xdotool, ['keydown', 'ctrl+alt+d'])
await sleep(1800)
execFileSync(xdotool, ['keyup', 'ctrl+alt+d'])
const log = await waitFor(() => (existsSync(pasted) ? readFileSync(pasted, 'utf8') : null), 15000)
check('D1 o Wisp aperta o Ctrl+V', /key --clearmodifiers ctrl\+v/.test(log ?? ''), log)
check(
  'D2 com o que foi dito, já com a troca, copiado',
  /\|abra o Wisp, por favor/.test(log ?? ''),
  log
)
const restored = await waitFor(() => clipboardNow() === 'o que estava copiado', 5000)
check('D3 a área de transferência volta a ser a de antes', !!restored, clipboardNow())
check(
  'D4 nada vai para a conversa',
  (await ev(`document.querySelectorAll('.pane .msg.user').length`)) === 0 &&
    (await ev(`document.querySelector('.pane .composer textarea').value`)) === ''
)
check(
  'D5 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
