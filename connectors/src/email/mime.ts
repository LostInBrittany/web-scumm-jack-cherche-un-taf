// A bounded MIME reader for the email connector (4.1.9, docs/dev/threat-models/email.md). It reads the four things the
// connector needs (Message-ID, the recipients, the subject, the text) and counts attachments; it never opens one, never
// follows a URL, never keeps HTML. Every loop is bounded by the input or by a constant: at most 3 levels of multipart,
// 64 parts, 200 headers, 256 KB of text. Pure: it runs in a worker thread (`parse.ts`), and directly in the fuzz harness.

export interface MimeLimits {
  /** Multipart levels below the message itself. */
  depth: number;
  parts: number;
  headers: number;
  /** Decoded text kept, in characters (the rest is cut, and said). */
  textChars: number;
}
const MIME_LIMITS: MimeLimits = { depth: 3, parts: 64, headers: 200, textChars: 256 * 1024 };

export interface ParsedMail {
  messageId: string;
  /** Every address of To, Cc, Delivered-To and X-Original-To, lower case. */
  to: string[];
  /** The first address of From, lower case (used hashed only, never for routing alone). */
  from: string;
  subject: string;
  /** The plain text (or the HTML reduced to inert text), whitespace collapsed. */
  text: string;
  attachments: number;
  truncated: boolean;
}
export type MimeResult = { ok: true; mail: ParsedMail } | { ok: false; reason: string };

class Refused extends Error {}

const latin1 = (b: Uint8Array) => Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString('latin1');

/** Bytes → text in a charset the platform knows; anything else as Latin-1 (never an exception). */
function decodeCharset(bytes: Uint8Array, charset = 'utf-8'): string {
  try {
    return new TextDecoder(charset.trim().toLowerCase() || 'utf-8', { fatal: false }).decode(bytes);
  } catch {
    return latin1(bytes);
  }
}

const B64 = /[^A-Za-z0-9+/]/g;
function base64(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s.replace(B64, ''), 'base64'));
}

function quotedPrintable(s: string, header = false): Uint8Array {
  const src = header ? s.replace(/_/g, ' ') : s.replace(/=\r?\n/g, '');
  const out: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const c = src.charCodeAt(i);
    if (c === 61 /* = */ && /^[0-9A-Fa-f]{2}$/.test(src.slice(i + 1, i + 3))) {
      out.push(Number.parseInt(src.slice(i + 1, i + 3), 16));
      i += 2;
    } else out.push(c & 0xff);
  }
  return new Uint8Array(out);
}

/** RFC 2047 encoded words in a header (`=?utf-8?B?…?=`), bounded by the header's own length. */
export function decodeWords(v: string): string {
  return v
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?([^?\s]{1,40})\?([bBqQ])\?([^?\s]{0,4096})\?=/g, (_m, cs: string, enc: string, text: string) =>
      decodeCharset(enc.toLowerCase() === 'b' ? base64(text) : quotedPrintable(text, true), cs.split('*')[0]),
    );
}

type Headers = Map<string, string[]>;

function readHeaders(block: string, limits: MimeLimits): Headers {
  const h: Headers = new Map();
  let n = 0;
  let current: [string, string] | null = null;
  const flush = () => {
    if (!current) return;
    if (++n > limits.headers) throw new Refused('too many headers');
    const [k, v] = current;
    h.set(k, [...(h.get(k) ?? []), v.trim()]);
  };
  for (const line of block.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && current) current[1] += ` ${line.trim()}`;
    else {
      flush();
      const i = line.indexOf(':');
      current = i > 0 && i < 80 ? [line.slice(0, i).trim().toLowerCase(), line.slice(i + 1)] : null;
    }
  }
  flush();
  return h;
}

