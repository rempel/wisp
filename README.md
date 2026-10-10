# Wisp

> _A little light on your desktop._

Um assistente para Linux com um mascote animado que flutua na tela. O cérebro é o
[Claude Code](https://docs.claude.com/en/docs/claude-code) rodando em modo headless.

**Status:** MVP completo. As cinco etapas da especificação estão prontas:

1. mascote;
2. chat com o Claude Code;
3. ferramentas de desktop com pedido de permissão;
4. anexos;
5. estados do mascote, bandeja e acabamento.

Depois do MVP, vieram as fases do roadmap:

- **Fase 6 (conversa):** troca de modelo, uso do plano, Parar na hora, histórico de conversas,
  diff das edições, colar imagem e um painel mais vivo.
- **Fase 7 (sessões do terminal), pronta para validação:** o Wisp acompanha as sessões do Claude
  Code que você roda no terminal, avisa quando uma precisa de você, deixa aprovar e responder
  pelo card e continuar uma sessão no chat.

O que vem depois está no [ROADMAP.md](ROADMAP.md).

## Requisitos

- Linux com GNOME ou KDE Plasma, em Wayland (via XWayland) ou X11
- Node.js 22.12 ou mais novo, e npm
- [Claude Code](https://docs.claude.com/en/docs/claude-code) instalado e logado com a sua
  assinatura: rode `claude` no terminal uma vez e faça o login
- Para abrir apps: `gtk-launch` (pacote `libgtk-3-bin` no Ubuntu/Debian) ou `gio` (pacote
  `libglib2.0-bin`, que já vem com o GNOME); no KDE, o `kioclient` também serve. Para abrir
  links: `xdg-open` (pacote `xdg-utils`)
- Para o ícone na bandeja: no Ubuntu e no KDE já funciona. Em outros GNOME, instale a extensão
  "AppIndicator and KStatusNotifierItem Support". O mascote e o chat funcionam sem ela
- Para a aba Sessões: Claude Code 2.1 ou mais novo. Para trazer o terminal de uma sessão para a
  frente: no KDE já funciona; no X11, instale o `xdotool`. No GNOME com Wayland não há como, e o
  Wisp oferece abrir a pasta no editor

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

### Estados, bandeja e acabamento (Etapa 5)

- [ ] **Mensagem normal:**
  - enquanto o Claude pensa, o mascote trabalha: bits mais rápidos e antena esticada;
  - enquanto o texto chega, ele fala, com o brilho pulsando;
  - no fim, dá um pulinho com os olhos `^ ^`.
- [ ] **Card de permissão na tela:** o mascote fica âmbar, olha para o painel e mostra um "?".
- [ ] **Erro** (por exemplo, sem internet):
  - o mascote fica coral, treme e os olhos viram `x x`;
  - o chat explica o erro em português;
  - no limite do plano, o aviso diz a que horas ele libera.
- [ ] **Bandeja:** o ícone do Wisp aparece, com **Ocultar mascote** (e **Mostrar mascote**),
      **Nova conversa**, **Abrir config** e **Sair**.
- [ ] **Tema:** trocar o tema do sistema entre claro e escuro troca o painel na hora.
- [ ] **Pergunta com opções:** peça "me pergunte qual cor eu prefiro, com opções".
  - Aparece um card com um botão por opção, e a resposta chega ao Claude.
  - Dá para escrever outra resposta ou pular.
- [ ] **Clique acidental:** nos primeiros meio segundo, os botões de um card que acabou de
      aparecer ignoram cliques.
- [ ] **Config inválido:** um valor inválido no `config.json` (por exemplo, `"editorCommand": 42`)
      vira um aviso no chat quando você abre o painel.
- [ ] **Claude instalado pelo npm ou nvm:** o Wisp o encontra mesmo aberto pelo menu do sistema.

### Conversa (Fase 6)

- [ ] **Modelo:** a pílula acima da caixa de texto mostra quem responde ("Padrão · Sonnet 5.5").
  - Peça para o Claude guardar uma palavra, troque para **Opus** na pílula e pergunte a palavra:
    ele lembra, e a resposta vem do Opus.
  - A escolha fica no `config.json` (`"model"`) e vale nas próximas conversas.
- [ ] **Uso do plano:** depois da primeira resposta, aparece no cabeçalho uma pílula com a
      porcentagem (verde até 50%, âmbar até 80%, vermelha acima). Clicar abre as barras da sessão
      de 5 horas e da semana, com o horário em que cada uma reinicia.
- [ ] **Parar:** peça um texto longo e clique em Parar no meio. A resposta para na hora, e a
      próxima mensagem continua a conversa sem esperar o Claude Code subir de novo.
- [ ] **Histórico:** o botão do relógio, no cabeçalho, lista as conversas por dia, com busca.
  - Abrir uma traz as mensagens de volta, e o Claude continua de onde parou, inclusive depois de
    fechar e abrir o app.
  - A lixeira apaga a conversa do histórico (com confirmação).
- [ ] **Edições de arquivo:** os cards de `Edit` e `Write` mostram `+N −M`; aberto, o card
      mostra o diff colorido.
- [ ] **Colar imagem:** tire um print (ou copie uma imagem do navegador) e aperte Ctrl+V na
      caixa de texto: ela vira um anexo.
- [ ] **Painel:**
  - o status mostra o que o Claude está fazendo ("lendo package.json…"), com um brilho;
  - o avatar do cabeçalho acompanha o humor do mascote, e o alto do painel ganha a cor dele;
  - depois da primeira mensagem, a caixa diz "Continuar a conversa…", e o foco volta para ela
    quando a resposta termina;
  - Ctrl+K começa uma conversa nova.

### Sessões do terminal (Fase 7)

- [ ] **Instalar:** no cabeçalho, o botão do terminal abre a aba Sessões. **Ver o que muda**
      mostra o diff do `~/.claude/settings.json`; **Instalar** grava, com um backup datado do
      arquivo anterior ao lado dele.
- [ ] **Acompanhar:** rode `claude` num terminal e peça algo. A sessão aparece na aba com o
      projeto, o estado (trabalhando, esperando você, terminou), a última mensagem, o passo atual
      e os passos anteriores, com `+N −M` e o diff das edições.
- [ ] **Pedido de permissão:** peça para criar um arquivo.
  - O terminal mostra o diálogo dele, e o Wisp mostra o card, com o mascote âmbar e um contador
    no botão da aba. Responder em qualquer um dos dois vale.
  - Se você responder no terminal, o card some sozinho.
  - **Responder no terminal** devolve a decisão para o terminal.
- [ ] **Pergunta:** peça "use o AskUserQuestion para me perguntar uma cor". O card de pergunta
      aparece no Wisp, e a resposta chega à sessão do terminal.
- [ ] **Terminou:** quando o Claude termina no terminal, o mascote dá o pulinho.
- [ ] **Terminal:** o botão traz a janela do terminal para a frente (KDE, ou X11 com `xdotool`).
- [ ] **Continuar no Wisp:** numa sessão parada, o botão abre a sessão no chat, com a última
      mensagem dela, e o Claude continua de onde parou. Se a sessão ainda estiver aberta no
      terminal, o Wisp segue numa cópia dela, e as duas não se misturam.
- [ ] **Wisp fechado:** feche o Wisp e use o Claude Code no terminal: tudo segue normal.
- [ ] **Tirar:** no fim da aba, **Tirar** mostra o diff e devolve o `settings.json` ao que era.

## Visual do mascote

O Wisp é uma **gotinha robô**: casco ciano-turquesa brilhante (`#5EEAD4` → `#22D3EE`) com
contorno, junta e parafusos, um visor escuro com dois olhos de LED, uma antena com uma lâmpada
de LED na ponta e "bits" quadradinhos em órbita, tudo com um glow suave. Ele acompanha a conversa
(seção 5.3 da especificação):

| Estado            | Como fica                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| Ocioso            | Flutua, a antena balança, o LED respira, os olhos piscam e olham em volta                                 |
| Falando           | O brilho pulsa no ritmo do texto e os LEDs dos olhos se animam                                            |
| Trabalhando       | Os bits orbitam mais rápido, a antena se estica e o LED dela pisca rápido                                 |
| Pedindo permissão | Casco e LEDs âmbar (`#FBBF24`), olhos virados para o painel e um "?" ao lado da cabeça, do lado do painel |
| Feliz             | Dá dois pulinhos, os olhos viram `^ ^` e solta bits (por uns 2 s, no fim de uma resposta)                 |
| Erro              | Fica coral (`#F87171`), treme e os olhos viram `x x` (por uns 5 s)                                        |

As cores ficam em variáveis no topo de `mascot.css`, então cada estado só precisa trocá-las.

## Configuração

Fica em `~/.config/wisp/config.json` e é criada com os padrões na primeira execução:

```json
{
  "claudePath": "claude",
  "editorCommand": "code",
  "projectRoots": ["~/projetos"],
  "mascotPosition": null,
  "extraAllowedTools": [],
  "model": null
}
```

`mascotPosition` é atualizada sempre que você solta o mascote. Para ele voltar ao canto
padrão, troque por `null`. Se um campo tiver um valor inválido, o Wisp avisa no chat (e no
terminal) e usa o padrão daquele campo, sem apagar o que você escreveu. Se o arquivo não for um JSON válido,
ele continua com a configuração anterior (ou com os padrões, se acabou de abrir) e não
sobrescreve o arquivo até você corrigir.

Dá para editar o arquivo com o Wisp aberto: `projectRoots` e `editorCommand` valem na hora;
`model`, na próxima mensagem; `claudePath` e `extraAllowedTools`, na próxima vez que o app abrir.

`model` é o modelo do Claude: `null` usa o padrão do seu Claude Code, e a pílula acima da caixa
de texto troca entre `"haiku"`, `"sonnet"`, `"opus"` e `"fable"`. No arquivo, também vale o nome
completo de um modelo (`"claude-sonnet-5-5"`).

`claudePath` é o comando do Claude Code. Um app aberto pelo menu do sistema recebe um `PATH` curto,
então um nome simples é procurado em vários lugares:

- no `PATH`;
- em `~/.local/bin` e `~/.claude/local`, onde fica o instalador oficial;
- nas pastas do npm global, Volta, Bun, pnpm, Yarn, asdf e mise;
- nas versões do nvm e do fnm, da mais nova para a mais antiga.

Se o `config.json` for um link simbólico (comum em quem versiona os dotfiles), o Wisp grava no
arquivo de destino e mantém as permissões dele.

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
apaga as pastas de conversas com mais de 7 dias. Imagens coladas com Ctrl+V esperam o envio em
`~/.cache/wisp/anexos/colados/`; as que nunca foram enviadas somem depois de um dia.

As sessões do terminal usam:

- os hooks no `~/.claude/settings.json` (ou no `$CLAUDE_CONFIG_DIR`, se você o usa), que só
  entram e saem pela aba Sessões, com prévia e backup;
- o relay `~/.local/share/wisp/bin/wisp-hook`, que o Wisp reescreve sempre que abre;
- o socket `$XDG_RUNTIME_DIR/wisp/hooks.sock`, numa pasta só do seu usuário;
- a lista das sessões recentes, em `~/.local/share/wisp/sessoes.json`.

Uma sessão que já estava aberta quando os hooks foram instalados aparece a partir da próxima
mensagem dela.

O histórico fica em `~/.local/share/wisp/conversas/`, um arquivo por conversa, que só o seu
usuário lê. Ele guarda o que o painel mostrou; o contexto do Claude volta pelo próprio Claude
Code, que apaga as conversas antigas depois de um tempo (30 dias, por padrão, pelo
`cleanupPeriodDays` dele). Apagar uma conversa no Wisp tira ela do histórico do Wisp; a cópia
do Claude Code segue a regra dele.

## Problemas comuns

| Sintoma                                     | O que fazer                                                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Fecha na hora com `No usable sandbox!`      | `npm run setup:apparmor` (veja acima)                                                                          |
| Rodando como root, recusa abrir             | `npm run dev -- --no-sandbox` (só para teste)                                                                  |
| Quadrado preto em vez de transparência      | Confira se a composição está ligada (no KDE X11: Alt+Shift+F12) ou tente `npm run dev -- --disable-gpu`        |
| Não fica no topo ou não se move             | Confira se o processo recebeu `--ozone-platform=x11`; o terminal avisa quando ele roda como app Wayland nativo |
| "Não encontrei o Claude Code"               | Informe o caminho completo do `claude` em `claudePath` no `config.json`                                        |
| Aviso de "chave de API, cobrada por uso"    | Tire o `ANTHROPIC_API_KEY`/`apiKeyHelper` da configuração do Claude Code e faça login com a assinatura         |
| "Não achei um lançador de apps"             | Instale o `libgtk-3-bin` (gtk-launch) ou o `libglib2.0-bin` (gio)                                              |
| "Não achei o editor"                        | Ajuste `editorCommand` no `config.json` para um comando que exista no `PATH`                                   |
| O projeto não aparece ou não abre           | Confira `projectRoots`: o projeto precisa ter `.git` e estar até dois níveis dentro de uma dessas pastas       |
| "As ferramentas do desktop não conectaram"  | Veja o erro no terminal onde o app roda; sem o servidor, o chat funciona, mas sem abrir apps, links e projetos |
| "… não veio de uma pasta do computador"     | O arraste veio de um app que não entrega um arquivo (ex.: imagem de uma página). Salve o arquivo e anexe-o     |
| Sem ícone na bandeja                        | Em GNOME fora do Ubuntu, instale a extensão "AppIndicator and KStatusNotifierItem Support"                     |
| O mascote sumiu                             | Se você o escondeu pela bandeja, use **Mostrar mascote**; ao abrir o app de novo, ele volta                    |
| "Você chegou ao limite de uso do seu plano" | É o limite da sua assinatura do Claude; o aviso diz a que horas ele libera                                     |
| "O modelo escolhido não existe…"            | O modelo não está liberado no seu plano (ou o `model` do `config.json` tem um nome errado): troque na pílula   |
| "O Claude Code não tem mais esta conversa"  | Ele já apagou a sessão antiga; o Wisp continua numa sessão nova, sem o contexto de antes                       |
| A pílula de uso não aparece                 | Ela surge depois da primeira resposta; versões antigas do Claude Code não mandam o uso do plano                |
| "O Wisp não está ouvindo as sessões"        | Outro Wisp já está aberto, ou `$XDG_RUNTIME_DIR` não é uma pasta só sua. O motivo aparece na aba Sessões       |
| A sessão do terminal não aparece            | Confira se os hooks estão instalados na aba Sessões; uma sessão já aberta aparece na próxima mensagem          |
| O botão Terminal não traz a janela          | No X11, instale o `xdotool`. No GNOME com Wayland não há como: use o botão **Pasta**                           |
| Um card ficou parado na aba Sessões         | **Responder no terminal** devolve a decisão para lá; ele também some sozinho quando o prazo do hook acaba      |

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
│  ├─ mascot.ts      # janela do mascote, arraste e estado mostrado
│  ├─ mood.ts        # estado do mascote a partir dos eventos da conversa
│  ├─ tray.ts        # ícone e menu da bandeja
│  ├─ chat.ts        # janela do chat, workspace, IPC da conversa e pedidos de permissão
│  ├─ claude.ts      # processo `claude -p`, leitura do stream-json e pedidos de controle
│  ├─ history.ts     # histórico das conversas em ~/.local/share/wisp/conversas
│  ├─ hooks/
│  │  ├─ protocol.ts # contrato relay ↔ app: socket, eventos, respostas
│  │  ├─ relay.ts    # o wisp-hook que o Claude Code roda a cada hook (Electron em modo Node)
│  │  ├─ server.ts   # o socket que recebe os hooks no app
│  │  └─ install.ts  # hooks no ~/.claude/settings.json: prévia, backup, gravação
│  ├─ sessions.ts    # as sessões do terminal: estado, passos, pedidos
│  ├─ sessions-ipc.ts # IPC da aba Sessões
│  ├─ terminal.ts    # trazer o terminal de uma sessão para a frente (KWin, xdotool, tmux)
│  ├─ mcp-server.ts  # servidor MCP `desktop` (127.0.0.1 + token) e a ferramenta approve
│  ├─ questions.ts   # perguntas do Claude (AskUserQuestion): leitura e conferência das respostas
│  ├─ desktop.ts     # apps (.desktop), links, projetos: o que as ferramentas fazem
│  ├─ attachments.ts # cópia dos anexos, imagens coladas e limpeza das antigas
│  ├─ config.ts      # ~/.config/wisp/config.json
│  ├─ page.ts        # carregar as páginas e recarregá-las se caírem
│  └─ paths.ts       # pastas XDG (~/.config, ~/.local/share, ~/.cache)
├─ preload/          # expõe window.wisp (só funções específicas)
├─ shared/
│  ├─ ipc.ts         # canais de IPC, eventos da conversa e o tipo da API
│  ├─ diff.ts        # diff das edições (do Claude Code ou calculado) e contagem +N −M
│  └─ format.ts      # datas e horários em português
└─ renderer/
   ├─ mascot/        # Mascot.tsx (SVG) + mascot.css (animações)
   └─ chat/          # Chat.tsx, Markdown, cards, anexos, pílulas, histórico, aba Sessões
resources/
├─ icon.png, tray.png  # ícones do app e da bandeja (gerados de icon.svg)
└─ workspace/CLAUDE.md # persona, copiada para o workspace na 1ª vez
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
  com `--session-id`. Parar manda ao processo, pelo stdin, um `control_request` de `interrupt`:
  o turno acaba na hora e o mesmo processo segue para a próxima mensagem. Se ele não obedecer em
  4 s, é encerrado, e a próxima mensagem sobe outro com `--resume <session_id>`. Nova conversa
  encerra o processo e começa outra, com outro id.
- **Modelo:** o processo sobe com `--model=<escolha>` (com `=`, o valor nunca vira outra opção).
  Trocar na pílula com o processo vivo manda um `control_request` de `set_model` logo antes da
  próxima mensagem, que já sai no modelo novo, com o contexto inteiro. Sem modelo, o CLI volta ao
  padrão. O nome do modelo que respondeu vem do evento `init` de cada turno. Se o CLI recusar a
  troca, a conversa avisa e a pílula volta ao modelo de antes.
- **Uso do plano:** o stream do Claude Code manda um `rate_limit_event` a cada resposta, com o uso
  das janelas de 5 horas e de 7 dias e o horário em que cada uma reinicia. A pílula mostra a
  maior das duas. Não é preciso instalar nada no Claude Code do usuário.
- **Histórico:** cada conversa vira um JSONL em `~/.local/share/wisp/conversas/` (pasta 0700,
  arquivos 0600). A primeira linha tem o título (a primeira mensagem) e a data; as outras são os
  eventos que o painel recebeu, com o texto juntado por bloco e as miniaturas dos anexos. Reabrir
  manda esses eventos de volta ao painel e prepara a sessão: a próxima mensagem sobe o processo com
  `--resume`. Se o Claude Code já tiver apagado a sessão, o processo cai na largada com "No
  conversation found"; o Wisp manda a mesma mensagem de novo numa sessão nova, com o mesmo id, e
  avisa que o contexto se perdeu. O formato interno das sessões do Claude Code não é lido.
- **Diff das edições:** junto com o resultado do `Edit` e do `Write`, o Claude Code manda o
  `structuredPatch` do arquivo, com os números das linhas. Antes do resultado (ou se ele não vier),
  o diff sai dos argumentos da chamada, linha a linha. O card mostra até 400 linhas.
- **Colar imagem:** uma imagem copiada não tem arquivo; o painel manda os bytes ao main
  (`ipcRenderer.invoke`), que grava um PNG em `~/.cache/wisp/anexos/colados/`. No envio, ela é
  copiada para a pasta da conversa como qualquer anexo, e o arquivo de espera sai.
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
  - A memória automática do Claude Code fica desligada (`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`):
    ela grava arquivos em `~/.claude/projects/…/memory/` sem passar pelo card e os carrega em
    toda conversa. Para o Wisp lembrar de algo entre conversas, o Claude pede para editar o
    `CLAUDE.md` do workspace, com card.
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
- **Estados do mascote:** o `mood.ts` acompanha os eventos da conversa e escolhe o estado, nesta
  ordem de prioridade:
  1. pedindo permissão, enquanto há um card esperando;
  2. feliz (uns 2 s) ou erro (uns 5 s) quando o turno acaba;
  3. falando, enquanto o texto chega, ou trabalhando, no resto do turno;
  4. ocioso.

  O mascote recebe o estado por IPC e troca uma classe CSS. O brilho pulsa a cada pedaço de texto,
  no máximo umas 7 vezes por segundo, e as animações continuam em `transform` e `opacity`.

- **Bandeja:** o ícone usa o protocolo StatusNotifierItem pelo D-Bus (a extensão AppIndicator no
  GNOME, nativo no KDE). Todas as ações ficam no menu, porque muitos painéis não repassam o clique
  no ícone. Esconder o mascote vale só até o app fechar: sem a bandeja, não haveria como trazê-lo
  de volta.
- **Perguntas do Claude:** quando o Claude usa o `AskUserQuestion`, o pedido chega ao `approve`, e
  o chat mostra um card com um botão por opção.
  - **Responder:** a resposta volta como `allow` com `updatedInput.answers`, um mapa do texto da
    pergunta para a resposta, conferido no main contra as perguntas feitas. Opções de múltipla
    escolha vão juntas, separadas por vírgula, o formato que todas as versões do CLI aceitam.
  - **Pular:** nega o pedido com "O usuário preferiu não responder.".
- **Cards seguros:**
  - os botões ignoram cliques nos primeiros 600 ms, porque o card pode surgir embaixo do cursor;
  - se o Claude Code desistir do pedido (o SDK do MCP avisa a ferramenta), o card vira
    **Cancelado**.
- **Erros:**
  - limite do plano, servidores sobrecarregados e falta de rede viram avisos em português. No
    limite, o horário vem do `rate_limit_event`;
  - se o processo cai, o aviso mostra o fim do stderr;
  - a mensagem de erro crua do CLI não aparece como resposta, porque o aviso já cobre o erro;
  - problemas no `config.json` aparecem no chat;
  - se a página do painel ou do mascote cair, ela recarrega sozinha. Se cair de novo logo depois,
    o Wisp desiste, para não entrar num laço. No painel, a conversa volta do histórico, com a
    resposta em andamento e os cards pendentes.
- **Tema:** o painel segue o tema do sistema na hora (`prefers-color-scheme`), e o fundo da janela
  acompanha pelo `nativeTheme`.
- **Sessões do terminal, escutar:** o Wisp põe no `settings.json` do Claude Code um hook por
  evento (início e fim da sessão, mensagem, antes e depois de cada ferramenta, pedido de
  permissão, fim do turno). Todos chamam o relay `wisp-hook`, que lê o JSON do hook e o passa ao
  app por um socket Unix em `$XDG_RUNTIME_DIR/wisp/hooks.sock` (pasta 0700, socket 0600; o relay
  confere a pasta e o dono do socket antes de conectar).
  - O relay roda com o próprio Electron em modo Node (`ELECTRON_RUN_AS_NODE=1`), então não
    depende de nada instalado.
  - O Claude Code nunca trava por causa do Wisp. Só o pedido de permissão espera o relay; os
    outros hooks rodam em segundo plano (`async`). Sem o Wisp aberto, o relay sai na hora, sem
    imprimir nada. Ele também tem prazo para conectar (300 ms) e para mandar (2 s).
  - Nada é liberado sem um clique: sem decisão, o relay não imprime nada, e quem decide é o
    diálogo do terminal, que o Claude Code mostra junto com o card.
  - Os processos do próprio Wisp levam `WISP_INTERNAL=1`, e os hooks deles são ignorados.
  - Os hooks em segundo plano podem chegar fora de ordem. Cada evento leva a hora em que o hook
    disparou, e um evento mais velho não muda o estado da sessão.
- **Sessões do terminal, agir:**
  - **Card:** um pedido vira o mesmo card do chat. **Permitir** e **Negar** voltam pelo socket, e
    o relay imprime a decisão no formato do hook `PermissionRequest`. **Permitir sempre nesta
    sessão** fica na memória do Wisp, enquanto o mesmo processo do Claude Code estiver aberto. A
    resposta de uma pergunta volta como `updatedInput.answers`, conferida no app e no relay.
  - **Resposta dada no terminal:** o Claude Code não avisa o hook, então o Wisp percebe sozinho.
    - O resultado da mesma chamada chega (o relay manda um hash da entrada para casar os dois).
    - Ou o transcript da sessão cresce. Enquanto o diálogo espera, ele fica parado, e o Wisp só
      olha o tamanho do arquivo, sem ler o formato interno dele.
    - Ou o turno acaba, ou o processo some.
  - **Trazer o terminal para a frente:** o Wisp acha os processos pais do Claude Code pelo
    `/proc`, e numa sessão no tmux, os clientes conectados. No KDE, um script do KWin carregado
    pelo D-Bus ativa a janela do primeiro processo com janela (vale no X11 e no Wayland). No
    X11, o `xdotool` ativa a janela anunciada pelo terminal (`WINDOWID`) ou a do processo.
- **Continuar no Wisp:** o chat retoma a sessão na pasta dela, com `--resume`. Se ela ainda
  estiver aberta no terminal, o chat usa `--fork-session` e segue numa cópia. Sem isso, os dois
  processos escreveriam na mesma sessão (testado no 2.1.296: o CLI não copia sozinho). A
  conversa guarda a pasta no histórico, para reabrir no lugar certo.
- **Painel vivo:** o humor do mascote também vai para o painel (`chat:mood`): o avatar do
  cabeçalho muda os olhos e a antena, e o alto do painel ganha um degradê na cor do estado (uma
  propriedade CSS registrada com `@property`, para a cor poder animar). O status traduz a
  ferramenta em andamento ("lendo package.json…", "pesquisando “…”…"). O system prompt pede
  Markdown leve, porque o painel é estreito.
