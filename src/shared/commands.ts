import { t } from './i18n'
// O que um comando do terminal faz, em uma linha (Fase 24): o card do Bash e a notificação
// mostram isto ao lado do comando, para os programas conhecidos. É uma explicação independente da
// descrição que o próprio Claude dá ao pedido (que pode estar errada). Não decide nada: o que
// libera ou não continua sendo o seu clique.

type Explainer = string | ((args: string[]) => string | null)

const READS = t(' (só lê)')

/** Os subcomandos de um programa (git, npm, docker…), com uma explicação para os outros. */
const sub =
  (table: Record<string, Explainer>, fallback: string | null) =>
  (args: string[]): string | null => {
    const name = args.find((arg) => !arg.startsWith('-'))
    const entry = name !== undefined ? table[name] : undefined
    if (entry === undefined) return fallback
    return typeof entry === 'string' ? entry : entry(args.slice(args.indexOf(name!) + 1))
  }

const has = (args: string[], ...flags: string[]): boolean =>
  args.some(
    (arg) =>
      flags.includes(arg) ||
      // -rf, -fr: as letras juntas de uma opção curta.
      (/^-[a-zA-Z]+$/.test(arg) &&
        flags.some((flag) => /^-[a-zA-Z]$/.test(flag) && arg.includes(flag[1])))
  )

/** O endereço (só o host) do primeiro argumento que parece uma URL. */
const hostIn = (args: string[]): string | null => {
  for (const arg of args) {
    try {
      const url = new URL(arg)
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.host
    } catch {
      // Não é uma URL.
    }
  }
  return null
}

const firstPlain = (args: string[]): string | null =>
  args.find((arg) => !arg.startsWith('-')) ?? null

const PACKAGES: Record<string, Explainer> = {
  install: t('Instala pacotes (baixa da internet e roda os scripts de instalação deles).'),
  i: t('Instala pacotes (baixa da internet e roda os scripts de instalação deles).'),
  add: t('Instala pacotes (baixa da internet e roda os scripts de instalação deles).'),
  ci: t('Instala os pacotes exatamente como estão no lockfile.'),
  uninstall: t('Remove pacotes do projeto.'),
  remove: t('Remove pacotes do projeto.'),
  rm: t('Remove pacotes do projeto.'),
  test: t('Roda os testes do projeto.'),
  t: t('Roda os testes do projeto.'),
  start: t('Inicia o projeto (o script "start" do package.json).'),
  run: (args) => {
    const script = firstPlain(args)
    return script
      ? t('Roda o script "{script}" do package.json.', { script })
      : t('Lista os scripts do package.json.')
  },
  build: t('Monta o projeto (o script "build").'),
  update: t('Atualiza os pacotes do projeto.'),
  publish: t('Publica o pacote no registro do npm.'),
  audit: t('Procura falhas de segurança conhecidas nos pacotes') + READS + '.',
  ls: t('Lista os pacotes instalados') + READS + '.',
  outdated: t('Lista os pacotes com versão nova') + READS + '.'
}

const SYSTEM_PACKAGES: Record<string, Explainer> = {
  install: t('Instala pacotes do sistema.'),
  remove: t('Remove pacotes do sistema.'),
  purge: t('Remove pacotes do sistema, com as configurações deles.'),
  autoremove: t('Remove pacotes do sistema que ninguém mais usa.'),
  update: t('Atualiza a lista de pacotes disponíveis.'),
  upgrade: t('Atualiza os pacotes do sistema.'),
  search: t('Procura pacotes') + READS + '.',
  show: t('Mostra os detalhes de um pacote') + READS + '.',
  list: t('Lista pacotes') + READS + '.'
}

const SCRIPT = (language: string) => (args: string[]) => {
  const module = args[0] === '-m' ? args[1] : undefined
  if (module) return t('Roda o módulo {module} do {language}.', { module, language })
  if (has(args, '-c', '-e'))
    return t('Roda um trecho de código {language} escrito no próprio comando.', { language })
  const script = firstPlain(args)
  return script
    ? t('Roda o script {script} com o {language}.', { script, language })
    : t('Abre o {language}.', { language })
}

