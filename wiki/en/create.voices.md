# Voices: per language and per hero

A spoken line plays a recorded clip when the game has one for it. This page says how a line finds its clip, how a
translated game gets its own recordings, how a line whose words change with the hero is recorded once per value, what
plays when a clip is missing, and what the browser and an offline player allow. It ends with the production table
(`voices`), from the lines to the files an actor sends back.

<a name="overview"></a>

## How a line finds its clip

- A line with a **stable id** (`npm run ids -- --lines` gives every line one) plays the clip filed under that id in
  `audio.voices`. Lines without an id have no clip: they are keyed by their position, which moves when the content
  does.
- A translated game plays `audio.voicesByLang[lang]` instead, under **the same ids**.
- A line whose text has a **text switch** (`{form?m=him|f=her}`) looks up `<id>~<flag>=<value>` first, then the plain
  id: see [Lines with text switches](#text-switches).
- An explicit `voice` on a `say` names one clip exactly, without keys.

The files live in `games/<id>/audio/voice/` in the engine repository, `game/audio/voice/` in a created project;
`npm run assets` encodes them (64 kb/s, mono) into `public/assets/audio/voices/`.

> [!GUARANTEE id=voice-keyed-then-plain]
> A line with switches plays its keyed clip for the flags as they stand, else its plain id.

With a flag still unset, it plays the plain id only.

<a name="voice-lines"></a>

## Voice in the content

```ts
audio: { voices: { grandma_01: 'grandma-01.mp3' } },   // files in games/<id>/audio/voice/
{ say: ['grandma', 'Pixel! Bad news.'], voice: 'grandma_01' }
```

- The line stays on screen as long as the clip plays; a tap still skips it. Without a clip, the reading time applies
  (the Text speed setting).
- The voice volume is a setting of its own (Settings, with `settings: true`), and the music steps back while someone
  speaks, then comes back.
- The other languages have their own clips, chosen with the language:
  `audio.voicesByLang: { fr: { <line id>: 'fr/…mp3' } }`.
- A sound that matters gets a caption, shown in writing and translated like any line
  ([Sound effects](create.sound-effects.md#captions)).

<a name="per-language"></a>

## Per language: `voicesByLang`

The game's own language (`lang` in `game.ts`, `en` when absent) plays `audio.voices`. For any other language the
player picks ([Translations](create.translations.md)):

| `audio.voicesByLang[lang]` | What plays |
|---|---|
| absent | the game's own clips, `audio.voices`: the translated text, voiced in the original language |
| present | only its clips, under the same ids (and the same keys); a line it lacks has no voice |

> [!LIMIT id=no-per-line-fallback]
> There is no line-by-line fallback between languages: once a language has its own map, a line missing from it is not
> voiced in the game's language; it shows for its reading time. Record every line of that language, or leave the
> language without a map.

> [!GUARANTEE id=voices-by-language]
> A translated game plays `audio.voicesByLang[lang]` in place of `audio.voices`, under the same line ids.

Since 4.4.0 `npm run assets` ships the clips of `voicesByLang` too (before, only `audio.voices` was encoded and a
translated page played nothing), and `npm run voices -- check` reads each language's own text.

<a name="text-switches"></a>

## Lines with text switches (per hero)

A line whose words follow a flag (`{form?m=him|f=her}`, the syntax is on [Heroes](create.heroes.md#hero-choice)) is
recorded once per value: Grandma saying "him" and "her" is two clips. The clip is keyed by the line's id and the
values of the flags its switches read:

```ts
audio: { voices: {
  grandma_saw: 'grandma_saw.mp3',              // the plain id: the fallback
  'grandma_saw~form=m': 'grandma_saw_m.mp3',   // {form?m=…} with form = "m"
  'grandma_saw~form=f': 'grandma_saw_f.mp3',
  'greet~form=f~mood=calm': 'greet_f_calm.mp3', // two flags in one line: sorted by name, joined by "~"
} }
```

- **The lookup**: when the line is spoken, `<id>~<flag>=<value>` for the flags as they stand (values as text: `true`,
  `2`, `f`), then the plain id. The text as written decides which flags count. The same rule in `voicesByLang`.
- **A flag not set yet** (the line is spoken before the choice): no keyed lookup, the plain id. The text shows its
  `*=` alternative then (else the first one), so that is what the plain clip should say.
- **A value no switch lists** (covered by `*=`): the keyed clip if there is one for that value, else the plain id.
- **A translation** keeps its source's switches (`npm run i18n -- status` reports one that drops a choice), and may
  add its own: a French agreement English writes alike, `Prêt{form?f=e|*=}`. The French clips follow the French text
  (4.3.1): a switch only the French text has asks for French clips by value, and a switch the French text drops asks
  for none in French.
- **The recording table** (`npm run voices -- export`, the Studio's Voices tab) lists one row per combination of the
  values the switches list, with the text as it reads for those values, then the plain id when a switch has `*=` (or
  when a clip is already filed under it). `{hero}` stays as written in that text.
- **The validator** warns when a voiced line (a clip under its id or one of its keyed ids) with switches lacks a clip
  for a listed value, per language: `voiced line with text switches lacks 1 of 2 clip(s) by value: grandma_saw~form=f
  (the plain id plays instead)`. A warning, not an error: a game can ship before every recording exists.
- **A line without switches** keeps one clip. `{hero}` alone is not a switch: a line that says the hero's name in a
  game with several heroes has one clip; write `{form?m=Max|f=Fay}` instead when it must be recorded per hero.
- **Files**: the keys are map keys only. The file each one names is written by hand (`'grandma_saw_f.mp3'`), and
  `npm run assets` and the player build paths from the file, never from the key, so `~` and `=` never reach a file name
  or an asset URL. Name the files as you like; letters, digits, `_` and `-` are safe everywhere.

The Studio's "Heroes × languages" view (4.4.0) shows, for each such line, the text each hero reads in each language,
the clip that plays and the keyed clip that is missing:
[Studio: voices and the heroes × languages matrix](studio.voices-matrix.md).

<a name="autoplay"></a>

## What the browser allows

Browsers refuse sound before the player's first gesture on the page. The engine waits for the first `pointerdown`,
`touchend` or `keydown`; choosing New game or Continue on the title screen is one, so the first room's lines can be
heard.

A line the game has **no** clip for shows for its reading time. A line that **has** a clip which cannot play ends as
soon as the clip gives up, without the reading time:

- before the first gesture;
- with the sounds off in the pause menu, or the voice volume at 0 in Settings;
- when the file fails to load or to play (missing from `public/assets/audio/voices/`, offline and not cached).

> [!LIMIT id=voiced-line-without-sound]
> In 4.4.0 a voiced line whose clip cannot play does not fall back to the reading time: the speech bubble closes at
> once ([`src/engine/dom/speech.ts`](../../src/engine/dom/speech.ts)). A player who turns the sounds off in a voiced
> game reads those lines only in a conversation's transcript and the screen reader's live region. Ship every clip you
> declare.

<a name="offline"></a>

## Offline

With `offline: 'full'` (the default in `game.ts`), once the current room and its neighbours are loaded the player
fetches every image and sound of the game in the background, in batches, the clips of **every** language included
(`voicesByLang`, and every keyed clip of a line). The pause menu shows the state ("Offline: complete", or a retry).
The background download is skipped on a "save data" or 2G connection. With `offline: 'nearby'`, only the current room
and its neighbours are cached, and a voice line of a room never visited needs the network: without it, the clip fails
and the line closes at once (see [What the browser allows](#autoplay)). More: [Install as an app](play.install-app.md).

<a name="what-you-get"></a>

## Producing the recordings

With the production table you get, per language, every clip the game needs, who speaks it, its text in that language,
its file and its status, kept in `games/<id>/voices.json` (`game/voices.json` in a created project), and a check of
every recorded file.

<a name="where-to-run"></a>

### Where to run the commands

- In the engine repository, at its root: `npm run voices -- …`, `npm run ids -- …` (the game is `GAME=<id>`, else the
  one `npm run game` chose, else `config.game` of `package.json`).
- In a created project, at its root: `npx quest-n-click voices …`, `npx quest-n-click ids …`.

`ffmpeg` (with `ffprobe`) is required for `check`: see [doctor](install.doctor.md).

<a name="steps"></a>

### Steps

<!-- step: give-ids -->
1. **Give every line a stable id.** Without one, a line is not listed.

   ```sh
   # in the engine repository
   npm run ids -- --lines --write
   ```

   ```sh
   # in the created project
   npx quest-n-click ids --lines --write
   ```

   Without `--write` it is a dry run. `--lines=all` first turns every plain string line into
   `{ say: ['hero', text], id }`, for a game that voices every line.

<!-- step: export -->
2. **Export the table for the actors**, per language (CSV, or `--json`):

   ```sh
   # in the engine repository
   npm run voices -- export --lang fr > voices-fr.csv
   ```

   `npm run voices -- status` gives the counts per language: the clips needed, their statuses (`draft`, `record`,
   `recorded`, `approved`), how many have a file, and the clips no line claims.

<!-- step: file-clips -->
3. **File the clips.** Put each file in the voice folder, and name it under its id (or key) in `audio.voices`, or in
   `audio.voicesByLang.<lang>` for a translation. Then encode them:

   ```sh
   # in the engine repository
   npm run assets
   ```

<!-- step: import -->
4. **Bring the statuses back**: the CSV (or JSON) the actors filled, with statuses, actors and notes.

   ```sh
   # in the engine repository
   npm run voices -- import voices-fr.csv --lang fr
   ```

   It refuses a row whose line the game does not have, or an unknown status, and writes nothing then.

<!-- step: check -->
5. **Check the files.**

   ```sh
   # in the engine repository
   npm run voices -- check
   ```

   It measures each encoded clip with ffmpeg: the codec (mp3, ogg vorbis or opus, aac, wav, flac), at least
   22 050 Hz, at least 300 ms and at most three times the line's reading time, loudness between −23 and −12 LUFS
   (speech is about −16), a peak below −1 dBFS. `--release` turns "approved without a clip" from a warning into an
   error; `npx quest-n-click release` runs `voices check --release`.

<a name="expected-result"></a>

### Expected result, and how to check it

`npm run voices -- check` ends with `✔  [<id>] voices: 0 error(s), …`; in the game, the line plays its clip and stays
on screen until the clip ends.

<a name="common-errors"></a>

### Common errors

| Symptom | Cause | Fix |
|---|---|---|
| A line is missing from the table | It has no stable id | `ids --lines --write` |
| `<id>: approved without a clip` | Approved in `voices.json`, no file in the map | File the clip, or change its status |
| `<id>: the clip cannot be read` | The file is not in `public/assets/audio/voices/` yet | `npm run assets`, then check again |
| `<id>: a clip no line claims` | A key no line of that language has (a renamed id, a dropped switch) | Rename the key, or remove it |
| `✖ no line "<id>" in the game` (import) | A row from another version of the game | Export the table again |
| A French player hears nothing | `voicesByLang.fr` exists but lacks that line | Record it (see [Per language](#per-language)) |
| Voiced lines flash by without sound | Sounds off, voice volume 0, or the clip file missing | Check the pause menu and Settings; `npm run assets` |

<a name="files-changed"></a>

### Files or data changed

`games/<id>/voices.json`, `games/<id>/audio/voice/`, `game.ts` (`audio.voices`, `audio.voicesByLang`), the sources
(`ids --write` adds ids), `public/assets/audio/voices/` and `assets.gen.json` (a translation's clips keyed
`<lang>:<id>`).

<a name="recovery"></a>

### Recovery or going back

`voices.json`, the maps and the sources are in Git: `git diff` shows what `ids --write` and `import` changed, and
`git checkout -- <file>` undoes it. `npm run voices -- status` and `export` write nothing.

<a name="references"></a>

## References

- [`src/engine/core/voice-key.ts`](../../src/engine/core/voice-key.ts), [`src/engine/tools/voices.ts`](../../src/engine/tools/voices.ts), [`tools/voices.ts`](../../tools/voices.ts), [`src/engine/tools/validate/voices.ts`](../../src/engine/tools/validate/voices.ts)
- [`src/engine/dom/audio.ts`](../../src/engine/dom/audio.ts) (the first gesture), [`src/engine/dom/offline.ts`](../../src/engine/dom/offline.ts)
- ADR 0022 (voices by value), [Translations](create.translations.md), [Heroes](create.heroes.md)
