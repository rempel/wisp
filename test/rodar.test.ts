// Subir o projeto com um clique (Fase 75): os servidores lidos do .claude/launch.json ou do
// package.json, o comando numa linha (nada que o shell interprete passa) e a espera pela porta.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  commandLine,
  launchConfigs,
  packageRunner,
  parseLaunchJson,
  parsePackageJson,
  waitForPort
} from '../src/main/launch'

test('o comando numa linha: o que o shell interpretaria é recusado', () => {
  assert.equal(commandLine('npm', ['run', 'dev']), 'npm run dev')
  assert.equal(commandLine('python3', ['-m', 'http.server', '8000']), 'python3 -m http.server 8000')
  // Um argumento com espaço (ou com um caractere do shell) vai entre aspas simples, literal.
  assert.equal(commandLine('node', ['meu app.js']), "node 'meu app.js'")
  assert.equal(commandLine('npm', ['run', 'dev; rm -rf ~']), "npm run 'dev; rm -rf ~'")
  assert.equal(commandLine('echo', ['$(whoami)']), "echo '$(whoami)'")
  // Uma aspa simples fecharia as aspas; uma quebra de linha mandaria outro comando.
  assert.equal(commandLine('echo', ["a'b"]), null)
  assert.equal(commandLine('echo', ['a\nrm -rf ~']), null)
  assert.equal(commandLine('', []), null)
  assert.equal(commandLine('x', ['y'.repeat(600)]), null)
})

test('o launch.json: o nome, o comando e a porta; o que vier estranho fica de fora', () => {
  const configs = parseLaunchJson(
    JSON.stringify({
      version: '0.0.1',
      configurations: [
        { name: 'web', runtimeExecutable: 'npm', runtimeArgs: ['run', 'dev'], port: 5173 },
        { runtimeExecutable: 'cargo', runtimeArgs: ['run'], port: 99999 },
        { name: 'ruim', runtimeExecutable: 'sh', runtimeArgs: ['-c', "echo 'x'"] },
        { name: 'sem programa' },
        'texto solto'
      ]
    })
  )
  assert.deepEqual(configs, [
    { name: 'web', command: 'npm run dev', port: 5173, source: 'launch.json' },
    { name: 'cargo run', command: 'cargo run', port: null, source: 'launch.json' }
  ])
  assert.deepEqual(parseLaunchJson('não é json'), [])
  assert.deepEqual(parseLaunchJson('{"configurations": {}}'), [])
})

test('o package.json: dev, start e serve, com o gerenciador de pacotes da pasta', () => {
  const text = JSON.stringify({ scripts: { test: 'vitest', start: 'node .', dev: 'vite' } })
  assert.deepEqual(
    parsePackageJson(text, 'pnpm').map((config) => config.command),
    ['pnpm run dev', 'pnpm run start']
  )
  assert.deepEqual(parsePackageJson('{}', 'npm'), [])
  assert.equal(
    packageRunner('/p', (path) => path.endsWith('yarn.lock')),
    'yarn'
  )
  assert.equal(
    packageRunner('/p', (path) => path.endsWith('pnpm-lock.yaml')),
    'pnpm'
  )
  assert.equal(
    packageRunner('/p', (path) => path.endsWith('bun.lock')),
    'bun'
  )
  assert.equal(
    packageRunner('/p', () => false),
    'npm'
  )
})

test('os servidores de uma pasta: o launch.json vem antes do package.json', () => {
  const project = join(HOME, 'projeto')
  mkdirSync(join(project, '.claude'), { recursive: true })
  assert.deepEqual(launchConfigs(project), [])
  writeFileSync(join(project, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' } }))
  assert.deepEqual(launchConfigs(project), [
    { name: 'dev', command: 'npm run dev', port: null, source: 'package.json' }
  ])
  writeFileSync(
    join(project, '.claude', 'launch.json'),
    JSON.stringify({
      configurations: [{ name: 'api', runtimeExecutable: 'make', runtimeArgs: ['run'], port: 8080 }]
    })
  )
  assert.deepEqual(launchConfigs(project), [
    { name: 'api', command: 'make run', port: 8080, source: 'launch.json' }
  ])
  assert.deepEqual(launchConfigs(null), [])
  assert.deepEqual(launchConfigs(join(HOME, 'sumiu')), [])
})

test('a espera pela porta: responde quando o servidor sobe, desiste no prazo', async () => {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  assert.equal(await waitForPort(port, 2000, 50), true)
  await new Promise((resolve) => server.close(resolve))
  const started = Date.now()
  assert.equal(await waitForPort(port, 400, 50), false)
  assert.ok(Date.now() - started < 5000)
})
