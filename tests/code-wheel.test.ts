// @vitest-environment happy-dom
// The code wheel (4.1.15, §11.13): the same wheel for a seed (the `copy-protection` stream), a single solution per
// wheel, every reading of the printed wheel in its text table; the modes (parody lets the player through, strict never,
// cosmetic accepts anything, disabled skips); the view turns with buttons, the arrow keys and announces each turn,
// lists the wheel as text, draws no animated turn under prefers-reduced-motion, and records what was played.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type CodeWheelParams,
  checkWheel,
  generateWheel,
  judge,
  readWindow,
  rotationFor,
  wheelProblems,
  wheelTable,
} from '@engine/core/remix/code-wheel';
import { codeWheel } from '@engine/minigames/code-wheel';
import type { MinigameCtx } from '@engine/minigames/types';
import { encodeSeedCode } from '@engine/core/remix/seed-code';
import { applyVariant, compileGameManifest } from '@engine/core/remix/apply';
import { variantOf } from '@engine/tools/remix';
import { pageSvg, printLayout } from '@engine/tools/code-wheel-print';
import { game as reference } from '../games/reference/game';

const P: CodeWheelParams = {
  actors: ['pixel', 'biscuit', 'grandma', 'lou', 'seller'].map((id) => ({ id, label: id, img: `${id}/r1c2` })),
  symbols: ['key', 'token', 'oil', 'matches', 'cable'].map((id) => ({ id, label: `the ${id}` })),
  answers: ['STREET', 'MARKET', 'ALLEY', 'YARD', 'CELLAR'],
};

describe('the wheel a seed makes', () => {
  it('is the same for the same seed, another for another seed, and always has one solution', () => {
    expect(generateWheel(P, 'WS-0000-0000')).toEqual(generateWheel(P, 'WS-0000-0000'));
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const w = generateWheel(P, encodeSeedCode(i * 7_777_777));
      expect(checkWheel(w)).toEqual([]);
      seen.add(JSON.stringify(w));
      expect(readWindow(w, w.challenge.actor, w.challenge.symbol)).toBe(w.answer);
    }
    expect(seen.size).toBeGreaterThan(1900);
  });
  it('a portrait changed moves nothing; its own stream, apart from the logic', () => {
    const a = generateWheel(P, 'WS-0000-0000');
    const b = generateWheel({ ...P, actors: P.actors.map((x) => ({ ...x, img: 'other' })) }, 'WS-0000-0000');
    expect(b).toEqual(a);
  });
  it('the text table is the whole wheel: n × n readings, each actor reading every answer once', () => {
    const w = generateWheel(P, 'story');
    const t = wheelTable(w);
    expect(t).toHaveLength(25);
    for (const actor of w.outer) expect(new Set(t.filter((r) => r.actor === actor).map((r) => r.answer)).size).toBe(5);
    expect(t.find((r) => r.actor === w.challenge.actor && r.symbol === w.challenge.symbol)!.answer).toBe(w.answer);
  });
  it('refuses parameters that cannot make a wheel', () => {
    expect(wheelProblems({ ...P, answers: ['A', 'A', 'B', 'C', 'D'] })).toContain(
      'the answers must differ (one per window)',
    );
    expect(wheelProblems({ ...P, symbols: P.symbols.slice(1) })).toContain('as many symbols as actors');
    const four = { actors: P.actors.slice(0, 4), symbols: P.symbols.slice(0, 4), answers: P.answers.slice(0, 4) };
    expect(wheelProblems(four)).toContain('a code wheel has an odd number of actors, 3 to 11');
    expect(
      wheelProblems({ ...P, actors: P.actors.slice(0, 2), symbols: P.symbols.slice(0, 2), answers: ['A', 'B'] }),
    ).toContain('a code wheel has an odd number of actors, 3 to 11');
  });
  it('the modes judge an answer: parody lets through after three, strict never, cosmetic always', () => {
    const w = generateWheel(P, 'story');
    const bad = P.answers.find((a) => a !== w.answer)!;
    expect(judge(w, 'parody', w.answer, 0)).toBe('won');
    expect(judge(w, 'parody', bad, 0)).toBe('wrong');
    expect(judge(w, 'parody', bad, 2)).toBe('passed');
    expect(judge(w, 'strict', bad, 50)).toBe('wrong');
    expect(judge(w, 'cosmetic', bad, 0)).toBe('won');
  });
  it("the reference's wheel takes the world's seed", () => {
    const c = compileGameManifest(reference);
    const a = applyVariant(reference, variantOf(c, 'remix', 3, {}));
    const params = (a.rooms.find((r) => r.id === 'hall')!.on![0]!.do[1] as unknown as { params: { seed: string } })
      .params;
    expect(params.seed).toBe('catalogue:remix:3');
  });
});

