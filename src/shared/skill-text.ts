// O SKILL.md de uma skill que o Wisp propõe (Fase 86): o mesmo texto no card (que mostra o que vai
// ser gravado, ou o diff de uma que já existe) e no arquivo. Uma marca diz que ela veio do Wisp,
// para ele saber quais pode propor melhorar.

/** O nome de uma skill: minúsculas, números e hífens (o /comando do Claude Code). */
export const LEARNED_SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/
export const MAX_SKILL_DESCRIPTION = 300
export const MAX_SKILL_INSTRUCTIONS = 8000
/** A marca das skills criadas pelo Wisp. */
export const WISP_SKILL_MARK = '<!-- Criada pelo Wisp a partir do seu uso. Edite à vontade. -->'

export interface SkillDraft {
  name: string
  description: string
  instructions: string
}

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** O pedido da ferramenta (nome, descrição, instruções) conferido, ou o que está errado. */
export function skillDraftOf(input: unknown): SkillDraft | { error: string } {
  const value = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const name = str(value.nome)
  const description = str(value.descricao).replace(/\s+/g, ' ')
  const instructions = str(value.instrucoes)
  if (!LEARNED_SKILL_NAME.test(name)) {
    return { error: 'O nome vai em minúsculas, números e hífens (até 40): resumo-prs.' }
  }
  if (!description) return { error: 'Falta a descrição: quando usar a skill.' }
  if (description.length > MAX_SKILL_DESCRIPTION) {
    return { error: `A descrição passou de ${MAX_SKILL_DESCRIPTION} caracteres.` }
  }
  if (!instructions) return { error: 'Faltam as instruções: o passo a passo.' }
  if (instructions.length > MAX_SKILL_INSTRUCTIONS) {
    return { error: `As instruções passaram de ${MAX_SKILL_INSTRUCTIONS} caracteres.` }
  }
  return { name, description, instructions }
}

/** O SKILL.md: o cabeçalho (nome e descrição), a marca do Wisp e as instruções. */
export function skillText(draft: SkillDraft): string {
  const description = JSON.stringify(draft.description)
  return `---\nname: ${draft.name}\ndescription: ${description}\n---\n\n${WISP_SKILL_MARK}\n\n${draft.instructions.trim()}\n`
}

/** O SKILL.md veio do Wisp. */
export const isWispSkill = (text: string): boolean => text.includes(WISP_SKILL_MARK)
