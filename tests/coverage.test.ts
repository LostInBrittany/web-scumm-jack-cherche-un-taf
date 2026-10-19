// Storyboard coverage: what the story says, found (or not) in the content.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { coverageMarkdown, norm, alike, storyboardCoverage } from '@engine/tools/coverage';
import { normalizeStoryboard } from '../tools/pages/storyboard-data';
import { game } from '../games/demo/game';

const sb = normalizeStoryboard(JSON.parse(readFileSync('games/demo/storyboard.json', 'utf8')));

describe('text matching', () => {
  it('normalises and compares', () => {
    expect(norm('Open (or pull) Grandpa’s armchair!')).toBe("open grandpa's armchair");
    expect(alike('Go through the big window', 'Use the big window')).toBeGreaterThan(0.4);
    expect(alike('Sardines', 'Pixel')).toBe(0);
  });
});

describe("the sample game's storyboard", () => {
  const c = storyboardCoverage(game, sb);
  it('is mostly implemented, with the rooms, speakers, sounds and actions found', () => {
    expect(c.score).toBeGreaterThan(0.9);
    const house = c.boards.find((b) => b.id === 'house')!;
    expect(house.room).toMatchObject({ status: 'ok' });
    expect(house.panels.find((p) => p.id === 'house-1')).toMatchObject({ status: 'ok' });
    expect(house.panels.find((p) => p.id === 'house-1')!.action).toMatchObject({
      status: 'ok',
      path: 'room:house/on[1]',
    });
    expect(house.panels.find((p) => p.id === 'house-3')!.action).toMatchObject({ status: 'ok' }); // a declared exit
    expect(house.reactions.find((r) => r.what.startsWith('Pull'))).toMatchObject({
      status: 'ok',
      path: expect.stringContaining('rules/kinds'),
    });
    const market = c.boards.find((b) => b.id === 'market')!;
    expect(market.panels.find((p) => p.id === 'market-1')!.action).toMatchObject({
      status: 'ok',
      path: expect.stringContaining('talk.neighbor'),
    });
    expect(market.panels.find((p) => p.id === 'market-4')!.lines.every((l) => l.status === 'ok')).toBe(true); // minigame texts
  });
  it('reports what is not there', () => {
    const sb2 = normalizeStoryboard({
      boards: [
        {
          id: 'x',
          title: 'X',
          room: 'attic',
          panels: [
            {
              id: 'x-1',
              title: 'nope',
              action: 'Use ladder with roof',
              lines: [
                { who: 'ghost', text: 'Boo' },
                { who: 'hero', text: 'Nobody ever said this sentence.' },
              ],
              sfx: ['thunder'],
            },
            {
              id: 'x-2',
              title: 'half',
              action: 'Pull the clock',
              lines: [{ who: 'grandma', text: 'Go through the big window. Mind the roses.' }],
            },
          ],
          talks: { grandma: [{ topic: 'Where is the key?' }, { topic: 'Where is the moon?' }] },
        },
      ],
    });
    const r = storyboardCoverage(game, sb2);
    const b = r.boards[0];
    expect(b.room).toMatchObject({ status: 'missing' });
    expect(b.panels[0].status).toBe('missing');
    expect(b.panels[0].lines[0]).toMatchObject({ status: 'missing', detail: 'no character "ghost"' });
    expect(b.panels[0].lines[1].status).toBe('missing');
    expect(b.panels[0].sfx[0]).toMatchObject({ status: 'missing' });
    expect(b.panels[1].lines[0]).toMatchObject({
      status: 'ok',
      path: expect.stringContaining('room:house/talk.grandma'),
    });
    expect(b.talks[0].actor.status).toBe('unknown'); // grandma exists but the board's room does not
    expect(b.talks[0].topics[1].status).toBe('missing');
    const md = coverageMarkdown(r);
    expect(md).toContain('# Storyboard coverage');
    expect(md).toContain('✗ **x-1** nope');
  });
});
