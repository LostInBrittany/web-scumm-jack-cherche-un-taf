// The hosted blob store's writes (4.4.0, s3BlobStore in studio-server/src/server/s3.ts): a blob this store wrote less
// than an hour ago is not written again (its date already within the collection's grace period, its key its content's
// hash); any other is written, even when it is there, so that its date is the last time it was stored. A failed write
// is not remembered, nor a removed blob; the memory is bounded.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FRESH_MAX, FRESH_MS, s3BlobStore } from '../studio-server/src/server/s3';

function bucket() {
  const objects = new Map<string, Buffer>();
  const puts: string[] = [];
  let failing = false;
  const s3 = {
    put: async (k: string, b: Buffer) => {
      if (failing) throw new Error('S3 PUT: 503');
      puts.push(k);
      objects.set(k, b);
    },
    get: async (k: string) => objects.get(k),
    has: async (k: string) => objects.has(k),
    delete: async (k: string) => void objects.delete(k),
    list: async function* () {},
  };
  return { s3, objects, puts, fail: (v: boolean) => (failing = v) };
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

describe('the hosted blob store', () => {
  it('writes a blob it wrote itself again only an hour later', async () => {
    expect(FRESH_MS).toBe(3_600_000);
    let t = 0;
    const b = bucket();
    const store = s3BlobStore(b.s3, { now: () => t });
    expect(await store.put(Buffer.from('a'))).toBe(sha('a'));
    t = FRESH_MS - 1;
    expect(await store.put(Buffer.from('a'))).toBe(sha('a'));
    expect(b.puts).toEqual([`sha256/${sha('a')}`]);
    t = FRESH_MS;
    await store.put(Buffer.from('a'));
    expect(b.puts).toHaveLength(2);
    // The hour counts from the last write.
    t = FRESH_MS + FRESH_MS - 1;
    await store.put(Buffer.from('a'));
    expect(b.puts).toHaveLength(2);
    // Other bytes, another blob: written.
    await store.put(Buffer.from('b'));
    expect(b.puts).toEqual([`sha256/${sha('a')}`, `sha256/${sha('a')}`, `sha256/${sha('b')}`]);
    expect((await store.get(sha('b'))).toString()).toBe('b');
  });

  it('writes a blob another store (another instance) wrote, and one written by default store options', async () => {
    const b = bucket();
    await s3BlobStore(b.s3).put(Buffer.from('a'));
    const store = s3BlobStore(b.s3);
    await store.put(Buffer.from('a'));
    await store.put(Buffer.from('a'));
    expect(b.puts).toHaveLength(2);
  });

  it('remembers no failed write, and forgets a removed blob', async () => {
    const b = bucket();
    const store = s3BlobStore(b.s3, { now: () => 0 });
    b.fail(true);
    await expect(store.put(Buffer.from('a'))).rejects.toThrow(/503/);
    b.fail(false);
    await store.put(Buffer.from('a'));
    expect(b.puts).toHaveLength(1);
    await store.remove!(sha('a'));
    expect(b.objects.size).toBe(0);
    await store.put(Buffer.from('a'));
    expect(b.puts).toHaveLength(2);
    expect(b.objects.size).toBe(1);
  });

  it(`remembers ${FRESH_MAX} blobs at most, the oldest written forgotten first`, async () => {
    expect(FRESH_MAX).toBe(10_000);
    const b = bucket();
    const store = s3BlobStore(b.s3, { now: () => 0, max: 2 });
    for (const s of ['a', 'b', 'c']) await store.put(Buffer.from(s));
    await store.put(Buffer.from('c'));
    await store.put(Buffer.from('b'));
    expect(b.puts).toHaveLength(3);
    // 'a' was forgotten (the oldest): written again, and 'b' (now the oldest) forgotten in its turn.
    await store.put(Buffer.from('a'));
    expect(b.puts).toHaveLength(4);
    await store.put(Buffer.from('c'));
    expect(b.puts).toHaveLength(4);
    await store.put(Buffer.from('b'));
    expect(b.puts).toHaveLength(5);
  });

  it('counts a write again as the newest: a blob written again is the last forgotten', async () => {
    let t = 0;
    const b = bucket();
    const store = s3BlobStore(b.s3, { now: () => t, max: 2 });
    await store.put(Buffer.from('a'));
    await store.put(Buffer.from('b'));
    t = FRESH_MS;
    await store.put(Buffer.from('a'));
    t = FRESH_MS + 1;
    // 'c' pushes out the oldest: 'b', not 'a' written again.
    await store.put(Buffer.from('c'));
    const before = b.puts.length;
    await store.put(Buffer.from('a'));
    expect(b.puts.length).toBe(before);
    await store.put(Buffer.from('b'));
    expect(b.puts.length).toBe(before + 1);
  });
});