const PROGRAMS: Record<string, Explainer> = {
  ls: t('Lista os arquivos de uma pasta') + READS + '.',
  ll: t('Lista os arquivos de uma pasta') + READS + '.',
  tree: t('Mostra as pastas e os arquivos em árvore') + READS + '.',
  cat: t('Mostra o conteúdo de arquivos') + READS + '.',
  head: t('Mostra o começo de um arquivo') + READS + '.',
  tail: (args) =>
    has(args, '-f', '-F')
      ? t('Acompanha o fim de um arquivo, conforme ele cresce') + READS + '.'
      : t('Mostra o fim de um arquivo') + READS + '.',
  less: t('Mostra um arquivo, página por página') + READS + '.',
  grep: t('Procura um texto dentro de arquivos') + READS + '.',
  rg: t('Procura um texto dentro de arquivos') + READS + '.',
  find: (args) =>
    has(args, '-delete')
      ? t('Procura arquivos e apaga os que achar.')
      : has(args, '-exec', '-execdir', '-ok')
        ? t('Procura arquivos e roda um comando em cada um.')
        : t('Procura arquivos pelo nome ou por outras características') + READS + '.',
  fd: t('Procura arquivos pelo nome') + READS + '.',
  pwd: t('Mostra a pasta atual.'),
  echo: t('Escreve um texto na saída.'),
  printf: t('Escreve um texto na saída.'),
  wc: t('Conta linhas, palavras e caracteres') + READS + '.',
  du: t('Mostra quanto espaço as pastas ocupam') + READS + '.',
  df: t('Mostra o espaço livre nos discos') + READS + '.',
  which: t('Mostra onde fica um programa.'),
  file: t('Diz que tipo de arquivo é') + READS + '.',
  stat: t('Mostra os detalhes de um arquivo') + READS + '.',
  diff: t('Compara arquivos, linha a linha') + READS + '.',
  sort: t('Ordena linhas de texto.'),
  uniq: t('Tira as linhas repetidas.'),
  jq: t('Lê e filtra um JSON.'),
  awk: t('Processa texto, coluna por coluna.'),
  sed: (args) =>
    has(args, '-i') || args.some((arg) => arg.startsWith('--in-place'))
      ? t('Troca textos dentro de arquivos (muda os arquivos).')
      : t('Troca textos na saída (não muda os arquivos).'),
  mkdir: t('Cria uma pasta.'),
  touch: t('Cria um arquivo vazio (ou atualiza a data dele).'),
  cp: t('Copia arquivos.'),
  mv: t('Move ou renomeia arquivos.'),
  rm: (args) =>
    has(args, '-r', '-R', '--recursive')
      ? t('Apaga arquivos e pastas inteiras, sem passar pela lixeira.')
      : t('Apaga arquivos, sem passar pela lixeira.'),
  rmdir: t('Apaga uma pasta vazia.'),
  ln: t('Cria um atalho (link) para um arquivo.'),
  chmod: t('Muda as permissões de arquivos.'),
  chown: t('Muda o dono de arquivos.'),
  tar: (args) =>
    has(args, '-x', '--extract')
      ? t('Extrai os arquivos de um pacote .tar.')
      : has(args, '-c', '--create')
        ? t('Junta arquivos num pacote .tar.')
        : t('Lida com um pacote .tar.'),
  zip: t('Junta arquivos num .zip.'),
  unzip: t('Extrai os arquivos de um .zip.'),
  git: sub(
    {
      status: t('Mostra o que mudou no repositório') + READS + '.',
      diff: t('Mostra as mudanças, linha a linha') + READS + '.',
      log: t('Mostra o histórico de commits') + READS + '.',
      show: t('Mostra um commit') + READS + '.',
      blame: t('Mostra quem mudou cada linha') + READS + '.',
      branch: (args) =>
        has(args, '-d', '-D', '--delete')
          ? t('Apaga uma branch.')
          : firstPlain(args)
            ? t('Cria uma branch.')
            : t('Lista as branches') + READS + '.',
      add: t('Marca mudanças para o próximo commit.'),
      commit: t('Grava as mudanças marcadas num commit (no seu computador).'),
      push: (args) =>
        has(args, '-f', '--force', '--force-with-lease')
          ? t('Envia os commits para o servidor, sobrescrevendo o que estiver lá.')
          : t('Envia os commits para o servidor (o GitHub, por exemplo).'),
      pull: t('Baixa as mudanças do servidor e junta com as suas.'),
      fetch: t('Baixa as novidades do servidor, sem mexer nos seus arquivos.'),
      checkout: t('Troca de branch (ou desfaz as mudanças de um arquivo).'),
      switch: t('Troca de branch.'),
      restore: t('Desfaz mudanças em arquivos.'),
      reset: (args) =>
        has(args, '--hard')
          ? t('Desfaz mudanças e commits, apagando o que não foi guardado.')
          : t('Tira mudanças do próximo commit (ou volta commits, sem apagar arquivos).'),
      revert: t('Cria um commit que desfaz outro.'),
      rebase: t('Reescreve os commits da branch em cima de outra.'),
      merge: t('Junta outra branch nesta.'),
      'cherry-pick': t('Copia um commit para esta branch.'),
      stash: t('Guarda as mudanças de lado, para depois.'),
      clone: t('Baixa um repositório inteiro.'),
      tag: t('Lista ou cria marcações de versão.'),
      clean: t('Apaga os arquivos que o git não acompanha.'),
      remote: t('Lista ou muda os servidores do repositório.'),
      init: t('Cria um repositório novo.')
    },
    t('Um comando do git.')
  ),
  gh: sub(
    {
      pr: t('Mexe com pull requests no GitHub.'),
      issue: t('Mexe com issues no GitHub.'),
      run: t('Mexe com as execuções do CI no GitHub.'),
      repo: t('Mexe com repositórios no GitHub.'),
      api: t('Chama a API do GitHub.')
    },
    t('Um comando do GitHub CLI.')
  ),
  npm: sub(PACKAGES, t('Um comando do npm.')),
  pnpm: sub(PACKAGES, t('Um comando do pnpm.')),
  yarn: sub(PACKAGES, t('Um comando do yarn.')),
  bun: sub(PACKAGES, t('Um comando do bun.')),
  npx: (args) =>
    firstPlain(args)
      ? t('Baixa (se preciso) e roda o programa {v1}, do npm.', { v1: firstPlain(args) })
      : null,
  pip: sub(
    {
      install: t('Instala pacotes do Python (baixa da internet).'),
      uninstall: t('Remove pacotes do Python.'),
      list: t('Lista os pacotes do Python') + READS + '.',
      freeze: t('Lista os pacotes do Python') + READS + '.'
    },
    t('Um comando do pip.')
  ),
  node: SCRIPT('Node.js'),
  python: SCRIPT(t('Python')),
  python3: SCRIPT(t('Python')),
  ruby: SCRIPT(t('Ruby')),
  perl: SCRIPT(t('Perl')),
  bash: SCRIPT('bash'),
  sh: SCRIPT('sh'),
  zsh: SCRIPT('zsh'),
  tsc: t('Confere os tipos do TypeScript (e pode gerar o JavaScript).'),
  eslint: (args) =>
    has(args, '--fix') ? t('Confere o código e corrige o que der.') : t('Confere o código (lint).'),
  prettier: (args) =>
    has(args, '--write', '-w')
      ? t('Formata os arquivos (muda os arquivos).')
      : t('Confere a formatação') + READS + '.',
  pytest: t('Roda os testes do Python.'),
  jest: t('Roda os testes.'),
  vitest: t('Roda os testes.'),
  make: (args) =>
    firstPlain(args)
      ? t('Roda a tarefa "{v1}" do Makefile.', { v1: firstPlain(args) })
      : t('Roda a tarefa padrão do Makefile.'),
  cargo: sub(
    {
      build: t('Compila o projeto Rust.'),
      test: t('Roda os testes do projeto Rust.'),
      run: t('Compila e roda o projeto Rust.'),
      check: t('Confere o código do projeto Rust, sem compilar.'),
      add: t('Adiciona uma dependência ao projeto Rust.')
    },
    t('Um comando do cargo.')
  ),
  go: sub(
    {
      build: t('Compila o projeto Go.'),
      test: t('Roda os testes do projeto Go.'),
      run: t('Compila e roda o programa Go.'),
      get: t('Baixa uma dependência do Go.'),
      mod: t('Mexe nas dependências do projeto Go.')
    },
    t('Um comando do Go.')
  ),
  docker: sub(
    {
      ps: t('Lista os contêineres') + READS + '.',
      images: t('Lista as imagens') + READS + '.',
      logs: t('Mostra a saída de um contêiner') + READS + '.',
      run: t('Cria e roda um contêiner.'),
      build: t('Monta uma imagem.'),
      exec: t('Roda um comando dentro de um contêiner.'),
      stop: t('Para contêineres.'),
      rm: t('Apaga contêineres.'),
      rmi: t('Apaga imagens.'),
      pull: t('Baixa uma imagem.'),
      push: t('Envia uma imagem para um registro.'),
      compose: sub(
        {
          up: t('Sobe os serviços do docker compose.'),
          down: t('Derruba os serviços do docker compose.'),
          ps: t('Lista os serviços do docker compose') + READS + '.',
          logs: t('Mostra a saída dos serviços') + READS + '.',
          build: t('Monta as imagens do docker compose.')
        },
        t('Um comando do docker compose.')
      ),
      system: t('Mexe no Docker como um todo (prune apaga o que não está em uso).')
    },
    t('Um comando do Docker.')
  ),
  systemctl: sub(
    {
      status: t('Mostra o estado de um serviço') + READS + '.',
      start: t('Inicia um serviço.'),
      stop: t('Para um serviço.'),
      restart: t('Reinicia um serviço.'),
      reload: t('Recarrega a configuração de um serviço.'),
      enable: t('Faz um serviço iniciar com o sistema.'),
      disable: t('Faz um serviço não iniciar com o sistema.'),
      'list-units': t('Lista os serviços') + READS + '.'
    },
    t('Um comando do systemd.')
  ),
  journalctl: t('Mostra os registros do sistema') + READS + '.',
  apt: sub(SYSTEM_PACKAGES, t('Um comando do apt.')),
  'apt-get': sub(SYSTEM_PACKAGES, t('Um comando do apt.')),
  dnf: sub(SYSTEM_PACKAGES, t('Um comando do dnf.')),
  pacman: (args) =>
    has(args, '-S')
      ? t('Instala ou atualiza pacotes do sistema.')
      : has(args, '-R')
        ? t('Remove pacotes do sistema.')
        : t('Um comando do pacman.'),
  flatpak: sub(
    {
      install: t('Instala um app Flatpak.'),
      uninstall: t('Remove um app Flatpak.'),
      update: t('Atualiza os apps Flatpak.'),
      list: t('Lista os apps Flatpak') + READS + '.',
      run: t('Abre um app Flatpak.')
    },
    t('Um comando do Flatpak.')
  ),
  curl: (args) => {
    const host = hostIn(args)
    const sends =
      has(args, '-d', '--data', '-F', '--form', '-T', '--upload-file') ||
      args.some((arg, i) => (arg === '-X' || arg === '--request') && args[i + 1] !== 'GET')
    const where = host ? ` (${host})` : ''
    return sends
      ? t('Manda dados para um endereço da internet{where}.', { where })
      : t('Baixa um endereço da internet{where}.', { where })
  },
  wget: (args) => {
    const host = hostIn(args)
    return t('Baixa um endereço da internet{v1}.', { v1: host ? ` (${host})` : '' })
  },
  ssh: t('Abre uma conexão com outra máquina.'),
  scp: t('Copia arquivos de ou para outra máquina.'),
  rsync: t('Copia e sincroniza arquivos entre pastas ou máquinas.'),
  kill: t('Encerra um programa (pelo número dele).'),
  pkill: t('Encerra programas pelo nome.'),
  killall: t('Encerra programas pelo nome.'),
  ps: t('Lista os programas rodando') + READS + '.',
  top: t('Mostra os programas que mais gastam') + READS + '.',
  htop: t('Mostra os programas que mais gastam') + READS + '.',
  code: t('Abre no VS Code.'),
  codium: t('Abre no VSCodium.'),
  'xdg-open': t('Abre com o programa padrão do sistema.'),
  open: t('Abre com o programa padrão do sistema.'),
  date: t('Mostra a data e a hora.'),
  env: t('Mostra as variáveis de ambiente.'),
  history: t('Mostra os comandos digitados antes') + READS + '.'
}

