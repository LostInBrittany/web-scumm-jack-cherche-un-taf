---
name: review
description: Build the sprite review page (every cell of every sheet, keep/redo/unused), publish it, read the decisions back.
---
# Review

1. `npm run assets` so every cell is prepared, then `npm run page:review` → `dist-pages/review.html`.
2. Publish as an artifact, send the link. The owner marks each cell keep / redo / unused with a note.
3. ArtifactData `list` on `decide`: list the "redo" cells with their notes, prepare one regeneration prompt per
   sheet (`wiki/en/create.images.md`), never recut a cell marked keep. "unused" cells are left out of the game but never deleted.
