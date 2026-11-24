import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import { temaEscuro } from './tema';
import footnote from 'markdown-it-footnote';
import deflist from 'markdown-it-deflist';
import sub from 'markdown-it-sub';
import sup from 'markdown-it-sup';
import mark from 'markdown-it-mark';
import abbr from 'markdown-it-abbr';
import { full as emoji } from 'markdown-it-emoji';
import hljs from 'highlight.js/lib/core';
import ts from 'highlight.js/lib/languages/typescript';
import js from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import py from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import cs from 'highlight.js/lib/languages/csharp';
import go from 'highlight.js/lib/languages/go';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import kotlin from 'highlight.js/lib/languages/kotlin';
import rust from 'highlight.js/lib/languages/rust';
import php from 'highlight.js/lib/languages/php';
import ini from 'highlight.js/lib/languages/ini';
import plaintext from 'highlight.js/lib/languages/plaintext';

const langs: Record<string, Parameters<typeof hljs.registerLanguage>[1]> = { typescript: ts, javascript: js, json, bash, python: py, java, sql, yaml, xml, css, csharp: cs, go, diff, dockerfile, kotlin, rust, php, ini, plaintext };
for (const [n, l] of Object.entries(langs)) hljs.registerLanguage(n, l);
const alias: Record<string, string> = { ts: 'typescript', js: 'javascript', sh: 'bash', shell: 'bash', zsh: 'bash', py: 'python', yml: 'yaml', html: 'xml', cs: 'csharp', golang: 'go', docker: 'dockerfile', kt: 'kotlin', rs: 'rust', toml: 'ini', jsonc: 'json', tsx: 'typescript', jsx: 'javascript', text: 'plaintext', txt: 'plaintext' };

export interface AmbienteMd {
  cofreId: string;
  baseDir: string; // pasta da página, relativa a Docs/ (ex.: "Arquitetura"), '' na raiz
  h?: number;
  desl?: number; // linhas removidas (frontmatter) antes do corpo
}

const md = new MarkdownIt({
  html: true, // sanitizado por DOMPurify
  linkify: true,
  breaks: true, // uma quebra de linha simples conta (como no GitHub comments/Obsidian)
  typographer: false,
  highlight(code, lang) {
    const l = alias[lang.toLowerCase()] ?? lang.toLowerCase();
    if (!l || !hljs.getLanguage(l)) return '';
    try { return hljs.highlight(code, { language: l, ignoreIllegals: true }).value; } catch { return ''; }
  }
}).use(footnote).use(deflist).use(sub).use(sup).use(mark).use(abbr).use(emoji);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// [[Página]] , [[Página|texto]] , [[#id]]
md.inline.ruler.before('link', 'ligacao', (state, silent) => {
  const s = state.src;
  const i = state.pos;
  if (s.charCodeAt(i) !== 0x5b || s.charCodeAt(i + 1) !== 0x5b) return false;
  const fim = s.indexOf(']]', i + 2);
  if (fim < 0) return false;
  const interior = s.slice(i + 2, fim);
  if (!interior || interior.includes('\n') || interior.includes('[')) return false;
  if (!silent) {
    const [alvo, texto] = interior.split('|');
    const t = state.push('ligacao', '', 0);
    t.meta = { alvo: alvo.trim(), texto: (texto ?? alvo).trim() };
  }
  state.pos = fim + 2;
  return true;
});
md.renderer.rules.ligacao = (tokens, idx) => {
  const { alvo, texto } = tokens[idx].meta as { alvo: string; texto: string };
  return `<a class="ligacao" href="#" data-wiki="${esc(alvo)}">${esc(texto)}</a>`;
};

md.renderer.rules.image = (tokens, idx, _o, e: unknown) => {
  const env = e as AmbienteMd;
  const t = tokens[idx];
  const src = String(t.attrGet('src') ?? '');
  let url = src;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(src) && !src.startsWith('/')) {
    const partes = (env.baseDir ? env.baseDir.split('/') : []).concat(src.split('/'));
    const limpo: string[] = [];
    for (const p of partes) {
      if (p === '..') limpo.pop();
      else if (p && p !== '.') limpo.push(p);
    }
    url = `vault://${env.cofreId}/Docs/${limpo.map(encodeURIComponent).join('/')}`;
  }
  return `<img src="${esc(url)}" alt="${esc(t.content)}" loading="lazy">`;
};

const fenceOriginal = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, idx, o, env, self) => {
  const t = tokens[idx];
  if (t.info.trim().split(/\s+/)[0] === 'mermaid') return `<div class="mermaid-src" data-code="${encodeURIComponent(t.content)}"><pre>${esc(t.content)}</pre></div>`;
  return fenceOriginal(tokens, idx, o, env, self);
};

md.renderer.rules.heading_open = (tokens, idx, o, e: unknown, self) => {
  const env = e as AmbienteMd;
  tokens[idx].attrSet('data-h', String(env.h ?? 0));
  env.h = (env.h ?? 0) + 1;
  return self.renderToken(tokens, idx, o);
};

