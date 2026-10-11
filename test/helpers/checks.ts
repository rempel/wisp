import assert from 'node:assert'

/**
 * Verificações em sequência, como num roteiro: todas rodam, e o teste falha no fim com a lista
 * das que não passaram.
 */
export function checker(): {
  check: (name: string, ok: unknown, extra?: string) => void
  done: () => void
} {
  const failures: string[] = []
  return {
    check: (name, ok, extra = '') => {
      if (!ok) failures.push(extra ? `${name} — ${extra}` : name)
    },
    done: () => assert.deepStrictEqual(failures, [])
  }
}
