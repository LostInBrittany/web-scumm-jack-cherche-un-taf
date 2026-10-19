// The Field Kit's report (4.1.18 "Dress Rehearsal", docs/dev/PLAN-4.1.18-DRESS-REHEARSAL.md §5): one JSON file per
// pass a person makes, bound to the candidate run it tried (its commit, its run, the SHA-256 of every file it judged).
// `not-run`, `blocked`, `failed` and `passed` stay four words: a try is not a success, and only `passed` may lift a
// surface's `experimental` (D12 still: a pass is reported, it does not block a 4.1.x tag). The schema is strict: a
// field it does not name is refused, so a token, an address or an attachment cannot ride in by mistake.
import { z } from 'zod';

/** The passes, by an id that does not move with a translation: the thirteen of 4.1.17's sheet, then two each in 4.2.1, 4.2.2 and 4.2.3. */
export const PASS_IDS = [
  'bridge-postgres-https',
  'runs-real-players',
  'run-resume-power-cycle',
  'code-wheel-human',
  'mystery-deployed',
  'safari-ios-offline-update',
  'firefox-real-offline',
  'phone-both-renderers',
  'livesplit-obs',
  'connectors-real-security',
  'blind-playtesters',
  'voices-listening',
  'archive-human-install',
  'studio-hosted',
  'studio-collab',
  'studio-preview',
  'studio-assets-hosted',
  'studio-mcp-remote',
  'studio-oidc-generic',
] as const;
export type PassId = (typeof PASS_IDS)[number];

/** The first release each pass is asked of: a pass added later is not asked of an older release (4.2.1). */
const PASS_SINCE: Partial<Record<PassId, string>> = {
  'studio-hosted': '4.2.1',
  'studio-collab': '4.2.1',
  'studio-preview': '4.2.2',
  'studio-assets-hosted': '4.2.2',
  'studio-mcp-remote': '4.2.3',
  'studio-oidc-generic': '4.2.3',
};

/** The passes asked of a release (`4.2.1`, `4.2.1-rc.1`: a pre-release is asked what its release will be). */
export function passesFor(release: string): PassId[] {
  const parts = (v: string) => v.replace(/-.*$/, '').split('.').map(Number);
  const atLeast = (a: string, b: string) => {
    const [x, y] = [parts(a), parts(b)];
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] ?? 0) > (y[i] ?? 0);
    return true;
  };
  return PASS_IDS.filter((id) => !PASS_SINCE[id] || atLeast(release, PASS_SINCE[id]!));
}

/** What each pass is, as the sheet says it (English; the French docs show their own label, the tools use the id). */
export const PASS_LABELS: Record<PassId, string> = {
  'bridge-postgres-https': 'A multi-instance Bridge behind HTTPS on Postgres, a worker killed mid-verification',
  'runs-real-players': 'Story, Remix and Daily runs submitted by real people',
  'run-resume-power-cycle': 'A run resumed after the machine was stopped and started again',
  'code-wheel-human': 'The code wheel printed and used at the table; the text alternative by a screen-reader user',
  'mystery-deployed': 'A Mystery world played from the Remix menu against a deployed Bridge',
  'safari-ios-offline-update': 'Safari offline on an iPhone, and its update',
  'firefox-real-offline': 'Firefox offline on a real machine',
  'phone-both-renderers': 'A real phone on both painters',
  'livesplit-obs': 'A real LiveSplit and OBS session',
  'connectors-real-security': "Real connectors and a person's security pass",
  'blind-playtesters': 'Playtesters who do not know the puzzles',
  'voices-listening': 'The voices listened to',
  'archive-human-install': 'The published archive installed by a person',
  'studio-hosted':
    'The Studio Server deployed on Clever Cloud (Node, PostgreSQL, Cellar, Keycloak, a TLS domain), from its archive, by its guide; a real Safari on macOS and iOS',
  'studio-collab': 'Three people on one hosted Studio, a network cut and a redeploy while they edit',
  'studio-preview':
    'On a hosted Studio, people play the shared revision without a dev server, a save carried across revisions, the health chip, their own undo, a published build',
  'studio-assets-hosted':
    "A hosted Studio's prepare on the worker (Python, ffmpeg), its prepared set played in the Play tab",
  'studio-mcp-remote':
    "An AI agent on a hosted Studio through its remote MCP (/mcp): a real MCP client, a member's token, a write in the journal as the member, a span another holds refused",
  'studio-oidc-generic':
    'The Studio Server behind a second OpenID Connect provider (GitLab, D44): login, roles, a revoked member refused, verified by a person',
};

