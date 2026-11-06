# Notas de versão

O que mudou em cada versão do Wisp. O detalhe de cada fase (e o que ficou de fora) está no
[ROADMAP](ROADMAP.md); os roteiros para conferir à mão, em [docs/VALIDACAO.md](docs/VALIDACAO.md).

## Não lançado

### Novo

- **Aprovar pelo celular** (Fase 18): o card que espera vai para o celular pelo ntfy, com Permitir e
  Negar, pareado por um QR code; expira em 2 minutos, negado.
- **Avatares** (Fase 19): o fantasminha, escolhível no menu do mascote, na bandeja e nas
  configurações.
- **Primeiros passos e diagnóstico** (Fase 20): o que falta, um passo por vez, na primeira vez; o
  diagnóstico com o relatório para uma issue (sem nada pessoal); o aviso de versão nova (desligado
  por padrão).
- **Conversa mais fluida** (Fase 21): editar e reenviar a última mensagem (↑ na caixa vazia), buscar
  com Ctrl+F, exportar em Markdown, fixar conversas e o rascunho de cada aba.
- **Acessibilidade e aparência** (Fase 22): tema claro, escuro ou do sistema; alto contraste; menos
  animações; o tamanho do painel (Ctrl+mais e Ctrl+menos); o leitor de tela anuncia os pedidos e as
  respostas, e o Alt+P vai para o card.
- **Desempenho** (Fase 23): as abas paradas dormem (o Claude Code delas sai e volta pela sessão);
  conversas longas e históricos grandes carregam por partes; o consumo é medido no CI.
- **Notificações** (Fase 24): o card vira notificação com Permitir e Negar quando você não está
  olhando o painel; o resumo "Enquanto você estava fora" ao desbloquear a tela; o card do Bash diz o
  que o comando faz.
- **Para a comunidade** (Fase 25): a interface em inglês (pelo idioma do sistema ou nas
  configurações, e o Claude responde no mesmo idioma); pacotes para ARM64 e o Flatpak; estas notas
  e o guia de contribuição.
- **Prompts salvos e tarefas agendadas** (Fase 26): pedidos prontos no menu da barra, com a pasta, o
  que foi copiado, a data e a hora; e prompts que rodam sozinhos num horário, numa aba nova, sempre
  no modo Pedir.
