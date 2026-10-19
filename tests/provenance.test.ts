import { describe, expect, it } from 'vitest';
import {
  assetKeys,
  assetPath,
  commercialVerdict,
  licenceVerdict,
  nonCommercial,
  lockDiff,
  lockMessages,
  makeLock,
  placeholderVerdict,
  provenanceReport,
} from '@engine/tools/provenance';
import demoLock from '../games/demo/provenance.lock.json';
import { fileFacts } from '../tools/provenance-files';
import { game as demo } from '../games/demo/game';
import demoManifest from '../games/demo/assets.gen.json';
import demoProvenance from '../games/demo/provenance.json';
import type { Provenance } from '@engine/tools/provenance';

describe('asset provenance', () => {
  const manifest = { images: { 'hero/r1c1': [1, 1], 'decor/house': [1, 1] } };
  const game = { ...demo, audio: { sfx: { ding: 'ding.mp3' }, music: { theme: 'theme.mp3' } } } as typeof demo;
  it('lists every image and sound a game ships', () => {
    expect(assetKeys(game, manifest)).toEqual(['img:decor/house', 'img:hero/r1c1', 'music:theme.mp3', 'sfx:ding.mp3']);
  });
  it('reports what no entry covers, incomplete entries and placeholders', () => {
    const r = provenanceReport(game, manifest, {
      assets: [
        { match: 'img:hero/*', source: 'drawn', licence: 'own work', status: 'final' },
        { match: 'music:*', source: 'bought', licence: 'royalty-free', status: 'placeholder' },
        { match: 'sfx:*', source: '', licence: 'x', status: 'final' },
      ],
    } as Provenance);
    expect(r.uncovered).toEqual(['img:decor/house']);
    expect(r.placeholders).toEqual(['music:theme.mp3']);
    expect(r.incomplete).toEqual(['sfx:*']);
  });
  it('an asset two entries match is ambiguous, whatever their order', () => {
    const r = provenanceReport(game, manifest, {
      assets: [
        { match: 'img:*', source: 'a', licence: 'x', status: 'final' },
        { match: 'img:hero/*', source: 'b', licence: 'y', status: 'placeholder' },
        { match: 'music:*', source: 'c', licence: 'z', status: 'final' },
        { match: 'sfx:*', source: 'd', licence: 'z', status: 'final' },
      ],
    } as Provenance);
    expect(r.ambiguous).toEqual(['img:hero/r1c1 (img:*, img:hero/*)']);
    expect(r.placeholders).toEqual([]);
  });
  it('the sample game covers every asset, with no placeholder left (3.7: its theme is written for the project)', () => {
    const r = provenanceReport(demo, demoManifest as never, demoProvenance as Provenance);
    expect(r.uncovered).toEqual([]);
    expect(r.incomplete).toEqual([]);
    expect(r.placeholders).toEqual([]);
  });
});

describe('placeholders in a release', () => {
  const r = { keys: 2, uncovered: [], placeholders: ['music:theme.mp3'], incomplete: [], ambiguous: [] };
  it('fail it, unless the file says why they may ship', () => {
    expect(placeholderVerdict({ assets: [] }, r).errors).toHaveLength(1);
    const allowed = { assets: [], releaseExceptions: [{ match: 'music:theme.mp3', reason: 'a demo' }] };
    expect(placeholderVerdict(allowed, r)).toEqual({
      errors: [],
      accepted: [expect.stringContaining('release exception: a demo')],
    });
    // an exception names its asset: a new placeholder is not covered by an older reason
    expect(placeholderVerdict(allowed, { ...r, placeholders: ['music:theme.mp3', 'img:new'] }).errors).toEqual([
      expect.stringContaining('img:new'),
    ]);
    expect(placeholderVerdict({ assets: [] }, { ...r, placeholders: [] })).toEqual({ errors: [], accepted: [] });
  });
});

