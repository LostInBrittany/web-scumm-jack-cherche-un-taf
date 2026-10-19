// @vitest-environment happy-dom
// The Rooms tab's bridge with the engine's editor iframe (src/studio/rooms-bridge.ts, 4.1.8): what it posts, what it
// does with the editor's messages, how a text edit waits for the placement to be saved, how a scroll to a content
// path retries. The iframe is a fake window; the backend a fake Api.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Layout } from '@engine/core/types';
import { type Api, type EditorToStudio, serverApi, useApi } from '../../src/studio/api';
import { type BridgeHost, EditorBridge, focusPath } from '../../src/studio/rooms-bridge';
import type { Sel } from '../../src/studio/rooms-text';

const setLayout = vi.fn(async (_id: string, _layout: Layout) => ({ ok: true as const }));
const fakeApi = (mode: Api['mode']): Api => ({ ...serverApi, mode, setLayout });

function setup(sel: Sel = null) {
  const host: BridgeHost & { sel: Sel } = {
    sel,
    room: () => 'kitchen',
    checkpoint: () => '',
    selection() {
      return this.sel;
    },
    select: vi.fn(),
    layoutStored: vi.fn(),
    ownWrite: vi.fn(),
    saved: vi.fn(),
  };
  const bridge = new EditorBridge(host);
  const win = { postMessage: vi.fn() };
  Object.defineProperty(bridge.frame, 'contentWindow', { value: win });
  const receive = (m: EditorToStudio, from: unknown = win, origin = location.origin) =>
    window.dispatchEvent(new MessageEvent('message', { data: m, origin, source: from as MessageEventSource }));
  return { host, bridge, win, receive };
}

const toasts = () => [...document.querySelectorAll('.toast')].map((t) => t.textContent);

/** Between tests: the body emptied, but the toasts' stack kept (src/studio/ui.ts holds it in a module variable). */
const reset = () => {
  for (const c of [...document.body.children]) c.classList.contains('toasts') ? c.replaceChildren() : c.remove();
};

