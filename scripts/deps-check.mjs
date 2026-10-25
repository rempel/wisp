#!/usr/bin/env node
// Confere as dependências no CI (Fase 28): falhas de segurança conhecidas (npm audit), o Electron
// e o Claude Code. O resultado vira avisos no GitHub (anotações) e uma tabela no resumo do job;
// nada aqui derruba o CI. Uso: node scripts/deps-check.mjs (depois do npm ci).
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { assess, summary } from './deps.mjs'

const root = new URL('..', import.meta.url).pathname

/** A saída de um comando do npm (null se ele falhar ou sem rede). */
function npm(args) {
  try {
    return execFileSync('npm', args, { cwd: root, encoding: 'utf8', timeout: 120_000 })
  } catch (err) {
    // O npm audit sai com erro quando acha falhas, mas a saída vale.
    return err.stdout ? String(err.stdout) : null
  }
}

function json(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const audit = json(npm(['audit', '--omit=dev', '--json']) ?? '')?.metadata?.vulnerabilities ?? null
const electron = {
  current: JSON.parse(readFileSync(join(root, 'node_modules/electron/package.json'), 'utf8'))
    .version,
  latest: npm(['view', 'electron', 'dist-tags.latest'])?.trim() || null
}
const minimum = /MIN_CLAUDE = '([^']+)'/.exec(
  readFileSync(join(root, 'src/main/diagnostics.ts'), 'utf8')
)?.[1]
const claude = {
  minimum: minimum ?? '?',
  latest: npm(['view', '@anthropic-ai/claude-code', 'version'])?.trim() || null
}

const facts = { audit, electron, claude }
const notes = assess(facts)
for (const note of notes) console.log(`::${note.level} title=${note.title}::${note.message}`)
const text = summary(facts, notes)
console.log(text)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text)
