// @vitest-environment happy-dom
// The Git panel of a hosted Studio's Play tab (4.2.3 PR 6, H5): the remote, the branch, the last push; an owner's push
// and import, their outcome said; hidden where the Studio has no repository; a reviewer reads, never pushes.
import { afterEach, describe, expect, it, vi } from 'vitest';

const answers = new Map<string, { status: number; body: unknown }>();
const sent: string[] = [];
vi.mock('../../src/studio/api-base', () => ({
  studioFetch: async (path: string, init: RequestInit = {}) => {
    sent.push(`${init.method ?? 'GET'} ${path}`);
    const a = answers.get(`${init.method ?? 'GET'} ${path}`) ?? { status: 404, body: { error: 'not found' } };
    return new Response(JSON.stringify(a.body), { status: a.status });
  },
}));
const { gitPanel } = await import('../../src/studio/git-panel');
const flush = () => new Promise((r) => setTimeout(r, 0));
afterEach(() => {
  answers.clear();
  sent.length = 0;
  document.body.replaceChildren();
});
const STATE = {
  remote: 'git@example:org/game.git',
  branch: 'main',
  path: 'games/tpl',
  pushed: 4,
  commit: 'abcdef0123456789',
};

describe('the Git panel', () => {
  it('says where the game goes and how far; an owner pushes and imports, each outcome said', async () => {
    answers.set('GET git', { status: 200, body: STATE });
    const el = gitPanel({ owner: true });
    document.body.append(el);
    await flush();
    expect(el.textContent).toContain('git@example:org/game.git · main · games/tpl/ · revision 4 pushed (abcdef012345)');
    answers.set('POST git/push', {
      status: 200,
      body: { pushed: true, commit: '0123456789abcdef', revisions: [5, 7] },
    });
    [...el.querySelectorAll('button')].find((b) => b.textContent === 'Push to Git')!.click();
    await flush();
    await flush();
    expect(document.body.textContent).toContain('Pushed revisions 5–7 (0123456789ab)');
    answers.set('POST git/push', { status: 409, body: { error: 'main moved since the Studio’s last push' } });
    [...el.querySelectorAll('button')].find((b) => b.textContent === 'Push to Git')!.click();
    await flush();
    await flush();
    expect(document.body.textContent).toContain('main moved since');
    answers.set('POST git/import', { status: 200, body: { commit: 'feedfacecafebeef', changed: 3 } });
    const imp = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Import from Git')!;
    // The first click asks: an import replaces what was not pushed.
    imp.click();
    expect(imp.textContent).toMatch(/Click again/);
    expect(sent).not.toContain('POST git/import');
    imp.click();
    await flush();
    await flush();
    expect(document.body.textContent).toContain('Imported feedfacecafe: 3 files');
    expect(sent).toContain('POST git/import');
  });

  it('reads only for a reviewer, and hides itself where there is no repository', async () => {
    answers.set('GET git', { status: 200, body: { ...STATE, pushed: null, commit: null } });
    const el = gitPanel({ owner: false });
    await flush();
    expect(el.querySelectorAll('button')).toHaveLength(0);
    expect(el.textContent).toContain('nothing pushed yet');
    answers.clear();
    const none = gitPanel({ owner: true });
    await flush();
    expect(none.hidden).toBe(true);
  });
});
