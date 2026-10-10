# Wisp

> _A little light on your desktop._

Um assistente para Linux com um mascote animado que flutua na tela. O cérebro é o
[Claude Code](https://docs.claude.com/en/docs/claude-code) rodando em modo headless.

**Status:** Etapa 2 de 5 (mascote + chat com o Claude Code). As ferramentas de desktop e o
pedido de permissão entram na Etapa 3.

## Requisitos

- Linux com GNOME ou KDE Plasma, em Wayland (via XWayland) ou X11
- Node.js 22.12 ou mais novo, e npm
- [Claude Code](https://docs.claude.com/en/docs/claude-code) instalado e logado com a sua
  assinatura: rode `claude` no terminal uma vez e faça o login

## Rodando

```sh
npm install
npm run dev
```

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

Por enquanto, ações que mudam algo na máquina (comandos `Bash`, criar ou editar arquivos)
são negadas automaticamente e aparecem como **negado** no card. O pedido de permissão chega
na Etapa 3.

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
ele usa os padrões e não sobrescreve o arquivo até você corrigir.

`claudePath` é o comando do Claude Code. Um nome simples é procurado no `PATH` e também em
`~/.local/bin` e `~/.claude/local`, onde os instaladores costumam colocá-lo. Ferramentas em
`extraAllowedTools` passam a ser usadas sem pedir permissão, além das já liberadas.

Os dados internos do Chromium (cache etc.) ficam em `~/.cache/wisp/electron`, fora da pasta
de configuração. O Claude Code roda em `~/.local/share/wisp/workspace/`, cujo `CLAUDE.md` define
a persona do Wisp. Ele é criado na primeira vez e depois você pode editá-lo à vontade.

## Problemas comuns

| Sintoma                                  | O que fazer                                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Fecha na hora com `No usable sandbox!`   | `npm run setup:apparmor` (veja acima)                                                                          |
| Rodando como root, recusa abrir          | `npm run dev -- --no-sandbox` (só para teste)                                                                  |
| Quadrado preto em vez de transparência   | Confira se a composição está ligada (no KDE X11: Alt+Shift+F12) ou tente `npm run dev -- --disable-gpu`        |
| Não fica no topo ou não se move          | Confira se o processo recebeu `--ozone-platform=x11`; o terminal avisa quando ele roda como app Wayland nativo |
| "Não encontrei o Claude Code"            | Informe o caminho completo do `claude` em `claudePath` no `config.json`                                        |
| Aviso de "chave de API, cobrada por uso" | Tire o `ANTHROPIC_API_KEY`/`apiKeyHelper` da configuração do Claude Code e faça login com a assinatura         |

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
│  ├─ index.ts      # ciclo de vida do app
│  ├─ mascot.ts     # janela do mascote e arraste
│  ├─ chat.ts       # janela do chat, workspace e IPC da conversa
│  ├─ claude.ts     # processo `claude -p` + leitura do stream-json
│  ├─ config.ts     # ~/.config/wisp/config.json
│  └─ paths.ts      # pastas XDG (~/.config, ~/.local/share, ~/.cache)
├─ preload/         # expõe window.wisp (só funções específicas)
├─ shared/ipc.ts    # canais de IPC, eventos da conversa e o tipo da API
└─ renderer/
   ├─ mascot/       # Mascot.tsx (SVG) + mascot.css (animações)
   └─ chat/         # Chat.tsx, Markdown, cards de ferramenta, chat.css
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
- **Parar e nova conversa:** parar encerra o processo, e a próxima mensagem sobe outro com
  `--resume <session_id>`, continuando a mesma conversa. Nova conversa encerra o processo e
  esquece a sessão.
- **Permissões:** só `Read`, `Glob`, `Grep`, `WebSearch`, `WebFetch` (e, na Etapa 3, as
  ferramentas de leitura do desktop) rodam direto. O resto é negado até a Etapa 3 trazer o
  pedido de permissão. O Claude Code ainda executa sozinho alguns comandos de shell que só
  leem, como `ls`.
