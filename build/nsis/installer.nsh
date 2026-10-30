; O endereço wisp:// (Fase 35): os botões das notificações do Windows (Permitir e Negar) abrem
; wisp://notificacao/<id>/<chave>, e o Windows entrega o endereço ao Wisp que está aberto. O
; instalador registra o endereço só para o seu usuário, e o desinstalador o tira.

!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\Classes\wisp" "" "URL:Wisp"
  WriteRegStr SHELL_CONTEXT "Software\Classes\wisp" "URL Protocol" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\wisp\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro customUnInstall
  DeleteRegKey SHELL_CONTEXT "Software\Classes\wisp"
!macroend
