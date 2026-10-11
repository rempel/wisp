import { join } from 'node:path'

/** A raiz do repositório, a partir de out/test. */
export const ROOT = join(__dirname, '..', '..')

/** Os executáveis e arquivos de mentira dos testes (test/fixtures), a partir de out/test. */
export const FIXTURES = join(__dirname, '..', '..', 'test', 'fixtures')

/** O relay dos hooks montado para os testes (scripts/test.mjs). */
export const RELAY = join(__dirname, 'wisp-hook.cjs')
