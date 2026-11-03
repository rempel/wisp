// Segurar para falar no Windows (Fase 40): a tecla de cada atalho no código virtual do Windows, o
// vigia que pergunta ao script se ela ainda está apertada (com um script de mentira, em qualquer
// sistema) e o script de verdade, só no Windows, com uma tecla apertada e solta pelo próprio teste.
import './helpers/home'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { test } from 'node:test'
import { KeyWatcher, acceleratorVirtualKey } from '../src/main/keys-win'

const windowsOnly = { skip: process.platform !== 'win32' && 'só no Windows' }

test('a tecla de um atalho no código virtual do Windows', () => {
  assert.equal(acceleratorVirtualKey('Ctrl+Alt+Space'), 0x20)
  assert.equal(acceleratorVirtualKey('Ctrl+Alt+W'), 0x57)
  assert.equal(acceleratorVirtualKey('Super+w'), 0x57)
  assert.equal(acceleratorVirtualKey('Ctrl+Shift+7'), 0x37)
  assert.equal(acceleratorVirtualKey('Alt+F1'), 0x70)
  assert.equal(acceleratorVirtualKey('F24'), 0x87)
  assert.equal(acceleratorVirtualKey('Ctrl+num5'), 0x65)
  assert.equal(acceleratorVirtualKey('Ctrl+PageDown'), 0x22)
  assert.equal(acceleratorVirtualKey('Ctrl + Alt + Esc'), 0x1b)
  // A pontuação muda de lugar conforme o teclado: sem ela, o atalho fica no toque.
  assert.equal(acceleratorVirtualKey('Ctrl+,'), null)
  assert.equal(acceleratorVirtualKey('Ctrl+F25'), null)
  assert.equal(acceleratorVirtualKey(''), null)
})

/** Um script de mentira: guarda o que entra e responde o que o teste mandar. */
function fakeScript(): {
  child: ChildProcessWithoutNullStreams
  input: string[]
  say(line: string): void
  exit(): void
} {
  const child = new EventEmitter() as unknown as ChildProcessWithoutNullStreams
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const input: string[] = []
  stdin
    .setEncoding('utf8')
    .on('data', (chunk: string) => input.push(...chunk.split('\n').filter(Boolean)))
  Object.assign(child, {
    stdin,
    stdout,
    stderr: new PassThrough(),
    kill: () => child.emit('exit', null, 'SIGTERM')
  })
  return {
    child,
    input,
    say: (line) => stdout.write(`${line}\r\n`),
    exit: () => child.emit('exit', 1, null)
  }
}

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

test('o vigia da tecla: pergunta no aperto, avisa uma vez quando solta e abre o script uma vez só', async () => {
  const script = fakeScript()
  let opened = 0
  let released = 0
  let broken = 0
  const watcher = new KeyWatcher(0x20, {
    release: () => released++,
    broken: () => broken++,
    spawn: () => {
      opened++
      return script.child
    }
  })
  assert.equal(opened, 0, 'o script só abre no primeiro aperto')
  watcher.start()
  // A repetição do teclado chama de novo com a tecla presa: a pergunta já está feita.
  watcher.start()
  watcher.start()
  await tick()
  assert.deepEqual(script.input, ['32'])
  script.say('pronto')
  await tick()
  assert.equal(released, 0, '"pronto" não é soltar')
  script.say('solta')
  await tick()
  assert.equal(released, 1)
  // Um "solta" fora de hora (sem aperto) não conta.
  script.say('solta')
  await tick()
  assert.equal(released, 1)
  // O próximo aperto usa o mesmo script.
  watcher.start()
  await tick()
  assert.deepEqual(script.input, ['32', '32'])
  assert.equal(opened, 1)
  script.say('solta')
  await tick()
  assert.equal(released, 2)
  // Fechar não é cair: nada de "quebrado".
  watcher.stop()
  assert.equal(broken, 0)
})

test('o vigia da tecla: o script que cai no meio solta a tecla, e o atalho volta ao toque', async () => {
  const script = fakeScript()
  let opened = 0
  let released = 0
  let broken = 0
  const watcher = new KeyWatcher(0x57, {
    release: () => released++,
    broken: () => broken++,
    spawn: () => {
      opened++
      return script.child
    }
  })
  watcher.start()
  await tick()
  script.exit()
  assert.equal(released, 1, 'a escuta em curso acaba')
  assert.equal(broken, 1)
  // Depois de cair, não tenta de novo a cada aperto.
  watcher.start()
  assert.equal(opened, 1)
  assert.equal(released, 1)

  // Um script que nem abre também conta como quebrado.
  let failed = 0
  const never = new KeyWatcher(0x57, {
    release: () => undefined,
    broken: () => failed++,
    spawn: () => {
      throw new Error('sem PowerShell')
    }
  })
  never.start()
  never.start()
  assert.equal(failed, 1)
})

test(
  'o script da tecla no Windows: espera a tecla presa e avisa quando ela é solta',
  windowsOnly,
  async () => {
    const { runPowerShell } = await import('../src/main/powershell')
    // F24 não existe na maioria dos teclados: apertar e soltar pelo teste não atrapalha ninguém.
    const F24 = 0x87
    const press = (up: boolean): Promise<unknown> =>
      runPowerShell(
        "Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public static class Aperto { " +
          '[DllImport("user32.dll")] public static extern void keybd_event(byte v, byte s, int f, System.UIntPtr e); }\'; ' +
          `[Aperto]::keybd_event(${F24}, 0, ${up ? 2 : 0}, [System.UIntPtr]::Zero)`
      )
    let released = 0
    let broken = 0
    const watcher = new KeyWatcher(F24, {
      release: () => released++,
      broken: () => broken++
    })
    try {
      // Sem a tecla apertada, a resposta vem logo (o script compila o C# na primeira vez).
      let started = Date.now()
      watcher.start()
      while (!released && !broken && Date.now() - started < 20000)
        await new Promise((r) => setTimeout(r, 50))
      console.log(`sem a tecla: solta em ${Date.now() - started} ms`)
      assert.equal(broken, 0, 'o script abriu')
      assert.equal(released, 1)
      // Com a tecla presa, ele espera; solta, ele avisa.
      await press(false)
      watcher.start()
      await new Promise((r) => setTimeout(r, 1000))
      const held = released === 1
      console.log(
        `com a tecla presa: ${held ? 'esperou' : 'não esperou (o Windows do CI não segurou a tecla)'}`
      )
      started = Date.now()
      await press(true)
      while (released < 2 && Date.now() - started < 10000)
        await new Promise((r) => setTimeout(r, 30))
      console.log(`solta em ${Date.now() - started} ms depois do soltar`)
      assert.equal(released, 2)
      assert.ok(held, 'esperou a tecla presa')
      assert.equal(broken, 0)
    } finally {
      await press(true)
      watcher.stop()
    }
  }
)
