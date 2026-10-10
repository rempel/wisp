# Wisp

> _A little light on your desktop._

Um assistente para Linux com um mascote animado que flutua na tela. O cérebro é o
[Claude Code](https://docs.claude.com/en/docs/claude-code) rodando em modo headless.

**Status:** Etapa 4 de 5 (mascote + chat com o Claude Code + ferramentas de desktop com pedido
de permissão + anexos). Os estados do mascote e o ícone na bandeja entram na Etapa 5. O que vem
depois do MVP está no [ROADMAP.md](ROADMAP.md).

## Requisitos

- Linux com GNOME ou KDE Plasma, em Wayland (via XWayland) ou X11
- Node.js 22.12 ou mais novo, e npm
- [Claude Code](https://docs.claude.com/en/docs/claude-code) instalado e logado com a sua
  assinatura: rode `claude` no terminal uma vez e faça o login
- Para abrir apps: `gtk-launch` (pacote `libgtk-3-bin` no Ubuntu/Debian) ou `gio` (pacote
  `libglib2.0-bin`, que já vem com o GNOME); no KDE, o `kioclient` também serve. Para abrir
  links: `xdg-open` (pacote `xdg-utils`)

## Rodando

```sh
npm install
npm run dev
```

Vindo de uma etapa anterior, rode `npm install` de novo: a Etapa 3 trouxe uma dependência nova
(o SDK do MCP).

Na primeira vez, o `npm run dev` baixa o binário do Electron (~120 MB). Desde o Electron 42
o download não acontece mais no `npm install`.

O app roda sempre em XWayland (`--ozone-platform=x11`, já incluído em `npm run dev` e
`npm start`). No GNOME Wayland, um app Wayland nativo não pode escolher a própria posição nem
ficar sempre no topo; via XWayland, as duas coisas funcionam igual no GNOME e no KDE.

### Ubuntu 24.04 ou mais novo (inclusive o 26.04)

O AppArmor do Ubuntu bloqueia o sandbox do Chromium para binários que não são do sistema,
como o Electron dentro de `node_modules`. Sem ajuste, o app fecha logo ao abrir com
`No usable sandbox!`. Rode uma vez (pede sudo):

```sh
npm run setup:apparmor
```

O script cria um perfil do AppArmor só para o `node_modules/electron/dist/electron` deste
projeto. Se você mover a pasta do projeto, rode de novo.

## Validando

### Mascote (Etapa 1)

- [ ] O mascote aparece no canto inferior direito, acima da barra/dock, com fundo transparente.
- [ ] Ele flutua, a antena balança com o LED da ponta "respirando", os olhos de LED piscam e
      às vezes olham para os lados, e os bits orbitam em volta.
- [ ] Ele fica por cima das outras janelas, inclusive de uma janela maximizada.
- [ ] Arrastar move o mascote; um clique sem arrastar faz ele "quicar".
- [ ] Depois de fechar (Ctrl+C no terminal) e abrir de novo, ele volta para onde você deixou.
- [ ] Ele não aparece na barra de tarefas, na dock nem no Alt+Tab, e acompanha a troca de
      workspace.

### Chat (Etapa 2)

- [ ] Clicar no mascote abre o painel ao lado dele. Com o painel em foco, outro clique (ou Esc,
      ou o ×) esconde; se o painel estiver aberto atrás de outra janela, o clique o traz para
      a frente.
- [ ] Uma pergunta simples é respondida em streaming: o texto vai aparecendo aos poucos.
- [ ] Enter envia e Shift+Enter quebra a linha.
- [ ] Respostas com código mostram o bloco com o botão **Copiar**.
- [ ] Pedir para ler um arquivo ("lê o ~/.bashrc e resume") mostra o card da ferramenta, que
      abre para mostrar a entrada e a saída.
- [ ] O botão de parar interrompe a resposta, e a próxima mensagem continua a mesma conversa.
- [ ] O **+** começa uma conversa nova, do zero.
- [ ] Sem o Claude Code logado, o painel mostra "Rode `claude` no terminal e faça login".

### Ferramentas de desktop e permissões (Etapa 3)

Antes, aponte `projectRoots` para a pasta dos seus projetos e `editorCommand` para o seu editor
no `~/.config/wisp/config.json` (veja [Configuração](#configuração)).

- [ ] "abre o Firefox": aparece o card **Abrir um app** com o id do app. **Permitir** abre o
      Firefox; **Negar** não abre, e o Wisp aceita sem tentar outro caminho.
- [ ] "pesquisa fogo-fátuo": abre a busca no navegador padrão, sem pedir permissão.
- [ ] "abre o projeto X": o Wisp lista os projetos, mostra o card **Abrir um projeto no
      editor** com a pasta e, ao permitir, abre no seu editor.
- [ ] "roda `ls` no terminal": aparece o card **Rodar um comando no terminal** com o comando,
      e o cabeçalho mostra "esperando sua permissão…". Todo comando pede permissão, até os que
      só leem.
- [ ] **Permitir sempre nesta conversa** libera o mesmo comando (no `Bash`) ou a mesma
      ferramenta (nas outras) até você clicar no **+**; depois disso, pede de novo.
- [ ] Com o painel escondido (Esc), um pedido de permissão faz ele reaparecer, sem roubar o
      foco da janela em que você está.
- [ ] Parar com um card esperando marca o card como **Cancelado**.
- [ ] "me manda uma notificação dizendo oi" mostra uma notificação do sistema.
- [ ] Ler um arquivo de segredos (em `~/.ssh`, `~/.aws`, `.env`…) mostra o card **Ler um
      arquivo protegido**; ler os outros arquivos continua direto.

### Anexos (Etapa 4)

- [ ] O clipe ao lado da caixa de texto abre o seletor de arquivos, e dá para escolher vários.
      Imagens aparecem como miniatura; os outros arquivos, como um chip com nome e tamanho.
- [ ] Arrastar arquivos do gerenciador de arquivos para o painel mostra **Solte para anexar**,
      e soltar anexa.
- [ ] Com uma imagem anexada, "o que tem nessa imagem?" é respondido: o Wisp lê a imagem (card
      **Read** com o nome do arquivo) e descreve o que tem nela.
- [ ] Um PDF ou um texto anexado também é lido ("resume esse PDF").
- [ ] O × remove um anexo antes do envio, e dá para mandar só anexos, sem texto.
- [ ] Pastas e arquivos acima de 50 MB são recusados com um aviso em vermelho acima da caixa.
- [ ] As cópias ficam em `~/.cache/wisp/anexos/<id da conversa>/`, e uma conversa nova usa outra
      pasta.

## Visual do mascote

O Wisp é uma **gotinha robô**: casco ciano-turquesa brilhante (`#5EEAD4` → `#22D3EE`) com
contorno, junta e parafusos, um visor escuro com dois olhos de LED, uma antena com uma lâmpada
de LED na ponta e "bits" quadradinhos em órbita, tudo com um glow suave. Os estados das próximas
etapas seguem o mesmo estilo:

| Estado            | Como fica                                                                 |
| ----------------- | ------------------------------------------------------------------------- |
| Ocioso            | Flutua, a antena balança, o LED respira, os olhos piscam e olham em volta |
| Falando           | O brilho pulsa no ritmo do texto e os LEDs dos olhos se animam            |
| Trabalhando       | Os bits orbitam mais rápido, a antena se estica e o LED dela pisca rápido |
| Pedindo permissão | Casco e LEDs âmbar (`#FBBF24`), olhos virados para o chat e "?" no visor  |
| Feliz             | Dá um pulinho, os olhos viram `^ ^` e solta bits                          |
| Erro              | Fica coral (`#F87171`), treme e os olhos viram "x" no visor               |

As cores ficam em variáveis no topo de `mascot.css`, então cada estado só precisa trocá-las.

## Configuração

Fica em `~/.config/wisp/config.json` e é criada com os padrões na primeira execução:

```json
{
  "claudePath": "claude",
  "editorCommand": "code",
  "projectRoots": ["~/projetos"],
  "mascotPosition": null,
  "extraAllowedTools": []
}
```

`mascotPosition` é atualizada sempre que você solta o mascote. Para ele voltar ao canto
padrão, troque por `null`. Se um campo tiver um valor inválido, o Wisp avisa no terminal e usa
o padrão daquele campo, sem apagar o que você escreveu. Se o arquivo não for um JSON válido,
ele continua com a configuração anterior (ou com os padrões, se acabou de abrir) e não
sobrescreve o arquivo até você corrigir.

Dá para editar o arquivo com o Wisp aberto: `projectRoots` e `editorCommand` valem na hora;
`claudePath` e `extraAllowedTools`, na próxima vez que o app abrir.

`claudePath` é o comando do Claude Code. Um nome simples é procurado no `PATH` e também em
`~/.local/bin` e `~/.claude/local`, onde os instaladores costumam colocá-lo.

`projectRoots` são as pastas onde o Wisp procura projetos: pastas com `.git` até dois níveis
abaixo delas (pulando pastas ocultas, `node_modules`, `build` etc.). Só projetos dentro delas
podem ser abertos. `editorCommand` é o comando do editor, com argumentos se precisar (`code -n`,
`codium`, `flatpak run com.visualstudio.code`); a pasta do projeto vai como último argumento.

Ferramentas em `extraAllowedTools` passam a rodar sem o card, além das já liberadas. Por
exemplo, `"mcp__desktop__open_app"` para abrir apps sem perguntar. Comandos `Bash` são a
exceção: sempre pedem permissão, mesmo listados aqui.

Os dados internos do Chromium (cache etc.) ficam em `~/.cache/wisp/electron`, fora da pasta
de configuração. O Claude Code roda em `~/.local/share/wisp/workspace/`, cujo `CLAUDE.md` define
a persona do Wisp. Ele é criado na primeira vez e depois você pode editá-lo à vontade.

Os anexos são copiados para `~/.cache/wisp/anexos/<id da conversa>/`. Quando o app abre, ele
apaga as pastas de conversas com mais de 7 dias.

## Problemas comuns

| Sintoma                                    | O que fazer                                                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Fecha na hora com `No usable sandbox!`     | `npm run setup:apparmor` (veja acima)                                                                          |
| Rodando como root, recusa abrir            | `npm run dev -- --no-sandbox` (só para teste)                                                                  |
| Quadrado preto em vez de transparência     | Confira se a composição está ligada (no KDE X11: Alt+Shift+F12) ou tente `npm run dev -- --disable-gpu`        |
| Não fica no topo ou não se move            | Confira se o processo recebeu `--ozone-platform=x11`; o terminal avisa quando ele roda como app Wayland nativo |
| "Não encontrei o Claude Code"              | Informe o caminho completo do `claude` em `claudePath` no `config.json`                                        |
| Aviso de "chave de API, cobrada por uso"   | Tire o `ANTHROPIC_API_KEY`/`apiKeyHelper` da configuração do Claude Code e faça login com a assinatura         |
| "Não achei um lançador de apps"            | Instale o `libgtk-3-bin` (gtk-launch) ou o `libglib2.0-bin` (gio)                                              |
| "Não achei o editor"                       | Ajuste `editorCommand` no `config.json` para um comando que exista no `PATH`                                   |
| O projeto não aparece ou não abre          | Confira `projectRoots`: o projeto precisa ter `.git` e estar até dois níveis dentro de uma dessas pastas       |
| "As ferramentas do desktop não conectaram" | Veja o erro no terminal onde o app roda; sem o servidor, o chat funciona, mas sem abrir apps, links e projetos |
| "… não veio de uma pasta do computador"    | O arraste veio de um app que não entrega um arquivo (ex.: imagem de uma página). Salve o arquivo e anexe-o     |

Argumentos depois de `--` em `npm run dev -- ...` vão direto para o Electron.

## Scripts

| Comando                  | O que faz                                     |
| ------------------------ | --------------------------------------------- |
| `npm run dev`            | Abre o app com recarga automática             |
| `npm start`              | Gera a build e abre a versão de produção      |
| `npm run build`          | Typecheck + build em `out/`                   |
| `npm run typecheck`      | Checa os tipos do main/preload e do renderer  |
| `npm run lint`           | ESLint                                        |
| `npm run format`         | Prettier                                      |
| `npm run setup:apparmor` | Libera o sandbox do Electron no Ubuntu 24.04+ |

## Como funciona

```
src/
├─ main/
│  ├─ index.ts       # ciclo de vida do app
│  ├─ mascot.ts      # janela do mascote e arraste
│  ├─ chat.ts        # janela do chat, workspace, IPC da conversa e pedidos de permissão
│  ├─ claude.ts      # processo `claude -p` + leitura do stream-json
│  ├─ mcp-server.ts  # servidor MCP `desktop` (127.0.0.1 + token) e a ferramenta approve
│  ├─ desktop.ts     # apps (.desktop), links, projetos: o que as ferramentas fazem
│  ├─ attachments.ts # cópia dos anexos para ~/.cache/wisp/anexos e limpeza das antigas
│  ├─ config.ts      # ~/.config/wisp/config.json
│  └─ paths.ts       # pastas XDG (~/.config, ~/.local/share, ~/.cache)
├─ preload/          # expõe window.wisp (só funções específicas)
├─ shared/ipc.ts     # canais de IPC, eventos da conversa e o tipo da API
└─ renderer/
   ├─ mascot/        # Mascot.tsx (SVG) + mascot.css (animações)
   └─ chat/          # Chat.tsx, Markdown, cards de ferramenta e de permissão, anexos, chat.css
resources/workspace/CLAUDE.md   # persona, copiada para o workspace na 1ª vez
```

- **Janela do mascote:** 128×128, transparente, sem moldura e sempre no topo. O Electron
  ignora `skipTaskbar` no Linux, então o mascote usa `focusable: false`: no X11 isso cria uma
  janela _override-redirect_, que o gerenciador de janelas não controla. Ela fica acima das
  outras, aparece em todos os workspaces, fica fora da barra de tarefas e do Alt+Tab e não
  rouba o foco quando é clicada.
- **Arrastar × clicar:** o renderer decide pelo limiar de 5 px. Durante o arraste, o main
  move a janela seguindo a posição global do cursor. Usar as coordenadas dos eventos da página
  faria o mascote tremer, porque elas são relativas a uma janela que está se movendo.
- **Animações:** tudo é `transform` e `opacity` em camadas HTML, que o compositor anima sem
  redesenhar o SVG. O corpo é desenhado uma vez só; antena, LED da antena e olhos são camadas
  separadas que se movem por cima dele.
- **Claude Code:** cada conversa é um processo `claude -p` de longa duração, com
  `--input-format stream-json --output-format stream-json --verbose --include-partial-messages`.
  As mensagens entram pelo stdin, uma linha JSON cada, e a resposta chega em eventos pelo
  stdout. O `claude.ts` transforma esses eventos em poucos eventos de conversa (texto,
  ferramenta, fim do turno, aviso), e o chat só conhece esses.
- **Assinatura, não API:** o processo roda sem `ANTHROPIC_API_KEY` no ambiente. Antes de
  começar, o Wisp confere a instalação e o login com `claude auth status`. Se mesmo assim o
  Claude Code usar uma chave de API, a conversa avisa.
- **Parar e nova conversa:** o id da conversa é gerado pelo Wisp e passado no primeiro processo
  com `--session-id`. Parar encerra o processo, e a próxima mensagem sobe outro com
  `--resume <session_id>`, continuando a mesma conversa. Nova conversa encerra o processo e
  começa outra, com outro id.
- **Servidor MCP `desktop`:** roda dentro do app, em HTTP (Streamable HTTP, sem sessões),
  só em `127.0.0.1` e numa porta aleatória. Cada execução gera um token novo, exigido no header
  `Authorization`; o `Host` também é conferido, contra DNS rebinding. O endereço e o token vão
  para `$XDG_RUNTIME_DIR/wisp/mcp-<pid>.json` (ou `~/.cache/wisp`, sem essa variável), com
  permissão 0600. Esse arquivo é passado ao Claude Code com `--mcp-config` e apagado quando o
  app fecha. Com `--strict-mcp-config`, os servidores MCP que você configurou no seu Claude Code
  ficam de fora da conversa do Wisp.
- **Ferramentas:** `list_apps`, `open_app`, `open_url`, `list_projects`, `open_project` e
  `notify`. Nenhuma passa por shell: os programas rodam com `spawn` e uma lista de argumentos.
  `open_app` só aceita ids que estão na lista de apps, `open_url` só aceita http e https, e
  `open_project` só abre pastas dentro de `projectRoots` (depois de resolver links simbólicos).
  As ferramentas vão direto no prompt (`_meta` `anthropic/alwaysLoad`), em vez de ficarem atrás
  do ToolSearch, o que economiza uma ida ao modelo por pedido.
- **Permissões:** `Read`, `Glob`, `Grep`, `WebSearch`, `WebFetch`, `open_url`, `list_apps`,
  `list_projects` e `notify` rodam direto (`--allowedTools`). Todo o resto (`Bash`, `Write`,
  `Edit`, `open_app`, `open_project`…) passa pela ferramenta `approve` do servidor
  (`--permission-prompt-tool mcp__desktop__approve`), que mostra o card e espera o clique:
  **Permitir** responde `{"behavior":"allow","updatedInput":…}` e **Negar** responde
  `{"behavior":"deny","message":"Usuário negou"}`. **Permitir sempre nesta conversa** fica só
  na memória do app e vale até a conversa recomeçar; no `Bash`, só para o mesmo comando exato.
  Três detalhes fecham as brechas:
  - `--permission-mode default`: numa instalação nova, o Claude Code pode começar no modo
    `auto`, em que um classificador aprova sozinho o que parece pedido pelo usuário (abrir um
    app passava sem card), e o `settings.json` do usuário pode definir outro modo. Se mesmo
    assim o Claude Code informar outro modo, a conversa avisa.
  - Um hook `PreToolUse` (via `--settings`) manda todo `Bash` para o card; sem ele, o Claude
    Code roda sozinho comandos que considera só de leitura, como `ls` e `whoami`.
  - Regras `ask` para `Read` em arquivos de segredos (`~/.ssh`, `~/.gnupg`, `~/.aws`,
    `~/.kube`, chaveiros, perfis de navegador, `.env`…): sem elas, um texto malicioso numa
    página lida pelo `WebFetch` poderia levar o Claude a ler uma chave sem ninguém ver.
- **Painel e pedidos:** um pedido que chega com o painel escondido faz ele reaparecer sem
  roubar o foco. Parar a resposta ou começar outra conversa cancela os pedidos abertos.
- **Anexos:** o preload descobre o caminho de cada arquivo escolhido ou arrastado
  (`webUtils.getPathForFile`), e o renderer gera as miniaturas num canvas, como data URLs
  pequenos (o CSP do chat só aceita imagens `data:`). Ao enviar, o main copia os arquivos para
  `~/.cache/wisp/anexos/<session_id>/`, sem sobrescrever nada e com os nomes limpos de caracteres
  de controle e de `<` `>`, e acrescenta à mensagem um bloco `<anexos>` com os caminhos das
  cópias. O Claude lê com o `Read`, que também lê imagens e PDFs; a pasta dos anexos entra no
  espaço de trabalho dele com `--add-dir`. Os limites são 20 arquivos por mensagem e 50 MB por
  arquivo, conferidos ao anexar e de novo ao copiar. Como o id da conversa já existe antes da
  primeira resposta, a pasta dos anexos tem o mesmo id da sessão do Claude Code.
