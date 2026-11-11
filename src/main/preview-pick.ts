// Apontar um elemento da página (Fase 60): o JavaScript que põe a mira na página do navegador
// da bancada, o que volta dela (conferido: a página não é de confiança) e o texto que vai para
// a caixa da conversa.

import type { ViewBounds } from '../shared/ipc'
import { t } from '../shared/i18n'

/** O elemento apontado: como achá-lo, o que ele diz e como está desenhado. */
export interface Picked {
  selector: string
  tag: string
  text: string
  rect: ViewBounds
  styles: Record<string, string>
}

/**
 * A mira: uma moldura segue o cursor; o clique devolve o elemento e a Esc (ou um minuto)
 * desiste. Tudo o que ela põe na página sai antes de devolver.
 */
export const PICK_SCRIPT = `new Promise((resolve) => {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;box-sizing:border-box;border:2px solid #2ed3ee;background:rgba(46,211,238,.16);border-radius:3px;left:0;top:0;width:0;height:0';
  document.documentElement.appendChild(box);
  const cursor = document.documentElement.style.cursor;
  document.documentElement.style.cursor = 'crosshair';
  let current = null;
  const selectorOf = (el) => {
    const parts = [];
    for (let node = el; node && node.nodeType === 1 && parts.length < 5; node = node.parentElement) {
      if (node.id) { parts.unshift('#' + CSS.escape(node.id)); break; }
      let part = node.tagName.toLowerCase();
      const classes = [...node.classList].slice(0, 2).map((name) => '.' + CSS.escape(name)).join('');
      part += classes;
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter((child) => child.tagName === node.tagName);
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      if (node === document.body) break;
    }
    return parts.join(' > ');
  };
  const move = (event) => {
    current = event.target;
    if (!current || current === box || !current.getBoundingClientRect) return;
    const r = current.getBoundingClientRect();
    box.style.left = r.left + 'px'; box.style.top = r.top + 'px';
    box.style.width = r.width + 'px'; box.style.height = r.height + 'px';
  };
  let timer = 0;
  const done = (value) => {
    removeEventListener('mousemove', move, true);
    removeEventListener('click', click, true);
    removeEventListener('keydown', key, true);
    clearTimeout(timer);
    box.remove();
    document.documentElement.style.cursor = cursor;
    resolve(value);
  };
  const click = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const el = event.target;
    if (!el || !el.getBoundingClientRect) return done(null);
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const styles = {};
    for (const name of ['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'padding', 'margin', 'border-radius', 'display']) {
      styles[name] = style.getPropertyValue(name);
    }
    done({
      selector: selectorOf(el),
      tag: el.tagName.toLowerCase(),
      text: (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('alt') || '').trim().slice(0, 300),
      rect: { x: Math.max(0, r.left), y: Math.max(0, r.top), width: Math.min(r.width, innerWidth), height: Math.min(r.height, innerHeight) },
      styles
    });
  };
  const key = (event) => { if (event.key === 'Escape') { event.preventDefault(); done(null); } };
  addEventListener('mousemove', move, true);
  addEventListener('click', click, true);
  addEventListener('keydown', key, true);
  timer = setTimeout(() => done(null), 60000);
})`

const str = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.slice(0, max) : ''

/** O que a página devolveu, conferido: ela pode mandar qualquer coisa. null: nada apontado. */
export function sanePick(raw: unknown): Picked | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const rect = value.rect as Record<string, unknown> | null
  const selector = str(value.selector, 400)
  if (!selector || !rect || typeof rect !== 'object') return null
  const numbers = [rect.x, rect.y, rect.width, rect.height]
  if (!numbers.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 20000)) {
    return null
  }
  if ((rect.width as number) < 1 || (rect.height as number) < 1) return null
  const styles: Record<string, string> = {}
  if (value.styles && typeof value.styles === 'object') {
    for (const [name, style] of Object.entries(value.styles as Record<string, unknown>)) {
      if (/^[a-z-]{1,30}$/.test(name) && typeof style === 'string') {
        styles[name] = style.slice(0, 120)
      }
    }
  }
  return {
    selector,
    tag: str(value.tag, 30).replace(/[^a-z0-9-]/gi, ''),
    text: str(value.text, 300),
    rect: {
      x: rect.x as number,
      y: rect.y as number,
      width: rect.width as number,
      height: rect.height as number
    },
    styles
  }
}

/** O que vai para a caixa da conversa: onde está o elemento, o que diz e como está desenhado. */
export function pickedText(picked: Picked, url: string): string {
  const styles = Object.entries(picked.styles)
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}: ${value}`)
    .join('; ')
  // As crases do texto da página não fecham o bloco de código.
  const quoted = picked.text.replace(/`/g, "'").replace(/\s+/g, ' ')
  return (
    t('Na página {url}, este elemento (o recorte está em anexo):', { url }) +
    `\n\`${picked.selector.replace(/`/g, "'")}\`` +
    (quoted ? ` <${picked.tag}> "${quoted}"` : ` <${picked.tag}>`) +
    (styles ? `\n${t('Estilos:')} ${styles}` : '') +
    '\n\n'
  )
}
