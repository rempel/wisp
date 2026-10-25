# Contribuindo com o Wisp

Obrigado pelo interesse! Este guia diz como montar o projeto, rodar os testes e onde fica cada
parte. O [README](README.md) explica o que o Wisp faz e como usar; o [ROADMAP](ROADMAP.md), o que vem
por aí; e a [arquitetura](docs/ARQUITETURA.md), como as partes se encaixam.

## Antes de começar

- **Ideias novas entram no ROADMAP primeiro.** O trabalho vai por fases, cada uma com um aceite que
  dá para conferir. Abra uma issue contando o que você quer fazer e por quê.
- **Os princípios valem para toda mudança** (estão no fim do ROADMAP): nada que muda a máquina roda
  sem um clique seu; nenhum arquivo de configuração do usuário é alterado sem backup, diff e
  confirmação; sem telemetria e rede só para o que foi configurado; segredos no Secret Service; e o
  Wisp parado não gasta CPU perceptível.
- **Segurança:** o Claude Code nunca roda com `--dangerously-skip-permissions`; a
  `ANTHROPIC_API_KEY` sai do ambiente antes de subir o Claude Code; programas sobem com `spawn` e
  uma lista de argumentos, nunca uma string para o shell; o servidor MCP fica só em `127.0.0.1`, numa
  porta e com um token sorteados.
