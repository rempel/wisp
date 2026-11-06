import { spawn } from 'child_process'
import { SNAPSHOT_ENV } from './turn-snapshot'
import type { ChildProcess, ChildProcessWithoutNullStreams } from 'child_process'
import type { Provider, PermissionMode } from '../shared/ipc'
import {
  ATTACHMENTS_DIR,
  copyAttachments,
  ensureAttachmentsDir,
  withAttachments
} from './attachments'
import type { CopiedAttachments } from './attachments'
import { INSTALL_HINT, checkClaude, claudeCommand, claudeEnv, resolveCommand } from './claude-cli'
import {
  MODE_FILE_ENV,
  PERMISSION_TOOL,
  sessionSettings,
  terminalSettings
} from './claude-settings'
import type { TerminalLaunch } from './claude-settings'
import { StreamReader } from './claude-stream'
import type { AsideLaunch } from './aside'
import { openrouterEnv, seedTerminalConfig } from './openrouter'
import { t } from '../shared/i18n'

// O ClaudeSession é a porta de entrada: o resto do Wisp importa daqui o que antes morava neste
// arquivo (as configurações, a checagem do CLI e a leitura do stream ficam em claude-*.ts).
export {
  MODE_FILE_ENV,
  PERMISSION_TOOL,
  SAFE_TOOLS,
  modeOf,
  terminalSettings
} from './claude-settings'
import { IS_WINDOWS } from './platform'
import { killTree } from './win'
export type { ClaudeOptions, DemoPlayer, TerminalLaunch } from './claude-settings'
export { INSTALL_HINT, LOGIN_HINT, checkClaude, claudeStatus, resolveCommand } from './claude-cli'
export type { ClaudeStatus } from './claude-cli'
export { friendlyError } from './claude-stream'

/** O "executável" do modo demonstração, no lugar do caminho do CLI. */
const DEMO = 'wisp-demo'
const STDERR_TAIL = 2000
const KILL_TIMEOUT_MS = 3000
/** Se o turno não acabar até lá depois do pedido de interrupção, o processo é encerrado. */
const INTERRUPT_TIMEOUT_MS = 4000

/** A mensagem do usuário no formato do --input-format stream-json. */
function userMessage(text: string): string {
  return JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text }] }
  })
}

/**
 * Uma conversa com o Claude Code: um processo `claude -p` de longa duração, que recebe as
 * mensagens pelo stdin e responde em stream-json pelo stdout. Converte essa saída em ChatEvents.
 *
 * - O session_id é gerado aqui e passado com `--session-id`, para a pasta dos anexos da conversa
 *   existir antes de o CLI responder pela primeira vez.
 * - Parar pede ao CLI, pelo stdin, que interrompa o turno; o processo continua vivo. Se ele não
 *   obedecer a tempo, é encerrado, e a próxima mensagem sobe outro com `--resume <session_id>`.
 * - Trocar o modelo também vai pelo stdin, antes da próxima mensagem; o contexto continua.
 * - Nova conversa encerra o processo e esquece o session_id.
 */
export class ClaudeSession extends StreamReader {
  /**
   * Compacta a conversa: o /compact do Claude Code, com instruções do que manter. O resumo
   * substitui as mensagens no contexto do Claude (o painel continua mostrando tudo). false se não
   * deu para pedir agora (respondendo, sem conversa, ou na demonstração).
   */
  compact(instructions = ''): boolean {
    if (this.busy || !this.sessionId || this.options.demo?.()) return false
    const extra = instructions.replace(/\s+/g, ' ').trim().slice(0, 500)
    void this.send(extra ? `/compact ${extra}` : '/compact')
    return true
  }

  /**
   * Troca o provedor: o processo vai embora e a conversa recomeça (cada lado tem as suas
   * sessões). O modelo vem em seguida, pelo setModel.
   */
  setProvider(provider: Provider): void {
    if (provider === this.provider) return
    this.clear()
    this.provider = provider
    this.bin = null
    this.secret = null
    this.emit({ type: 'reset' })
    this.emit(this.providerEvent())
  }

  /**
   * Troca o modo de permissão. Com o processo vivo, vale na hora (control_request
   * set_permission_mode); senão, o próximo processo já sobe com ele.
   */
  setPermissionMode(mode: PermissionMode): void {
    if (mode === this.mode) return
    const previous = this.mode
    this.mode = mode
    this.writeModeFile()
    if (this.proc) {
      this.modeRequests.set(
        this.control(this.proc, { subtype: 'set_permission_mode', mode }),
        previous
      )
    }
    this.emit({ type: 'mode', mode })
  }