describe('the provenance lock', () => {
  const prov: Provenance = {
    licences: { allow: ['own work'] },
    assets: [
      { match: 'img:*', source: 'drawn', licence: 'own work', status: 'final' },
      { match: 'music:*', source: 'bought', licence: 'royalty-free', status: 'final' },
    ],
  };
  const keys = ['img:a', 'img:b', 'music:t.mp3'];
  const files = {
    'img:a': { sha256: '1', bytes: 1 },
    'img:b': { sha256: '2', bytes: 2 },
    'music:t.mp3': { sha256: '3', bytes: 3 },
  };
  it('maps keys to the built files', () => {
    expect(
      ['img:hero/r1c1', 'sfx:ding.mp3', 'music:t.mp3', 'voice:v.mp3', 'video:intro.mp4', 'odd:x'].map(assetPath),
    ).toEqual([
      'img/hero/r1c1.webp',
      'audio/sfx/ding.mp3',
      'audio/music/t.mp3',
      'audio/voices/v.mp3',
      'video/intro.mp4',
      null,
    ]);
  });
  it('records each file with its claims, and finds what changed since', () => {
    const lock = makeLock(keys, prov, files);
    expect(lock.assets['img:a']).toEqual({
      sha256: '1',
      bytes: 1,
      match: 'img:*',
      licence: 'own work',
      status: 'final',
    });
    expect(lockMessages(lockDiff(keys, prov, files, lock))).toEqual([]);
    const now = {
      ...files,
      'img:b': { sha256: 'x', bytes: 2 },
      'img:c': { sha256: '4', bytes: 4 },
      'music:t.mp3': null,
    };
    const claims = { ...prov, assets: [{ ...prov.assets[0], licence: 'CC0' }, prov.assets[1]] };
    expect(lockDiff([...keys, 'img:c'], claims, now, lock)).toEqual({
      missing: ['music:t.mp3'],
      added: ['img:c'],
      removed: [],
      changed: ['img:b'],
      claims: ['img:a'],
    });
    expect(lockDiff(['img:a'], prov, files, lock).removed).toEqual(['img:b', 'music:t.mp3']);
  });
  it('a licence outside the policy fails, unless the asset is excepted by name', () => {
    expect(licenceVerdict(keys, prov).errors).toEqual([
      'provenance.json › royalty-free: not in licences.allow (own work), used by 1 asset(s): music:t.mp3',
    ]);
    expect(
      licenceVerdict(keys, {
        ...prov,
        releaseExceptions: [{ match: 'music:t.mp3', reason: 'licensed for this game' }],
      }),
    ).toEqual({ errors: [], accepted: [expect.stringContaining('licensed for this game')] });
    expect(licenceVerdict(keys, { assets: prov.assets }).errors).toEqual([
      expect.stringContaining('which licences may ship'),
    ]);
  });
  it('the sample game ships exactly the files it locked', () => {
    const k = assetKeys(demo, demoManifest as never);
    expect(lockMessages(lockDiff(k, demoProvenance as Provenance, fileFacts(k), demoLock as never))).toEqual([]);
    const v = licenceVerdict(k, demoProvenance as Provenance);
    expect(v.errors).toEqual([]);
    expect(v.accepted).toEqual([]);
  });
});

describe('a commercial release (verify:commercial)', () => {
  const keys = ['img:a', 'music:t.mp3'];
  const clean: Provenance = {
    licences: { allow: ['own work'] },
    assets: [
      {
        match: 'img:*',
        source: 'Drawn from games/demo/prompts.md',
        author: 'Wano',
        licence: 'own work',
        status: 'final',
      },
      {
        match: 'music:*',
        source: 'Bought',
        url: 'https://example.org/licence/123',
        author: 'A composer',
        licence: 'royalty-free, commercial use',
        status: 'final',
      },
    ],
  };
  const exists = (p: string) => p === 'games/demo/prompts.md';
  it('passes complete, sellable claims', () => expect(commercialVerdict(keys, clean, exists)).toEqual([]));
  it('a game in its own project names its own files (3.9); a URL is not a file', () => {
    const own: Provenance = {
      ...clean,
      assets: [
        {
          match: '*',
          source: 'Drawn by art-src/draw.py, see https://example.org/a/b.py',
          author: 'Us',
          licence: 'own work',
          status: 'final',
        },
      ],
    };
    expect(commercialVerdict(keys, own, (p) => p === 'art-src/draw.py')).toEqual([]);
    expect(commercialVerdict(keys, own, (p) => p === 'example.org/a/b.py').join('\n')).toContain(
      'nothing to check the source against',
    );
  });
  it('refuses exceptions, placeholders, non-commercial licences, no author, nothing to check', () => {
    const bad: Provenance = {
      ...clean,
      releaseExceptions: [{ match: 'music:t.mp3', reason: 'a demo' }],
      assets: [
        { match: 'img:*', source: 'Drawn somewhere', licence: 'own work', status: 'final' },
        {
          match: 'music:*',
          source: 'An arrangement',
          url: 'https://example.org',
          author: 'A',
          licence: 'CC BY-NC-SA 4.0',
          status: 'placeholder',
        },
      ],
    };
    const e = commercialVerdict(keys, bad, exists).join('\n');
    for (const x of [
      'ships no exception',
      'a placeholder, not for sale',
      'CC BY-NC-SA 4.0 does not allow commercial use',
      'img:* (1 asset(s)): no author',
      'img:* (1 asset(s)): nothing to check the source against',
    ])
      expect(e).toContain(x);
  });
  it('knows a non-commercial or no-derivatives licence', () => {
    expect(['CC BY-NC 4.0', 'CC BY-NC-ND 4.0', 'CC BY-ND', 'non-commercial use only'].every(nonCommercial)).toBe(true);
    expect(
      ['CC BY 4.0', 'CC0', 'own work', 'proprietary', 'SIL OFL 1.1', 'royalty-free, commercial use'].some(
        nonCommercial,
      ),
    ).toBe(false);
  });
  it('the sample game may be sold (3.7): no exception, no placeholder, every licence commercial', () => {
    const k = assetKeys(demo, {
      images: demoManifest.images,
      videos: (demoManifest as { videos?: Record<string, unknown> }).videos,
    });
    expect(commercialVerdict(k, demoProvenance as Provenance, (p) => require('node:fs').existsSync(p))).toEqual([]);
  });
});
