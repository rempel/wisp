// O que pede atualização nas dependências (Fase 28), a partir dos fatos que o deps-check.mjs junta:
// as falhas de segurança conhecidas (npm audit, só as dependências do app), o Electron (o
// projeto mantém as três últimas versões maiores) e o Claude Code (uma versão maior nova pede
// conferir o Wisp com ela e subir o MIN_CLAUDE). Funções puras, para os testes.

/** O número maior de uma versão ("44.9.3" → 44); NaN se não der para ler. */
export const major = (version) => Number(/^v?(\d+)\./.exec(String(version ?? ''))?.[1] ?? NaN)

/**
 * Os avisos: { level: 'warning' | 'notice', title, message }. `facts`:
 * - audit: o metadata.vulnerabilities do `npm audit --json` (ou null, sem rede);
 * - electron: { current, latest } (latest null sem rede);
 * - claude: { minimum, latest }.
 */
export function assess({ audit, electron, claude }) {
  const notes = []
  if (audit) {
    const serious = (audit.high ?? 0) + (audit.critical ?? 0)
    const moderate = audit.moderate ?? 0
    if (serious) {
      notes.push({
        level: 'warning',
        title: 'Falhas de segurança',
        message: `${serious} falha(s) alta(s) ou crítica(s) nas dependências do app: rode npm audit.`
      })
    } else if (moderate) {
      notes.push({
        level: 'notice',
        title: 'Falhas de segurança',
        message: `${moderate} falha(s) moderada(s) nas dependências do app: rode npm audit.`
      })
    }
  }
  if (electron.latest) {
    const behind = major(electron.latest) - major(electron.current)
    if (behind >= 3) {
      notes.push({
        level: 'warning',
        title: 'Electron sem suporte',
        message: `O Wisp usa o Electron ${electron.current}, fora das três últimas versões maiores (a mais nova é a ${electron.latest}): ele não recebe mais correções de segurança.`
      })
    } else if (behind >= 1) {
      notes.push({
        level: 'notice',
        title: 'Electron novo',
        message: `Saiu o Electron ${electron.latest} (o Wisp usa o ${electron.current}).`
      })
    }
  }
  if (claude.latest && major(claude.latest) > major(claude.minimum)) {
    notes.push({
      level: 'warning',
      title: 'Claude Code novo',
      message: `Saiu o Claude Code ${claude.latest}, uma versão maior nova (o mínimo do Wisp é o ${claude.minimum}): confira o Wisp com ela e suba o MIN_CLAUDE.`
    })
  }
  return notes
}

/** O resumo do job (Markdown) com o que foi conferido e os avisos. */
export function summary({ audit, electron, claude }, notes) {
  const count = audit
    ? `${audit.total ?? 0} (altas e críticas: ${(audit.high ?? 0) + (audit.critical ?? 0)})`
    : 'não deu para ler'
  const lines = [
    '### Dependências',
    '',
    '| O quê | Agora | Mais nova |',
    '| --- | --- | --- |',
    `| Electron | ${electron.current} | ${electron.latest ?? '?'} |`,
    `| Claude Code (mínimo) | ${claude.minimum} | ${claude.latest ?? '?'} |`,
    `| Falhas conhecidas (npm audit) | ${count} | |`,
    ''
  ]
  for (const note of notes) lines.push(`- **${note.title}:** ${note.message}`)
  if (!notes.length) lines.push('Nada pede atualização.')
  return lines.join('\n') + '\n'
}
