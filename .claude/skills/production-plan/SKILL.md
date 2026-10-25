---
name: production-plan
description: Write docs/PRODUCTION.md for the current game from its storyboard, as work packages for parallel sub-agents.
---
# Production plan

1. Read `wiki/en/create.production-template.md`, `games/<id>/storyboard.json`, the current state (`npm run validate`,
   `npm run solve`, `npm test`, rooms present, assets present).
2. Fill the template: delivery goal, constraints of the subject, state, work packages with owned files
   (engine / content per group of rooms / assets / minigames / QA), ordering, final checklist, sub-agent prompt.
3. Suggest a model per package (strong reasoning for engine and QA, fast for transcription).
4. Launch the packages in waves; each agent ends with validate + solve + tests; QA runs last and may touch any file.