function ctxOf(params: Record<string, unknown>) {
  const root = document.createElement('div');
  document.body.append(root);
  const ac = new AbortController();
  const said: string[] = [];
  const ctx: MinigameCtx = {
    root,
    u: 1,
    img: (id) => `/${id}.png`,
    size: () => [10, 10],
    sfx: () => {},
    instruct: (t) => said.push(t),
    params,
    labels: { skip: 'Skip', jump: 'Jump', duck: 'Duck' },
    signal: ac.signal,
  };
  return { ctx, root, said, ac };
}
const buttons = (root: HTMLElement, cls: string) => [...root.querySelectorAll<HTMLButtonElement>(`button.${cls}`)];

describe('the wheel on screen', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });
  it('turns with the buttons and the keys, announces each turn, and the right answer wins with a record', async () => {
    const { ctx, root, said } = ctxOf({ ...P, seed: 'WS-0000-0000' });
    const w = generateWheel(P, 'WS-0000-0000');
    const records: unknown[] = [];
    root.addEventListener('mg-record', (e) => records.push((e as CustomEvent).detail));
    const done = codeWheel.run(ctx);
    await Promise.resolve();
    expect(said[0]).toContain(`the ${w.challenge.symbol}`);
    const live = root.querySelector('[aria-live]')!;
    const [left, right] = buttons(root, 'mg-turn');
    for (let k = 0; k < rotationFor(w, w.challenge.actor, w.challenge.symbol); k++) right!.click();
    expect(live.textContent).toBe(
      `the ${w.challenge.symbol} is under ${w.challenge.actor}; its window shows ${w.answer}.`,
    );
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    left!.click();
    expect(live.textContent).toContain(w.answer);
    // The wheel as a list: every reading.
    expect(root.querySelectorAll('details tr')).toHaveLength(25);
    buttons(root, 'mg-answer')
      .find((b) => b.textContent === w.answer)!
      .click();
    await done;
    expect(records).toMatchObject([
      { seed: 'WS-0000-0000', version: 1, mode: 'parody', result: 'won', answers: [w.answer], tries: 1 },
    ]);
  });
  it('parody lets the player through after three wrong answers; strict offers no skip', async () => {
    const w = generateWheel(P, 'story');
    const { ctx, root } = ctxOf({ ...P });
    const records: { result: string }[] = [];
    root.addEventListener('mg-record', (e) => records.push((e as CustomEvent).detail));
    const done = codeWheel.run(ctx);
    await Promise.resolve();
    const wrong = buttons(root, 'mg-answer').find((b) => b.textContent !== w.answer)!;
    wrong.click();
    wrong.click();
    expect(root.querySelector('[aria-live]')!.textContent).toBe('Nope. Did you turn the small disc?');
    wrong.click();
    await done;
    expect(records[0]!.result).toBe('passed');
    const strict = ctxOf({ ...P, mode: 'strict' });
    void codeWheel.run(strict.ctx);
    await Promise.resolve();
    expect(strict.root.querySelector('.mg-skip')).toBeNull();
    strict.ac.abort();
  });
  it('disabled skips at once; no animated turn under prefers-reduced-motion', async () => {
    const { ctx, root } = ctxOf({ ...P, mode: 'disabled' });
    await codeWheel.run(ctx);
    expect(root.children).toHaveLength(0);
    vi.spyOn(globalThis, 'matchMedia').mockImplementation(
      (q: string) => ({ matches: q.includes('reduce') }) as MediaQueryList,
    );
    const r = ctxOf({ ...P });
    void codeWheel.run(r.ctx);
    await Promise.resolve();
    buttons(r.root, 'mg-turn')[1]!.click();
    expect((r.root.querySelector('svg g') as SVGGElement).style.transition).toBe('none');
    r.ac.abort();
  });
});