- **Idioma:** os comentários do código e as mensagens de commit são em português do Brasil, em
  frases curtas e diretas. A interface tem português e inglês (veja
  [Textos e idiomas](#textos-e-idiomas)).

## Montar e rodar

Siga o [Compilar a partir do código](README.md#compilar-a-partir-do-código) do README (as
dependências do sistema, o Node 22 e o `npm ci`). Depois:

```sh
npm run dev      # abre o app com recarga automática
npm run build    # confere os tipos e monta em out/
```

## Testes

Rode tudo isto antes de mandar uma mudança:

```sh
npm run typecheck
npm run lint
npx prettier --check .
npm test                 # testes de unidade (test/)
npm run i18n             # os textos sem tradução para o inglês
npm run build && e2e/run.sh e2e/<o-que-voce-mexeu>.mjs
```

- **Unidade** (`test/*.test.ts`): cada arquivo vira um CommonJS (esbuild) e roda com `node --test`,
  num processo e num HOME temporário só dele. `npm test -- stream terminal` roda só esses arquivos.
- **Ponta a ponta** (`e2e/*.mjs`): cada roteiro abre o app montado num HOME temporário, num X virtual
  (Xvfb) e num D-Bus só dele, e controla as páginas pelo protocolo do DevTools. `e2e/run.sh` sem
  argumentos roda todos.
- **De mentira, para os testes** (`test/fixtures/`): o Claude Code (`fake-claude`, que fala
  stream-json, tem um modo interativo e lembra as sessões), o gh, o whisper, o Piper, o ntfy, o
  chaveiro (Secret Service) e o servidor de notificações. Nenhum teste usa a rede de verdade nem o
  Claude Code de verdade.
- **À mão:** cada fase tem um roteiro de aceite com o Claude Code de verdade em
  [docs/VALIDACAO.md](docs/VALIDACAO.md).
- **Consumo:** o `e2e/consumo.mjs` mede a memória e a CPU; o CI põe os números no resumo do job.

## Onde fica cada parte

| Pasta                  | O que tem                                                                 |
| ---------------------- | ------------------------------------------------------------------------- |
| `src/main/`            | O processo principal: o Claude Code, as conversas, o MCP, o D-Bus, a voz… |
| `src/main/hooks/`      | Os hooks do Claude Code no terminal (a aba Sessões) e o relay deles       |
| `src/preload/`         | A ponte entre as páginas e o main (a API `window.wisp`)                   |
| `src/renderer/mascot/` | A página do mascote e da ilha                                             |
| `src/renderer/chat/`   | A página do painel: abas, conversa, cards, configurações, histórico       |
| `src/shared/`          | O que o main e as páginas usam: o IPC, o diff, os comandos, os textos     |
| `resources/`           | Os ícones, as gravações do modo demonstração e a persona do Claude        |
| `build/`               | Os ícones dos pacotes, o afterPack e o Flatpak (`build/flatpak/`)         |
| `scripts/`             | Os testes de unidade, os ícones, os pacotes ARM64 e as conferências       |
| `test/`, `e2e/`        | Os testes                                                                 |
| `docs/`                | A arquitetura e os roteiros de validação                                  |

A [arquitetura](docs/ARQUITETURA.md) descreve cada arquivo e cada parte.

- **Arquivos de até 1.000 linhas** (o `test/manutencao.test.ts` confere; o dicionário em inglês é a
  exceção). Um que cresce demais vira módulos por assunto, e o módulo antigo reexporta o que saiu
  dele, para quem o importa não mudar.
- **O CSS** de cada página fica em folhas por assunto, em `styles/`, ligadas pelo `chat.css` e pelo
  `mascot.css` com `@import`, na ordem da cascata. Uma folha nova entra lá, no lugar certo.

## Textos e idiomas

Todo texto que aparece para quem usa (na interface, num aviso, numa notificação ou num erro) passa
por `t()`, de `src/shared/i18n.ts`. O texto em português fica no código e é a chave; o inglês fica
em `src/shared/i18n-en.ts`:

```ts
t('Abrir o painel')
t('Passo {v1} de {total}', { v1: step, total }) // as variáveis vão entre chaves
```

- **Um texto novo** pede a entrada dele no `i18n-en.ts`, com as mesmas `{variáveis}`. O
  `test/idiomas.test.ts` falha com o arquivo e a linha do que faltou; `npm run i18n` lista tudo de
  uma vez (e as traduções que nenhum código usa mais). Para muitas de uma vez,
  `node scripts/i18n-add.mjs novas.json` acrescenta um JSON `{"português": "English"}` ao
  dicionário.
- **Frases inteiras:** um texto partido em pedaços (por causa de um `<strong>` no meio, por
  exemplo) vira pedaços no outro idioma também, então prefira uma frase por `t()` sempre que der.
  Para um plural, dois textos (`t('1 passo')` e `t('{count} passos', { count })`).
- **Datas e números:** `dateLocale()` diz o idioma para o `Intl` e o `toLocaleString`.
- **O que fica em português:** os nomes das ferramentas e dos campos do config.json, os comandos de
  voz rápidos ("pausa a música") e as gravações do modo demonstração.
- **O idioma** é decidido uma vez, quando o app abre (o `language` do config.json, ou o do sistema):
  no main, `src/main/locale-init.ts` é o primeiro import; nas páginas, ele vem na URL (`?lang=en`).
  Trocar nas configurações pede para abrir o Wisp de novo.
- **Outro idioma** é um dicionário novo como o `i18n-en.ts`, uma entrada no `Locale` e no
  `LANGUAGE_SETTINGS` de `i18n.ts`, e o nome dele nas configurações.

## Pacotes

```sh
npm run dist                 # .deb e AppImage (x86-64) em dist/
scripts/package-arm64.sh     # .deb e AppImage para ARM64, num x86-64 (compilação cruzada)
scripts/smoke-packages.sh    # confere os pacotes x86-64 e abre o AppImage
scripts/smoke-arm64.sh       # confere a arquitetura e o conteúdo dos pacotes ARM64
```

O Flatpak se monta com o `flatpak-builder` sobre o app já empacotado (`build/flatpak/`, veja o
comentário no topo do manifesto); o CI monta, instala e abre.

## Mandando a mudança

- Um pull request por assunto, com o que mudou e como conferir.
- Commits com mensagens em português, dizendo o que mudou e por quê.
- O CI precisa passar: tipos, lint, formatação, unidade, ponta a ponta e os pacotes. O job
  **Dependências** só avisa: o que ele aponta pode ir num pull request à parte.
- Ao contribuir, você concorda que a sua contribuição sai sob a mesma licença do projeto, a
  [GPL-3.0 ou mais nova](LICENSE).
