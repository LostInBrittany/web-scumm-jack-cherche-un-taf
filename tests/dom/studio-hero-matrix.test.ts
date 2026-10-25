// @vitest-environment happy-dom
// The Voices tab's "Heroes × languages" view (4.4.0, src/studio/hero-matrix.ts): a column per hero and language
// headed by the variant's portrait and name, a cell per text with its clip or what is missing, the problems filter.
// And the tab's switch between the recording table and the matrix (voices.ts).
import { afterEach, describe, expect, it } from 'vitest';
import { heroMatrix } from '@engine/tools/hero-matrix';
import { type Api, serverApi, useApi } from '../../src/studio/api';
import { HeroMatrixView } from '../../src/studio/hero-matrix';
import { VoicesTab } from '../../src/studio/voices';
import { heroes } from '../fixtures/heroes';
import { frReady, readyGame } from '../fixtures/voice-locale';

const matrix = () => heroMatrix(readyGame(), { fr: frReady });
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => useApi({ ...serverApi }));

describe('HeroMatrixView', () => {
  it('heads each hero with its portrait and name, shows each cell’s text and clip, filters the problems', async () => {
    useApi({ ...serverApi, heroMatrix: async () => matrix() } as Api);
    const v = new HeroMatrixView();
    await v.load();
    const heroes = [...v.el.querySelectorAll('th.hm-hero')];
    expect(heroes.map((th) => th.querySelector('div')!.textContent)).toEqual(['Sir Lance', 'Morwen', 'Robo']);
    expect(heroes[1]!.querySelector('img')!.getAttribute('src')).toMatch(/kid\/witch_face\.webp$/);
    expect(heroes[0]!.getAttribute('colspan')).toBe('2');
    const ready = [...v.el.querySelectorAll('tbody tr')].find((tr) => tr.textContent!.includes('ready'))!;
    const cells = [...ready.querySelectorAll('td.hm-cell')].map((td) => td.textContent);
    expect(cells[1]).toContain('Prêt ?');
    expect(cells[1]).toContain('▶ ready~form=knight');
    expect(cells[0]).toContain('missing ready');
    expect(v.el.querySelector('tbody')!.textContent).toContain('untranslated fr');
    const lang = v.el.querySelectorAll('select')[1] as HTMLSelectElement;
    lang.value = 'fr';
    lang.dispatchEvent(new Event('change'));
    expect(v.el.querySelectorAll('tbody tr')[0]!.querySelectorAll('td.hm-cell').length).toBe(3);
  });

  it('the problems filter keeps the lines with one', async () => {
    // The sneeze line has its three clips, the goodbye none.
    const g = heroes();
    g.rooms[0]!.on!.push({ verb: 'look', a: 'door', do: [{ say: ['kid', 'Bye, {hero}.'], id: 'bye' }] });
    useApi({ ...serverApi, heroMatrix: async () => heroMatrix(g) } as Api);
    const v = new HeroMatrixView();
    await v.load();
    expect(v.el.querySelectorAll('tbody tr').length).toBe(2);
    const show = v.el.querySelector('select') as HTMLSelectElement;
    show.value = 'problems';
    show.dispatchEvent(new Event('change'));
    expect([...v.el.querySelectorAll('tbody tr code')].map((c) => c.textContent)).toEqual(['bye']);
  });

  it('says so when no text switches on a flag', async () => {
    useApi({ ...serverApi, heroMatrix: async () => ({ langs: ['en'], flags: [], columns: [], rows: [] }) } as Api);
    const v = new HeroMatrixView();
    await v.load();
    expect(v.el.textContent).toContain('No text switches');
  });
});

describe('VoicesTab', () => {
  it('opens on the matrix where there is no voice table (the demo), and switches views', async () => {
    useApi({ ...serverApi, voices: undefined, heroMatrix: async () => matrix() } as Api);
    const t = new VoicesTab();
    await t.load();
    await flush();
    const [table, matrixBtn] = [...t.el.querySelectorAll('.bar button')] as HTMLButtonElement[];
    expect(matrixBtn!.getAttribute('aria-pressed')).toBe('true');
    expect(t.el.querySelector('th.hm-hero')).not.toBeNull();
    table!.click();
    await flush();
    expect(t.el.textContent).toContain('needs the dev server');
  });
});
