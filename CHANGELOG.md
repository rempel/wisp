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

### Mudou

- O tipo de instalação no diagnóstico pode ser `flatpak`.
- Manutenção (Fase 28): o código ficou em módulos menores (nenhum arquivo do `src/` passa de 1.000
  linhas, menos o dicionário em inglês), sem mudar o que o app faz; o CSS do painel e o do mascote
  viraram folhas por assunto em `styles/`.
- O CI ganhou o job **Dependências**, que avisa quando o `npm audit`, o Electron ou o Claude Code
  pedem atualização (sem derrubar o CI).
- Dependências atualizadas pelo `npm audit fix`: o Electron 44.9.3 (era o 44.7.0) e, no servidor
  MCP e no build, body-parser, fast-uri, ip-address, qs, undici e zod.
- O `config.json` ganhou `language` (`"auto"`, `"pt"` ou `"en"`), `prompts`, `scheduledTasks`,
  `dance` (a dança de quando toca música) e `enabledMcpServers`.
- O mascote ganhou boca: falando, ela abre e fecha (antes, os olhos piscavam no ritmo); pedindo
  permissão, os olhos brilham.
- O CLAUDE.md do workspace pede ao Claude que responda no idioma da interface.

### Consertado

- Sem a libnotify, as notificações (lembretes, o resumo de quando você saiu, as tarefas) não
  apareciam: agora vão direto pelo D-Bus.
- O aviso de tela bloqueada não espera mais o barramento do sistema responder.
- O CI monta e confere os pacotes ARM64 e o Flatpak.
- O CI não cai mais por um espelho do apt lento: os pacotes ficam em cache, cada `apt-get` tem
  tentativas e um limite de tempo, e todo job tem o seu limite.

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
