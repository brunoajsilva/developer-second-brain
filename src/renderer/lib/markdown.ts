import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
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

export interface MarkdownEnv {
  vaultId: string;
  /** Folder of the page, relative to Docs/ ('' at the root). */
  baseDir: string;
  /** Running heading counter (set while rendering). */
  headingIndex?: number;
  /** Lines removed (frontmatter) before the body, so checkbox line numbers match the file. */
  lineOffset?: number;
}

const md = new MarkdownIt({
  html: true, // sanitized by DOMPurify
  linkify: true,
  breaks: true, // a single newline breaks the line (like GitHub comments and Obsidian)
  typographer: false,
  highlight(code, lang) {
    const l = alias[lang.toLowerCase()] ?? lang.toLowerCase();
    if (!l || !hljs.getLanguage(l)) return '';
    try { return hljs.highlight(code, { language: l, ignoreIllegals: true }).value; } catch { return ''; }
  }
}).use(footnote).use(deflist).use(sub).use(sup).use(mark).use(abbr).use(emoji);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// [[Page]] , [[Page|label]] , [[#cardId]]
md.inline.ruler.before('link', 'wikilink', (state, silent) => {
  const s = state.src;
  const i = state.pos;
  if (s.charCodeAt(i) !== 0x5b || s.charCodeAt(i + 1) !== 0x5b) return false;
  const end = s.indexOf(']]', i + 2);
  if (end < 0) return false;
  const inner = s.slice(i + 2, end);
  if (!inner || inner.includes('\n') || inner.includes('[')) return false;
  if (!silent) {
    const [target, label] = inner.split('|');
    const t = state.push('wikilink', '', 0);
    t.meta = { target: target.trim(), label: (label ?? target).trim() };
  }
  state.pos = end + 2;
  return true;
});
md.renderer.rules.wikilink = (tokens, idx) => {
  const { target, label } = tokens[idx].meta as { target: string; label: string };
  return `<a class="wikilink" href="#" data-wiki="${esc(target)}">${esc(label)}</a>`;
};

md.renderer.rules.image = (tokens, idx, _o, e: unknown) => {
  const env = e as MarkdownEnv;
  const t = tokens[idx];
  const src = String(t.attrGet('src') ?? '');
  let url = src;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(src) && !src.startsWith('/')) {
    const parts = (env.baseDir ? env.baseDir.split('/') : []).concat(src.split('/'));
    const clean: string[] = [];
    for (const p of parts) {
      if (p === '..') clean.pop();
      else if (p && p !== '.') clean.push(p);
    }
    url = `vault://${env.vaultId}/Docs/${clean.map(encodeURIComponent).join('/')}`;
  }
  return `<img src="${esc(url)}" alt="${esc(t.content)}" loading="lazy">`;
};

const defaultFence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, idx, o, env, self) => {
  const t = tokens[idx];
  if (t.info.trim().split(/\s+/)[0] === 'mermaid') return `<div class="mermaid-src" data-code="${encodeURIComponent(t.content)}"><pre>${esc(t.content)}</pre></div>`;
  return defaultFence(tokens, idx, o, env, self);
};

md.renderer.rules.heading_open = (tokens, idx, o, e: unknown, self) => {
  const env = e as MarkdownEnv;
  tokens[idx].attrSet('data-h', String(env.headingIndex ?? 0));
  env.headingIndex = (env.headingIndex ?? 0) + 1;
  return self.renderToken(tokens, idx, o);
};

const defaultLinkOpen = md.renderer.rules.link_open ?? ((tokens, idx, o, _e, self) => self.renderToken(tokens, idx, o));
md.renderer.rules.link_open = (tokens, idx, o, env, self) => {
  tokens[idx].attrSet('target', '_blank');
  tokens[idx].attrSet('rel', 'noopener noreferrer');
  return defaultLinkOpen(tokens, idx, o, env, self);
};

