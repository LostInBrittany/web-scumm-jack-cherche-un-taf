// A minimal S3 client for the hosted blobs (4.2.1, plan §4): Cellar on Clever Cloud, MinIO in CI. Path-style
// requests signed with AWS Signature Version 4 (node:crypto only, no SDK): PUT, GET, HEAD and DELETE of one object, and
// presigned GET/PUT URLs for the processing worker (plan §3.8). Spike S measured Cellar: a presigned URL is reusable
// until it expires and gives nothing else; a PUT overwrites. The blob store never relies on If-None-Match: a key is
// the sha256 of its content, so writing it twice writes the same bytes.
import { createHash, createHmac } from 'node:crypto';
import { sha256 } from '../ops/durable';
import type { BlobStore } from '../ops/blobs';

export interface S3Options {
  /** `https://cellar-c2.services.clever-cloud.com` or `http://127.0.0.1:9000` (MinIO). */
  endpoint: string;
  bucket: string;
  keyId: string;
  secret: string;
  region?: string;
  /** A key prefix (`blobs/`). */
  prefix?: string;
}

const hmac = (key: Buffer | string, s: string) => createHmac('sha256', key).update(s).digest();
const hex = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const enc = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encPath = (p: string) => p.split('/').map(enc).join('/');

function stamp(d = new Date()) {
  const iso = d.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amz: iso, day: iso.slice(0, 8) };
}

export class S3 {
  private url: URL;
  private region: string;
  constructor(private o: S3Options) {
    this.url = new URL(o.endpoint);
    this.region = o.region ?? 'us-east-1';
  }

  private key(k: string) {
    return `${this.o.prefix ?? ''}${k}`;
  }

  private signingKey(day: string) {
    const k1 = hmac(`AWS4${this.o.secret}`, day);
    const k2 = hmac(k1, this.region);
    const k3 = hmac(k2, 's3');
    return hmac(k3, 'aws4_request');
  }

  /** Signs a request (header form) and sends it; `key` null is the bucket itself (a listing, with its `query`). */
  private async request(
    method: string,
    key: string | null,
    body?: Buffer,
    extra: Record<string, string> = {},
    query: Record<string, string> = {},
  ): Promise<Response> {
    const path = key === null ? `/${this.o.bucket}` : `/${this.o.bucket}/${encPath(this.key(key))}`;
    const qs = Object.keys(query)
      .sort()
      .map((k) => `${enc(k)}=${enc(query[k]!)}`)
      .join('&');
    const { amz, day } = stamp();
    const payload = body ? hex(body) : hex('');
    const headers: Record<string, string> = {
      host: this.url.host,
      'x-amz-content-sha256': payload,
      'x-amz-date': amz,
      ...extra,
    };
    const names = Object.keys(headers)
      .map((h) => h.toLowerCase())
      .sort();
    const canonical = [
      method,
      path,
      qs,
      ...names.map((n) => `${n}:${String(headers[n]).trim()}`),
      '',
      names.join(';'),
      payload,
    ].join('\n');
    const scope = `${day}/${this.region}/s3/aws4_request`;
    const toSign = ['AWS4-HMAC-SHA256', amz, scope, hex(canonical)].join('\n');
    const sig = hmac(this.signingKey(day), toSign).toString('hex');
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${this.o.keyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${sig}`;
    const { host: _h, ...send } = headers;
    // Bounded: a request that hangs must not hold the journal's lease (renewed while an operation runs) forever.
    return fetch(new URL(qs ? `${path}?${qs}` : path, this.url), {
      method,
      headers: send,
      body: body ? new Uint8Array(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
  }

  async put(key: string, body: Buffer): Promise<void> {
    const r = await this.request('PUT', key, body);
    if (!r.ok) throw new Error(`S3 PUT ${key}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  }

  /** An object, or undefined; past `max` bytes the read stops and throws (an object someone else could write). */
  async get(key: string, o: { max?: number } = {}): Promise<Buffer | undefined> {
    const r = await this.request('GET', key);
    if (r.status === 404) return undefined;
    if (!r.ok) {
      await r.body?.cancel();
      throw new Error(`S3 GET ${key}: ${r.status}`);
    }
    if (o.max === undefined) return Buffer.from(await r.arrayBuffer());
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const c of r.body as unknown as AsyncIterable<Uint8Array>) {
      size += c.length;
      if (size > o.max) {
        await r.body?.cancel().catch(() => {});
        throw new Error(`S3 GET ${key}: larger than ${o.max} bytes`);
      }
      chunks.push(c);
    }
    return Buffer.concat(chunks);
  }

