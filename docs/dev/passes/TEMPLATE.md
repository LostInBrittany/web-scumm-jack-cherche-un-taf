# Manual passes, <version>

The checks automation cannot make (D12: reported in the release notes, not blocking); how to make each one and what
to bring back: `wiki/en/contribute.field-passes.md`. Copy this file to
`docs/dev/passes/<version>.md`, fill what was done, and leave "not done" where nothing was.

| Pass | Status | Who, when | Device, OS, browser, versions | What failed |
|---|---|---|---|---|
| Screen reader (`docs/dev/SCREEN-READER.md`, VoiceOver iOS or TalkBack Android) | not done | | | |
| Safari offline (`docs/dev/SAFARI-OFFLINE.md`: first visit online, airplane mode, a room never visited, a reload) | not done | | | |
| Real phone, frame rate of the heaviest scene (≥ 30 FPS) | not done | | | |
| Playtesters who do not know the puzzles (`npm run verify:field`: sessions, finished, device families) | not done | | | |
| Recorded voices (lines approved / lines with an id) | not done | | | |
| Listening (each score on a phone speaker and on headphones, each bridge, a save loaded mid-transition) | not done | | | |
| Signed tag (`git tag -s`) | not done | | | |

Each failure is a bug with its screen, the device, and what happened instead.