// - [ ] / - [x] become clickable checkboxes (data-line = line in the file)
md.core.ruler.after('text_join', 'tasks', (state) => {
  const t = state.tokens;
  const offset = (state.env as unknown as MarkdownEnv).lineOffset ?? 0;
  for (let i = 2; i < t.length; i++) {
    if (t[i].type !== 'inline' || t[i - 1].type !== 'paragraph_open' || t[i - 2].type !== 'list_item_open') continue;
    const m = t[i].content.match(/^\[([ xX])\](?:\s+|$)/);
    const children = t[i].children;
    if (!m || !children?.length || children[0].type !== 'text') continue;
    children[0].content = children[0].content.replace(/^\[[ xX]\]\s*/, '');
    const line = (t[i - 2].map?.[0] ?? 0) + offset;
    const box = new state.Token('html_inline', '', 0);
    box.content = `<input type="checkbox" class="task-box" data-line="${line}" ${m[1] === ' ' ? '' : 'checked'}> `;
    children.unshift(box);
    t[i - 2].attrJoin('class', 'task');
    // the whole list gets a class too, to hide its bullets
    for (let j = i - 3; j >= 0; j--) if (t[j].type === 'bullet_list_open' || t[j].type === 'ordered_list_open') { t[j].attrJoin('class', 'has-tasks'); break; }
  }
});

// > [!NOTE] / [!TIP] / [!IMPORTANT] / [!WARNING] / [!CAUTION]
const CALLOUT_TITLES: Record<string, string> = { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' };
md.core.ruler.after('text_join', 'callouts', (state) => {
  const t = state.tokens;
  for (let i = 0; i < t.length - 2; i++) {
    if (t[i].type !== 'blockquote_open' || t[i + 1].type !== 'paragraph_open' || t[i + 2].type !== 'inline') continue;
    const children = t[i + 2].children;
    if (!children?.length || children[0].type !== 'text') continue;
    const m = children[0].content.match(/^\[!(note|tip|important|warning|caution)\]\s*$/i);
    if (!m) continue;
    const kind = m[1].toLowerCase();
    children.shift();
    const next: string | undefined = children[0]?.type;
    if (next === 'softbreak' || next === 'hardbreak') children.shift();
    const title = new state.Token('html_inline', '', 0);
    title.content = `<span class="callout-title">${CALLOUT_TITLES[kind]}</span>`;
    const br = new state.Token('html_inline', '', 0);
    br.content = '<br>';
    children.unshift(title, ...(children.length ? [br] : []));
    t[i].attrJoin('class', `callout callout-${kind}`);
  }
});

export interface Heading {
  level: number;
  text: string;
}

/** Headings (levels 1–3) outside code blocks, for the page outline. */
export function extractHeadings(text: string): Heading[] {
  const out: Heading[] = [];
  let inCode = false;
  for (const line of text.split('\n')) {
    if (/^```/.test(line)) inCode = !inCode;
    if (inCode) continue;
    const m = line.match(/^(#{1,3})\s+(.+?)\s*#*$/);
    if (m) out.push({ level: m[1].length, text: m[2] });
  }
  return out;
}

export function renderMarkdown(text: string, env: MarkdownEnv): string {
  const frontmatter = text.match(/^---\n[\s\S]*?\n---\n/);
  const lineOffset = frontmatter ? frontmatter[0].split('\n').length - 1 : 0;
  const html = md.render(frontmatter ? text.slice(frontmatter[0].length) : text, { ...env, headingIndex: 0, lineOffset });
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'data-wiki', 'data-h', 'data-code', 'data-line'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|vault):|#|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i
  });
}

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;
let diagramCounter = 0;

/** Draws the ```mermaid blocks inside an already rendered element (mermaid is loaded lazily). */
export async function renderMermaid(root: HTMLElement): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.mermaid-src'));
  if (!blocks.length) return;
  mermaidPromise ??= import('mermaid').then((m) => {
    m.default.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral', fontFamily: 'Geist Variable, system-ui, sans-serif' });
    return m.default;
  });
  const mermaid = await mermaidPromise;
  for (const el of blocks) {
    // stored encoded: DOMPurify drops attributes containing "-->" (mermaid arrows)
    let code = '';
    try { code = decodeURIComponent(el.dataset.code ?? ''); } catch { code = ''; }
    try {
      const { svg } = await mermaid.render('mmd-' + ++diagramCounter, code);
      el.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ['foreignObject'] });
      el.classList.add('ready');
    } catch (e) {
      console.warn('[mermaid]', e);
      el.classList.add('failed');
      el.title = 'Invalid diagram';
    }
  }
}
