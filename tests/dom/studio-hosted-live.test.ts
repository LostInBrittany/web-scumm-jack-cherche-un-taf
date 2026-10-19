// @vitest-environment happy-dom
// A hosted Studio's live state (src/studio/hosted.ts, 4.2.1 PR 7, plan P5, P7): each committed revision is told once
// and in order; after a cut, what was committed meanwhile is read from the journal (`/api/ops`), page by page; a new
// epoch reloads the page; leases follow their sequence number. The stream is a fake EventSource, the API a fake fetch.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Live, type Revision } from '../../src/studio/hosted';

class FakeSource {
  static CLOSED = 2;
  static last: FakeSource;
  static made = 0;
  readyState = 1;
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  private on = new Map<string, (m: MessageEvent) => void>();
  constructor(readonly url: string) {
    FakeSource.last = this;
    FakeSource.made++;
  }
  addEventListener(name: string, fn: (m: MessageEvent) => void) {
    this.on.set(name, fn);
  }
  emit(name: string, data: unknown) {
    this.on.get(name)?.({ data: JSON.stringify(data) } as MessageEvent);
  }
  close() {}
}

const hello = (revision: number, epoch = 'e1') => ({ epoch, revision, leases: [], seq: 0, here: [] });
const op = (rev: number) => ({ id: `o${rev}`, rev, author: 'tom@example.org', paths: [`f${rev}.ts`] });
const flush = () => new Promise((ok) => setTimeout(ok, 0));

describe('the live state of a hosted Studio', () => {
  let told: Revision[];
  let live: Live;
  let reload: ReturnType<typeof vi.fn>;
  let check: ReturnType<typeof vi.fn<() => Promise<void>>>;
  beforeEach(() => {
    told = [];
    vi.stubGlobal('EventSource', FakeSource);
    reload = vi.fn();
    check = vi.fn<() => Promise<void>>(async () => undefined);
    vi.stubGlobal('location', { ...location, reload });
    live = new Live({ revision: (r) => told.push(r), check });
    live.start('/api/events');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('starts at the revision the stream says, then tells each revision once and in order', async () => {
    FakeSource.last.emit('hello', hello(4));
    await flush();
    expect(live.revision).toBe(4);
    expect(live.up).toBe(true);
    FakeSource.last.emit('revision', op(5));
    FakeSource.last.emit('revision', op(5));
    FakeSource.last.emit('revision', op(4));
    FakeSource.last.emit('revision', op(6));
    expect(told.map((r) => r.rev)).toEqual([5, 6]);
    expect(live.revision).toBe(6);
  });

  it('after a cut, reads what it missed from the journal, page after page, each once', async () => {
    const pages = [
      { ops: [op(3), op(4)], next: 4, revision: 6 },
      { ops: [op(5), op(6)], next: 6, revision: 6 },
    ];
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        asked.push(url);
        return new Response(JSON.stringify(pages.shift()), { status: 200 });
      }),
    );
    FakeSource.last.emit('hello', hello(2));
    await flush();
    FakeSource.last.onerror?.();
    expect(live.up).toBe(false);
    FakeSource.last.emit('hello', hello(6));
    await vi.waitFor(() => expect(live.revision).toBe(6));
    expect(told.map((r) => r.rev)).toEqual([3, 4, 5, 6]);
    expect(asked).toEqual(['/__studio/api/ops?after=2&epoch=e1', '/__studio/api/ops?after=4&epoch=e1']);
    expect(live.up).toBe(true);
  });

  it('a new epoch (the game imported or restored again) reloads the page', async () => {
    FakeSource.last.emit('hello', hello(2, 'e1'));
    await flush();
    FakeSource.last.emit('hello', hello(1, 'e2'));
    await flush();
    expect(reload).toHaveBeenCalled();
  });

  it('keeps the leases of the latest sequence number only', async () => {
    FakeSource.last.emit('hello', hello(1));
    await flush();
    const lease = (span: string) => ({ span, holder: 'u-tom', holderName: 'Tom', fence: 1, until: 0 });
    FakeSource.last.emit('leases', { seq: 2, leases: [lease('room:garden')] });
    FakeSource.last.emit('leases', { seq: 1, leases: [lease('notes')] });
    expect(live.leases.map((l) => l.span)).toEqual(['room:garden']);
  });

  it('a revision that arrives while the journal is read waits, then follows in order: none is lost', async () => {
    let answer: (r: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((ok) => (answer = ok))),
    );
    FakeSource.last.emit('hello', hello(10));
    await flush();
    FakeSource.last.emit('hello', hello(12));
    await flush();
    // Rev 13 is committed and streamed before the journal answers for 11 and 12.
    FakeSource.last.emit('revision', op(13));
    expect(told).toEqual([]);
    answer(new Response(JSON.stringify({ ops: [op(11), op(12)], next: 12, revision: 12 }), { status: 200 }));
    await vi.waitFor(() => expect(told.map((r) => r.rev)).toEqual([11, 12, 13]));
    expect(check).toHaveBeenCalled();
  });

  it('a journal that does not answer is said as a gap, never skipped in silence', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 503 })),
    );
    FakeSource.last.emit('hello', hello(1));
    await vi.advanceTimersByTimeAsync(0);
    FakeSource.last.emit('hello', hello(3));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(live.gap).toBe(true);
    expect(told).toEqual([]);
    vi.useRealTimers();
  });

  it('a stream the server refused (a removed member, a suspended session) checks the session and opens again', async () => {
    vi.useFakeTimers();
    FakeSource.last.emit('hello', hello(1));
    await vi.advanceTimersByTimeAsync(0);
    const before = FakeSource.made;
    FakeSource.last.readyState = FakeSource.CLOSED;
    FakeSource.last.onerror?.();
    expect(check).toHaveBeenCalledTimes(1);
    expect(live.up).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeSource.made).toBe(before + 1);
    vi.useRealTimers();
  });

  it('a project at revision 0 still catches up after a cut', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ops: [op(1)], next: 1, revision: 1 }), { status: 200 })),
    );
    FakeSource.last.emit('hello', hello(0));
    await flush();
    FakeSource.last.emit('hello', hello(1));
    await vi.waitFor(() => expect(told.map((r) => r.rev)).toEqual([1]));
  });
});