  async has(key: string): Promise<boolean> {
    const r = await this.request('HEAD', key);
    if (r.status === 404) return false;
    if (!r.ok) throw new Error(`S3 HEAD ${key}: ${r.status}`);
    return true;
  }

  /**
   * The objects under `prefix` (4.2.2: the journal's shipped segments, the blobs to collect), with their size and when
   * they were last written, page by page (ListObjectsV2).
   */
  async *list(prefix: string): AsyncGenerator<{ key: string; size: number; at: number }> {
    let token: string | undefined;
    do {
      const r = await this.request(
        'GET',
        null,
        undefined,
        {},
        {
          'list-type': '2',
          prefix: this.key(prefix),
          ...(token ? { 'continuation-token': token } : {}),
        },
      );
      const xml = await r.text();
      if (!r.ok) throw new Error(`S3 LIST ${prefix}: ${r.status} ${xml.slice(0, 200)}`);
      const own = (this.o.prefix ?? '').length;
      for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const field = (n: string) => new RegExp(`<${n}>([^<]*)</${n}>`).exec(m[1]!)?.[1] ?? '';
        const key = unxml(field('Key'));
        yield { key: key.slice(own), size: Number(field('Size')), at: Date.parse(field('LastModified')) };
      }
      token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
        ? unxml(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml)?.[1] ?? '') || undefined
        : undefined;
    } while (token);
  }

  /** Deletes one object; deleting a missing object is not an error (S3 answers 204 either way). */
  async delete(key: string): Promise<void> {
    const r = await this.request('DELETE', key);
    await r.body?.cancel();
    if (!r.ok && r.status !== 404) throw new Error(`S3 DELETE ${key}: ${r.status}`);
  }

  /** A presigned URL (query form) for one method on one key, valid `seconds` (plan §3.8: ≤ 300 for a job). */
  presign(method: 'GET' | 'PUT', key: string, seconds: number): string {
    const path = `/${this.o.bucket}/${encPath(this.key(key))}`;
    const { amz, day } = stamp();
    const scope = `${day}/${this.region}/s3/aws4_request`;
    const q: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${this.o.keyId}/${scope}`,
      'X-Amz-Date': amz,
      'X-Amz-Expires': String(seconds),
      'X-Amz-SignedHeaders': 'host',
    };
    const query = Object.keys(q)
      .sort()
      .map((k) => `${enc(k)}=${enc(q[k]!)}`)
      .join('&');
    const canonical = [method, path, query, `host:${this.url.host}`, '', 'host', 'UNSIGNED-PAYLOAD'].join('\n');
    const toSign = ['AWS4-HMAC-SHA256', amz, scope, hex(canonical)].join('\n');
    const sig = hmac(this.signingKey(day), toSign).toString('hex');
    return `${new URL(path, this.url).toString()}?${query}&X-Amz-Signature=${sig}`;
  }
}

/** XML text decoded: the five entities and numeric references, each once (`&amp;lt;` is `&lt;`). */
const unxml = (s: string) =>
  s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, e: string) =>
    e[0] === '#'
      ? String.fromCodePoint(e[1] === 'x' ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1)))
      : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[e]!,
  );

/** Blobs in S3 under `sha256/<hex>`, read back and checked against their hash. */
export function s3BlobStore(s3: S3): BlobStore {
  const key = (h: string) => {
    if (!/^[0-9a-f]{64}$/.test(h)) throw new Error(`not a blob hash: "${h}"`);
    return `sha256/${h}`;
  };
  return {
    async put(bytes) {
      const h = sha256(bytes);
      // Written even when it is there: its date is the last time it was stored (the collection's grace period).
      await s3.put(key(h), bytes);
      return h;
    },
    async get(h) {
      const b = await s3.get(key(h));
      if (!b) throw new Error(`blob ${h} is missing`);
      if (sha256(b) !== h) throw new Error(`blob ${h} is damaged`);
      return b;
    },
    has: (h) => s3.has(key(h)),
    async *list() {
      for await (const o of s3.list('sha256/')) {
        const h = o.key.slice('sha256/'.length);
        if (/^[0-9a-f]{64}$/.test(h)) yield { hash: h, at: o.at };
      }
    },
    remove: (h) => s3.delete(key(h)),
  };
}
