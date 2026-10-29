// O essencial no Windows (Fase 33), no que dá para conferir em qualquer sistema: achar o claude
// (o .exe antes do .cmd, nunca o script do sh sem extensão), rodar o atalho .cmd do npm pelo
// node.exe com o cli.js (sem shell), um script do Node pelo node, o nome do PATH, e a resposta
// do hook do Bash que o Wisp dá quando o Claude Code o roda na forma exec.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { ASK_FOR_BASH, MODE_FILE_ENV, modeHookOutput } from '../src/main/mode-hook'
import { npmShimTarget, pathDirs, pathKey, resolveWindows, windowsLaunch } from '../src/main/win'

const NPM_SHIM = [
  '@ECHO off',
  'GOTO start',
  ':find_dp0',
  'SET dp0=%~dp0',
  'EXIT /b',
  ':start',
  'SETLOCAL',
  'CALL :find_dp0',
  'IF EXIST "%dp0%\\node.exe" (',
  '  SET "_prog=%dp0%\\node.exe"',
  ') ELSE (',
  '  SET "_prog=node"',
  ')',
  'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*'
].join('\r\n')

function folder(name: string, files: Record<string, string>): string {
  const dir = join(HOME, name)
  mkdirSync(dir, { recursive: true })
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(join(dir, file, '..'), { recursive: true })
    writeFileSync(join(dir, file), text)
  }
  return dir
}

test('o PATH, que no Windows se chama Path', () => {
  assert.equal(pathKey({ Path: 'a' }), 'Path')
  assert.equal(pathKey({ PATH: 'a' }), 'PATH')
  assert.equal(pathKey({}), 'PATH')
  const sep = process.platform === 'win32' ? ';' : ':'
  assert.deepEqual(pathDirs({ Path: ['a', '', 'b'].join(sep) }), ['a', 'b'])
})

test('achar o claude: o .exe antes do .cmd, e nunca o script do sh sem extensão', () => {
  const both = folder('ambos', { 'claude.exe': '', 'claude.cmd': NPM_SHIM, claude: '#!/bin/sh' })
  const npm = folder('npm', { 'claude.cmd': NPM_SHIM, claude: '#!/bin/sh' })
  const sh = folder('sh', { claude: '#!/bin/sh' })
  assert.equal(resolveWindows('claude', [sh, both]), join(both, 'claude.exe'))
  assert.equal(resolveWindows('claude', [sh, npm]), join(npm, 'claude.cmd'))
  assert.equal(resolveWindows('claude', [sh]), null)
  // Um caminho: com a extensão, ou o arquivo como está (o claudePath do config.json).
  assert.equal(resolveWindows(join(npm, 'claude'), []), join(npm, 'claude.cmd'))
  assert.equal(resolveWindows(join(sh, 'claude'), []), join(sh, 'claude'))
  assert.equal(resolveWindows(join(both, 'claude.exe'), []), join(both, 'claude.exe'))
})

test('o atalho .cmd do npm roda o cli.js pelo node.exe, sem shell', () => {
  assert.equal(
    npmShimTarget(join('C', 'npm', 'claude.cmd'), NPM_SHIM),
    join('C', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js')
  )
  assert.equal(
    npmShimTarget(join('C', 'pnpm', 'claude.cmd'), '"%~dp0\\..\\claude-code\\cli.mjs" %*'),
    join('C', 'pnpm', '..', 'claude-code', 'cli.mjs')
  )
  assert.equal(npmShimTarget('x.cmd', '@echo off\r\nnotepad.exe %*'), null)

  const cli = join('node_modules', '@anthropic-ai', 'claude-code', 'cli.js')
  // Com o node.exe ao lado do atalho (o npm do instalador do Node).
  const beside = folder('npm-node', { 'claude.cmd': NPM_SHIM, 'node.exe': '', [cli]: '' })
  assert.deepEqual(windowsLaunch(join(beside, 'claude.cmd'), ['-p', 'oi'], { PATH: '' }), {
    command: join(beside, 'node.exe'),
    args: [join(beside, cli), '-p', 'oi']
  })
  // Com o node.exe no PATH.
  const shim = folder('npm-path', { 'claude.cmd': NPM_SHIM, [cli]: '' })
  const nodeDir = folder('nodejs', { 'node.exe': '' })
  assert.deepEqual(windowsLaunch(join(shim, 'claude.cmd'), ['-p'], { Path: nodeDir }), {
    command: join(nodeDir, 'node.exe'),
    args: [join(shim, cli), '-p']
  })
  // Sem Node nenhum: o Electron do próprio Wisp, como Node.
  const alone = windowsLaunch(join(shim, 'claude.cmd'), ['-p'], { PATH: '' })
  assert.equal(alone.command, process.execPath)
  assert.deepEqual(alone.env, { ELECTRON_RUN_AS_NODE: '1' })
  // Um atalho que aponta para um cli.js que não existe vai como está (e o erro aparece).
  const broken = folder('npm-quebrado', { 'claude.cmd': NPM_SHIM })
  assert.deepEqual(windowsLaunch(join(broken, 'claude.cmd'), ['-p'], { PATH: nodeDir }), {
    command: join(broken, 'claude.cmd'),
    args: ['-p']
  })
})

test('o .exe roda direto, e um script do Node pelo node', () => {
  assert.deepEqual(windowsLaunch('C:\\bin\\claude.exe', ['-p'], {}), {
    command: 'C:\\bin\\claude.exe',
    args: ['-p']
  })
  const nodeDir = folder('node-script', { 'node.exe': '' })
  const scripts = folder('scripts', {
    'fake-claude': '#!/usr/bin/env node\nconsole.log(1)\n',
    'sh-claude': '#!/bin/sh\necho 1\n'
  })
  assert.deepEqual(windowsLaunch(join(scripts, 'fake-claude'), ['--version'], { PATH: nodeDir }), {
    command: join(nodeDir, 'node.exe'),
    args: [join(scripts, 'fake-claude'), '--version']
  })
  assert.deepEqual(windowsLaunch(join(scripts, 'sh-claude'), ['-p'], { PATH: nodeDir }), {
    command: join(scripts, 'sh-claude'),
    args: ['-p']
  })
})

test('o hook do Bash: pede em todo modo, menos no Automático', () => {
  const dir = folder('modos', { pedir: 'default\n', auto: 'auto\n', plano: 'plan' })
  const run = (file?: string): string =>
    modeHookOutput(file ? { [MODE_FILE_ENV]: join(dir, file) } : {})
  assert.equal(run('pedir'), ASK_FOR_BASH)
  assert.equal(run('plano'), ASK_FOR_BASH)
  assert.equal(run('auto'), '')
  // Sem o arquivo (ou sem a variável), pede: na dúvida, o card.
  assert.equal(run('sumiu'), ASK_FOR_BASH)
  assert.equal(run(), ASK_FOR_BASH)
  assert.match(ASK_FOR_BASH, /"permissionDecision":"ask"/)
})