const linkOriginal = md.renderer.rules.link_open ?? ((tokens, idx, o, _e, self) => self.renderToken(tokens, idx, o));
md.renderer.rules.link_open = (tokens, idx, o, env, self) => {
  tokens[idx].attrSet('target', '_blank');
  tokens[idx].attrSet('rel', 'noopener noreferrer');
  return linkOriginal(tokens, idx, o, env, self);
};

// - [ ] / - [x] viram caixas clicáveis (data-linha = linha no ficheiro)
md.core.ruler.after('text_join', 'tarefas', (state) => {
  const t = state.tokens;
  const desl = (state.env as unknown as AmbienteMd).desl ?? 0;
  for (let i = 2; i < t.length; i++) {
    if (t[i].type !== 'inline' || t[i - 1].type !== 'paragraph_open' || t[i - 2].type !== 'list_item_open') continue;
    const m = t[i].content.match(/^\[([ xX])\](?:\s+|$)/);
    const filhos = t[i].children;
    if (!m || !filhos?.length || filhos[0].type !== 'text') continue;
    filhos[0].content = filhos[0].content.replace(/^\[[ xX]\]\s*/, '');
    const linha = (t[i - 2].map?.[0] ?? 0) + desl;
    const box = new state.Token('html_inline', '', 0);
    box.content = `<input type="checkbox" class="tarefa-cx" data-linha="${linha}" ${m[1] === ' ' ? '' : 'checked'}> `;
    filhos.unshift(box);
    t[i - 2].attrJoin('class', 'tarefa');
    // a lista inteira também recebe a classe, para tirar os marcadores
    for (let j = i - 3; j >= 0; j--) if (t[j].type === 'bullet_list_open' || t[j].type === 'ordered_list_open') { t[j].attrJoin('class', 'tem-tarefas'); break; }
  }
});

// > [!NOTE] / [!TIP] / [!IMPORTANT] / [!WARNING] / [!CAUTION]
const titulosCallout: Record<string, string> = { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' };
md.core.ruler.after('text_join', 'callouts', (state) => {
  const t = state.tokens;
  for (let i = 0; i < t.length - 2; i++) {
    if (t[i].type !== 'blockquote_open' || t[i + 1].type !== 'paragraph_open' || t[i + 2].type !== 'inline') continue;
    const filhos = t[i + 2].children;
    if (!filhos?.length || filhos[0].type !== 'text') continue;
    const m = filhos[0].content.match(/^\[!(note|tip|important|warning|caution)\]\s*$/i);
    if (!m) continue;
    const tipo = m[1].toLowerCase();
    filhos.shift();
    const prox: string | undefined = filhos[0]?.type;
    if (prox === 'softbreak' || prox === 'hardbreak') filhos.shift();
    const tit = new state.Token('html_inline', '', 0);
    tit.content = `<span class="callout-t">${titulosCallout[tipo]}</span>`;
    const quebra = new state.Token('html_inline', '', 0);
    quebra.content = '<br>';
    filhos.unshift(tit, ...(filhos.length ? [quebra] : []));
    t[i].attrJoin('class', `callout callout-${tipo}`);
  }
});

export interface Cabecalho {
  nivel: number;
  texto: string;
}

export function cabecalhos(texto: string): Cabecalho[] {
  const out: Cabecalho[] = [];
  let codigo = false;
  for (const l of texto.split('\n')) {
    if (/^```/.test(l)) codigo = !codigo;
    if (codigo) continue;
    const m = l.match(/^(#{1,3})\s+(.+?)\s*#*$/);
    if (m) out.push({ nivel: m[1].length, texto: m[2] });
  }
  return out;
}

export function renderMarkdown(texto: string, env: AmbienteMd): string {
  const fm = texto.match(/^---\n[\s\S]*?\n---\n/);
  const desl = fm ? fm[0].split('\n').length - 1 : 0;
  const html = md.render(fm ? texto.slice(fm[0].length) : texto, { ...env, h: 0, desl });
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'data-wiki', 'data-h', 'data-code', 'data-linha'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|vault):|#|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i
  });
}

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;
/** Chamar quando o tema muda, para o próximo diagrama usar as cores certas. */
export function reiniciarMermaid(): void { mermaidPromise = null; }
let contador = 0;

/** Desenha os blocos ```mermaid dentro de um elemento já renderizado. */
export async function desenharMermaid(raiz: HTMLElement): Promise<void> {
  const blocos = Array.from(raiz.querySelectorAll<HTMLElement>('.mermaid-src'));
  if (!blocos.length) return;
  mermaidPromise ??= import('mermaid').then((m) => {
    m.default.initialize({ startOnLoad: false, securityLevel: 'strict', theme: temaEscuro() ? 'dark' : 'neutral', fontFamily: 'Geist Variable, system-ui, sans-serif' });
    return m.default;
  });
  const mermaid = await mermaidPromise;
  for (const el of blocos) {
    // codificado: o DOMPurify remove atributos com "-->" (setas do mermaid)
    let codigo = '';
    try { codigo = decodeURIComponent(el.dataset.code ?? ''); } catch { codigo = ''; }
    try {
      const { svg } = await mermaid.render('mmd-' + ++contador, codigo);
      el.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ['foreignObject'] });
      el.classList.add('pronto');
    } catch (e) {
      console.warn('[mermaid]', e);
      el.classList.add('erro');
      el.title = 'Invalid diagram';
    }
  }
}
