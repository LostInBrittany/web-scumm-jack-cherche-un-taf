---
name: new-game
description: Scaffold a new game folder games/<id> from the template and set it as the current game.
---
# New game

1. Ask for the game id (lowercase, letters and dashes) and a working title. Run `npm run new-game <id>`.
   It copies `games/_template` to `games/<id>`, writes `site.json` and sets `package.json` → `config.game`.
2. Fill `games/<id>/site.json` (title, shortName, description, lang, themeColor).
3. Write the story as a storyboard first (`/storyboard`), then rooms (`/new-room`), characters (`/new-character`).
4. Art: follow `wiki/en/create.images.md`; cut sheets with `python3 tools/cut-sheet.py <sheet.png> <sheet-id>`;
   `npm run assets` after every new sheet.
5. Check often: `npm run validate && npm run solve && npm test`.