- **Emoções e danças do mascote** (Fase 27): as 31 emoções, os 18 sinais no ar, as 12 danças e a
  troca atuada do [ClaudeAnimationBase](https://github.com/JohnHeibel/ClaudeAnimationBase), para a
  gotinha e o fantasminha; o Claude mostra uma quando combina com a conversa (a ferramenta
  `express`, sem card), e a galeria fica nas configurações.
- **O histórico que acha** (Fase 29): a busca acha o que foi dito nas conversas (as suas mensagens e
  as respostas), sem ligar para acentos, com o trecho; abrir leva à mensagem. Filtros por período e
  por pasta. A busca na conversa (Ctrl+F) também ignora os acentos.
- **Servidores MCP pelo Wisp** (Fase 30): em Configurações → Servidores MCP, os do seu Claude Code
  e os dos projetos; pôr e tirar um mostram a mudança no `~/.claude.json` antes, com backup, e
  gravam pelo `claude mcp`. Os ligados entram nas conversas do Wisp, e cada ferramenta deles pede
  permissão pelo card até você liberá-la.
- **Levar o Wisp junto** (Fase 31): exportar as configurações, os prompts, as tarefas e, se quiser,
  o histórico para um arquivo, e importar noutra máquina vendo antes o que muda (sem chaves, sem
  apagar nada, com backup do `config.json`). No AppImage, o aviso de versão nova ganha
  **Atualizar**: baixa, confere a assinatura ed25519 e troca o arquivo (depois que quem publica
  gerar a chave com `scripts/release-key.mjs`).
- **Paleta de comandos** (Fase 32): Ctrl+P no painel (Ctrl+Shift+P no modo terminal), Ctrl+Alt+P de
  qualquer lugar ou `wisp --palette`: abas, ações, modo e modelo, prompts salvos, tarefas, sessões
  do terminal, projetos e conversas numa busca só, sem acentos, pelo teclado.
- **Não perturbe** (Fase 32): com o "não perturbe" do KDE ou do GNOME ligado, o Wisp não manda
  notificações nem toca sons; os cards esperam no painel (`quietWithDnd`).
- **O Wisp no Windows** (Fase 33): um instalador para o Windows 10 e 11 (x64, por usuário, sem
  administrador). O mascote, o painel, as conversas, os cards (cada Bash pede, sem passar por um
  shell), o modo terminal, a bandeja, o atalho global, o print da tela e o início com o sistema
  funcionam; o Claude Code do instalador oficial ou do npm é achado sozinho. O resto da integração
  com o desktop chega na Fase 35, e o diagnóstico diz o que ainda não há.
- **O editor do VS Code** (Fase 34): o diff das edições nos cards (e o das prévias dos arquivos de
  configuração) no Monaco, com o realce da linguagem, os números das linhas do arquivo, em linha ou
  lado a lado, no tema do Wisp; e **Abrir o arquivo no painel**, só para ler, na linha da mudança.
  O editor carrega só quando um diff aparece, e cada linguagem só quando um arquivo dela aparece.
- **O Windows por inteiro** (Fase 35): os cards do modo terminal e a aba Sessões (os hooks pelo
  próprio `wisp.exe`, sem shell, e um pipe nomeado de nome sorteado), as notificações com
  **Permitir** e **Negar** (pelo endereço `wisp://`, que o instalador registra), o chaveiro (as
  chaves cifradas pelo Windows, DPAPI) e o desktop pelo Claude: abrir um terminal numa pasta (o
  Windows Terminal, o PowerShell ou o cmd), ver as janelas e trazer uma para a frente, abrir os
  apps do menu Iniciar (os da loja também) e os links, a música pelo controle de mídia do Windows e
  o volume do sistema. A voz acha o whisper.cpp e o Piper do Windows. Nada passa pelo cmd, e
  nenhum programa é procurado na pasta atual.

- **O que faltava no Windows** (Fase 36): na aba Sessões, **Trazer para a frente** acha a janela
  do terminal da sessão; o navegador do Claude acha o Chrome ou o Edge sozinho; a linha de status
  do Wisp no modo terminal; e o **Atualizar** com um clique, que baixa o instalador novo, confere a
  assinatura e instala ao reiniciar.

- **A ilha que abre** (Fase 37, inspirada na do [Coucou](https://github.com/Louis-CFM/coucou)): o
  clique na cápsula do topo abre a ilha. No **Início**, a conversa ou sessão do terminal em foco
  com os passos ao vivo (+N −M nas edições) e o começo da resposta, a música com a capa, a barra de
  progresso e os controles (anterior, tocar, próxima, aleatório, repetir, volume), e as pílulas do
  resto. Um pedido de permissão abre a ilha sozinho, com **Negar**, **Permitir** e **Sempre**; uma
  pergunta do Claude mostra as opções. Os **Ajustes** dela: os sons, o tempo para recolher (com a
  barrinha da contagem), abrir ao passar o mouse e, no Linux, as capas da internet. No Windows, o
  mascote volta a dançar com a música, e a ilha mostra o que toca.

- **A ilha, parte 2** (Fase 38): o **Perguntar** na ilha (no Windows, a caixa de texto; no Linux,
  falar ou escrever no painel), com a resposta aparecendo nela sem abrir o painel; arquivos soltos
  na ilha vão junto com a pergunta; um clique num passo com +N −M abre o diff dele na ilha; as
  pílulas do **Plano** (5 horas e semana), do **GitHub** (os seus PRs e as revisões pedidas), da
  **Agenda** e da versão nova, com **Atualizar**; e o atalho **Ctrl+Alt+K**, que abre a ilha no
  Perguntar (com o Esc e o Ctrl+← e → dentro dela, no Windows).

- **O fogo-fátuo** (Fase 39): o avatar padrão agora é uma chaminha azul que tremula, com uma faísca
  em cima (o _will-o'-the-wisp_ do nome); a **geleca**, um corpinho gelatinoso que respira
  amassando, entrou como mais uma escolha, ao lado do fantasminha. Os ícones do app e da bandeja
  viraram a chama.

- **O Windows sem lacunas** (Fase 40): segurar o atalho de voz ouve até soltar; a agenda pelo
  endereço iCal do Google, do Outlook ou do iCloud (guardado no chaveiro; vale no Linux também); o
  "não perturbe" do Windows deixa o Wisp quieto; a linha de status do Wisp também sem o Git Bash;
  e o instalador para Windows ARM64.

- **Recortar, o aviso do plano e o CI que vira conversa** (Fase 41): recortar uma área da tela
  para a conversa (pelo **+** ou com Ctrl+Alt+R); um aviso ao passar de 80% e de 95% das janelas
  do plano; e o clique num CI vermelho ou num pedido de mudanças abre uma aba com o pedido de
  investigar pronto.

- **Revisar no fim da resposta** (Fase 42): um card com os arquivos que a resposta mudou, o diff de
  cada um e o **Desfazer**, um a um ou todos.

- **A conversa numa cópia do Git** (Fase 43): abrir um projeto numa worktree, num ramo só da
  conversa, e no fim juntar na pasta original (sem commit) ou descartar.

- **Tarefas por evento** (Fase 44): uma tarefa pode rodar quando chega uma revisão num PR seu,
  quando um CI seu falha, quando aparece um arquivo novo numa pasta ou ao desbloquear a tela, com o
  `{evento}` no prompt.

- **Explicar a seleção e o modo foco** (Fase 45): Ctrl+Alt+E leva o texto marcado em qualquer
  programa para uma conversa; o modo foco deixa o Wisp quieto por 25 ou 50 minutos.

- **Voltar, ramificar e a pergunta lateral** (Fase 46): voltar a conversa (e, se quiser, os
  arquivos) para antes de qualquer mensagem sua; ramificar uma conversa numa aba nova a partir de
  uma resposta; e o `/btw`, uma pergunta rápida que não entra na conversa.

- **A pré-visualização** (Fase 47): um HTML, PDF, imagem ou o servidor local do projeto
  numa janela ao lado do painel (e um Markdown no próprio painel), pelo `/preview` ou pelos cards;
  recarrega sozinha, e **Mostrar ao Claude** anexa um print dela.

- **O mascote numa janela** (Fase 48): arraste o mascote com o Ctrl e solte numa janela, ou
  aperte Ctrl+Alt+J, e o print dela vai para a conversa, com o título e o programa na caixa.

- **O painel de uso** (Fase 49): os tokens e o custo estimado por dia, por projeto e por
  modelo, lidos dos arquivos que o Claude Code grava na sua máquina, com um gráfico e o CSV.

### Mudou

- A gotinha robô saiu: quem a usava abre no fogo-fátuo.
- O tipo de instalação no diagnóstico pode ser `flatpak`.
- Manutenção (Fase 28): o código ficou em módulos menores (nenhum arquivo do `src/` passa de 1.000
  linhas, menos o dicionário em inglês), sem mudar o que o app faz; o CSS do painel e o do mascote
  viraram folhas por assunto em `styles/`.
- O CI ganhou o job **Dependências**, que avisa quando o `npm audit`, o Electron ou o Claude Code
  pedem atualização (sem derrubar o CI).
- Dependências atualizadas pelo `npm audit fix`: o Electron 44.9.3 (era o 44.7.0) e, no servidor
  MCP e no build, body-parser, fast-uri, ip-address, qs, undici e zod.
- O `config.json` ganhou `language` (`"auto"`, `"pt"` ou `"en"`), `prompts`, `scheduledTasks`,
  `dance` (a dança de quando toca música), `enabledMcpServers`, `paletteShortcut`,
  `quietWithDnd`, `islandAutoClose`, `islandHoverOpen` e `islandCovers`.
- Na ilha, o clique abre a ilha (antes, abria o painel); o painel abre pelo botão dela.
- O mascote ganhou boca: falando, ela abre e fecha (antes, os olhos piscavam no ritmo); pedindo
  permissão, os olhos brilham.
- O CLAUDE.md do workspace pede ao Claude que responda no idioma da interface.
- O `main` do app é o `out/main/boot.js`, que responde o hook do Bash (`--wisp-mode-hook`) antes de
  carregar o resto.
- O CI ganhou o job **Windows**, num Windows de verdade (os testes, o roteiro do essencial com os
  prints e o instalador), e numa tag o instalador do Windows vai para o release.

### Consertado

- No Windows, o mascote só dançava com a música que o Claude tivesse olhado por último: agora o
  Wisp acompanha o controle de mídia do Windows.
- No Windows, um hook do Claude Code que terminava depois de o Claude Code sair podia deixar
  aberta uma caixa "Error" do Electron; agora ele só sai.
- No Windows, as skills pessoais não entravam nas conversas pela OpenRouter: o link para elas
  pedia o modo de desenvolvedor ou o administrador (EPERM). Agora é uma junction.
- No modo terminal, uma mensagem mandada pelo `wisp --ask` ou pela voz a um Claude Code que
  acabou de subir podia ficar na caixa sem enviar (o Enter chegava antes de ele ligar o modo cru
  do terminal, como uma quebra de linha): agora a colagem espera ele mostrar alguma coisa.
- Sem a libnotify, as notificações (lembretes, o resumo de quando você saiu, as tarefas) não
  apareciam: agora vão direto pelo D-Bus.
- O aviso de tela bloqueada não espera mais o barramento do sistema responder.
- O CI monta e confere os pacotes ARM64 e o Flatpak.
- O CI não cai mais por um espelho do apt lento: os pacotes ficam em cache, cada `apt-get` tem
  tentativas e um limite de tempo, e todo job tem o seu limite.
- Com o painel escondendo enquanto a notificação de um card ainda saía, o Wisp mostrava duas, e o
  Permitir da primeira não respondia nada.
- Editar a última mensagem logo depois da resposta não junta mais a resposta nova com a velha.

## 0.1.0

A primeira versão: o MVP e as fases 6 a 17.

- **O mascote** (Etapas 1 e 5, Fase 8): a gotinha robô que flutua, segue o cursor com os olhos,
  reage a cliques, cochila sem gastar CPU, tem sons próprios e acessórios por data.
- **O painel** (Etapas 2 a 4, Fase 6): a conversa com o Claude Code (a sua assinatura), os cards de
  permissão, os anexos, o histórico, o modelo e o uso do plano.
- **As sessões do terminal** (Fase 7): o Claude Code do terminal no Wisp, pelos hooks.
- **O desktop** (Fase 9): atalho global, o comando `wisp`, lembretes, música (MPRIS), prints, apps,
  terminais, janelas e o navegador do Claude.
- **A voz** (Fase 10): falar com o Wisp (whisper.cpp, local), comandos rápidos e respostas faladas
  (Piper).
- **Abas e modos** (Fase 11): várias conversas lado a lado e os modos de permissão (Pedir, Aceitar
  edições, Planejar, Automático).
- **Pacotes e testes** (Fase 12): o .deb e o AppImage, o CI, o modo demonstração, a tela de
  configurações e o registro em arquivo.
- **Integrações** (Fase 13): alertas do GitHub, a agenda e o resumo da semana.
- **A ilha, a voz mais robusta e a OpenRouter** (Fase 14).
- **Pastas e skills** (Fase 15), **a janela e a grade de painéis** (Fase 16) e **o modo terminal**, com
  o chat igual ao CLI (Fase 17).
