// @vitest-environment happy-dom
// The revision an editor read, sent with its writes (4.2.3, H10): by the longest read path, moved on by an editor's own
// reads only (not by a write's answer, nor by a read made for something else), none for a derived file, moved to the
// head when the member asks to apply their edit there; a whole document is said to replace the other change.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sent: { method: string; path: string; base: string | null; client: string | null }[] = [];
const answers = new Map<string, { status?: number; body: unknown; rev?: number }>();

vi.mock('../../src/studio/api-base', () => ({
  hosting: { hosted: true, api: '/api', play: 'https://play.example' },
  apiUrl: (p: string) => `/api/${p}`,
  goLogin: () => undefined,
  studioFetch: async (path: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const hd = new Headers(init.headers);
    sent.push({ method, path, base: hd.get('x-studio-base'), client: hd.get('x-studio-client') });
    const a = answers.get(`${method} ${path}`) ?? { body: { ok: true } };
    return new Response(JSON.stringify(a.body), {
      status: a.status ?? 200,
      headers: a.rev === undefined ? {} : { 'x-studio-revision': String(a.rev) },
    });
  },
}));

const { api, onRefused } = await import('../../src/studio/api');

beforeEach(() => {
  sent.length = 0;
  answers.clear();
});
afterEach(() => onRefused(() => undefined));

const last = () => sent.at(-1)!;

describe('the revision an editor read, with its writes (hosted)', () => {
  it('sends the revision of the read the write belongs to, and only an editor read moves it', async () => {
    answers.set('GET room/hall', { body: { layout: {} }, rev: 4 });
    await api.room('hall');
    answers.set('PUT room/hall/layout', { body: { ok: true }, rev: 9 });
    await api.setLayout('hall', {});
    expect(last()).toMatchObject({ path: 'room/hall/layout', base: '4' });
    // With this tab's own id, the same on every write: its own writes since its read are not a conflict.
    const client = last().client!;
    expect(client).toMatch(/^[\w-]{8,64}$/);
    // The write's answer (revision 9) does not move it: the next write still says what the editor read.
    await api.setLayout('hall', {});
    expect(last()).toMatchObject({ base: '4', client });
    // A read for something else (an overlay) does not move it either; the editor's own read does.
    answers.set('GET room/hall', { body: { layout: {} }, rev: 12 });
    await api.room('hall', { track: false });
    await api.setLayout('hall', {});
    expect(last().base).toBe('4');
    await api.room('hall');
    await api.setLayout('hall', {});
    expect(last().base).toBe('12');
  });

  it('takes the longest read path, sends nothing without a read, and nothing for a derived file', async () => {
    answers.set('GET storyboard', { body: { boards: [] }, rev: 3 });
    await api.storyboardRaw();
    await api.setStoryboard({ boards: [] });
    expect(last()).toMatchObject({ path: 'storyboard', base: '3' });
    await api.storyboardMarkdown();
    expect(last()).toMatchObject({ path: 'storyboard/markdown', base: null });
    await api.addNote({ text: 'hi' });
    expect(last()).toMatchObject({ path: 'notes', base: null });
  });

  it('on a 409, applies the edit from the head when asked, and says when it replaces a whole document', async () => {
    answers.set('GET room/hall', { body: { layout: {} }, rev: 4 });
    await api.room('hall');
    const seen: { whole?: boolean; retry: () => Promise<void> }[] = [];
    onRefused((r) => void seen.push(r));
    answers.set('PUT room/hall/layout', {
      status: 409,
      body: {
        error: 'layout/hall.json changed since revision 4 (now 7)',
        path: 'layout/hall.json',
        readAt: 4,
        head: 7,
      },
    });
    await expect(api.setLayout('hall', {})).rejects.toMatchObject({ status: 409, handled: true });
    expect(seen[0]!.whole).toBe(true);
    answers.set('PUT room/hall/layout', { body: { ok: true }, rev: 8 });
    await seen[0]!.retry();
    expect(last()).toMatchObject({ path: 'room/hall/layout', base: '7' });
    answers.set('PUT room/hall/text', {
      status: 409,
      body: { error: 'rooms/hall.ts changed since revision 7 (now 9)', path: 'rooms/hall.ts', readAt: 7, head: 9 },
    });
    await expect(api.setText('hall', 'look', 'x')).rejects.toMatchObject({ status: 409 });
    expect(seen[1]!.whole).toBe(false);
  });
});