  /**
   * A aba dorme (Fase 23): o processo do Claude Code sai, e a próxima mensagem sobe outro com
   * `--resume`, na mesma sessão. Não dorme trabalhando, com tarefa em segundo plano (um servidor
   * que o Claude subiu morreria junto) nem antes de o CLI gravar a sessão.
   */
  sleep(): boolean {
    const proc = this.proc
    if (!proc || this.busy || this.stopping || this.tasks.size || !this.sessionSaved) return false
    if (this.echoes.length) return false
    this.turn++
    this.proc = null
    this.sleeping = true
    this.streamedMessages.clear()
    this.hiddenToolUses.clear()
    void killProcess(proc)
    return true
  }

  /** Checa o CLI de antemão (ao abrir o chat) e avisa na conversa se faltar algo. */
  async preflight(): Promise<void> {
    // Pela OpenRouter, só o CLI: a chave é lida do chaveiro na primeira mensagem (abrir o painel
    // não pede a senha do chaveiro).
    if (this.provider === 'openrouter' && !this.options.demo?.()) {
      if (!resolveCommand(this.options.claudePath)) this.notice('warning', INSTALL_HINT)
      return
    }
    await this.check()
  }

  /**
   * Manda uma mensagem. `attachments` são caminhos de arquivos: viram cópias na pasta da
   * conversa, listadas no fim da mensagem para o Claude ler com o Read.
   */
  async send(text: string, attachments: string[] = []): Promise<void> {
    if (this.busy) return
    const turn = ++this.turn
    this.retried = false
    this.lastAssistant = null
    this.setBusy(true)
    const bin = await this.check()
    if (turn !== this.turn) return
    if (!bin) return this.finishTurn('error')

    const sessionId = this.ensureSessionId()
    // O aviso de limite vale para o turno em que chegou; cada turno traz o seu.
    this.planLimit = null
    let content = text
    if (attachments.length) {
      let copied: CopiedAttachments
      try {
        copied = await copyAttachments(attachments, sessionId)
      } catch (err) {
        if (turn !== this.turn) return
        this.notice(
          'error',
          t('Não consegui preparar os anexos: {message}', { message: (err as Error).message })
        )
        return this.finishTurn('error')
      }
      if (turn !== this.turn) return
      for (const problem of copied.problems) this.notice('warning', problem)
      content = withAttachments(text, copied.paths)
    }
    // Só anexos, e nenhum deu certo: não há o que mandar (os avisos já explicam).
    if (!content.trim()) return this.finishTurn('error')

    // Numa pasta, um processo novo só sobe se ela for confiável (o card, se preciso).
    if (!this.proc && bin !== DEMO && this.options.folderGate) {
      const trusted = await this.options.folderGate()
      if (turn !== this.turn) return
      if (!trusted) return this.finishTurn('error')
    }
    let proc = this.proc
    if (proc && this.provider === 'openrouter' && this.processModel !== this.model) {
      // Pela OpenRouter, o modelo vai também no ambiente (subagentes, tarefas internas): a troca
      // sobe outro processo, que retoma a conversa.
      this.proc = null
      void killProcess(proc)
      proc = null
    }
    this.write(proc ?? this.start(bin), content)
  }

  /**
   * Para a resposta em andamento: pede ao CLI que interrompa o turno, e o processo continua
   * vivo para a próxima mensagem. A conversa continua.
   */
  stop(): void {
    this.turn++
    if (!this.busy) return
    const proc = this.proc
    // A mensagem ainda nem chegou ao CLI (checando o CLI, copiando anexos): basta encerrar.
    if (!proc || this.sentText === null) return this.finishTurn('stopped')
    if (this.stopping) return
    this.stopping = true
    this.control(proc, { subtype: 'interrupt' })
    // Se o CLI não encerrar o turno a tempo, o processo vai embora; a conversa continua com
    // --resume na próxima mensagem.
    this.stopTimer = setTimeout(() => {
      this.stopTimer = null
      if (this.stopping && proc === this.proc) void killProcess(proc)
    }, INTERRUPT_TIMEOUT_MS)
  }

  /**
   * A chave da OpenRouter mudou (ou saiu do chaveiro): a próxima mensagem a lê de novo. Um
   * processo parado vai embora, porque leva a chave antiga no ambiente; a conversa continua.
   */
  dropSecret(): void {
    this.secret = null
    if (this.provider !== 'openrouter' || this.busy || !this.proc) return
    const proc = this.proc
    this.proc = null
    void killProcess(proc)
  }

