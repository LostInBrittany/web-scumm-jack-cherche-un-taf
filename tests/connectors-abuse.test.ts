// The connectors cannot run code of their own choosing (4.1.9, plan §4 branch 6, D19): statically, no source of
// connectors/ reaches `child_process`, `vm`, `eval`, `new Function` or an eval'd worker, and the only package it
// imports is `ssh2`; at run time, the four connectors take hostile input in a process where V8 refuses code made
// from strings; and the fuzz harness (tools/fuzz-connectors.ts) feeds each one seeded mutations without a crash.
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FUZZ_TARGETS, fuzz } from '../tools/fuzz-connectors';

const files = (d: string): string[] =>
  readdirSync(d).flatMap((e) => {
    const p = join(d, e);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|mjs|js)$/.test(e) ? [p] : [];
  });

describe('no connector can run code of its own choosing', () => {
  const sources = files('connectors/src').filter((f) => !f.endsWith('.d.ts'));

  it('reaches no process, no vm, no eval, no code from a string, statically', () => {
    const FORBIDDEN = [
      /\bchild_process\b/,
      /\bnode:vm\b|from 'vm'/,
      /\beval\s*\(/,
      /\bnew\s+Function\b/,
      /\beval:\s*true\b/,
      /\brequire\s*\(/,
      /\bprocess\.binding\b/,
      /setTimeout\(\s*['"`]/,
    ];
    const hits = sources.flatMap((f) =>
      FORBIDDEN.filter((re) => re.test(readFileSync(f, 'utf8'))).map((re) => `${f}: ${re}`),
    );
    expect(sources.length).toBeGreaterThan(15);
    expect(hits).toEqual([]);
  });

  it('imports Node, the engine’s Reality types, its own modules and ssh2: nothing else', () => {
    const outside = sources.flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/(?:from|import)\s+'([^']+)'/g)]
        .map((m) => m[1]!)
        .filter((s) => !s.startsWith('node:') && !s.startsWith('.') && s !== 'ssh2' && s !== 'tsx/esm/api')
        .map((s) => `${f}: ${s}`),
    );
    expect(outside).toEqual([]);
    // tsx only in the development boot of the MIME worker (the package bundles it away).
    const tsx = sources.filter((f) => readFileSync(f, 'utf8').includes("'tsx/esm/api'"));
    expect(tsx).toEqual(['connectors/src/email/mime-worker.boot.mjs']);
  });

  it('takes hostile input on all four under --disallow-code-generation-from-strings', async () => {
    const p = spawn(
      process.execPath,
      ['--disallow-code-generation-from-strings', 'tests/fixtures/connectors/no-eval.mjs'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let out = '';
    p.stdout.on('data', (d) => {
      out += d;
    });
    p.stderr.on('data', (d) => {
      out += d;
    });
    const code = await new Promise<number | null>((ok) => p.on('exit', ok));
    expect(out).toContain('{"evalRefused":true,"problems":[]}');
    expect(code).toBe(0);
  }, 60_000);
});

describe('the fuzz harness, a small budget on every change', () => {
  it.each(FUZZ_TARGETS)(
    '%s: seeded mutations, no crash, no runaway memory',
    async (target) => {
      const r = await fuzz(target, { cases: 1000, seed: 11 });
      expect(r.cases).toBe(1000);
      expect(r.crashes).toEqual([]);
      expect(r.rssAfterMB - r.rssBeforeMB).toBeLessThan(128);
      expect(Object.keys(r.outcomes).length).toBeGreaterThan(1);
    },
    60_000,
  );
});
