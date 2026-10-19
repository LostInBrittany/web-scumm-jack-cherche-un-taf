// @vitest-environment happy-dom
// The Check tab's changes between revisions (4.2.3 PR 4, H3): asked by two revisions, said file by file by what the game
// names, "file changed" when nothing more can be said, a refusal said.
import { afterEach, describe, expect, it, vi } from 'vitest';

let answer: { status: number; body: unknown } = { status: 200, body: { files: [] } };
const asked: string[] = [];
vi.mock('../../src/studio/api-base', () => ({
  studioFetch: async (path: string) => {
    asked.push(path);
    return new Response(JSON.stringify(answer.body), { status: answer.status });
  },
}));
const { diffPanel } = await import('../../src/studio/diff-panel');
const flush = () => new Promise((r) => setTimeout(r, 0));
afterEach(() => document.body.replaceChildren());

describe('the changes between revisions', () => {
  it('asks the two revisions and says each file by what the game names', async () => {
    const el = diffPanel();
    document.body.append(el);
    const [from, to] = el.querySelectorAll('input');
    from!.value = '3';
    to!.value = '7';
    answer = {
      status: 200,
      body: {
        files: [
          {
            path: 'rooms/hall.ts',
            change: 'changed',
            ids: {
              added: ['hall.r9'],
              removed: [],
              changed: [
                { id: 'hall.r1', fields: ['do', 'if'] },
                { id: 'hall.r2', fields: [] },
              ],
            },
          },
          {
            path: 'layout/hall.json',
            change: 'changed',
            values: { added: [], removed: ['walk[3]'], changed: ['props.lamp.x'] },
            cut: true,
          },
          { path: 'art/x.png', change: 'added', opaque: true },
        ],
      },
    };
    el.querySelector('button')!.click();
    await flush();
    await flush();
    expect(asked).toEqual(['diff/3..7']);
    const text = el.querySelector('.diff-out')!.textContent!;
    expect(text).toContain('rooms/hall.ts · changed');
    expect(text).toContain('added: hall.r9');
    expect(text).toContain('hall.r1 changed: do, if');
    expect(text).toContain('hall.r2 changed: its place');
    expect(text).toContain('removed: walk[3]');
    expect(text).toContain('… and more (cut at 500)');
    expect(text).toContain('art/x.png · added');
    expect(text).toContain('file changed');
  });

  it('says when nothing changed, a list cut, and a refusal', async () => {
    const el = diffPanel();
    const [f, t] = el.querySelectorAll('input');
    f!.value = '1';
    t!.value = '2';
    answer = { status: 200, body: { files: [], cut: true } };
    el.querySelector('button')!.click();
    await flush();
    await flush();
    expect(el.textContent).toContain('Nothing changed between them.');
    expect(el.textContent).toContain('… and more files (cut at 500)');
    // What is not a revision is said before anything is asked.
    const [a] = el.querySelectorAll('input');
    a!.value = 'soon';
    el.querySelector('button')!.click();
    await flush();
    expect(el.querySelector('.error')!.textContent).toBe('two revisions, as numbers');
    a!.value = '1';
    el.querySelectorAll('input')[1]!.value = '9';
    answer = { status: 404, body: { error: 'no revision 9 yet' } };
    el.querySelector('button')!.click();
    await flush();
    await flush();
    expect(el.querySelector('.error')!.textContent).toBe('no revision 9 yet');
  });
});
