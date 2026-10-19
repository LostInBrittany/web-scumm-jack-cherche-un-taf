## 4.2.3 PR 0: a worker from the archives prepares (H7)

- `scripts/pack.mjs` ships `ops/studio/worker-requirements.lock` in the engine's package (where `prepare.ts` lives).
- `prepare.ts`: `pythonPathOf(env, cwd)`, `WORKER_PYTHON_PATH` else `.python` in the worker's folder; the worker
  (`main.ts`) and the local Studio (`local.ts`) pass it to the child with the PATH; before, `PYTHONPATH` was the engine's
  folder, which an install from the archives is not (`node_modules/web-scumm`).
- `scripts/studio-install-smoke.mjs`: the lock in the installed package, byte for byte the repository's; with
  `--python` (the candidate's job, now with CPython 3.13), installed as the hook does (`--require-hashes`, wheels only)
  and its packages imported from that folder. A real `prepare` from the archives stays the `studio-assets-hosted` pass;
  CI's real `prepare` runs from the repository (`studio-hosted`).
- STUDIO-SERVER (en, fr): the hook for a worker from the archives, the lock's platform said.
- Tests: `tests/studio-prepared.test.ts` (`pythonPathOf`).

→ next: Claude (4.2.3 PR 1: the revision read, H10)