describe('EditorBridge', () => {
  beforeEach(() => {
    useApi(fakeApi('server'));
    setLayout.mockClear();
  });
  afterEach(() => {
    reset();
    vi.useRealTimers();
  });

  it('opens the view on the room, with the checkpoint when one is chosen, and says it is loading on a reload', () => {
    const { host, bridge } = setup();
    expect(bridge.frame.getAttribute('src')).toBe('/?edit=kitchen');
    host.checkpoint = () => 'cp2';
    bridge.reload();
    expect(bridge.frame.getAttribute('src')).toBe('/?edit=kitchen&at=cp2');
    expect(bridge.status.textContent).toBe('loading…');
  });

  it('posts to the iframe with the page origin', () => {
    const { bridge, win } = setup();
    bridge.post({ source: 'web-scumm-studio', type: 'save' });
    expect(win.postMessage).toHaveBeenCalledWith({ source: 'web-scumm-studio', type: 'save' }, location.origin);
  });

  it('on ready: lists the entities without a place, then selects the current entity, or creates it if it has no place', () => {
    const { bridge, win, receive } = setup({ kind: 'prop', id: 'vase' });
    receive({ source: 'web-scumm-editor', type: 'ready', room: 'kitchen', missing: [] });
    expect(bridge.status.textContent).toBe('');
    expect(win.postMessage).toHaveBeenLastCalledWith(
      { source: 'web-scumm-studio', type: 'select', kind: 'prop', id: 'vase' },
      location.origin,
    );
    expect(bridge.lastReady).toBeGreaterThan(0);
    bridge.selectWhenReady({ kind: 'actor', id: 'cat' });
    receive({
      source: 'web-scumm-editor',
      type: 'ready',
      room: 'kitchen',
      missing: [
        { kind: 'actor', id: 'cat' },
        { kind: 'prop', id: 'dust' },
      ],
    });
    expect(bridge.status.textContent).toBe('2 without a place: cat, dust');
    expect(win.postMessage).toHaveBeenLastCalledWith(
      { source: 'web-scumm-studio', type: 'create', kind: 'actor', id: 'cat' },
      location.origin,
    );
  });

  it("passes the view's selection to the tab only when it differs, and ignores messages from elsewhere", () => {
    const { host, bridge, receive } = setup({ kind: 'prop', id: 'vase' });
    receive({
      source: 'web-scumm-editor',
      type: 'select',
      room: 'kitchen',
      key: 'prop:vase',
      kind: 'prop',
      id: 'vase',
    });
    expect(host.select).not.toHaveBeenCalled();
    receive({
      source: 'web-scumm-editor',
      type: 'select',
      room: 'kitchen',
      key: 'actor:cat',
      kind: 'actor',
      id: 'cat',
    });
    expect(host.select).toHaveBeenCalledWith({ kind: 'actor', id: 'cat' });
    receive({ source: 'web-scumm-editor', type: 'dirty', room: 'kitchen', dirty: true }, { other: true });
    receive(
      { source: 'web-scumm-editor', type: 'dirty', room: 'kitchen', dirty: true },
      undefined,
      'https://evil.test',
    );
    expect(host.select).toHaveBeenCalledTimes(1);
    expect(bridge.status.textContent).toBe(''); // neither foreign message reached the handler
  });

  it('flush saves a dirty placement and waits for the view to confirm; a clean one returns at once', async () => {
    const { host, bridge, win, receive } = setup();
    await bridge.flush();
    expect(win.postMessage).not.toHaveBeenCalled();
    receive({ source: 'web-scumm-editor', type: 'dirty', room: 'kitchen', dirty: true });
    expect(bridge.status.textContent).toBe('placement not saved');
    let done = false;
    const p = bridge.flush().then(() => {
      done = true;
    });
    // A save request carries a nonce (a hosted view answers with it; here the view writes itself).
    expect(win.postMessage).toHaveBeenCalledWith(
      { source: 'web-scumm-studio', type: 'save', nonce: expect.any(String) },
      location.origin,
    );
    await Promise.resolve();
    expect(done).toBe(false);
    receive({ source: 'web-scumm-editor', type: 'saved', room: 'kitchen', ok: true });
    await p;
    expect(done).toBe(true);
    expect(bridge.status.textContent).toBe('');
    expect(host.ownWrite).toHaveBeenCalledTimes(1);
    expect(host.saved).toHaveBeenCalledTimes(1);
    expect(toasts()).toEqual(['Layout saved']);
    expect(setLayout).not.toHaveBeenCalled();
  });

  it('stores the layout through the backend when the view could not write it, and keeps the tab informed', async () => {
    useApi(fakeApi('demo'));
    const { host, bridge, receive } = setup();
    const layout: Layout = { width: 800 };
    receive({ source: 'web-scumm-editor', type: 'saved', room: 'kitchen', ok: true, layout });
    await vi.waitFor(() => expect(host.saved).toHaveBeenCalled());
    expect(setLayout).toHaveBeenCalledWith('kitchen', layout);
    expect(host.layoutStored).toHaveBeenCalledWith('kitchen', layout);
    expect(toasts()).toEqual(['Layout saved in this browser']);
    setLayout.mockRejectedValueOnce(new Error('disk full'));
    receive({ source: 'web-scumm-editor', type: 'saved', room: 'kitchen', ok: true, layout });
    await vi.waitFor(() => expect(bridge.status.textContent).toBe('disk full'));
    expect(host.saved).toHaveBeenCalledTimes(1);
    expect(toasts()).toEqual(['Layout saved in this browser', 'disk full']);
  });

  it('a failed save shows the error, and flush gives up after four seconds', async () => {
    vi.useFakeTimers();
    const { bridge, receive } = setup();
    receive({ source: 'web-scumm-editor', type: 'dirty', room: 'kitchen', dirty: true });
    const p = bridge.flush();
    await vi.advanceTimersByTimeAsync(4000);
    await p;
    receive({ source: 'web-scumm-editor', type: 'saved', room: 'kitchen', ok: false, error: 'read only' });
    await vi.advanceTimersByTimeAsync(0);
    expect(bridge.status.textContent).toBe('read only');
    expect(toasts()).toEqual(['read only']);
  });
});

describe('focusPath', () => {
  afterEach(() => {
    reset();
    vi.useRealTimers();
  });

  it('scrolls to and flashes the editor of a path, or the first one under it, and focuses its field', () => {
    vi.useFakeTimers();
    const field = document.createElement('textarea');
    const row = document.createElement('div');
    row.dataset.path = 'on[3].do[0]';
    row.append(field);
    row.scrollIntoView = vi.fn();
    const root = document.createElement('section');
    root.append(row);
    document.body.append(root);
    focusPath(root, 'on[3]');
    expect(row.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(row.classList.contains('flash')).toBe(true);
    expect(document.activeElement).toBe(field);
    vi.advanceTimersByTime(1200);
    expect(row.classList.contains('flash')).toBe(false);
  });

  it('retries every 150 ms while the room is loading, then gives up', () => {
    vi.useFakeTimers();
    const root = document.createElement('section');
    const spy = vi.spyOn(root, 'querySelector');
    focusPath(root, 'look.piano[0]', 2);
    expect(spy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(150);
    expect(spy).toHaveBeenCalledTimes(2);
    const row = document.createElement('div');
    row.dataset.path = 'look.piano[0]';
    row.scrollIntoView = vi.fn();
    root.append(row);
    vi.advanceTimersByTime(150);
    expect(spy).toHaveBeenCalledTimes(3);
    expect(row.classList.contains('flash')).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(spy).toHaveBeenCalledTimes(3); // found: no more tries
    const empty = document.createElement('section');
    const again = vi.spyOn(empty, 'querySelector');
    focusPath(empty, 'nowhere', 1);
    vi.advanceTimersByTime(1000);
    expect(again).toHaveBeenCalledTimes(2); // the first look and one retry, then it gives up
  });
});
