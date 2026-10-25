// A Studio request refused, with the HTTP status it answers (4.1.19: a module of its own, so the Vite configuration
// reads the Studio's plugin without loading the Studio itself; written without a constructor parameter property, which
// Node's type stripping, what Vite's future native configuration loader relies on, does not accept).
export class StudioError extends Error {
  /** The mark a copy of this module recognises (an `instanceof` across the two copies cannot). */
  readonly studioError = true;
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** A Studio error from any copy of this module (the plugin's, and the one the dev server loads with the Studio). */
export const isStudioError = (e: unknown): e is StudioError =>
  e instanceof Error &&
  (e as { studioError?: unknown }).studioError === true &&
  Number.isInteger((e as { status?: unknown }).status) &&
  (e as StudioError).status >= 400 &&
  (e as StudioError).status < 600;

/**
 * The game's own code did not load (4.3.0: a game still importing the former name's `web-scumm/…`, D47): a property of
 * the game at that revision, unlike a worker that refused, timed out or left no result. The guard takes it for a head's
 * baseline; anything else propagates.
 */
export class GameDoesNotLoad extends StudioError {
  readonly gameDoesNotLoad = true;
  constructor(why: string, status = 500) {
    super(`the game does not load: ${why}`, status);
  }
}

/** A GameDoesNotLoad from any copy of this module. */
export const isGameDoesNotLoad = (e: unknown): e is GameDoesNotLoad =>
  isStudioError(e) && (e as { gameDoesNotLoad?: unknown }).gameDoesNotLoad === true;
