// @vitest-environment happy-dom
// The Assets tab's IO (4.1.8, src/studio/assets-io.ts): the uploads' POST to the dev server's assets middleware (its
// URL, headers and JSON body; a refusal carried with its status and body), a picked file read as a data URL, the file
// picker's hidden input, the clipboard copy and its toast.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetsApiError, copy, pickFile, post, readFile } from '../../src/studio/assets-io';

const response = (ok: boolean, status: number, body: unknown) =>
  ({ ok, status, statusText: ok ? 'OK' : 'Conflict', json: async () => body }) as unknown as Response;

/** Empties the page but keeps the toast stack `toast()` caches (emptied), so later toasts stay visible. */
const clean = () => {
  for (const el of [...document.body.children]) if (!el.classList.contains('toasts')) el.remove();
  document.querySelector('.toasts')?.replaceChildren();
};

afterEach(() => {
  vi.unstubAllGlobals();
  clean();
});

describe('post', () => {
  it('POSTs JSON to /__studio/api/assets/<path> and returns the parsed body', async () => {
    const fetch = vi.fn(async () => response(true, 200, { ok: true, file: 'art/hero/r1c1.png' }));
    vi.stubGlobal('fetch', fetch);
    const r = await post<{ ok: true; file: string }>('cell', {
      sheetId: 'hero',
      cell: 'r1c1',
      data: 'data:x',
      key: 'auto',
    });
    expect(r.file).toBe('art/hero/r1c1.png');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/__studio/api/assets/cell');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    // The Studio's own header: a hosted Studio refuses a write without it (plan §3.4, policy A).
    expect(new Headers(init.headers).get('x-studio-request')).toBe('1');
    expect(JSON.parse(String(init.body))).toEqual({ sheetId: 'hero', cell: 'r1c1', data: 'data:x', key: 'auto' });
  });

  it('a refusal becomes an AssetsApiError with the status and the whole body (a 409 lists the conflicts)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(false, 409, { error: 'cells exist', conflicts: ['r1c1', 'r1c2'] })),
    );
    const e = await post('sheet', { sheetId: 'hero', data: 'x' }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(AssetsApiError);
    expect(e).toMatchObject({ message: 'cells exist', status: 409, body: { conflicts: ['r1c1', 'r1c2'] } });
  });

  it('a body that is not JSON falls back to the status line as the message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, statusText: 'Boom', json: async () => JSON.parse('{') })),
    );
    await expect(post('sound', {})).rejects.toMatchObject({ message: '500 Boom', status: 500 });
  });
});

describe('files', () => {
  it('reads a picked file as a data URL', async () => {
    const data = await readFile(new File(['abc'], 'a.png', { type: 'image/png' }));
    expect(data).toBe('data:image/png;base64,YWJj');
  });

  it('pickFile opens a hidden file input with the accept list, resolves with the chosen file and removes the input', async () => {
    const p = pickFile('image/png,image/jpeg');
    const input = document.body.querySelector<HTMLInputElement>('input[type=file]');
    expect(input).not.toBeNull();
    expect(input?.getAttribute('accept')).toBe('image/png,image/jpeg');
    expect(input?.hidden).toBe(true);
    const f = new File(['x'], 'pick.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [f] });
    input?.dispatchEvent(new Event('change'));
    expect(await p).toBe(f);
    expect(document.body.querySelector('input[type=file]')).toBeNull();
  });
});

describe('copy', () => {
  it('writes to the clipboard and says what was copied in a toast', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await copy('A hero, 6 x 4', 'Prompt');
    expect(writeText).toHaveBeenCalledWith('A hero, 6 x 4');
    expect(document.querySelector('.toasts .toast.ok')?.textContent).toBe('Prompt copied');
  });
});