/** Divide em comandos (&&, ||, ;, |), respeitando aspas. */
export function splitCommands(command: string): { parts: string[]; piped: boolean } {
  const parts: string[] = []
  let current = ''
  let quote: string | null = null
  let piped = false
  for (let i = 0; i < command.length; i++) {
    const c = command[i]
    if (quote) {
      if (c === quote) quote = null
      else if (c === '\\' && quote === '"') current += command[i++]
      current += c
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      current += c
      continue
    }
    const two = command.slice(i, i + 2)
    if (two === '&&' || two === '||') {
      parts.push(current)
      current = ''
      i++
      continue
    }
    if (c === ';' || c === '\n' || (c === '|' && command[i + 1] !== '|')) {
      if (c === '|') piped = true
      parts.push(current)
      current = ''
      continue
    }
    current += c
  }
  parts.push(current)
  return { parts: parts.map((part) => part.trim()).filter(Boolean), piped }
}

/** As palavras de um comando, sem as aspas (o suficiente para achar o programa e as opções). */
function words(part: string): string[] {
  const out: string[] = []
  const pattern = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g
  for (let match = pattern.exec(part); match; match = pattern.exec(part)) {
    out.push(match[1] ?? match[2] ?? match[3])
  }
  return out
}

/** Um comando simples: o que ele faz, ou null se o programa não é conhecido. */
function explainOne(part: string): string | null {
  let args = words(part)
  let admin = false
  // Variáveis antes do programa (FOO=1 npm test) e os prefixos que só mudam como ele roda.
  for (;;) {
    const first = args[0]
    if (first === undefined) return null
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(first)) args = args.slice(1)
    else if (first === 'sudo' || first === 'doas') {
      admin = true
      args = args.slice(1)
      while (args[0]?.startsWith('-')) args = args.slice(1)
    } else if (['time', 'nice', 'nohup', 'exec', 'command'].includes(first)) args = args.slice(1)
    else break
  }
  const program = args[0].split('/').pop() ?? ''
  const entry = PROGRAMS[program]
  if (entry === undefined) return null
  const text = typeof entry === 'string' ? entry : entry(args.slice(1))
  if (!text) return null
  return admin ? t('{text} Como administrador (sudo).', { text }) : text
}

/**
 * O que o comando faz, em uma linha, ou null se o programa não é conhecido. Num "cd pasta && …",
 * explica o que vem depois; em vários comandos, o primeiro e quantos mais.
 */
export function explainCommand(command: string): string | null {
  const { parts, piped } = splitCommands(command.trim())
  let list = parts
  let folder: string | null = null
  if (list.length > 1 && /^cd(\s|$)/.test(list[0])) {
    folder = words(list[0])[1] ?? null
    list = list.slice(1)
  }
  const [first, ...rest] = list
  if (!first) return null
  const text = explainOne(first)
  if (!text) return null
  const where = folder ? t(' Na pasta {folder}.', { folder }) : ''
  if (!rest.length) return text + where
  const more =
    rest.length === 1 ? t('mais um comando') : t('mais {length} comandos', { length: rest.length })
  return t('{text}{where} Depois, {v3}{more}.', {
    text,
    where,
    v3: piped ? t('passa o resultado para ') : '',
    more
  })
}
