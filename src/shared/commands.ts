// O que um comando do terminal faz, em uma linha (Fase 24): o card do Bash e a notificação
// mostram isto ao lado do comando, para os programas conhecidos. É uma explicação independente da
// descrição que o próprio Claude dá ao pedido (que pode estar errada). Não decide nada: o que
// libera ou não continua sendo o seu clique.

type Explainer = string | ((args: string[]) => string | null)

const READS = ' (só lê)'

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
  install: 'Instala pacotes (baixa da internet e roda os scripts de instalação deles).',
  i: 'Instala pacotes (baixa da internet e roda os scripts de instalação deles).',
  add: 'Instala pacotes (baixa da internet e roda os scripts de instalação deles).',
  ci: 'Instala os pacotes exatamente como estão no lockfile.',
  uninstall: 'Remove pacotes do projeto.',
  remove: 'Remove pacotes do projeto.',
  rm: 'Remove pacotes do projeto.',
  test: 'Roda os testes do projeto.',
  t: 'Roda os testes do projeto.',
  start: 'Inicia o projeto (o script "start" do package.json).',
  run: (args) => {
    const script = firstPlain(args)
    return script
      ? `Roda o script "${script}" do package.json.`
      : 'Lista os scripts do package.json.'
  },
  build: 'Monta o projeto (o script "build").',
  update: 'Atualiza os pacotes do projeto.',
  publish: 'Publica o pacote no registro do npm.',
  audit: 'Procura falhas de segurança conhecidas nos pacotes' + READS + '.',
  ls: 'Lista os pacotes instalados' + READS + '.',
  outdated: 'Lista os pacotes com versão nova' + READS + '.'
}

const SYSTEM_PACKAGES: Record<string, Explainer> = {
  install: 'Instala pacotes do sistema.',
  remove: 'Remove pacotes do sistema.',
  purge: 'Remove pacotes do sistema, com as configurações deles.',
  autoremove: 'Remove pacotes do sistema que ninguém mais usa.',
  update: 'Atualiza a lista de pacotes disponíveis.',
  upgrade: 'Atualiza os pacotes do sistema.',
  search: 'Procura pacotes' + READS + '.',
  show: 'Mostra os detalhes de um pacote' + READS + '.',
  list: 'Lista pacotes' + READS + '.'
}

const SCRIPT = (language: string) => (args: string[]) => {
  const module = args[0] === '-m' ? args[1] : undefined
  if (module) return `Roda o módulo ${module} do ${language}.`
  if (has(args, '-c', '-e'))
    return `Roda um trecho de código ${language} escrito no próprio comando.`
  const script = firstPlain(args)
  return script ? `Roda o script ${script} com o ${language}.` : `Abre o ${language}.`
}

