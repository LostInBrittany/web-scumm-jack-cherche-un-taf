// The HTML of the documentation archive (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.5.4 and §4.5.5): the pages a
// release's `html/` holds and Pages copies as they are, never rendered again. A small renderer for the Markdown the
// wiki's pages are written in, not a general one: the project has no Markdown library, and the subset is known and
// checked by `wiki -- check` (ATX headings, the `<a name>` anchor line before a section's heading, paragraphs, lists,
// fenced code, pipe tables, block quotes and the structured blocks the build has already named, links, images, code
// spans, emphasis). Everything else is text: every character a page holds is escaped, raw HTML included, except the
// anchor line (read, never copied) and `<br>`; a link or an image whose target is not http(s), mailto or a relative
// path keeps its text and loses its target. The same bytes for the same Markdown on every system.
import { closeBracket, destination } from './page';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** A target a page may link to: http(s), mailto, a fragment or a relative path; never `javascript:`, `data:`… */
export function safeHref(target: string): string | undefined {
  const t = target.trim();
  if (/^(https?:|mailto:)/i.test(t)) return t;
  // `//host` and `/\host` (a browser reads a backslash as a slash): another site, not a relative path.
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) || /^[/\\]{2}/.test(t) || /^\/?\\/.test(t) || /[\u0000-\u001f]/.test(t))
    return undefined;
  return t;
}

/** Inline Markdown as HTML: escapes first, then code spans, links, images, emphasis, `<br>`, hard breaks. */
export function inline(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === '\\' && i + 1 < text.length && /[!-/:-@[-`{-~]/.test(text[i + 1]!)) {
      out += esc(text[i + 1]!);
      i += 2;
      continue;
    }
    if (c === '`') {
      let run = 0;
      while (text[i + run] === '`') run++;
      const close = text.indexOf('`'.repeat(run), i + run);
      if (close > 0 && text[close + run] !== '`') {
        let code = text.slice(i + run, close).replace(/\n/g, ' ');
        if (/^ .*[^ ].* $/.test(code)) code = code.slice(1, -1);
        out += `<code>${esc(code)}</code>`;
        i = close + run;
        continue;
      }
      out += esc('`'.repeat(run));
      i += run;
      continue;
    }
    const image = c === '!' && text[i + 1] === '[';
    if (c === '[' || image) {
      const open = image ? i + 1 : i;
      const close = closeBracket(text, open);
      const dest = close > 0 && text[close + 1] === '(' ? destination(text, close + 1) : undefined;
      if (dest) {
        const label = text.slice(open + 1, close);
        const href = safeHref(dest.target);
        const title = dest.title !== undefined ? ` title="${esc(dest.title)}"` : '';
        if (image)
          out += href
            ? `<img src="${esc(href)}" alt="${esc(plain(label))}"${title} loading="lazy">`
            : esc(plain(label));
        else out += href ? `<a href="${esc(href)}"${title}>${inline(label)}</a>` : inline(label);
        i = dest.end + 1;
        continue;
      }
    }
    if (c === '<') {
      const br = /^<br\s*\/?>/i.exec(text.slice(i));
      if (br) {
        out += '<br>';
        i += br[0].length;
        continue;
      }
      const auto = /^<(https?:\/\/[^\s<>]+)>/.exec(text.slice(i));
      if (auto) {
        out += `<a href="${esc(auto[1]!)}">${esc(auto[1]!)}</a>`;
        i += auto[0].length;
        continue;
      }
    }
    if (c === '*' || c === '_') {
      const strong = text[i + 1] === c;
      const mark = strong ? c + c : c;
      const before = text[i - 1] ?? ' ';
      const after = text[i + mark.length] ?? ' ';
      // `_` inside a word (snake_case) is a character, never emphasis; a mark followed by a space opens nothing.
      if (!/\s/.test(after) && (c === '*' || !/[\p{L}\p{N}]/u.test(before))) {
        const end = findClose(text, i + mark.length, mark);
        if (end > 0) {
          const tag = strong ? 'strong' : 'em';
          out += `<${tag}>${inline(text.slice(i + mark.length, end))}</${tag}>`;
          i = end + mark.length;
          continue;
        }
      }
    }
    if (c === ' ' && text.slice(i, i + 3) === '  \n') {
      out += '<br>\n';
      i += 3;
      continue;
    }
    out += esc(c);
    i++;
  }
  return out;
}

