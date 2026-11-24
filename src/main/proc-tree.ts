// A árvore de um processo (o Cancelar do pentest): o Claude Code abre os servidores MCP, que rodam
// as fases, que abrem as ferramentas. Encerrar só o Claude Code deixa o resto rodando; aqui, os
// descendentes pelo /proc (no Linux), para encerrar todos. No Windows, o taskkill /T já encerra a
// árvore, e esta lista vem vazia.

import { readdirSync, readFileSync } from 'fs'

/** O pai de um processo, pelo /proc/<pid>/stat (o nome pode ter espaços e parênteses). */
function parentOf(pid: number): number | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    const ppid = Number(rest[1])
    return Number.isFinite(ppid) ? ppid : null
  } catch {
    return null
  }
}

/** Os descendentes de `root` (filhos, netos...), sem ele; vazio sem o /proc. */
export function descendants(root: number): number[] {
  let pids: number[]
  try {
    pids = readdirSync('/proc')
      .filter((name) => /^\d+$/.test(name))
      .map(Number)
  } catch {
    return []
  }
  const children = new Map<number, number[]>()
  for (const pid of pids) {
    const parent = parentOf(pid)
    if (parent === null) continue
    children.set(parent, [...(children.get(parent) ?? []), pid])
  }
  const out: number[] = []
  const queue = [root]
  while (queue.length) {
    for (const child of children.get(queue.shift()!) ?? []) {
      if (out.includes(child) || child === root) continue
      out.push(child)
      queue.push(child)
    }
  }
  return out
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Manda SIGTERM a cada processo e, os que não saírem em `grace` ms, SIGKILL. Resolve quando
 * terminou (o SIGKILL, se precisou).
 */
export async function killAll(pids: number[], grace = 3000): Promise<void> {
  const own = process.pid
  const targets = pids.filter((pid) => pid > 1 && pid !== own)
  for (const pid of targets) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // Já saiu.
    }
  }
  const until = Date.now() + grace
  while (Date.now() < until && targets.some(alive)) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  for (const pid of targets.filter(alive)) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // Saiu agora.
    }
  }
}

/**
 * Para um processo e tudo o que ele abriu: a árvore é lida antes (depois de ele sair, os filhos
 * passam para o init e somem dela), `stop` encerra o processo do jeito dele, e o resto vai junto.
 */
export async function haltTree(root: number | null | undefined, stop: () => void): Promise<void> {
  const tree = root ? descendants(root) : []
  stop()
  await killAll(tree)
}
