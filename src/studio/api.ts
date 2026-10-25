// The Studio's backend, behind one interface: the dev server's /__studio/api/* (tools/studio/plugin.ts, the default)
// or, in demo mode, the browser backend (src/studio/api-browser.ts: a build-time snapshot plus edits in localStorage).
// Types are shared with the server.
import type { Layout } from '@engine/core/types';
import type { GameIR } from '@engine/core/ir';
import type { HeroMatrix } from '@engine/tools/hero-matrix';
import type {
  CoverageData,
  GraphData,
  LintData,
  PlaytestsData,
  PuzzleData,
  ReportData,
  AddEntity,
  AssetsListing,
  EditResult,
  GameInfo,
  MarkdownResult,
  NewNote,
  Note,
  NoteEdit,
  NotesFile,
  RoomData,
  ScreenshotResult,
  SolveData,
  ValidateResult,
} from '../../tools/studio/types';
import type { GroupingsFile, ScenarioMap } from '../../tools/studio/scenario-map';
import { goLogin, hosting, studioFetch } from './api-base';
export { studioFetch };

export type * from '../../tools/studio/types';

export class ApiError extends Error {
  /** A refusal a dialog already shows (hosted 423, 409): the caller need not say it again. */
  handled = false;
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** A write refused by a span another member holds (423) or by a file changed since it was read (409). */
export interface Refusal {
  status: 409 | 423;
  data: Record<string, unknown>;
  /** What was sent: the draft the member keeps. */
  draft: unknown;
  /** The draft is a whole document (a layout, the storyboard): sent again, it replaces the other change. */
  whole?: boolean;
  /** Sends it again (a new operation). */
  retry: () => Promise<void>;
}
let refused: ((r: Refusal) => void) | undefined;
/** Who shows a refused write on a hosted Studio (hosted.ts / spans.ts). */
export const onRefused = (fn: (r: Refusal) => void) => {
  refused = fn;
};

/** The writes sent but not yet answered on a hosted Studio (a cut, a server switching): `changed` tells the count. */
export const waiting = { count: 0, changed: () => {} };

const pause = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** The POSTs that only read (a check takes its options in a body): the server's READ_POSTS (studio-server http.ts). */
const READ_POSTS = /^(validate|report|puzzle|coverage|playtests|lint|solve|screenshot)$/;

/** A 409 about a file that changed (the journal's base, or a write meanwhile), not another refusal that is a 409. */
/** The writes that send a whole document rather than an edit the server computes again on the file as it is. */
const WHOLE = /^PUT (room\/[\w-]+\/layout|storyboard|groupings)$/;

const fileConflict = (data: Record<string, unknown>) =>
  typeof data.path === 'string' || /changed (since|while)/.test(String(data.error ?? ''));

/**
 * The revision each resource was last read at on a hosted Studio (4.2.3, H10), by its read path (`room/<id>`,
 * `storyboard`, `notes`…): a write under that path sends it (`x-studio-base`), so a file another member wrote since is a
 * 409 that says what changed, never a write over it unseen. Only an editor's own read moves it on: a write's answer does
 * not (the server never counts the member's own writes against them), nor a read made for something else (`track`).
 */
const readAt = new Map<string, number>();
/** This tab, for the server: its own writes since its read are not a conflict (another tab's are). */
const client = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `t${Date.now()}`;
/** Writes that derive a file rather than edit one: no base (a regenerated `storyboard.md` is nobody's edit). */
const NO_BASE = /\/markdown$/;
/** The read a write belongs to: the longest read path that is the write's path or a folder of it. */
const readOf = (path: string): string | undefined => {
  let best: string | undefined;
  for (const k of readAt.keys())
    if ((path === k || path.startsWith(`${k}/`)) && (best === undefined || k.length > best.length)) best = k;
  return best;
};

/**
 * `quiet`: a retry from a refusal's dialog, which says itself why it failed again. `track: false`: a read that is not
 * an editor's (an overlay, a side look), which leaves the revision its editor read where it was.
 */
async function call<T>(method: string, path: string, body?: unknown, quiet = false, track = true): Promise<T> {
  // P6: on a hosted Studio a write carries its operation id, and a cut or a 502/503/504 (another instance taking
  // over, a proxy during a deploy, a proxy that may have passed it on) sends it again with the same id: applied once.
  const write = hosting.hosted && method !== 'GET' && !(method === 'POST' && READ_POSTS.test(path));
  const op = write ? crypto.randomUUID() : undefined;
  const read = write && !NO_BASE.test(path) ? readOf(path) : undefined;
  const base = read === undefined ? undefined : readAt.get(read);
  let r: Response | undefined;
  // Counted as waiting from its first failed attempt only: a write answered at once is never shown as waiting.
  let counted = false;
  const wait = async (attempt: number) => {
    if (!counted) {
      counted = true;
      waiting.count++;
      waiting.changed();
    }
    await pause(Math.min(8000, 500 * 2 ** attempt));
  };
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        r = await studioFetch(path, {
          method,
          headers: {
            ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
            ...(op ? { 'x-studio-op': op } : {}),
            ...(base !== undefined ? { 'x-studio-base': String(base), 'x-studio-client': client } : {}),
          },
          body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
        });
      } catch (e) {
        if (!write || attempt >= 8) throw e;
        await wait(attempt);
        continue;
      }
      if (write && [502, 503, 504].includes(r.status) && attempt < 8) {
        const d = (await r
          .clone()
          .json()
          .catch(() => ({}))) as { suspended?: boolean };
        if (d.suspended) location.reload();
        else {
          await wait(attempt);
          continue;
        }
      }
      break;
    }
  } finally {
    if (counted) {
      waiting.count--;
      waiting.changed();
    }
  }
  // A hosted Studio whose session ended: log in again, then come back here.
  if (r.status === 401 && hosting.hosted) goLogin();
  const data = await r.json().catch(() => ({ error: `${r.status} ${r.statusText}` }));
  if (!r.ok) {
    const err = new ApiError(data.error ?? `${r.status}`, r.status);
    if (write && !quiet && refused && (r.status === 423 || (r.status === 409 && fileConflict(data)))) {
      err.handled = true;
      // Applied on the head when the member asks (H10): their edit is computed again on the file as it is now.
      const head = Number(data.head);
      refused({
        status: r.status,
        data,
        draft: body,
        whole: WHOLE.test(`${method} ${path}`),
        retry: async () => {
          if (read !== undefined && Number.isSafeInteger(head)) readAt.set(read, Math.max(readAt.get(read) ?? 0, head));
          await call(method, path, body, true);
        },
      });
    }
    throw err;
  }
  // The revision the answer was made at (a hosted Studio's reads, 4.2.2): kept beside it, for `revisionOf`.
  const rev = Number(r.headers.get('x-studio-revision') ?? Number.NaN);
  if (Number.isSafeInteger(rev) && data && typeof data === 'object') revisions.set(data, rev);
  if (Number.isSafeInteger(rev) && method === 'GET' && track) readAt.set(path, rev);
  return data as T;
}

