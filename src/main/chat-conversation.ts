// Cada conversa do painel: com que Claude Code ela sobe (o caminho, as ferramentas liberadas, a
// persona do Wisp e o workspace dele), a demonstração, a OpenRouter e o arquivo do modo de
// permissão; e os anexos de uma mensagem, como chegam da página.

import { snapshotDirOf } from './turn-review'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { basename, join } from 'path'
import workspaceClaudeMd from '../../resources/workspace/CLAUDE.md?raw'
import { ATTACHMENTS_DIR, isThumbnail } from './attachments'
import { SAFE_TOOLS } from './claude'
import type { DemoPlayer } from './claude'
import { getConfig } from './config'
import type { WispConfig } from './config'
import { Conversation } from './conversation'
import type { ConversationHost } from './conversation'
import { listModels, OPENROUTER_SECRET } from './openrouter'
import { DATA_DIR, runtimeDir } from './paths'
import { thumbnailOfBase64 } from './screenshot'
import { readSecret } from './secrets'
import type { AttachmentPreview, OutgoingAttachment, PermissionMode, Provider } from '../shared/ipc'
import { t } from '../shared/i18n'

/** A pasta de trabalho do Claude Code nas conversas sem pasta, com a persona do Wisp. */
export const WORKSPACE_DIR = join(DATA_DIR, 'workspace')
/** O Claude Code gravado do modo demonstração e as gravações dele. */
export const DEMO: DemoPlayer = {
  player: join(__dirname, 'wisp-demo.js'),
  recordings: join(__dirname, '../../resources/demo')
}

export const APPEND_SYSTEM_PROMPT =
  t(
    'Você está respondendo dentro do Wisp, um painel de chat pequeno no desktop Linux do usuário. '
  ) +
  t(
    'Responda em português do Brasil, de forma breve. O painel é estreito: use Markdown leve, com '
  ) +
  t(
    'parágrafos curtos e listas simples, sem títulos grandes nem tabelas largas. Quando o usuário '
  ) +
  t(
    'anexa arquivos, a mensagem termina com um bloco <anexos> com os caminhos deles: leia-os com a '
  ) +
  t('ferramenta Read (ela também lê imagens e PDFs) antes de responder sobre eles. ') +
  t(
    'O mascote do Wisp tem emoções: de vez em quando, se combinar com o momento, mostre uma com a '
  ) +
  t('ferramenta express (sem anunciar). ') +
  t('O Wisp tem uma bancada ao lado da conversa, com um navegador e um terminal embutidos. Para ') +
  t('abrir, mostrar ou testar uma página (o localhost do projeto, um arquivo HTML ou um site), ') +
  t('use preview_open e as outras preview_* (screenshot, read, console, click, fill), e não o ') +
  t(
    'open_url (que abre o navegador do sistema, só se ele pedir) nem o do Playwright; para rodar '
  ) +
  t('o que o usuário deve acompanhar ou que continua rodando, use terminal_run e terminal_read.')

/** Os anexos de uma mensagem, conferidos: caminhos não vazios e miniaturas no formato certo. */
export function outgoing(value: unknown): OutgoingAttachment[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item: Record<string, unknown> | null) => {
    const path = item?.path
    if (typeof path !== 'string' || !path) return []
    const thumbnail = item?.thumbnail
    return [isThumbnail(thumbnail) ? { path, thumbnail } : { path }]
  })
}

/** Como o anexo aparece no histórico: nome, tamanho e a miniatura que o chat gerou. */
export function previewOf({ path, thumbnail }: OutgoingAttachment): AttachmentPreview {
  let size = 0
  try {
    size = statSync(path).size
  } catch {
    // O arquivo sumiu; o envio vai avisar.
  }
  return { name: basename(path), size, ...(thumbnail ? { thumbnail } : {}) }
}

/** Os bytes de uma imagem colada, como chegam pelo IPC (ArrayBuffer ou uma view dele). */
export function bytesOf(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  return null
}

/** Cria a pasta de trabalho do Claude Code e, na primeira vez, o CLAUDE.md com a persona. */
function prepareWorkspace(): string {
  mkdirSync(WORKSPACE_DIR, { recursive: true })
  const claudeMd = join(WORKSPACE_DIR, 'CLAUDE.md')
  if (!existsSync(claudeMd)) writeFileSync(claudeMd, workspaceClaudeMd)
  return WORKSPACE_DIR
}

/** O arquivo do modo de permissão de uma conversa (o hook do Bash do processo dela o lê). */
export const modeFileOf = (conversation: string): string =>
  join(runtimeDir(), `modo-${process.pid}-${conversation}`)

/**
 * Quem cria as conversas do painel. `startup`: o config.json de quando o Wisp abriu (o claudePath e
 * as ferramentas liberadas valem a partir da próxima vez que ele abrir); o resto é lido na hora.
 */
export function conversationFactory(
  startup: Pick<WispConfig, 'claudePath' | 'extraAllowedTools'>,
  host: ConversationHost,
  mcpConfig?: (conversation: string) => string
): (mode: PermissionMode, provider: Provider, folder: string | null) => Conversation {
  return (mode, provider, folder) => {
    const id = randomUUID()
    return new Conversation({
      id,
      host,
      claude: {
        claudePath: startup.claudePath,
        workspace: prepareWorkspace,
        allowedTools: [...SAFE_TOOLS, ...startup.extraAllowedTools],
        appendSystemPrompt: APPEND_SYSTEM_PROMPT,
        thumbnail: thumbnailOfBase64,
        snapshotDir: snapshotDirOf(id),
        demo: () => (getConfig().demo ? DEMO : null),
        openrouter: {
          key: () => readSecret(OPENROUTER_SECRET),
          // A lista é pública e fica guardada por uma hora; sem rede, o custo fica sem preço.
          pricing: async (model) =>
            (await listModels().catch(() => [])).find((item) => item.id === model) ?? null
        }
      },
      demo: () => getConfig().demo,
      mcpConfig: mcpConfig ? () => mcpConfig(id) : undefined,
      modeFile: modeFileOf(id),
      permissionMode: mode,
      provider,
      folder,
      modelFor: (which) =>
        which === 'openrouter' ? getConfig().openrouterModel : getConfig().model,
      projectRoots: () => getConfig().projectRoots,
      trustedDirs: [WORKSPACE_DIR, ATTACHMENTS_DIR]
    })
  }
}
