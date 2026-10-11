// O registro em arquivo: no máximo 1 MB (o atual e o anterior), sem comandos, URLs nem segredos,
// e o terminal continua recebendo tudo.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  installLog,
  LOG_FILE_LIMIT,
  LOG_PATH,
  logEntry,
  redact,
  RotatingLog
} from '../src/main/log'

test('o arquivo fica em ~/.local/state/wisp', () => {
  assert.equal(LOG_PATH, join(HOME, '.local/state/wisp/wisp.log'))
})

test('URLs somem; caminhos (e file://) ficam, com ~ no lugar da pasta pessoal', () => {
  assert.equal(
    redact('abrindo https://exemplo.com/busca?q=segredo e http://localhost:8080/x', '/home/u'),
    'abrindo <url> e <url>'
  )
  assert.equal(redact('ws://127.0.0.1:4567/mcp', '/home/u'), '<url>')
  assert.equal(redact('veja www.exemplo.com.br/pagina', '/home/u'), 'veja <url>')
  assert.equal(
    redact('erro em file:///opt/Wisp/resources/app/out/main/index.js:10', '/home/u'),
    'erro em file:///opt/Wisp/resources/app/out/main/index.js:10'
  )
  assert.equal(
    redact('não consegui ler /home/u/.config/wisp/sons/oi.wav', '/home/u'),
    'não consegui ler ~/.config/wisp/sons/oi.wav'
  )
})

test('comandos somem: o campo command do stream-json, o "Command failed" e os argumentos', () => {
  assert.equal(
    redact('linha inesperada: {"name":"Bash","input":{"command":"rm -rf \\"x\\" && curl y"}}', '/'),
    'linha inesperada: {"name":"Bash","input":{"command":"<omitido>"}}'
  )
  assert.equal(
    redact('Error: Command failed: git push origin main --force\nstderr', '/'),
    'Error: Command failed: <comando>\nstderr'
  )
  const inspected = `{ errno: -2, code: 'ENOENT', syscall: 'spawn codium', path: 'codium', spawnargs: [ '-n', '/home/u/projeto' ], cmd: 'codium -n /home/u/projeto' }`
  const clean = redact(inspected, '/home/u')
  assert.doesNotMatch(clean, /projeto/)
  assert.match(clean, /spawnargs: \[<omitidos>\]/)
  assert.match(clean, /cmd: '<comando>'/)
})

test('segredos somem: chaves, tokens e o token do servidor MCP', () => {
  assert.equal(redact('chave sk-ant-api03-abcdefghijklmnop', '/'), 'chave <segredo>')
  assert.equal(
    redact('Authorization: Bearer abcdefghijklmnopqrstuvwx', '/'),
    'Authorization: Bearer <segredo>'
  )
  assert.equal(redact('token=0123456789abcdef0123456789abcdef', '/'), 'token=<segredo>')
  assert.equal(redact('x-wisp-token: ' + 'a1'.repeat(24), '/'), 'x-wisp-token: <segredo>')
})

test('uma entrada: hora, nível e a mensagem limpa, cortada se for enorme', () => {
  const at = new Date('2026-10-11T12:00:00.000Z')
  assert.equal(
    logEntry('warn', ['[wisp] falhou:', new Error('https://x.y/z')], at).split('\n')[0],
    '2026-10-11T12:00:00.000Z WARN  [wisp] falhou: Error: <url>'
  )
  const long = logEntry('info', ['palavra '.repeat(1250)], at)
  assert.ok(long.length < 4200)
  assert.match(long, /… \(cortado\)\n$/)
})

test('o arquivo gira no limite: o atual e um anterior, nunca mais que o dobro do limite', () => {
  const path = join(HOME, 'giro', 'wisp.log')
  const log = new RotatingLog(path, 1000)
  for (let i = 0; i < 100; i++) log.write(`${String(i).padStart(3, '0')} ${'x'.repeat(95)}\n`)
  log.close()
  assert.ok(statSync(path).size <= 1000)
  assert.ok(statSync(`${path}.1`).size <= 1000)
  assert.ok(!existsSync(`${path}.2`))
  // As linhas mais novas estão no atual; as anteriores a elas, no .1.
  assert.match(readFileSync(path, 'utf8'), /099 x+\n$/)
  assert.equal((statSync(path).mode & 0o777).toString(8), '600')
  // Reaberto, continua contando do tamanho que já tinha.
  const again = new RotatingLog(path, 1000)
  again.write('y'.repeat(980) + '\n')
  again.close()
  assert.match(readFileSync(path, 'utf8'), /^y+\n$/)
})

test('sem como gravar: o arquivo desliga, sem erro', () => {
  // Um arquivo comum no lugar da pasta: o mkdir falha (ENOTDIR).
  writeFileSync(join(HOME, 'bloqueio'), '')
  const log = new RotatingLog(join(HOME, 'bloqueio', 'wisp.log'))
  log.write('oi\n')
  log.write('oi de novo\n')
  assert.ok(!existsSync(join(HOME, 'bloqueio', 'wisp.log')))
})

test('instalado: o console continua, e o arquivo recebe a mesma linha, limpa', () => {
  const printed: unknown[][] = []
  const original = console.warn
  console.warn = (...args: unknown[]): void => void printed.push(args)
  try {
    installLog('Wisp de teste')
    console.warn('[wisp] abrindo https://exemplo.com/a', { command: 'ls' })
  } finally {
    // O que o installLog pôs por cima chama o de teste acima; volta ao de verdade no fim.
    console.warn = original
  }
  assert.deepEqual(printed, [['[wisp] abrindo https://exemplo.com/a', { command: 'ls' }]])
  const lines = readFileSync(LOG_PATH, 'utf8').trim().split('\n')
  assert.match(lines[0], /INFO {2}--- Wisp de teste ---$/)
  assert.match(lines[1], /WARN {2}\[wisp\] abrindo <url> \{ command: 'ls' \}$/)
  assert.ok(LOG_FILE_LIMIT * 2 <= 1024 * 1024, 'no total, até 1 MB')
})