const revisions = new WeakMap<object, number>();

/** The revision an answer of the hosted Studio was made at; undefined elsewhere (the dev server, the demo). */
export const revisionOf = (answer: unknown): number | undefined =>
  answer && typeof answer === 'object' ? revisions.get(answer) : undefined;

type Storyboard = Record<string, unknown> & { boards: unknown[] };

export interface Api {
  /** 'server': files on disk through the dev server; 'demo': in this browser only. */
  readonly mode: 'server' | 'demo';
  game(): Promise<GameInfo>;
  /** `track: false`: a read for something else than the Rooms editor (an overlay), H10's base left as it was. */
  room(id: string, o?: { track?: boolean }): Promise<RoomData>;
  setLayout(id: string, layout: Layout): Promise<{ ok: true }>;
  setText(id: string, path: string, value: string | null): Promise<EditResult>;
  add(id: string, e: AddEntity): Promise<EditResult>;
  /** The raw storyboard.json (unknown fields kept). */
  storyboardRaw(): Promise<Storyboard>;
  setStoryboard(sb: unknown): Promise<{ ok: true; changed: boolean }>;
  /** Server: writes storyboard.md. Demo: generates it and hands it to the browser as a download. */
  storyboardMarkdown(): Promise<MarkdownResult>;
  notes(): Promise<NotesFile>;
  /** 4.2.3 (H1): the scenario map's groupings, and the map derived from them (the dev server and a hosted Studio). */
  groupings?(): Promise<GroupingsFile & { skipped?: string[] }>;
  setGroupings?(g: GroupingsFile): Promise<{ ok: true; changed: boolean }>;
  map?(): Promise<ScenarioMap>;
  addNote(n: NewNote): Promise<Note>;
  editNote(id: string, e: NoteEdit): Promise<Note>;
  deleteNote(id: string): Promise<{ ok: true }>;
  validate(): Promise<ValidateResult>;
  solve(from?: string, prove?: boolean): Promise<SolveData>;
  report(): Promise<ReportData>;
  graph(): Promise<GraphData>;
  puzzle(id?: string): Promise<PuzzleData>;
  /** The storyboard checked against the content. */
  coverage(): Promise<CoverageData>;
  /** The content lint after a solver run. */
  lint(prove?: boolean): Promise<LintData>;
  /** The playtests replayed and summed up (dev server only: the demo has no folder to read). */
  playtests?(): Promise<PlaytestsData>;
  screenshot(room: string, checkpoint?: string): Promise<Exclude<ScreenshotResult, { unavailable: true }>>;
  /** Every image and sound, where it is used, and the art prompts (the Assets tab; uploads: src/studio/assets.ts). */
  assets(): Promise<AssetsListing>;
  /** 3.4, dev server only: a structured value written at `path` of a room file (`dry`: the diff only), validated. */
  setValue?(
    id: string,
    path: string,
    value: unknown,
    dry?: boolean,
  ): Promise<EditResult & { diff: string; dry?: true }>;
  /** 3.4, dev server only: the last write taken back or done again (409 when the file changed since). */
  undo?(): Promise<{ ok: boolean; what?: string; reason?: string }>;
  redo?(): Promise<{ ok: boolean; what?: string; reason?: string }>;
  history?(): Promise<{ undo: string[]; redo: string[] }>;
  /** 4.1.12: the game's intermediate representation, with the provenance of its ids on the dev server. */
  ir?(): Promise<GameIR>;
  /** 3.4, dev server only: the voice production table. */
  voices?(lang?: string): Promise<VoicesData>;
  setVoice?(lang: string, id: string, patch: { status?: string; note?: string; actor?: string }): Promise<{ ok: true }>;
  voicesCsv?(lang: string): Promise<{ lang: string; csv: string }>;
  /** 4.4.0: the hero × language matrix (read-only; the dev server, a hosted Studio and the demo). */
  heroMatrix?(): Promise<HeroMatrix>;
}
export type { HeroMatrix };