/** `type/subtype; a=b; c="d"` → the value and its parameters (names lower case). */
export function headerValue(v: string | undefined): { value: string; params: Record<string, string> } {
  if (!v) return { value: '', params: {} };
  const [first = '', ...rest] = v.split(';');
  const params: Record<string, string> = {};
  for (const p of rest.slice(0, 16)) {
    const i = p.indexOf('=');
    if (i < 0) continue;
    params[p.slice(0, i).trim().toLowerCase()] = p
      .slice(i + 1)
      .trim()
      .replace(/^"(.*)"$/s, '$1');
  }
  return { value: first.trim().toLowerCase(), params };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/**
 * HTML → inert text, in one pass: tags dropped, `<script>` and `<style>` dropped with their content, comments dropped,
 * entities decoded. Linear in the input (an unclosed `<script` drops the rest), no pattern that backtracks.
 */
export function htmlToText(html: string): string {
  let out = '';
  let i = 0;
  // ASCII only, as HTML's tag names are: `toLowerCase` may lengthen a character (İ is two code units in lower case),
  // and `lower` is read at `html`'s indexes.
  const lower = html.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    if (lower.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    const gt = html.indexOf('>', lt + 1);
    if (gt < 0) break;
    const name = /^<\s*([a-z0-9]+)/.exec(lower.slice(lt, Math.min(gt + 1, lt + 32)))?.[1];
    i = gt + 1;
    if (name === 'script' || name === 'style') {
      const end = lower.indexOf(`</${name}`, i);
      const close = end < 0 ? -1 : html.indexOf('>', end);
      i = close < 0 ? html.length : close + 1;
    }
    out += ' ';
  }
  return out.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,6});/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : ' ';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const ADDRESS = /[^\s<>,;:"()[\]\\]{1,64}@[a-z0-9.-]{1,253}/gi;
const addresses = (v: string | undefined) =>
  v ? [...v.slice(0, 8192).matchAll(ADDRESS)].map((m) => m[0].toLowerCase()) : [];

interface Walk {
  plain: string[];
  html: string[];
  attachments: number;
  parts: number;
  chars: number;
  truncated: boolean;
}

function decodeBody(body: string, h: Headers): Uint8Array {
  const cte = headerValue(h.get('content-transfer-encoding')?.[0]).value;
  if (cte === 'base64') return base64(body);
  if (cte === 'quoted-printable') return quotedPrintable(body);
  return Buffer.from(body, 'latin1');
}

function splitHead(raw: string): [string, string] {
  const m = /\r?\n\r?\n/.exec(raw);
  return m ? [raw.slice(0, m.index), raw.slice(m.index + m[0].length)] : [raw, ''];
}

function walk(raw: string, h: Headers, depth: number, w: Walk, limits: MimeLimits): void {
  if (++w.parts > limits.parts) throw new Refused('too many parts');
  const ct = headerValue(h.get('content-type')?.[0] ?? 'text/plain');
  const disposition = headerValue(h.get('content-disposition')?.[0]).value;
  if (ct.value.startsWith('multipart/')) {
    if (depth >= limits.depth) throw new Refused('multipart nested too deep');
    const boundary = ct.params.boundary;
    if (!boundary || boundary.length > 200) throw new Refused('multipart without a usable boundary');
    const delimiter = `--${boundary}`;
    const lines = raw.split(/\r?\n/);
    let part: string[] | null = null;
    const parts: string[] = [];
    for (const line of lines) {
      if (line.startsWith(delimiter)) {
        if (part) parts.push(part.join('\r\n'));
        if (line.startsWith(`${delimiter}--`)) {
          part = null;
          break;
        }
        part = [];
        if (parts.length >= limits.parts) throw new Refused('too many parts');
      } else part?.push(line);
    }
    if (part) parts.push(part.join('\r\n'));
    for (const p of parts) {
      const [head, body] = splitHead(p);
      walk(body, readHeaders(head, limits), depth + 1, w, limits);
    }
    return;
  }
  const isText = ct.value === 'text/plain' || ct.value === 'text/html' || ct.value === '';
  if (disposition === 'attachment' || !isText) {
    w.attachments++;
    return;
  }
  if (w.chars >= limits.textChars) {
    w.truncated = true;
    return;
  }
  let text = decodeCharset(decodeBody(raw, h), ct.params.charset);
  if (ct.value === 'text/html') text = htmlToText(text);
  if (w.chars + text.length > limits.textChars) {
    text = text.slice(0, limits.textChars - w.chars);
    w.truncated = true;
  }
  w.chars += text.length;
  (ct.value === 'text/html' ? w.html : w.plain).push(text);
}

const collapse = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Reads a raw RFC 5322 message. Never throws: a message it will not read is `{ ok: false, reason }`. */
export function parseMail(bytes: Uint8Array, limits: MimeLimits = MIME_LIMITS): MimeResult {
  try {
    const raw = latin1(bytes);
    const [head, body] = splitHead(raw);
    if (head.length > 64 * 1024) throw new Refused('header block over 64 KB');
    const h = readHeaders(head, limits);
    const messageId = /<?([^<>\s]{1,250})>?/.exec(h.get('message-id')?.[0] ?? '')?.[1];
    if (!messageId) throw new Refused('no Message-ID');
    const w: Walk = { plain: [], html: [], attachments: 0, parts: 0, chars: 0, truncated: false };
    walk(body, h, 0, w, limits);
    const subject = collapse(decodeWords(decodeCharset(Buffer.from(h.get('subject')?.[0] ?? '', 'latin1'))));
    return {
      ok: true,
      mail: {
        messageId,
        to: [
          ...new Set(['to', 'cc', 'delivered-to', 'x-original-to'].flatMap((k) => (h.get(k) ?? []).flatMap(addresses))),
        ],
        from: addresses(h.get('from')?.[0])[0] ?? '',
        subject: subject.slice(0, 998),
        text: collapse((w.plain.length ? w.plain : w.html).join('\n')),
        attachments: w.attachments,
        truncated: w.truncated,
      },
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Refused ? e.message : 'unreadable message' };
  }
}
