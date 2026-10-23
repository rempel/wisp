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

### Mudou

- O tipo de instalação no diagnóstico pode ser `flatpak`.
- O `config.json` ganhou `language` (`"auto"`, `"pt"` ou `"en"`).
- O CLAUDE.md do workspace pede ao Claude que responda no idioma da interface.
- O CI monta e confere os pacotes ARM64 e o Flatpak.

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
