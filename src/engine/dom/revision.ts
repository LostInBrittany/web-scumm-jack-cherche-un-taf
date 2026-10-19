// Saves across revisions (4.2.2, ADR 0026). A build that declares its revision (a hosted Studio's preview, later its
// published builds) writes, beside each save, the revision and the full fingerprint of the content it was made in:
// a manual slot in its meta, the autosave in this browser's storage next to it. The envelope does not change (D40).
// Resumed where the content differs (the fingerprint, not the number: a revision that changed only notes asks
// nothing), the player is asked: Resume here (it may fail if this revision removed what the save refers to: said,
// never repaired), Restart (a new game), or Stay (the save's own revision, by its URL); Escape cancels. Builds without
// a revision, the player's, never ask and write nothing more. The texts are the Studio's, in English, not the game's
// `ui`: only the game's authors see a preview.
import type { SaveStore } from '../core/ports';
import type { SavedRevision } from '../core/save';
import { trapFocus } from './a11y';
import type { App } from './app';
import { el, esc } from './app-shared';

export type { SavedRevision };

/** What a build says of itself: its revision, and the URL of another revision's build. */
export interface BuildRevision {
  rev: number;
  url: (rev: number) => string;
}

/** `cancel`: the question dismissed (Escape): nothing is loaded, nothing replaced. */
export type ResumeChoice = 'resume' | 'restart' | 'stay' | 'cancel';

type Ask = (saved: SavedRevision, here: SavedRevision, host?: HTMLElement) => Promise<ResumeChoice>;

/** A save's revision as stored (a slot's meta, the autosave's record), or undefined when it is not well formed. */
export function savedRevision(v: unknown): SavedRevision | undefined {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined;
  if (!o || !Number.isSafeInteger(o.rev) || (o.rev as number) < 0) return undefined;
  if (typeof o.fingerprint !== 'string' || !o.fingerprint || o.fingerprint.length > 400) return undefined;
  return { rev: o.rev as number, fingerprint: o.fingerprint };
}

/**
 * Installs the guard on a booted game (bootGame, when the build declares its revision). No fingerprint (WebCrypto
 * needs a secure origin): the game runs as before 4.2.2, without the question.
 */
export async function installRevision(app: App, build: BuildRevision): Promise<void> {
  try {
    const f = await app.fingerprint();
    app.revision = new RevisionGuard({
      game: app.game.id,
      build,
      fingerprint: [f.logic, f.trustedExtensions, f.presentation, f.engine].join('-'),
      ask: askInPage(() => app.scene),
    });
    // The engine's own store (the IndexedDB one, or the fallback the App chose).
    app.revision.watch(app.engine.store);
  } catch (e) {
    console.warn('saves across revisions: off', e);
  }
}

const key = (game: string) => `${game}.save-revision`;

export class RevisionGuard {
  constructor(
    private o: {
      game: string;
      build: BuildRevision;
      fingerprint: string;
      /** The question; `host` is where the caller shows it (above the title screen, or in the game). */
      ask: Ask;
      /** Goes to another revision's build; default `location.assign`. */
      go?: (url: string) => void;
      storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
    },
  ) {}

  private get storage() {
    try {
      return this.o.storage ?? globalThis.localStorage;
    } catch {
      return undefined;
    }
  }

  /** This build's revision and fingerprint: what a save made now records. */
  here(): SavedRevision {
    return { rev: this.o.build.rev, fingerprint: this.o.fingerprint };
  }

  private remember() {
    try {
      this.storage?.setItem(key(this.o.game), JSON.stringify(this.here()));
    } catch {
      /* storage refused: the next resume asks nothing, as before 4.2.2 */
    }
  }

