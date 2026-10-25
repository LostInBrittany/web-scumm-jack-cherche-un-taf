// Default UI fonts (GameDef.skin.fonts replaces them). Both are OFL-licensed.
export const FONT_UI = 'Galmuri11';
/** Behind every interface family: Japanese, and the symbols a Latin pixel font lacks (the default until 4.2.5). */
const FONT_FALLBACK = 'DotGothic16';
export const FONT_PIXEL = 'Press Start 2P';

/** Full CSS stack for a family: DotGothic16 for what it lacks, then monospace. */
export const fontStack = (family: string) =>
  family === FONT_FALLBACK
    ? `'${family}', 'Courier New', monospace`
    : `'${family}', '${FONT_FALLBACK}', 'Courier New', monospace`;
