// The MIME reader's edges (4.1.18, mutation set `connectors`): each limit (headers, parts, depth, boundary, header block,
// text) at its exact bound and one past it, the multipart split (close delimiter, epilogue, missing close), the charset
// and transfer-encoding fallbacks, and htmlToText's comments, unclosed tags and numeric entities.
import { describe, expect, it } from 'vitest';
import { headerValue, htmlToText, type MimeLimits, parseMail } from '../connectors/src/email/mime';

const L: MimeLimits = { depth: 3, parts: 64, headers: 200, textChars: 256 * 1024 };
const bytes = (s: string) => new Uint8Array(Buffer.from(s, 'latin1'));
const mail = (s: string, limits: Partial<MimeLimits> = {}) => parseMail(bytes(s), { ...L, ...limits });
const head = 'Message-ID: <m@x>\r\n';
const multi = (b: string, parts: string[], end = `--${b}--\r\n`) =>
  `${head}Content-Type: multipart/mixed; boundary="${b}"\r\n\r\n${parts.map((p) => `--${b}\r\n${p}\r\n`).join('')}${end}`;
const plain = (t: string, type = 'text/plain') => `Content-Type: ${type}\r\n\r\n${t}`;
const text = (r: ReturnType<typeof parseMail>) => (r.ok ? r.mail.text : r.reason);

describe('the MIME reader at its limits', () => {
  it('counts headers to the limit, and only well-formed name lines', () => {
    expect(mail(`${head}Subject: s\r\n\r\nx`, { headers: 2 }).ok).toBe(true);
    expect(mail(`${head}Subject: s\r\n\r\nx`, { headers: 1 })).toEqual({ ok: false, reason: 'too many headers' });
    for (const junk of ['no colon here', ': empty name', `${'n'.repeat(80)}: long name`])
      expect(mail(`${head}${junk}\r\n\r\nx`, { headers: 1 }).ok).toBe(true);
  });

  it('refuses a header block over 64 KB, not one of exactly 64 KB', () => {
    const block = (n: number) => `${head}X: ${'a'.repeat(n - head.length - 3)}`;
    expect(mail(`${block(64 * 1024)}\r\n\r\nx`).ok).toBe(true);
    expect(mail(`${block(64 * 1024 + 1)}\r\n\r\nx`)).toEqual({ ok: false, reason: 'header block over 64 KB' });
  });

  it('counts every part, the container included', () => {
    const m = multi('b', [plain('one'), plain('two')]);
    expect(mail(m, { parts: 3 }).ok).toBe(true);
    expect(mail(m, { parts: 2 })).toEqual({ ok: false, reason: 'too many parts' });
  });

  it('refuses too many parts while splitting, before reading the first one', () => {
    const m = (n: number) => multi('b', [plain('x', 'multipart/mixed'), ...Array(n - 1).fill(plain('y'))]);
    expect(mail(m(3), { parts: 2 })).toEqual({ ok: false, reason: 'too many parts' });
    expect(mail(m(2), { parts: 3 })).toEqual({ ok: false, reason: 'multipart without a usable boundary' });
  });

  it('refuses multipart nested at the depth limit', () => {
    const inner = `Content-Type: multipart/mixed; boundary="c"\r\n\r\n--c\r\n${plain('deep')}\r\n--c--`;
    expect(text(mail(multi('b', [inner]), { depth: 2 }))).toBe('deep');
    expect(mail(multi('b', [inner]), { depth: 1 })).toEqual({ ok: false, reason: 'multipart nested too deep' });
  });

  it('refuses a multipart without a boundary or with one over 200 characters', () => {
    const refused = { ok: false, reason: 'multipart without a usable boundary' };
    expect(mail(`${head}Content-Type: multipart/mixed\r\n\r\nx`)).toEqual(refused);
    expect(mail(multi('b'.repeat(201), [plain('x')]))).toEqual(refused);
    expect(text(mail(multi('b'.repeat(200), [plain('x')])))).toBe('x');
  });

  it('stops at the close delimiter, and keeps a last part left unclosed', () => {
    expect(text(mail(multi('b', [plain('kept')], '--b--\r\n\r\n\r\nepilogue')))).toBe('kept');
    expect(text(mail(multi('b', [plain('one'), plain('last')], '')))).toBe('one last');
  });

  it('cuts the text at the limit and says so, only past it', () => {
    const r = mail(multi('b', [plain('ab'), plain('xyz')]), { textChars: 3 });
    expect(r.ok && [r.mail.text, r.mail.truncated]).toEqual(['ab x', true]);
    const fit = mail(`${head}\r\nabc`, { textChars: 3 });
    expect(fit.ok && [fit.mail.text, fit.mail.truncated]).toEqual(['abc', false]);
  });

  it('skips a text part once the limit is reached, and says so', () => {
    const r = mail(multi('b', [plain('abc', 'text/html'), plain('xyz')]), { textChars: 3 });
    expect(r.ok && [r.mail.text, r.mail.truncated]).toEqual(['abc', true]);
  });
});

describe('the MIME reader on its fallbacks', () => {
  it('reads a message without a body, and reports an unexpected error without its message', () => {
    expect(text(mail('Message-ID: <m@x>\r\nSubject: s'))).toBe('');
    expect(parseMail(null as unknown as Uint8Array)).toEqual({ ok: false, reason: 'unreadable message' });
  });

  it('decodes invalid UTF-8 with replacement characters, not as Latin-1', () => {
    expect(text(mail(`${head}Content-Type: text/plain; charset=utf-8\r\n\r\ncaf\xe9`))).toBe('caf�');
  });

  it('leaves = sequences alone without quoted-printable, and HTML in plain text', () => {
    expect(text(mail(`${head}\r\na=41 <b>c</b>`))).toBe('a=41 <b>c</b>');
  });

  it('keeps parameters only with an =', () => {
    expect(headerValue('a; flag;=x; b=1').params).toEqual({ '': 'x', b: '1' });
  });
});

describe('htmlToText', () => {
  // 4.4.0: the tags were found in `html.toLowerCase()` at `html`'s indexes, and a character whose lower case is longer
  // (İ, U+0130, lowers to two code units) shifted them: a script or a comment leaked into the text, visible text went.
  it('a character whose lower case is longer shifts no tag', () => {
    expect(htmlToText('İ<script>alert(1)</script>ok')).toBe('İ ok');
    expect(htmlToText('İ<!-- a > secret -->ok')).toBe('İok');
    expect(htmlToText('<style>İİİİİİİİİİ</style>Hello > world')).toBe(' Hello > world');
    expect(htmlToText('<SCRIPT>x</SCRIPT>İ<P>y')).toBe(' İ y');
  });

  it('drops comments, and the rest after an unclosed one', () => {
    expect(htmlToText('a<!-- b > c -->d')).toBe('ad');
    expect(htmlToText('a<!-->b')).toBe('a');
  });

  it('stops at an unclosed tag (fast, even on a long text)', () => {
    const long = 'a'.repeat(1 << 20);
    expect(htmlToText(`${long}<b`)).toBe(long);
  });

  it('decodes numeric entities to valid code points only', () => {
    const e = ['0', 'x41', 'xD7FF', 'xD800', 'xDFFF', 'xE000', 'x10FFFF', 'x110000'].map((n) => `&#${n};`).join('|');
    expect(htmlToText(e)).toBe(' |A|퟿| | ||\u{10ffff}| ');
  });
});
