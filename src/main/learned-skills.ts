// As skills que o Wisp aprende (Fase 86): gravar o SKILL.md de uma skill proposta (pelo Claude,
// com o card, ou pela sugestão da faxina da semana, com o seu clique) em ~/.claude/skills/<nome>.
// Uma que já existe ganha um backup ao lado antes de mudar, como todo arquivo de configuração seu.
// E a ferramenta propose_skill, que sempre pede o card.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { z } from 'zod'
import { backupFile, stamp } from './backup'
import { looksSecret } from './personal-memory'
import { claudeConfigDir } from './skills'
import { skillDraftOf, skillText } from '../shared/skill-text'
import type { SkillDraft } from '../shared/skill-text'

/** Onde fica o SKILL.md de uma skill pessoal. */
export const skillFile = (name: string, configDir = claudeConfigDir()): string =>
  join(configDir, 'skills', name, 'SKILL.md')

/** O SKILL.md de agora (null: a skill não existe). */
export function currentSkill(name: string, configDir = claudeConfigDir()): string | null {
  try {
    return readFileSync(skillFile(name, configDir), 'utf8')
  } catch {
    return null
  }
}

export type SkillWrite = { ok: true; path: string; backup?: string } | { ok: false; error: string }

/** Grava a skill (com o backup da de antes). Recusa um texto com cara de segredo. */
export function writeSkill(draft: SkillDraft, configDir = claudeConfigDir()): SkillWrite {
  const text = skillText(draft)
  if (looksSecret(text)) {
    return {
      ok: false,
      error: 'A skill parece ter um segredo (senha, ficha ou chave): tire antes.'
    }
  }
  const path = skillFile(draft.name, configDir)
  try {
    mkdirSync(join(path, '..'), { recursive: true })
    const backup = existsSync(path) ? backupFile(path, `${path}.backup-wisp-${stamp()}`) : undefined
    writeFileSync(`${path}.wisp-tmp`, text, { mode: 0o644 })
    renameSync(`${path}.wisp-tmp`, path)
    return { ok: true, path, ...(backup ? { backup } : {}) }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

const ALWAYS_LOAD = { 'anthropic/alwaysLoad': true }

/** A propose_skill no servidor `desktop`: o card (sempre) mostra o texto e a pasta. */
export function registerSkillTools(
  server: McpServer,
  configDir = (): string => claudeConfigDir()
): void {
  server.registerTool(
    'propose_skill',
    {
      title: 'Propor uma skill',
      description:
        'Cria (ou melhora) uma skill pessoal do Claude Code em ~/.claude/skills/<nome>/SKILL.md, ' +
        'para um pedido que se repete sempre do mesmo jeito. O usuário vê um card com o texto ' +
        'inteiro (ou o diff, se ela já existe) e decide. Use quando ele pedir ("transforma isso ' +
        'numa skill") ou quando uma skill criada pelo Wisp errou e ele corrigiu: proponha a mudança ' +
        'com o mesmo `nome`. `nome`: minúsculas, números e hífens (vira o /comando); ' +
        '`descricao`: quando usar, numa frase (o Claude Code decide por ela); `instrucoes`: o ' +
        'passo a passo em Markdown, que se entenda sem esta conversa. Nunca ponha segredos.',
      inputSchema: { nome: z.string(), descricao: z.string(), instrucoes: z.string() },
      _meta: ALWAYS_LOAD
    },
    async (input) => {
      const draft = skillDraftOf(input)
      if ('error' in draft) return { content: [{ type: 'text', text: draft.error }], isError: true }
      const result = writeSkill(draft, configDir())
      if (!result.ok) return { content: [{ type: 'text', text: result.error }], isError: true }
      return {
        content: [
          {
            type: 'text',
            text:
              `Skill gravada em ${result.path}` +
              (result.backup ? ` (a de antes ficou em ${result.backup})` : '') +
              `. Ela vale nas conversas novas, como /${draft.name}.`
          }
        ]
      }
    }
  )
}
