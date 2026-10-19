// @vitest-environment happy-dom
// The Studio's Remix tab (4.1.15, §11.9): the model reads the IR with the engine's compiler (the same world as the
// player), previews, locks and rerolls, compares, counts coverage, lists anchors, exports a frozen world; the view
// shows them, refuses a typo, draws a puzzle order and links the world to the player.
import { describe, expect, it } from 'vitest';
import { compileGame } from '@engine/core/define';
import { compileIR } from '@engine/core/ir';
import { compileVariant } from '@engine/core/remix/compile';
import { compileGameManifest } from '@engine/core/remix/apply';
import { encodeSeedCode } from '@engine/core/remix/seed-code';
import { exportWorld, isWorld, RemixModel, readSeed } from '../../src/studio/remix-model';
import { RemixTab } from '../../src/studio/remix-tab';
import { game as reference } from '../../games/reference/game';
import { game as demo } from '../../games/demo/game';

const irOf = (g: typeof reference) => compileIR(compileGame(g), { extensions: { trusted: '' } });
const model = new RemixModel(irOf(reference));

describe('the Remix model', () => {
  it('the same world as the player for a seed', () => {
    const s = encodeSeedCode(1234);
    expect(model.preview(s).hash).toBe(compileVariant(compileGameManifest(reference), reference.remix!, s).hash);
    expect(model.dimensions().map((d) => [d.id, d.logical])).toEqual([
      ['seller-start', true],
      ['seller-route', true],
      ['festival-order', true],
      ['festival-password', true],
      ['night-line', false],
    ]);
  });
  it('locks some dimensions and rerolls the others; compares two worlds', () => {
    const a = model.preview(encodeSeedCode(1));
    const b = model.reroll({ 'festival-password': a.assignments['festival-password'] }, 'remix', 99)!;
    expect(b.assignments['festival-password']).toBe(a.assignments['festival-password']);
    expect(b.hash).not.toBe(a.hash);
    const diff = model.compare(a, b);
    expect(diff.find((x) => x.id === 'festival-password')!.differs).toBe(false);
    expect(diff.some((x) => x.differs)).toBe(true);
  });
  it('coverage over seeds: every value drawn, none dominant', () => {
    const cov = model.coverage('remix', 600);
    expect(cov.every((r) => r.never.length === 0 && r.dominant.length === 0)).toBe(true);
  });
  it('anchors, orders, a frozen world and a typo', () => {
    expect(new RemixModel(irOf(demo)).anchors()).toEqual([
      { room: 'market', anchor: 'stall', at: 'stall', phase: 'deposit', usedBy: ['key-spot'] },
      { room: 'market', anchor: 'oranges', at: 'oranges', phase: 'deposit', usedBy: ['key-spot'] },
      { room: 'market', anchor: 'lantern', at: 'lantern', phase: 'deposit', usedBy: ['key-spot'] },
    ]);
    const v = model.preview(encodeSeedCode(5));
    expect(model.order('festival-order', v)!.groups).toHaveLength(2);
    const { name, json } = exportWorld('reference', v);
    expect(name).toMatch(/^reference-world-WS-.*\.json$/);
    expect(isWorld(JSON.parse(json), model.compiled!.hash)).toBe(true);
    expect(isWorld({ ...JSON.parse(json), seed: 'x' }, model.compiled!.hash)).toBe(false);
    expect(readSeed('WS-0000-0001')).toMatchObject({ error: expect.stringMatching(/check symbol/) });
  });
});

describe('the Remix tab', () => {
  const mount = async (g = reference, selection = () => ({ room: 'market' })) => {
    const tab = new RemixTab({ selection, ir: async () => irOf(g) });
    document.body.replaceChildren(tab.el);
    await tab.load();
    return tab;
  };
  const button = (label: string) =>
    [...document.querySelectorAll('button')].find((b) => b.textContent === label)! as HTMLButtonElement;

  it('lists the dimensions; previews a seed with a link to play it; refuses a typo', async () => {
    await mount();
    expect(document.querySelectorAll('table.dims tr')).toHaveLength(6);
    const seed = document.querySelector<HTMLInputElement>('input[name="seed"]')!;
    seed.value = 'WS-0000-0001';
    button('Preview').click();
    expect(document.querySelector('[role="alert"]')!.textContent).toMatch(/check symbol/);
    seed.value = 'WS-0000-0000';
    button('Preview').click();
    expect(document.querySelector('.remix-world')!.textContent).toContain('seed WS-0000-0000');
    const play = [...document.querySelectorAll('a')].find((a) => a.textContent?.startsWith('Play this seed'))!;
    expect(play.getAttribute('href')).toContain('?seed=WS-0000-0000');
    expect(document.querySelector('svg[role="img"]')!.getAttribute('aria-label')).toMatch(/^Order: /);
  });
  it('locks a dimension and rerolls the others; compares with another seed', async () => {
    await mount();
    button('New seed').click();
    const before = document.querySelector('.remix-world p')!.textContent;
    document.querySelector<HTMLInputElement>('input[aria-label="Lock festival-password"]')!.click();
    const value = () =>
      [...document.querySelectorAll('.remix-world tr')].find((tr) => tr.textContent?.includes('festival-password'))!
        .lastElementChild!.textContent;
    const kept = value();
    button('Reroll the others').click();
    expect(document.querySelector('.remix-world p')!.textContent).not.toBe(before);
    expect(value()).toBe(kept);
    document.querySelector<HTMLInputElement>('input[name="other"]')!.value = encodeSeedCode(77);
    button('Compare').click();
    expect(document.querySelector('.remix-compare table')).not.toBeNull();
  });
  it('counts coverage; a game without a manifest says so', async () => {
    await mount();
    document.querySelector<HTMLInputElement>('input[name="count"]')!.value = '100';
    button('Draw').click();
    expect(document.querySelector('.remix-coverage table')!.textContent).toContain('festival-password');
    const plain = structuredClone(demo);
    delete plain.remix;
    await mount(plain);
    expect(document.body.textContent).toContain('declares no `remix` manifest');
  });
});
