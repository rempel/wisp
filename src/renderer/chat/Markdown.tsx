import { memo, useRef, useState } from 'react'
import type { ComponentProps, JSX } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components, ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CheckIcon, CopyIcon } from './icons'

/** Linguagem de um bloco de código, pela classe "language-x" do <code> de dentro. */
function codeLanguage(node: ExtraProps['node']): string | undefined {
  const code = node?.children[0]
  if (!code || code.type !== 'element') return undefined
  const classes = code.properties.className
  const names = Array.isArray(classes) ? classes.map(String) : []
  return names.find((name) => name.startsWith('language-'))?.slice('language-'.length)
}

function CodeBlock({ children, node }: ComponentProps<'pre'> & ExtraProps): JSX.Element {
  const pre = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)
  const language = codeLanguage(node)

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(pre.current?.innerText ?? '')
    // Copiado do painel: o chip da área de transferência não oferece de volta.
    window.wisp.chat.copied()
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="code-block">
      <div className="code-head">
        <span>{language ?? 'código'}</span>
        <button type="button" onClick={copy} title="Copiar código">
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre ref={pre}>{children}</pre>
    </div>
  )
}

const components: Components = {
  pre: CodeBlock,
  // O main abre links novos no navegador (e só http/https).
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}

const plugins = [remarkGfm]

/**
 * Markdown da conversa. Não renderiza HTML cru que venha no texto. Memoizado: blocos que não
 * mudaram não são reprocessados enquanto outro bloco recebe texto.
 */
export const Markdown = memo(function Markdown({ text }: { text: string }): JSX.Element {
  return (
    <ReactMarkdown remarkPlugins={plugins} components={components}>
      {text}
    </ReactMarkdown>
  )
})
