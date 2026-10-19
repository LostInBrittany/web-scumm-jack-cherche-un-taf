// The game's health by revision, in a hosted Studio's header (4.2.2, G3 and G4): the last verdict and its revision,
// stale once the head has moved past it, "unknown" while none is known, and, for a failing revision, the revision
// that broke it with what its operation did and its files (never who made it).
import type { HealthState } from './hosted';

export interface HealthText {
  text: string;
  title: string;
  /** `stale`: a verdict on an older revision than the head (shown, never green: G3). */
  state: 'ok' | 'bad' | 'unknown' | 'stale';
}

export function healthText(s: HealthState | null): HealthText {
  if (s?.unknown && s.rev !== null)
    return {
      text: `health unknown at revision ${s.rev}: ${s.unknown}`,
      title: 'No verdict could be given at that revision: unknown, never valid',
      state: 'unknown',
    };
  if (!s || s.rev === null || s.ok === null)
    return {
      text: s?.running != null ? `checking revision ${s.running}…` : 'health unknown',
      title: 'No verdict yet on any revision: unknown, never valid',
      state: 'unknown',
    };
  const behind = s.head > s.rev;
  const stale = behind ? ` · head ${s.head}` : '';
  const checking = s.running != null ? ` · checking revision ${s.running}…` : '';
  if (s.ok)
    return {
      text: `✔ valid at revision ${s.rev}${stale}${checking}`,
      title: s.warnings ? `${s.warnings} warning(s)` : 'No error, no warning',
      state: behind ? 'stale' : 'ok',
    };
  const since = s.brokenSince
    ? ` · broken since revision ${s.brokenSince.rev}: ${s.brokenSince.what} (${s.brokenSince.paths.join(', ')})`
    : '';
  return {
    text: `✖ ${s.errors.length} error(s) at revision ${s.rev}${since}${stale}${checking}`,
    // The chip is cut short beside the rest: all of it on hover.
    title: [since.replace(/^ · /, ''), ...s.errors].filter(Boolean).join('\n'),
    state: behind ? 'stale' : 'bad',
  };
}