  /**
   * Prepara o Claude Code interativo do modo terminal desta conversa (Fase 17): o mesmo CLI,
   * provedor, modelo, modo, pasta, ferramentas e persona do chat, mais os hooks e a linha de
   * status da aba (a ficha `tab`). O processo do chat sai antes: os dois não podem escrever na
   * mesma sessão. null: não deu agora (o motivo vai como aviso) ou é a demonstração.
   */
  async terminalLaunch(tab: string): Promise<TerminalLaunch | null> {
    if (this.busy || this.options.demo?.()) return null
    const bin = await this.check()
    if (!bin || bin === DEMO) return null
    if (this.options.folderGate && !(await this.options.folderGate())) return null
    const proc = this.proc
    this.proc = null
    if (proc) await killProcess(proc)
    const args = [
      '--allowedTools',
      this.options.allowedTools.join(','),
      '--add-dir',
      ATTACHMENTS_DIR,
      // Como no chat: vale o modo da conversa, nunca o padrão do CLI (que pode ser o Automático).
      '--permission-mode',
      this.mode,
      '--append-system-prompt',
      this.options.appendSystemPrompt,
      '--settings',
      terminalSettings(tab)
    ]
    const mcpConfig = this.options.mcpConfig?.()
    // No terminal, quem pergunta é o próprio Claude Code (e o card do Wisp, pelo hook): não há
    // --permission-prompt-tool, que só vale no modo -p.
    if (mcpConfig) args.push('--mcp-config', mcpConfig, '--strict-mcp-config')
    if (this.model) args.push(`--model=${this.model}`)
    this.processModel = this.model
    const sessionId = this.ensureSessionId()
    args.push(this.sessionSaved ? '--resume' : '--session-id', sessionId)
    if (this.sessionSaved && this.fork) args.push('--fork-session')
    ensureAttachmentsDir()
    this.writeModeFile()
    const cwd = this.cwd ?? this.folder ?? this.options.workspace()
    const env = claudeEnv(bin)
    if (this.provider === 'openrouter' && this.secret && this.model) {
      Object.assign(env, openrouterEnv(this.secret, this.model))
      // A pasta de configuração da OpenRouter é do Wisp: ela já começa sem as boas-vindas.
      seedTerminalConfig(cwd)
    }
    if (this.options.modeFile) env[MODE_FILE_ENV] = this.options.modeFile
    env.TERM = 'xterm-256color'
    env.COLORTERM = 'truecolor'
    this.terminalCostBase = this.cost
    const run = claudeCommand(bin, args, env, cwd)
    return { file: run.command, args: run.args, env, cwd }
  }

  /** Começa uma conversa nova: encerra o processo atual e esquece a sessão. */
  reset(): void {
    this.clear()
    this.emit({ type: 'reset' })
  }

  /**
   * Volta a conversa para antes da última mensagem (Fase 21): o próximo processo retoma só até
   * a resposta `at` (o fim do turno anterior), numa cópia da sessão; a original fica como
   * estava. Com `at` null (a mensagem era a primeira), a conversa segue numa sessão nova.
   * Devolve false com uma resposta em andamento.
   */
  rewind(at: string | null): boolean {
    if (this.busy) return false
    if (at !== null && (!this.sessionId || !this.sessionSaved)) return false
    this.turn++
    this.clearStop()
    const proc = this.proc
    this.proc = null
    if (proc) void killProcess(proc)
    this.echoes = []
    this.tasks.clear()
    this.streamedMessages.clear()
    this.hiddenToolUses.clear()
    if (at === null) {
      this.sessionId = null
      this.sessionSaved = false
      this.restored = false
      this.fork = false
      this.resumeAt = null
    } else {
      this.resumeAt = at
      this.fork = true
    }
    return true
  }

  /**
   * Volta a uma conversa do histórico: encerra o processo atual, e a próxima mensagem sobe
   * outro com `--resume <sessionId>`.
   */
  resume(sessionId: string, options: { cwd?: string; fork?: boolean; at?: string } = {}): void {
    this.clear()
    this.sessionId = sessionId
    this.sessionSaved = true
    this.restored = true
    this.cwd = options.cwd ?? null
    this.fork = options.fork ?? false
    // Ramificar (Fase 46): só até a resposta `at`, numa cópia.
    this.resumeAt = options.at ?? null
    this.emit({ type: 'reset' })
  }