  /**
   * Records where the autosave was made, once it is written (a store that verifies its writes says so by `whenIdle`;
   * a refused write records nothing); forgets it when the autosave is erased.
   */
  watch(store: SaveStore): void {
    const save = store.save.bind(store);
    const clear = store.clear.bind(store);
    store.save = (s) => {
      save(s);
      if (store.whenIdle)
        store.whenIdle().then(
          () => this.remember(),
          () => undefined,
        );
      else this.remember();
    };
    store.clear = async () => {
      const ok = await clear();
      if (ok)
        try {
          this.storage?.removeItem(key(this.o.game));
        } catch {
          /* storage refused */
        }
      return ok;
    };
  }

  /** Where the autosave was made, when this build recorded it. */
  autosave(): SavedRevision | undefined {
    try {
      return savedRevision(JSON.parse(this.storage?.getItem(key(this.o.game)) ?? 'null'));
    } catch {
      return undefined;
    }
  }

  /**
   * Before a save is resumed: `resume` at once when it was made in the same content (or says nothing of where);
   * otherwise the player's choice, asked in `host`. `stay` has already gone to the save's revision.
   */
  async resume(stored: SavedRevision | undefined, host?: HTMLElement): Promise<ResumeChoice> {
    const saved = savedRevision(stored);
    if (!saved || saved.fingerprint === this.o.fingerprint) return 'resume';
    const choice = await this.o.ask(saved, this.here(), host);
    if (choice === 'stay') (this.o.go ?? ((u) => globalThis.location.assign(u)))(this.o.build.url(saved.rev));
    return choice;
  }

  /**
   * Before a slot is loaded from its menu (`d`, `m`): true to load it. Asked above the menu; Escape leaves the menu
   * as it is; Restart replaces the game in progress, so it is confirmed in the menu, as an overwrite is.
   */
  async beforeSlot(app: App, saved: SavedRevision | undefined, d: HTMLElement, m: HTMLElement): Promise<boolean> {
    const choice = await this.resume(saved, app.scene);
    if (choice !== 'restart') return choice === 'resume';
    const ui = app.game.ui;
    m.innerHTML = `<h3>!</h3><p>${esc(ui.confirmErase)}</p>`;
    const y = el('button', 'warn', `<span>${esc(ui.yes)}</span><span>!</span>`),
      no = el('button', '', `<span>${esc(ui.no)}</span><span>▶</span>`);
    y.onclick = () => {
      d.remove();
      void app.engine.newGame().catch((e) => app.presenter.toast(String((e as Error).message)));
    };
    no.onclick = () => d.remove();
    m.append(y, no);
    return false;
  }
}

/** The question, as a dialog in `host` (default `fallback()`): Resume here, Restart, Stay in the save's revision. */
export function askInPage(fallback: () => HTMLElement): Ask {
  return (saved, here, host) =>
    new Promise((done) => {
      const d = el('div', 'dim');
      d.dataset.revisionPrompt = '';
      const sameRev = saved.rev === here.rev;
      const title = 'Another revision';
      const m = el(
        'div',
        'menu',
        `<h3>${esc(title.toUpperCase())}</h3><p>${esc(
          sameRev
            ? 'This save was made in another version of the game (the engine or the content changed).'
            : `This save was made in revision ${saved.rev}; this is revision ${here.rev}.`,
        )} ${esc('Resuming it here may fail if this revision removed what it refers to.')}</p>`,
      );
      m.setAttribute('role', 'dialog');
      m.setAttribute('aria-modal', 'true');
      m.setAttribute('aria-label', title);
      let release = () => {};
      const choose = (c: ResumeChoice) => () => {
        release();
        d.remove();
        done(c);
      };
      const button = (label: string, mark: string, c: ResumeChoice) => {
        const b = el('button', '', `<span>${esc(label)}</span><span>${esc(mark)}</span>`);
        b.dataset.choice = c;
        b.onclick = choose(c);
        m.append(b);
        return b;
      };
      const first = button('Resume here', '▶', 'resume');
      button('Restart', '↺', 'restart');
      if (!sameRev) button(`Stay in revision ${saved.rev}`, '↩', 'stay');
      d.append(m);
      (host ?? fallback()).append(d);
      release = trapFocus(m, { onEscape: choose('cancel'), initial: first });
    });
}