/** The closing emphasis mark after `from`: not after a space, not inside a code span, `_` not inside a word. */
function findClose(text: string, from: number, mark: string): number {
  for (let j = from; j < text.length; j++) {
    if (text[j] === '\\') {
      j++;
      continue;
    }
    if (text[j] === '`') {
      const close = text.indexOf('`', j + 1);
      if (close < 0) return -1;
      j = close;
      continue;
    }
    if (text.startsWith(mark, j) && j > from && !/\s/.test(text[j - 1]!)) {
      if (mark.length === 1 && text[j + 1] === mark) {
        j++;
        continue;
      }
      if (mark[0] === '_' && /[\p{L}\p{N}]/u.test(text[j + mark.length] ?? '')) continue;
      return j;
    }
  }
  return -1;
}

/** A label's plain text (an image's `alt`): marks and link targets dropped. */
const plain = (label: string) => label.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_\\]/g, '');

const ANCHOR = /^<a (?:name|id)="([a-z0-9]+(?:-[a-z0-9]+)*)"><\/a>\s*$/;
const DETAILS = /^<details>(?:<summary>(.*)<\/summary>)?$/;
const HEADING = /^(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const LIST_ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
const RULE = /^ {0,3}([-*_])([ \t]*\1){2,}[ \t]*$/;
const COMMENT = /^<!--.*-->\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

/** The cells of a table row, split on `|` outside code spans and escapes. */
function cells(row: string): string[] {
  const t = row.trim().replace(/^\|/, '').replace(/\|$/, '');
  const out: string[] = [];
  let cur = '';
  let code = 0;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!;
    if (ch === '\\' && t[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (ch === '`') {
      let run = 0;
      while (t[i + run] === '`') run++;
      code = code === run ? 0 : code || run;
      cur += '`'.repeat(run);
      i += run - 1;
    } else if (ch === '|' && !code) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const startsBlock = (line: string) =>
  HEADING.test(line) || FENCE.test(line) || LIST_ITEM.test(line) || /^ {0,3}>/.test(line) || RULE.test(line);

/** Markdown blocks as HTML. A heading takes the id of the `<a name>` line before it (§4.1: the same in every output). */
export function renderMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let id: string | undefined;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const t = line.trim();
    if (!t) {
      i++;
      continue;
    }
    const anchor = ANCHOR.exec(t);
    if (anchor) {
      id = anchor[1];
      i++;
      continue;
    }
    if (COMMENT.test(t)) {
      i++;
      continue;
    }
    // A folded block, as the wiki writes it (a sidebar's domain, a page's qualification): `<details>` with its
    // `<summary>` on the same line, its Markdown body, `</details>` on a line of its own. The summary is inline text.
    const fold = DETAILS.exec(t);
    if (fold) {
      out.push(`<details>${fold[1] !== undefined ? `<summary>${inline(fold[1])}</summary>` : ''}`);
      i++;
      continue;
    }
    if (t === '</details>') {
      out.push('</details>');
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence && !(fence[1]![0] === '`' && fence[2]!.includes('`'))) {
      const mark = fence[1]!;
      const lang = fence[2]!.trim().split(/\s+/)[0] ?? '';
      const body: string[] = [];
      i++;
      while (i < lines.length) {
        const close = FENCE.exec(lines[i]!);
        if (close && close[1]![0] === mark[0] && close[1]!.length >= mark.length && !close[2]!.trim()) break;
        body.push(lines[i]!);
        i++;
      }
      i++;
      const cls = lang ? ` class="language-${esc(lang)}"` : '';
      out.push(`<pre><code${cls}>${esc(body.join('\n'))}${body.length ? '\n' : ''}</code></pre>`);
      continue;
    }
    const heading = HEADING.exec(t);
    if (heading) {
      const n = heading[1]!.length;
      out.push(`<h${n}${id ? ` id="${id}"` : ''}>${inline(heading[2]!)}</h${n}>`);
      id = undefined;
      i++;
      continue;
    }
    id = undefined;
    if (RULE.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }
    if (/^ {0,3}>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^ {0,3}>/.test(lines[i]!)) {
        body.push(lines[i]!.replace(/^ {0,3}> ?/, ''));
        i++;
      }
      out.push(`<blockquote>\n${renderMarkdown(body.join('\n'))}\n</blockquote>`);
      continue;
    }
    if (t.startsWith('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]!)) {
      const head = cells(line);
      const align = cells(lines[i + 1]!).map((c) =>
        c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : '',
      );
      const attr = (k: number) => (align[k] ? ` style="text-align:${align[k]}"` : '');
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.trim().startsWith('|')) {
        rows.push(cells(lines[i]!));
        i++;
      }
      out.push(
        `<table>\n<thead><tr>${head.map((c, k) => `<th${attr(k)}>${inline(c)}</th>`).join('')}</tr></thead>\n<tbody>\n${rows
          .map((r) => `<tr>${head.map((_, k) => `<td${attr(k)}>${inline(r[k] ?? '')}</td>`).join('')}</tr>`)
          .join('\n')}\n</tbody>\n</table>`,
      );
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      const ordered = /\d/.test(item[2]![0]!);
      const start = ordered ? Number.parseInt(item[2]!, 10) : 1;
      const items: string[][] = [];
      let loose = false;
      while (i < lines.length) {
        const m = LIST_ITEM.exec(lines[i]!);
        if (!m || /\d/.test(m[2]![0]!) !== ordered) break;
        const indent = m[1]!.length + m[2]!.length + 1;
        const body = [m[3]!];
        i++;
        // The item's own lines: indented under its text, or a lazy continuation of its paragraph.
        while (i < lines.length) {
          const l = lines[i]!;
          if (!l.trim()) {
            const next = lines[i + 1];
            if (next !== undefined && next.trim() && /^\s+/.test(next) && next.search(/\S/) >= indent) {
              body.push('');
              loose = true;
              i++;
              continue;
            }
            break;
          }
          if (l.search(/\S/) >= indent) body.push(l.slice(Math.min(indent, l.search(/\S/))));
          else if (!startsBlock(l) && body.at(-1)?.trim()) body.push(l.trim());
          else break;
          i++;
        }
        items.push(body);
        const following = LIST_ITEM.exec(lines[i + 1] ?? '');
        if (!lines[i]?.trim() && following && /\d/.test(following[2]![0]!) === ordered) {
          loose = true;
          i++;
        }
      }
      const tag = ordered ? 'ol' : 'ul';
      const startAttr = ordered && start !== 1 ? ` start="${start}"` : '';
      const html = items.map((b) => {
        const r = renderMarkdown(b.join('\n'));
        // A tight list: its items' paragraphs unwrapped.
        return `<li>${loose ? r : r.replace(/^<p>([\s\S]*?)<\/p>/, '$1')}</li>`;
      });
      out.push(`<${tag}${startAttr}>\n${html.join('\n')}\n</${tag}>`);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !(para.length && startsBlock(lines[i]!))) {
      if (ANCHOR.test(lines[i]!.trim()) || COMMENT.test(lines[i]!.trim())) break;
      para.push(lines[i]!.replace(/^\s+/, ''));
      i++;
    }
    out.push(`<p>${inline(para.join('\n'))}</p>`);
  }
  return out.join('\n');
}

/** The archive's one stylesheet: readable on a phone and in both colour schemes, no font to load. */
export const STYLE_CSS = `:root{color-scheme:light dark;--fg:#1d1d1f;--bg:#fff;--muted:#5b5b66;--line:#d9d9e0;--accent:#0b5cad;--code:#f3f3f6}
@media (prefers-color-scheme:dark){:root{--fg:#ececf1;--bg:#151518;--muted:#a3a3ad;--line:#33333a;--accent:#7ab7ff;--code:#202026}}
*{box-sizing:border-box}body{margin:0;font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--fg);background:var(--bg)}
a{color:var(--accent)}header,footer{padding:12px 16px;border-bottom:1px solid var(--line)}footer{border-top:1px solid var(--line);border-bottom:0;color:var(--muted);font-size:14px}
header{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center}header .home{font-weight:600;text-decoration:none}
.layout{display:grid;grid-template-columns:minmax(0,1fr);gap:24px;padding:16px;max-width:1200px;margin:0 auto}
@media (min-width:900px){.layout{grid-template-columns:260px minmax(0,1fr)}}
nav{font-size:14px}nav ul{padding-left:18px}main{min-width:0}main img{max-width:100%;height:auto}
pre{overflow:auto;padding:12px;background:var(--code);border-radius:6px}code{font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--code);padding:0 3px;border-radius:3px}pre code{padding:0}
table{border-collapse:collapse;display:block;overflow:auto}th,td{border:1px solid var(--line);padding:4px 8px;vertical-align:top}
blockquote{margin:16px 0;padding:4px 12px;border-left:4px solid var(--line);color:var(--muted)}
input[type=search]{font:inherit;padding:4px 8px;min-width:12em;max-width:100%;border:1px solid var(--line);border-radius:4px;background:var(--bg);color:var(--fg)}
#results{width:100%}#results ol{margin:8px 0;padding-left:20px}#results li{margin:6px 0}#results small{display:block;color:var(--muted)}
.state{padding:8px 16px;background:var(--code);font-size:14px}
`;

export interface PageShell {
  lang: 'en' | 'fr';
  title: string;
  /** The page's HTML, from `renderMarkdown`. */
  body: string;
  /** The navigation's HTML (the sidebar). */
  nav: string;
  /** From the page to the archive's root (`../` under `html/<lang>/`, `` at the root). */
  root: string;
  /** Its permalink (`/docs/<v>/r<n>/<lang>/<id>.html`), for `canonical`; none for a preview. */
  canonical?: string;
  /** The same page in the other language. */
  twin?: string;
  /** What the archive is: product version, revision, doc revision, build; and where publication is recorded. */
  identity: { productVersion: string; revision: string; docRevision: string; buildId?: string; publication: string };
}

/** A whole page: the shell around the rendered Markdown. No inline script: the search and the publication state load from `search.js`. */
export function htmlPage(s: PageShell): string {
  const fr = s.lang === 'fr';
  const id = s.identity;
  const words = fr
    ? {
        search: 'Chercher dans la documentation',
        state: `Construite pour quest'n'click ${id.productVersion}, révision ${id.revision}. Si elle est publiée, et laquelle est la courante, est dit par`,
        built: 'révision de la documentation',
        build: 'construction',
      }
    : {
        search: 'Search the documentation',
        state: `Built for quest'n'click ${id.productVersion}, revision ${id.revision}. Whether it is published, and which one is current, is recorded at`,
        built: 'documentation revision',
        build: 'build',
      };
  return `<!doctype html>
<html lang="${s.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(s.title)} · quest'n'click ${esc(id.productVersion)}</title>
<link rel="stylesheet" href="${s.root}style.css">
${s.canonical ? `<link rel="canonical" href="${esc(s.canonical)}">\n` : ''}${s.twin ? `<link rel="alternate" hreflang="${fr ? 'en' : 'fr'}" href="${esc(s.twin)}">\n` : ''}<script src="${s.root}search.js" defer></script>
</head>
<body data-root="${s.root}" data-lang="${s.lang}" data-version="${esc(id.productVersion)}" data-revision="${esc(id.revision)}" data-doc-revision="${esc(id.docRevision)}"${id.buildId ? ` data-build="${esc(id.buildId)}"` : ''} data-publication="${esc(id.publication)}">
<header><a class="home" href="${s.root}index.html">quest'n'click ${esc(id.productVersion)} · ${esc(id.revision)}</a><form role="search" id="docs-search-form"><input type="search" id="docs-search" aria-label="${words.search}" placeholder="${words.search}"></form><div id="results" aria-live="polite"></div></header>
<p class="state" id="publication-state">${words.state} <a href="${esc(id.publication)}">publication.json</a>.</p>
<div class="layout">
<nav>
${s.nav}
</nav>
<main>
${s.body}
</main>
</div>
<footer>quest'n'click ${esc(id.productVersion)} · ${esc(id.revision)} · ${words.built} <code>${esc(id.docRevision)}</code>${id.buildId ? ` · ${words.build} ${esc(id.buildId)}` : ''}</footer>
</body>
</html>
`;
}

/**
 * An alias (§4.5.4: `/docs/<v>/…` and `/docs/latest/…` point to a revision, and say so): a page that names its target
 * and goes there, the `#section` kept. Never a copy: a URL is not called a permalink and updated.
 */
export function aliasPage(target: string, what: string): string {
  const t = esc(target);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Alias · ${esc(what)}</title>
<link rel="canonical" href="${t}">
<script>location.replace(${JSON.stringify(target).replace(/</g, '\\u003c')} + location.hash)</script>
<meta http-equiv="refresh" content="0; url=${t}">
</head>
<body>
<p>This address is an alias of <a href="${t}">${esc(what)}</a>; the permalink holds the revision. · Cette adresse est un alias de <a href="${t}">${esc(what)}</a> ; le lien permanent porte la révision.</p>
</body>
</html>
`;
}