  /**
   * O que a pergunta lateral (Fase 46) precisa para subir um Claude Code à parte: o CLI, o
   * ambiente, a pasta e a sessão para retomar numa cópia (null antes da primeira resposta). Null
   * sem como subir (na demonstração, sem o CLI ou, pela OpenRouter, sem a chave).
   */
  asideLaunch(): AsideLaunch | null {
    if (this.options.demo?.()) return null
    const bin = this.bin ?? resolveCommand(this.options.claudePath)
    if (!bin) return null
    const env = claudeEnv(bin)
    if (this.provider === 'openrouter') {
      if (!this.secret || !this.model) return null
      Object.assign(env, openrouterEnv(this.secret, this.model))
    }
    return {
      bin,
      env,
      cwd: this.cwd ?? this.folder ?? this.options.workspace(),
      sessionId: this.sessionId && this.sessionSaved ? this.sessionId : null,
      model: this.model
    }
  }

  /** Encerra o processo sem esperar (o app está fechando). */
  dispose(): void {
    this.turn++
    this.clearStop()
    if (this.proc) stopProcess(this.proc, 'SIGTERM')
    this.proc = null
  }

  private clear(): void {
    this.turn++
    const proc = this.proc
    this.proc = null
    this.sleeping = false
    this.cost = null
    this.context = null
    this.sessionId = null
    this.sessionSaved = false
    this.restored = false
    this.cwd = null
    this.fork = false
    this.sentText = null
    this.echoes = []
    if (this.queueTimer) clearTimeout(this.queueTimer)
    this.queueTimer = null
    this.tasks.clear()
    this.clearStop()
    this.streamedMessages.clear()
    this.hiddenToolUses.clear()
    this.modelRequests.clear()
    this.modeRequests.clear()
    this.setBusy(false)
    if (proc) void killProcess(proc)
  }

  private async check(): Promise<string | null> {
    // Na demonstração, não há CLI para conferir.
    if (this.options.demo?.()) return DEMO
    if (this.provider === 'openrouter') return this.checkOpenRouter()
    if (this.bin) return this.bin
    const result = await checkClaude(this.options.claudePath)
    if (!result.ok) {
      this.notice('warning', result.hint)
      return null
    }
    this.bin = result.bin
    return this.bin
  }

  /**
   * Pela OpenRouter não há login a conferir (o `claude auth status` olharia a assinatura): basta
   * o CLI, um modelo escolhido e a chave no chaveiro.
   */
  private async checkOpenRouter(): Promise<string | null> {
    const bin = this.bin ?? resolveCommand(this.options.claudePath)
    if (!bin) {
      this.notice('warning', INSTALL_HINT)
      return null
    }
    if (!this.model) {
      this.notice(
        'warning',
        t('Escolha um modelo da OpenRouter na pílula do modelo, logo abaixo da caixa de texto.')
      )
      return null
    }
    if (!this.secret) {
      try {
        this.secret = (await this.options.openrouter?.key()) ?? null
      } catch (err) {
        this.notice('warning', (err as Error).message)
        return null
      }
      if (!this.secret) {
        this.notice(
          'warning',
          t('Para conversar pela OpenRouter, guarde a sua chave em **Configurações → OpenRouter**.')
        )
        return null
      }
    }
    this.bin = bin
    return bin
  }

  /** Escreve a mensagem do turno no processo, trocando antes o modelo se ele mudou. */
  private write(proc: ChildProcessWithoutNullStreams, text: string): void {
    if (this.processModel !== this.model) {
      // Sem `model`, o CLI volta ao padrão (é o que o SDK manda).
      const request = this.model
        ? { subtype: 'set_model', model: this.model }
        : { subtype: 'set_model' }
      const previous = this.processModel
      this.modelRequests.set(this.control(proc, request), { requested: this.model, previous })
      this.processModel = this.model
    }
    this.sentText = text
    this.echoes.push({ content: text, queued: false })
    proc.stdin.write(userMessage(text) + '\n')
  }

  /**
   * Dá para mandar uma mensagem agora, com o Claude trabalhando? (O processo está de pé e o
   * turno já começou.) Ela vai direto para o CLI, que a entrega na próxima pausa entre
   * ferramentas, ou como o turno seguinte, como no terminal.
   */
  canQueue(): boolean {
    return this.busy && this.proc !== null && this.sentText !== null && !this.stopping
  }

