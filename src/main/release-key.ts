// A chave pública que confere os AppImages das versões novas (Fase 31). O par é gerado uma vez por
// quem publica o Wisp (node scripts/release-key.mjs): a privada vai para o segredo
// WISP_RELEASE_KEY do GitHub, e a pública, para cá. Sem ela (null), o botão Atualizar não aparece
// e o aviso de versão nova leva à página, como antes.

export const RELEASE_PUBLIC_KEY: string | null = null