export const FIELD_STATUSES = ['not-run', 'blocked', 'failed', 'passed'] as const;

const sha256 = z.string().regex(/^[0-9a-f]{64}$/, 'a SHA-256 in lowercase hex');
const iso = z.iso.datetime({ offset: true });
const text = (max: number) => z.string().min(1).max(max);
/** A path inside the report's folder: relative, forward slashes, never `..`. */
const evidencePath = z
  .string()
  .min(1)
  .max(200)
  .refine((p) => !p.startsWith('/') && !/^[A-Za-z]:/.test(p) && !p.split(/[\\/]/).includes('..'), {
    message: 'a path inside the report folder (relative, no "..")',
  });

export const FieldReportSchema = z
  .object({
    schema: z.literal(1),
    passId: z.enum(PASS_IDS),
    release: z.string().regex(/^\d+\.\d+\.\d+(-rc\.\d+)?$/),
    commit: z.string().regex(/^[0-9a-f]{40}$/, 'the full SHA of the candidate commit'),
    candidateRun: z.string().regex(/^\d+$/),
    packageDigests: z.record(z.string().min(1).max(200), sha256),
    status: z.enum(FIELD_STATUSES),
    /** A pseudonym or a role: no identity is asked for. */
    operator: text(80).optional(),
    startedAt: iso.optional(),
    finishedAt: iso.optional(),
    environment: z
      .object({
        deviceFamily: text(80).optional(),
        deviceModel: text(80).optional(),
        os: text(80).optional(),
        browser: text(80).optional(),
        versions: z.record(z.string().min(1).max(60), text(80)),
      })
      .strict(),
    scenario: text(2000).optional(),
    evidence: z.array(z.object({ path: evidencePath, sha256, kind: text(40) }).strict()).max(200),
    failures: z
      .array(
        z
          .object({
            step: text(400),
            expected: text(2000),
            observed: text(2000),
            reproducible: z.boolean(),
            issue: text(200).optional(),
          })
          .strict(),
      )
      .max(100),
    notes: text(4000).optional(),
  })
  .strict()
  .superRefine((r, ctx) => {
    const say = (message: string, path: string) => ctx.addIssue({ code: 'custom', message, path: [path] });
    if (r.startedAt && r.finishedAt && Date.parse(r.finishedAt) < Date.parse(r.startedAt))
      say('it finished before it started', 'finishedAt');
    if (r.status === 'not-run') {
      if (r.startedAt || r.evidence.length || r.failures.length)
        say('a pass not run has no time, evidence or failure', 'status');
      return;
    }
    // Tried: when, by whom (a pseudonym), on what and what was done are what a reproduction needs.
    for (const k of ['operator', 'startedAt', 'finishedAt', 'scenario'] as const)
      if (!r[k]) say(`a pass tried (${r.status}) says ${k}`, k);
    const env = r.environment;
    if (!env.os && !env.browser && !env.deviceFamily && !Object.keys(env.versions).length)
      say(`a pass tried (${r.status}) says on what (os, browser, device or versions)`, 'environment');
    if (r.status === 'passed') {
      if (!r.evidence.length) say('a pass passed shows its evidence', 'evidence');
      if (r.failures.length) say('a pass passed has no failure: it is failed', 'failures');
    }
    if (r.status === 'failed' && !r.failures.length) say('a failed pass says what failed', 'failures');
    if (r.status === 'blocked' && !r.notes) say('a blocked pass says what blocked it (notes)', 'notes');
  });
export type FieldReport = z.infer<typeof FieldReportSchema>;
