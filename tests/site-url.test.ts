// site.json's `url` (#271): the game's public address makes the page's share image an absolute URL, which link
// previews (LinkedIn, Facebook, X) need; without it the page is as before.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { sitePlugin } from '../tools/vite/plugins';

mkdirSync('.cache', { recursive: true });
const root = mkdtempSync(join('.cache', 'site-url-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const INDEX = readFileSync('index.html', 'utf8');

const page = (site: Record<string, unknown>) => {
  const dir = mkdtempSync(join(root, 'g-'));
  writeFileSync(join(dir, 'site.json'), JSON.stringify(site));
  const t = sitePlugin({ gameDir: dir, game: 'g' }).transformIndexHtml as { handler: (html: string) => string };
  return t.handler(INDEX);
};
const meta = (html: string, prop: string) => new RegExp(`<meta property="${prop}" content="([^"]*)"`).exec(html)?.[1];

describe("site.json's url", () => {
  it('without it, the share image stays relative to the page, and no og:url is written', () => {
    const html = page({ title: 'T' });
    expect(meta(html, 'og:image')).toMatch(/^\/.*og\.png$|^\.?\/?og\.png$/);
    expect(meta(html, 'og:url')).toBeUndefined();
  });

  it('with it, the share image is absolute and the page says its address', () => {
    const html = page({ title: 'T', url: 'https://example.org/my-game/' });
    expect(meta(html, 'og:image')).toBe('https://example.org/my-game/og.png');
    expect(meta(html, 'og:url')).toBe('https://example.org/my-game/');
    expect(html.match(/og:url/g)).toHaveLength(1);
  });

  it('adds the final slash, and escapes what it writes', () => {
    const html = page({ url: 'https://example.org/a"b' });
    // The URL parser percent-encodes the quote; the escaping is the second guard.
    expect(meta(html, 'og:image')).toBe('https://example.org/a%22b/og.png');
    expect(meta(page({ url: 'https://example.org' }), 'og:image')).toBe('https://example.org/og.png');
    expect(meta(page({ url: '  https://example.org/g/  ' }), 'og:url')).toBe('https://example.org/g/');
  });

  it('writes a $ in site.json as text, not as a replacement pattern', () => {
    const html = page({ title: "A $& B $' C", url: "https://example.org/$&/$'/" });
    expect(meta(html, 'og:title')).toBe("A $&amp; B $' C");
    expect(meta(html, 'og:url')).toBe("https://example.org/$&amp;/$'/");
  });

  it('ignores an address with a query, a fragment or credentials', () => {
    for (const url of ['https://example.org/?a=b', 'https://example.org/#x', 'https://u:p@example.org/']) {
      const html = page({ url });
      expect(meta(html, 'og:url'), url).toBeUndefined();
      expect(meta(html, 'og:image'), url).not.toContain('example.org');
    }
  });

  it('ignores an address that is not http(s), absolute: the page stays as without it', () => {
    for (const url of ['/my-game/', 'example.org', 'javascript:alert(1)', 'ftp://example.org/', 3]) {
      const html = page({ url });
      expect(meta(html, 'og:url'), String(url)).toBeUndefined();
      expect(meta(html, 'og:image'), String(url)).not.toContain('example.org');
    }
  });
});