describe('the wheel by keyboard and gamepad, and its story outcome (4.1.16)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    delete (navigator as { getGamepads?: unknown }).getGamepads;
  });
  it('Escape skips (recorded skipped); a strict wheel starts with the focus on a turn button', async () => {
    const { ctx, root } = ctxOf({ ...P });
    const records: { result: string }[] = [];
    root.addEventListener('mg-record', (e) => records.push((e as CustomEvent).detail));
    const done = codeWheel.run(ctx);
    await Promise.resolve();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await done;
    expect(records.map((r) => r.result)).toEqual(['skipped']);
    const strict = ctxOf({ ...P, mode: 'strict' });
    document.body.append(strict.root);
    void codeWheel.run(strict.ctx);
    await Promise.resolve();
    await Promise.resolve();
    expect(document.activeElement?.className).toBe('mg-turn');
    strict.ac.abort();
  });
  it('a gamepad turns, chooses an answer and confirms it: the whole wheel, no pointer', async () => {
    const w = generateWheel(P, 'WS-0000-0000');
    const pad = { buttons: Array.from({ length: 16 }, () => ({ pressed: false })), axes: [0, 0] };
    // happy-dom has no Gamepad API: the page's navigator is given one for this test.
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    let frame: FrameRequestCallback | null = null;
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((f) => ((frame = f), 1));
    const tick = () => frame?.(0);
    const press = (i: number) => {
      pad.buttons[i]!.pressed = true;
      tick();
      pad.buttons[i]!.pressed = false;
      tick();
    };
    const { ctx, root } = ctxOf({ ...P, seed: 'WS-0000-0000' });
    const records: { result: string; answers: string[] }[] = [];
    root.addEventListener('mg-record', (e) => records.push((e as CustomEvent).detail));
    const done = codeWheel.run(ctx);
    await Promise.resolve();
    tick(); // the first poll: what is held then (the press that opened the wheel) is not a new press
    for (let k = 0; k < rotationFor(w, w.challenge.actor, w.challenge.symbol); k++) press(15);
    expect(root.querySelector('[aria-live]')!.textContent).toContain(`its window shows ${w.answer}`);
    const sorted = [...P.answers].sort();
    for (let k = 0; k <= sorted.indexOf(w.answer); k++) press(13);
    expect(root.querySelector('button.mg-answer[aria-current="true"]')!.textContent).toBe(w.answer);
    press(0);
    await done;
    expect(records).toMatchObject([{ result: 'won', answers: [w.answer] }]);
  });
  it('a story wheel lost after its tries ends failed, recorded for the story to read', async () => {
    const w = generateWheel(P, 'story');
    const { ctx, root } = ctxOf({ ...P, mode: 'story' });
    const records: { result: string }[] = [];
    root.addEventListener('mg-record', (e) => records.push((e as CustomEvent).detail));
    const done = codeWheel.run(ctx);
    await Promise.resolve();
    const wrong = buttons(root, 'mg-answer').find((b) => b.textContent !== w.answer)!;
    for (let k = 0; k < 3; k++) wrong.click();
    // The pause before it closes: the right answer, Escape, nothing changes the result once given.
    buttons(root, 'mg-answer')
      .find((b) => b.textContent === w.answer)!
      .click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await done;
    expect(records.map((r) => r.result)).toEqual(['failed']);
  });
});

describe('the printable wheel', () => {
  const w = generateWheel(P, 'WS-0000-0000');
  it('three pages: the large disc with its portraits and track, the small disc with its windows, a booklet', () => {
    const l = printLayout(w, P, { title: 'Test', image: (id) => `data:image/png;base64,${id}` });
    expect(l.pages.map((p) => p.name)).toEqual(['large-disc', 'small-disc', 'booklet']);
    const [large, small, booklet] = l.pages;
    expect(large!.marks.filter((m) => m.kind === 'image')).toHaveLength(5);
    expect(large!.marks.filter((m) => m.kind === 'text').map((m) => (m as { text: string }).text)).toEqual(
      expect.arrayContaining(P.answers),
    );
    expect(small!.marks.filter((m) => m.kind === 'window')).toHaveLength(5);
    // Cut lines, the centre hole and the crop marks.
    expect(large!.marks.filter((m) => m.kind === 'circle' && m.cut)).toHaveLength(2);
    expect(large!.marks.filter((m) => m.kind === 'line')).toHaveLength(8);
    const text = booklet!.marks.map((m) => (m as { text?: string }).text ?? '').join('\n');
    expect(text).toMatch(/Assembly/);
    expect(text).toMatch(/protects nothing/);
  });
  it('a colour and an economy SVG (no fill, grey portraits), well-formed', () => {
    const colour = pageSvg(printLayout(w, P, { title: 'T' }).pages[0]!, false);
    const eco = pageSvg(printLayout(w, P, { title: 'T', economy: true }).pages[0]!, true);
    expect(colour).toContain('fill="#f4e9c8"');
    expect(eco).not.toContain('#f4e9c8');
    expect(eco).toContain('feColorMatrix');
    for (const s of [colour, eco])
      expect(new DOMParser().parseFromString(s, 'image/svg+xml').querySelector('parsererror')).toBeNull();
  });
});