  /** Manda uma mensagem com o Claude trabalhando (veja canQueue). */
  async queue(text: string, attachments: string[] = []): Promise<void> {
    const proc = this.proc
    const sessionId = this.sessionId
    if (!proc || !sessionId || !this.canQueue()) return
    let content = text
    if (attachments.length) {
      try {
        const copied = await copyAttachments(attachments, sessionId)
        for (const problem of copied.problems) this.notice('warning', problem)
        content = withAttachments(text, copied.paths)
      } catch (err) {
        this.notice(
          'error',
          t('Não consegui preparar os anexos: {message}', { message: (err as Error).message })
        )
        content = text
      }
    }
    // O processo foi embora enquanto os anexos eram copiados: a mensagem não chega.
    if (proc !== this.proc || !content.trim()) {
      this.emit({ type: 'queue-dropped' })
      return
    }
    this.echoes.push({ content, queued: true })
    proc.stdin.write(userMessage(content) + '\n')
  }

  /** Manda um pedido de controle ao CLI pelo stdin. Devolve o id do pedido. */
  private control(proc: ChildProcessWithoutNullStreams, request: Record<string, unknown>): string {
    const id = `wisp-${++this.controlSeq}`
    proc.stdin.write(JSON.stringify({ type: 'control_request', request_id: id, request }) + '\n')
    return id
  }