const PROGRAMS: Record<string, Explainer> = {
  ls: 'Lista os arquivos de uma pasta' + READS + '.',
  ll: 'Lista os arquivos de uma pasta' + READS + '.',
  tree: 'Mostra as pastas e os arquivos em árvore' + READS + '.',
  cat: 'Mostra o conteúdo de arquivos' + READS + '.',
  head: 'Mostra o começo de um arquivo' + READS + '.',
  tail: (args) =>
    has(args, '-f', '-F')
      ? 'Acompanha o fim de um arquivo, conforme ele cresce' + READS + '.'
      : 'Mostra o fim de um arquivo' + READS + '.',
  less: 'Mostra um arquivo, página por página' + READS + '.',
  grep: 'Procura um texto dentro de arquivos' + READS + '.',
  rg: 'Procura um texto dentro de arquivos' + READS + '.',
  find: (args) =>
    has(args, '-delete')
      ? 'Procura arquivos e apaga os que achar.'
      : has(args, '-exec', '-execdir', '-ok')
        ? 'Procura arquivos e roda um comando em cada um.'
        : 'Procura arquivos pelo nome ou por outras características' + READS + '.',
  fd: 'Procura arquivos pelo nome' + READS + '.',
  pwd: 'Mostra a pasta atual.',
  echo: 'Escreve um texto na saída.',
  printf: 'Escreve um texto na saída.',
  wc: 'Conta linhas, palavras e caracteres' + READS + '.',
  du: 'Mostra quanto espaço as pastas ocupam' + READS + '.',
  df: 'Mostra o espaço livre nos discos' + READS + '.',
  which: 'Mostra onde fica um programa.',
  file: 'Diz que tipo de arquivo é' + READS + '.',
  stat: 'Mostra os detalhes de um arquivo' + READS + '.',
  diff: 'Compara arquivos, linha a linha' + READS + '.',
  sort: 'Ordena linhas de texto.',
  uniq: 'Tira as linhas repetidas.',
  jq: 'Lê e filtra um JSON.',
  awk: 'Processa texto, coluna por coluna.',
  sed: (args) =>
    has(args, '-i') || args.some((arg) => arg.startsWith('--in-place'))
      ? 'Troca textos dentro de arquivos (muda os arquivos).'
      : 'Troca textos na saída (não muda os arquivos).',
  mkdir: 'Cria uma pasta.',
  touch: 'Cria um arquivo vazio (ou atualiza a data dele).',
  cp: 'Copia arquivos.',
  mv: 'Move ou renomeia arquivos.',
  rm: (args) =>
    has(args, '-r', '-R', '--recursive')
      ? 'Apaga arquivos e pastas inteiras, sem passar pela lixeira.'
      : 'Apaga arquivos, sem passar pela lixeira.',
  rmdir: 'Apaga uma pasta vazia.',
  ln: 'Cria um atalho (link) para um arquivo.',
  chmod: 'Muda as permissões de arquivos.',
  chown: 'Muda o dono de arquivos.',
  tar: (args) =>
    has(args, '-x', '--extract')
      ? 'Extrai os arquivos de um pacote .tar.'
      : has(args, '-c', '--create')
        ? 'Junta arquivos num pacote .tar.'
        : 'Lida com um pacote .tar.',
  zip: 'Junta arquivos num .zip.',
  unzip: 'Extrai os arquivos de um .zip.',
  git: sub(
    {
      status: 'Mostra o que mudou no repositório' + READS + '.',
      diff: 'Mostra as mudanças, linha a linha' + READS + '.',
      log: 'Mostra o histórico de commits' + READS + '.',
      show: 'Mostra um commit' + READS + '.',
      blame: 'Mostra quem mudou cada linha' + READS + '.',
      branch: (args) =>
        has(args, '-d', '-D', '--delete')
          ? 'Apaga uma branch.'
          : firstPlain(args)
            ? 'Cria uma branch.'
            : 'Lista as branches' + READS + '.',
      add: 'Marca mudanças para o próximo commit.',
      commit: 'Grava as mudanças marcadas num commit (no seu computador).',
      push: (args) =>
        has(args, '-f', '--force', '--force-with-lease')
          ? 'Envia os commits para o servidor, sobrescrevendo o que estiver lá.'
          : 'Envia os commits para o servidor (o GitHub, por exemplo).',
      pull: 'Baixa as mudanças do servidor e junta com as suas.',
      fetch: 'Baixa as novidades do servidor, sem mexer nos seus arquivos.',
      checkout: 'Troca de branch (ou desfaz as mudanças de um arquivo).',
      switch: 'Troca de branch.',
      restore: 'Desfaz mudanças em arquivos.',
      reset: (args) =>
        has(args, '--hard')
          ? 'Desfaz mudanças e commits, apagando o que não foi guardado.'
          : 'Tira mudanças do próximo commit (ou volta commits, sem apagar arquivos).',
      revert: 'Cria um commit que desfaz outro.',
      rebase: 'Reescreve os commits da branch em cima de outra.',
      merge: 'Junta outra branch nesta.',
      'cherry-pick': 'Copia um commit para esta branch.',
      stash: 'Guarda as mudanças de lado, para depois.',
      clone: 'Baixa um repositório inteiro.',
      tag: 'Lista ou cria marcações de versão.',
      clean: 'Apaga os arquivos que o git não acompanha.',
      remote: 'Lista ou muda os servidores do repositório.',
      init: 'Cria um repositório novo.'
    },
    'Um comando do git.'
  ),
  gh: sub(
    {
      pr: 'Mexe com pull requests no GitHub.',
      issue: 'Mexe com issues no GitHub.',
      run: 'Mexe com as execuções do CI no GitHub.',
      repo: 'Mexe com repositórios no GitHub.',
      api: 'Chama a API do GitHub.'
    },
    'Um comando do GitHub CLI.'
  ),
  npm: sub(PACKAGES, 'Um comando do npm.'),
  pnpm: sub(PACKAGES, 'Um comando do pnpm.'),
  yarn: sub(PACKAGES, 'Um comando do yarn.'),
  bun: sub(PACKAGES, 'Um comando do bun.'),
  npx: (args) =>
    firstPlain(args) ? `Baixa (se preciso) e roda o programa ${firstPlain(args)}, do npm.` : null,
  pip: sub(
    {
      install: 'Instala pacotes do Python (baixa da internet).',
      uninstall: 'Remove pacotes do Python.',
      list: 'Lista os pacotes do Python' + READS + '.',
      freeze: 'Lista os pacotes do Python' + READS + '.'
    },
    'Um comando do pip.'
  ),
  node: SCRIPT('Node.js'),
  python: SCRIPT('Python'),
  python3: SCRIPT('Python'),
  ruby: SCRIPT('Ruby'),
  perl: SCRIPT('Perl'),
  bash: SCRIPT('bash'),
  sh: SCRIPT('sh'),
  zsh: SCRIPT('zsh'),
  tsc: 'Confere os tipos do TypeScript (e pode gerar o JavaScript).',
  eslint: (args) =>
    has(args, '--fix') ? 'Confere o código e corrige o que der.' : 'Confere o código (lint).',
  prettier: (args) =>
    has(args, '--write', '-w')
      ? 'Formata os arquivos (muda os arquivos).'
      : 'Confere a formatação' + READS + '.',
  pytest: 'Roda os testes do Python.',
  jest: 'Roda os testes.',
  vitest: 'Roda os testes.',
  make: (args) =>
    firstPlain(args)
      ? `Roda a tarefa "${firstPlain(args)}" do Makefile.`
      : 'Roda a tarefa padrão do Makefile.',
  cargo: sub(
    {
      build: 'Compila o projeto Rust.',
      test: 'Roda os testes do projeto Rust.',
      run: 'Compila e roda o projeto Rust.',
      check: 'Confere o código do projeto Rust, sem compilar.',
      add: 'Adiciona uma dependência ao projeto Rust.'
    },
    'Um comando do cargo.'
  ),
  go: sub(
    {
      build: 'Compila o projeto Go.',
      test: 'Roda os testes do projeto Go.',
      run: 'Compila e roda o programa Go.',
      get: 'Baixa uma dependência do Go.',
      mod: 'Mexe nas dependências do projeto Go.'
    },
    'Um comando do Go.'
  ),
  docker: sub(
    {
      ps: 'Lista os contêineres' + READS + '.',
      images: 'Lista as imagens' + READS + '.',
      logs: 'Mostra a saída de um contêiner' + READS + '.',
      run: 'Cria e roda um contêiner.',
      build: 'Monta uma imagem.',
      exec: 'Roda um comando dentro de um contêiner.',
      stop: 'Para contêineres.',
      rm: 'Apaga contêineres.',
      rmi: 'Apaga imagens.',
      pull: 'Baixa uma imagem.',
      push: 'Envia uma imagem para um registro.',
      compose: sub(
        {
          up: 'Sobe os serviços do docker compose.',
          down: 'Derruba os serviços do docker compose.',
          ps: 'Lista os serviços do docker compose' + READS + '.',
          logs: 'Mostra a saída dos serviços' + READS + '.',
          build: 'Monta as imagens do docker compose.'
        },
        'Um comando do docker compose.'
      ),
      system: 'Mexe no Docker como um todo (prune apaga o que não está em uso).'
    },
    'Um comando do Docker.'
  ),
  systemctl: sub(
    {
      status: 'Mostra o estado de um serviço' + READS + '.',
      start: 'Inicia um serviço.',
      stop: 'Para um serviço.',
      restart: 'Reinicia um serviço.',
      reload: 'Recarrega a configuração de um serviço.',
      enable: 'Faz um serviço iniciar com o sistema.',
      disable: 'Faz um serviço não iniciar com o sistema.',
      'list-units': 'Lista os serviços' + READS + '.'
    },
    'Um comando do systemd.'
  ),
  journalctl: 'Mostra os registros do sistema' + READS + '.',
  apt: sub(SYSTEM_PACKAGES, 'Um comando do apt.'),
  'apt-get': sub(SYSTEM_PACKAGES, 'Um comando do apt.'),
  dnf: sub(SYSTEM_PACKAGES, 'Um comando do dnf.'),
  pacman: (args) =>
    has(args, '-S')
      ? 'Instala ou atualiza pacotes do sistema.'
      : has(args, '-R')
        ? 'Remove pacotes do sistema.'
        : 'Um comando do pacman.',
  flatpak: sub(
    {
      install: 'Instala um app Flatpak.',
      uninstall: 'Remove um app Flatpak.',
      update: 'Atualiza os apps Flatpak.',
      list: 'Lista os apps Flatpak' + READS + '.',
      run: 'Abre um app Flatpak.'
    },
    'Um comando do Flatpak.'
  ),
  curl: (args) => {
    const host = hostIn(args)
    const sends =
      has(args, '-d', '--data', '-F', '--form', '-T', '--upload-file') ||
      args.some((arg, i) => (arg === '-X' || arg === '--request') && args[i + 1] !== 'GET')
    const where = host ? ` (${host})` : ''
    return sends
      ? `Manda dados para um endereço da internet${where}.`
      : `Baixa um endereço da internet${where}.`
  },
  wget: (args) => {
    const host = hostIn(args)
    return `Baixa um endereço da internet${host ? ` (${host})` : ''}.`
  },
  ssh: 'Abre uma conexão com outra máquina.',
  scp: 'Copia arquivos de ou para outra máquina.',
  rsync: 'Copia e sincroniza arquivos entre pastas ou máquinas.',
  kill: 'Encerra um programa (pelo número dele).',
  pkill: 'Encerra programas pelo nome.',
  killall: 'Encerra programas pelo nome.',
  ps: 'Lista os programas rodando' + READS + '.',
  top: 'Mostra os programas que mais gastam' + READS + '.',
  htop: 'Mostra os programas que mais gastam' + READS + '.',
  code: 'Abre no VS Code.',
  codium: 'Abre no VSCodium.',
  'xdg-open': 'Abre com o programa padrão do sistema.',
  open: 'Abre com o programa padrão do sistema.',
  date: 'Mostra a data e a hora.',
  env: 'Mostra as variáveis de ambiente.',
  history: 'Mostra os comandos digitados antes' + READS + '.'
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
  return admin ? `${text} Como administrador (sudo).` : text
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
  const where = folder ? ` Na pasta ${folder}.` : ''
  if (!rest.length) return text + where
  const more = rest.length === 1 ? 'mais um comando' : `mais ${rest.length} comandos`
  return `${text}${where} Depois, ${piped ? 'passa o resultado para ' : ''}${more}.`
}