export interface VoicesData {
  lang: string;
  langs: string[];
  statuses: string[];
  rows: { id: string; who: string; text: string; status: string; file?: string; note?: string; actor?: string }[];
}

export const serverApi: Api = {
  mode: 'server',
  game: () => call<GameInfo>('GET', 'game'),
  room: (id: string, o?: { track?: boolean }) =>
    call<RoomData>('GET', `room/${id}`, undefined, false, o?.track !== false),
  setLayout: (id: string, layout: Layout) => call<{ ok: true }>('PUT', `room/${id}/layout`, layout),
  setText: (id: string, path: string, value: string | null) =>
    call<EditResult>('PUT', `room/${id}/text`, { path, value }),
  add: (id: string, e: AddEntity) => call<EditResult>('POST', `room/${id}/add`, e),
  storyboardRaw: () => call<Storyboard>('GET', 'storyboard'),
  setStoryboard: (sb: unknown) => call<{ ok: true; changed: boolean }>('PUT', 'storyboard', sb),
  storyboardMarkdown: () => call<MarkdownResult>('POST', 'storyboard/markdown'),
  notes: () => call<NotesFile>('GET', 'notes'),
  groupings: () => call<GroupingsFile & { skipped?: string[] }>('GET', 'groupings'),
  setGroupings: (g) => call('PUT', 'groupings', g),
  map: () => call<ScenarioMap>('GET', 'map'),
  addNote: (n: NewNote) => call<Note>('POST', 'notes', n),
  editNote: (id: string, e: NoteEdit) => call<Note>('PUT', `notes/${encodeURIComponent(id)}`, e),
  deleteNote: (id: string) => call<{ ok: true }>('DELETE', `notes/${encodeURIComponent(id)}`),
  validate: () => call<ValidateResult>('POST', 'validate'),
  report: () => call<ReportData>('POST', 'report'),
  graph: () => call<GraphData>('GET', 'graph'),
  puzzle: (id?: string) => call<PuzzleData>('POST', 'puzzle', { id: id || undefined }),
  coverage: () => call<CoverageData>('POST', 'coverage'),
  lint: (prove?: boolean) => call<LintData>('POST', 'lint', { prove: prove || undefined }),
  playtests: () => call<PlaytestsData>('POST', 'playtests'),
  solve: (from?: string, prove?: boolean) =>
    call<SolveData>('POST', 'solve', { from: from || undefined, prove: prove || undefined }),
  screenshot: (room: string, checkpoint?: string) =>
    call<Exclude<ScreenshotResult, { unavailable: true }>>('POST', 'screenshot', {
      room,
      checkpoint: checkpoint || undefined,
    }),
  assets: () => call<AssetsListing>('GET', 'assets'),
  setValue: (id: string, path: string, value: unknown, dry?: boolean) =>
    call<EditResult & { diff: string; dry?: true }>('PUT', `room/${id}/value`, { path, value, dry: dry || undefined }),
  ir: () => call<GameIR>('GET', 'ir'),
  undo: () => call<{ ok: boolean; what?: string; reason?: string }>('POST', 'undo'),
  redo: () => call<{ ok: boolean; what?: string; reason?: string }>('POST', 'redo'),
  history: () => call<{ undo: string[]; redo: string[] }>('GET', 'history'),
  voices: (lang?: string) => call<VoicesData>('GET', lang ? `voices/${lang}` : 'voices'),
  setVoice: (lang: string, id: string, patch: { status?: string; note?: string; actor?: string }) =>
    call<{ ok: true }>('PUT', `voices/${lang}/${encodeURIComponent(id)}`, patch),
  voicesCsv: (lang: string) => call<{ lang: string; csv: string }>('GET', `voices/${lang}/csv`),
  heroMatrix: () => call<HeroMatrix>('GET', 'hero-matrix'),
};

/** The backend in use (a live binding: the tabs read it at call time). Set once at start by main.ts. */
export let api: Api = { ...serverApi }; // its own object: the server's one is the default, not an alias
export function useApi(a: Api) {
  api = a;
}

/** The game's root URL (the Vite base: `/` in dev, `/<repo>/` on GitHub Pages). */
export const BASE = import.meta.env.BASE_URL ?? '/';

/** Image URL of a manifest id (public/assets, prepared by npm run assets). */
export const imgUrl = (id: string) => `${BASE}assets/img/${id}.webp`;