  private start(bin: string): ChildProcessWithoutNullStreams {
    const args = [
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      // Cada mensagem volta quando o CLI a pega: é assim que se sabe que uma mensagem mandada
      // com ele trabalhando chegou.
      '--replay-user-messages',
      '--allowedTools',
      this.options.allowedTools.join(','),
      // Os anexos ficam fora do workspace; a pasta deles entra no espaço de trabalho do Claude.
      '--add-dir',
      ATTACHMENTS_DIR,
      // O modo padrão do CLI nem sempre é o "default": numa instalação nova ele pode começar no
      // "auto", e o settings.json do usuário pode definir outro defaultMode. Aqui vale sempre o
      // modo escolhido na conversa (Pedir, se ninguém escolheu outro).
      '--permission-mode',
      this.mode,
      '--append-system-prompt',
      this.options.appendSystemPrompt,
      '--settings',
      sessionSettings()
    ]
    const mcpConfig = this.options.mcpConfig?.()
    if (mcpConfig) {
      args.push(
        '--mcp-config',
        mcpConfig,
        // Só o servidor do Wisp: os servidores MCP configurados no Claude Code do usuário ficam
        // de fora, para o Wisp não depender deles.
        '--strict-mcp-config',
        '--permission-prompt-tool',
        PERMISSION_TOOL
      )
    }
    // Com "=", o valor nunca vira outra opção, mesmo se começar com "-".
    if (this.model) args.push(`--model=${this.model}`)
    this.processModel = this.model
    if (this.sessionId) args.push(this.sessionSaved ? '--resume' : '--session-id', this.sessionId)
    // A última mensagem foi editada: só até a resposta de antes dela, numa cópia (a sessão
    // original continua inteira no Claude Code).
    if (this.sessionId && this.sessionSaved && this.resumeAt) {
      args.push('--resume-session-at', this.resumeAt)
      this.fork = true
    }
    this.resumeAt = null
    // A sessão do terminal continua aberta: o Wisp segue numa cópia, para as duas não se misturarem.
    if (this.sessionId && this.sessionSaved && this.fork) args.push('--fork-session')

    ensureAttachmentsDir()
    this.writeModeFile()
    // Na demonstração, o Claude Code gravado roda com o próprio Electron em modo Node.
    const demo = bin === DEMO ? this.options.demo?.() : null
    const command = demo ? process.execPath : bin
    const env = claudeEnv(command)
    if (!demo && this.provider === 'openrouter' && this.secret && this.model) {
      Object.assign(env, openrouterEnv(this.secret, this.model))
    }
    if (this.options.modeFile) env[MODE_FILE_ENV] = this.options.modeFile
    // A pasta das cópias de antes das edições (Fase 42), que o hook delas lê.
    if (this.options.snapshotDir) env[SNAPSHOT_ENV] = this.options.snapshotDir
    if (demo) {
      env.ELECTRON_RUN_AS_NODE = '1'
      env.WISP_DEMO_DIR = demo.recordings
    }
    const cwd = this.cwd ?? this.folder ?? this.options.workspace()
    // A demonstração roda com o Electron do próprio Wisp; o Claude Code, no sistema.
    const run = demo
      ? { command, args: [demo.player, ...args] }
      : claudeCommand(command, args, env, cwd)
    // No Windows, sem a janela do console que um programa de terminal abriria.
    const proc = spawn(run.command, run.args, { cwd, env, windowsHide: true })
    this.proc = proc
    this.echoes = []

    // Eventos de um processo que já foi substituído (conversa nova) são ignorados.
    const current = (): boolean => proc === this.proc
    let pending = ''
    let stderrTail = ''
    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', (chunk: string) => {
      pending += chunk
      let newline: number
      while ((newline = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, newline).trim()
        pending = pending.slice(newline + 1)
        if (line && current()) this.handleLine(line)
      }
    })
    proc.stderr.setEncoding('utf8')
    proc.stderr.on('data', (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL)
    })
    // EPIPE ao escrever num processo que morreu: o 'exit' já trata.
    proc.stdin.on('error', () => {})
    proc.on('error', (err: Error) => {
      if (!current()) return
      this.proc = null
      this.bin = null
      const missing = (err as NodeJS.ErrnoException).code === 'ENOENT'
      this.notice(
        'error',
        missing ? INSTALL_HINT : `Não consegui iniciar o Claude Code: ${err.message}`
      )
      this.finishTurn('error')
    })
    proc.on('exit', (code, signal) => this.onExit(proc, code, signal, stderrTail))
    return proc
  }

  private onExit(
    proc: ChildProcessWithoutNullStreams,
    code: number | null,
    signal: NodeJS.Signals | null,
    stderrTail: string
  ): void {
    if (proc !== this.proc) return
    this.proc = null
    // O --session-id/--resume não bateu com o que o CLI tem gravado: uma parada bem no começo
    // do primeiro envio, ou uma conversa do histórico que o Claude Code já apagou. O erro diz
    // qual, e o próximo processo usa o outro.
    const inUse = /already in use/i.test(stderrTail)
    const notFound = /no conversation found/i.test(stderrTail)
    // O ponto para onde voltar (a edição da última mensagem) não existe na sessão.
    const noPoint = /no message found with message\.uuid/i.test(stderrTail)
    if (inUse) this.sessionSaved = true
    else if (notFound) this.sessionSaved = false
    const stopped = this.stopping
    this.clearStop()
    if (!this.busy) return
    if (stopped) return this.finishTurn('stopped')

    // Caiu na largada por causa disso: manda a mesma mensagem de novo, uma vez.
    const text = this.sentText
    if ((inUse || notFound) && text !== null && this.bin && !this.retried) {
      this.retried = true
      if (notFound && this.restored) {
        this.notice(
          'warning',
          t(
            'O Claude Code não tem mais esta conversa (ele apaga as antigas depois de um tempo). '
          ) + t('Continuei numa sessão nova: o Claude não lembra do que foi dito antes.')
        )
      }
      this.restored = false
      this.write(this.start(this.bin), text)
      return
    }

    if (noPoint) {
      this.fork = false
      this.notice(
        'error',
        t(
          'Não consegui voltar a conversa para antes da mensagem editada: o Claude Code não achou o '
        ) +
          t(
            'ponto de antes dela (a conversa pode ter sido compactada). A mensagem não foi mandada; '
          ) +
          t('comece uma conversa nova (Ctrl+K) para mandá-la do zero.')
      )
      return this.finishTurn('error')
    }
    const detail = stderrTail.trim()
    this.notice(
      'error',
      t('O Claude Code encerrou no meio da resposta ({v1}).', {
        v1: signal ?? t('código {code}', { code })
      }) + (detail ? `\n\n\`\`\`\n${detail}\n\`\`\`` : '')
    )
    this.finishTurn('error')
  }
}

/**
 * Encerra o processo. No Windows não há sinais: o taskkill encerra o Claude Code e o que ele abriu
 * (o Bash, os servidores MCP), de uma vez.
 */
function stopProcess(proc: ChildProcess, signal: NodeJS.Signals): void {
  if (IS_WINDOWS && proc.pid !== undefined) killTree(proc.pid)
  else proc.kill(signal)
}

/** Manda SIGTERM e, se o processo não sair a tempo, SIGKILL. Resolve quando ele sai. */
function killProcess(proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (proc.exitCode !== null || proc.signalCode !== null) return resolve()
    const timer = setTimeout(() => stopProcess(proc, 'SIGKILL'), KILL_TIMEOUT_MS)
    proc.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    stopProcess(proc, 'SIGTERM')
  })
}
