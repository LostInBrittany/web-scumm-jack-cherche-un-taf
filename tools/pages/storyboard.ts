// npm run page:storyboard [-- --out <dir|file.html>] [--md]
// Renders games/<id>/storyboard.json as a phone-friendly page with a notes box under every panel (artifact db
// collection `notes`, doc id = panel id) and Claude's rewrites (collection `rewrites`). Schema: storyboard-schema.md.
// --md also writes games/<id>/storyboard.md, the plain-text version sub-agents read.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GameDef } from '../../src/engine/core/types';
import {
  normalizeStoryboard,
  storyboardMarkdown,
  storyboardProblems,
  type SbBoard,
  type SbLine,
  type Storyboard,
} from './storyboard-data';
import {
  charImageId,
  cliArgs,
  docId,
  esc,
  imageSource,
  isMain,
  jsonForScript,
  loadContext,
  outPath,
  pageShell,
  persistBar,
  thumbs,
  writePage,
  type PageContext,
} from './lib';
import { writeGame } from '../game-write';

// ---------------------------------------------------------------------------
// Schema, normalisation and Markdown export: storyboard-data.ts (pure, shared with the Studio)
// ---------------------------------------------------------------------------

export type { SbBoard, SbLine, SbPanel, SbReaction, SbTopic, Storyboard } from './storyboard-data';
export { normalizeStoryboard, storyboardMarkdown } from './storyboard-data';

/** Reads and normalises games/<id>/storyboard.json (see normalizeStoryboard). */
export function readStoryboard(gameDir: string): Storyboard {
  const file = join(gameDir, 'storyboard.json');
  if (!existsSync(file)) throw new Error(`no storyboard: ${file}`);
  const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
  const problems = storyboardProblems(raw);
  if (problems.length) throw new Error(`${file}: ${problems.join('; ')}`);
  return normalizeStoryboard(raw);
}

// ---------------------------------------------------------------------------
// Speakers
// ---------------------------------------------------------------------------

interface Speaker {
  name: string;
  color: string;
  img?: string;
}

function speaker(game: GameDef, who: string): Speaker {
  const id = who === 'hero' ? game.hero : who;
  const c = game.characters[id];
  return c ? { name: c.name, color: c.color, img: charImageId(c) } : { name: who, color: '#bbbbbb' };
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

const CSS = `
main { max-width: 1080px; margin: 0 auto; padding: 20px 16px 60px; display: flex; flex-direction: column; gap: 22px; }
header.top { display: flex; flex-direction: column; gap: 8px; }
.kicker { font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: var(--accent); }
h1 { font-size: 26px; line-height: 1.2; text-wrap: balance; }
.lede { color: var(--dim); max-width: 70ch; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chips a { color: var(--ink); text-decoration: none; background: var(--panel2); border: 1px solid var(--line); border-radius: 999px; padding: 4px 12px 4px 4px; font-size: 13px; display: inline-flex; gap: 6px; align-items: center; }
.chips a span { background: var(--accent); color: var(--accent-ink); border-radius: 999px; min-width: 22px; height: 22px; display: inline-grid; place-items: center; font-weight: 700; font-size: 12px; }
.board { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 14px; scroll-margin-top: 10px; }
.bh { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 300px); gap: 14px; align-items: start; }
.bh h2 { font-size: 20px; text-wrap: balance; }
.bnum { color: var(--accent); font-weight: 800; margin-right: 6px; }
.room { color: var(--dim); font-size: 13px; }
.goal { font-size: 14.5px; margin-top: 6px; }
.label { color: var(--accent); font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; margin-right: 6px; font-weight: 700; }
.decor { width: 100%; height: auto; aspect-ratio: 8 / 5; object-fit: cover; border-radius: 8px; display: block; background: var(--panel2); }
.nodecor { width: 100%; aspect-ratio: 8 / 5; border-radius: 8px; border: 1px dashed var(--line); display: grid; place-items: center; color: var(--dim); font-size: 13px; }
.arrival { background: var(--panel2); border-left: 3px solid var(--accent); border-radius: 6px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
ol.strip { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 330px), 1fr)); gap: 12px; }
.panel { background: var(--bg); border: 1px solid var(--line); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.panel h3 { font-size: 15px; display: flex; gap: 8px; align-items: baseline; }
.pid { font: 600 11px ui-monospace, Menlo, monospace; color: var(--dim); background: var(--panel2); border-radius: 4px; padding: 1px 6px; }
.line { display: flex; gap: 9px; align-items: flex-start; }
.av { width: 36px; height: 36px; border-radius: 50%; flex: none; object-fit: contain; background: var(--panel2); display: grid; place-items: center; font-weight: 700; font-size: 14px; }
.line p { font-size: 14.5px; min-width: 0; overflow-wrap: anywhere; }
.line b, .who { display: flex; align-items: center; gap: 5px; font-size: 12px; letter-spacing: .3px; color: var(--ink); }
.dot { width: 9px; height: 9px; border-radius: 50%; flex: none; box-shadow: 0 0 0 1px var(--line); }
.who { display: inline-flex; }
.act { font-size: 14px; color: var(--ink); background: var(--panel2); border-radius: 6px; padding: 4px 8px; }
.act::before { content: "▸ "; color: var(--accent); }
.dir { font-size: 13.5px; color: var(--dim); font-style: italic; }
.sfx { display: flex; flex-wrap: wrap; gap: 6px; }
.sfx button, .sfx span { font-size: 12px; border-radius: 999px; padding: 2px 10px; border: 1px solid var(--line); background: var(--panel2); min-height: 28px; display: inline-flex; align-items: center; gap: 4px; }
.sfx button.on { border-color: var(--accent); }
.side { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 12px; }
.box { background: var(--panel2); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.box ol, .box ul { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
.topic { font-size: 14px; color: var(--accent); }
.answer { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
.answer label { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: var(--dim); }
.answer textarea { width: 100%; resize: vertical; min-height: 44px; font-size: 14px; }
.rewrite { background: color-mix(in srgb, var(--ok) 12%, var(--panel)); border: 1px solid color-mix(in srgb, var(--ok) 40%, var(--line)); border-radius: 6px; padding: 8px 10px; font-size: 14px; white-space: pre-wrap; }
.rewrite b { display: block; color: var(--ok); font-size: 11px; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 2px; }
@media (max-width: 640px) { .bh { grid-template-columns: 1fr; } h1 { font-size: 22px; } }
`;

const SCRIPT = String.raw`
(function () {
  var boxes = {};
  document.querySelectorAll('.answer').forEach(function (b) { boxes[b.dataset.key] = b; });
  var timers = {};
  function save(box) {
    var ta = box.querySelector('textarea');
    if (box.dataset.saved === ta.value) return;
    box.dataset.saved = ta.value;
    PS.save('notes', box.dataset.key, { text: ta.value }, box.querySelector('.state'));
  }
  Object.keys(boxes).forEach(function (k) {
    var box = boxes[k], ta = box.querySelector('textarea');
    ta.addEventListener('input', function () { clearTimeout(timers[k]); timers[k] = setTimeout(function () { save(box); }, 1000); });
    ta.addEventListener('blur', function () { clearTimeout(timers[k]); save(box); });
  });
  PS.start({ page: PAGE_KEY, collections: ['notes', 'rewrites'], onDoc: function (col, id, v) {
    if (col === 'notes') {
      var box = boxes[id]; if (!box) return;
      var ta = box.querySelector('textarea'), text = v.text || '';
      box.dataset.saved = text;
      if (document.activeElement !== ta && ta.value !== text) ta.value = text;
    } else if (col === 'rewrites') {
      var el = document.querySelector('[data-rewrite="' + id + '"]'); if (!el) return;
      el.hidden = !v.text; el.textContent = '';
      var b = document.createElement('b'); b.textContent = 'Claude rewrite'; el.append(b, document.createTextNode(v.text || ''));
    }
  } });
  document.getElementById('ps-export').addEventListener('click', function () {
    var all = PS.all();
    PS.exportJson(PAGE_KEY.replace(/[^a-z0-9-]+/gi, '-') + '.json', { page: 'storyboard', game: GAME_ID, exportedAt: new Date().toISOString(), notes: all.notes || {} });
  });
  // Sound buttons: one at a time.
  var cur = null;
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button[data-snd]'); if (!b) return;
    if (cur) { cur.a.pause(); cur.b.classList.remove('on'); if (cur.b === b) { cur = null; return; } }
    var a = new Audio(SOUNDS[b.dataset.snd]); a.play().catch(function () {});
    b.classList.add('on'); cur = { a: a, b: b }; a.onended = function () { b.classList.remove('on'); cur = null; };
  });
})();
`;

/** Embeds sound files up to this total; beyond, sfx chips are shown without playback. */
const SOUND_BUDGET = 4 * 1024 * 1024;

export function buildStoryboard(ctx: PageContext, sb: Storyboard): string {
  const g = ctx.game;
  // Images: one decor per board, one avatar per speaker.
  const decorFiles = new Map<string, string>();
  for (const b of sb.boards) {
    const room = g.rooms.find((r) => r.id === b.room);
    const f = room && imageSource(ctx.gameDir, room.decor);
    if (f) decorFiles.set(b.id, f);
  }
  const speakers = new Set<string>(['hero']);
  const allLines = (b: SbBoard) => [
    ...(b.arrival ?? []),
    ...b.panels.flatMap((p) => p.lines ?? []),
    ...Object.values(b.talks ?? {})
      .flat()
      .flatMap((t) => t.lines ?? []),
    ...(b.reactions ?? []).flatMap((r) => r.lines ?? []),
  ];
  sb.boards.forEach((b) => {
    allLines(b).forEach((l) => speakers.add(l.who));
    Object.keys(b.talks ?? {}).forEach((k) => speakers.add(k));
  });
  if (g.hintVoice) speakers.add(g.hintVoice);
  const avatarFile = new Map<string, string>();
  for (const w of speakers) {
    const id = speaker(g, w).img;
    const f = id && imageSource(ctx.gameDir, id);
    if (f) avatarFile.set(w, f);
  }
  const decorT = thumbs([...decorFiles.values()], 640);
  const avT = thumbs([...avatarFile.values()], 96, { trim: true });

  // Sounds referenced by panels (ids of game.audio.sfx), embedded while under budget.
  const sounds: Record<string, string> = {};
  let budget = SOUND_BUDGET;
  for (const id of new Set(sb.boards.flatMap((b) => b.panels.flatMap((p) => p.sfx ?? [])))) {
    const file = g.audio?.sfx?.[id];
    const path =
      file &&
      [join(ctx.gameDir, 'audio/sfx', file), join(ctx.gameDir, '..', '..', 'public/assets/audio/sfx', file)].find(
        existsSync,
      );
    if (!path) continue;
    const buf = readFileSync(path);
    if (buf.length > budget) continue;
    budget -= buf.length;
    const ext = file.split('.').pop()!.toLowerCase();
    sounds[id] = `data:audio/${ext === 'mp3' ? 'mpeg' : ext};base64,${buf.toString('base64')}`;
  }

  const avatar = (w: string, size = 36) => {
    const s = speaker(g, w);
    const t = avatarFile.has(w) ? avT.get(avatarFile.get(w)!) : undefined;
    return t
      ? `<img class="av" src="${t.uri}" alt="" width="${size}" height="${size}">`
      : `<span class="av" style="border:2px solid ${esc(s.color)}" aria-hidden="true">${esc(s.name.slice(0, 1).toUpperCase())}</span>`;
  };
  const dot = (c: string) => `<i class="dot" style="background:${esc(c)}"></i>`;
  const line = (l: SbLine) => {
    if (l.who === 'action') return `<p class="act">${esc(l.text)}</p>`;
    if (l.who === 'stage') return `<p class="dir">${esc(l.text)}</p>`;
    const s = speaker(g, l.who);
    return `<div class="line">${avatar(l.who)}<p><b>${dot(s.color)}${esc(s.name)}</b>${esc(l.text)}</p></div>`;
  };
  const notes = (key: string, label = 'Your notes') => {
    const k = docId(key);
    return (
      `<div class="answer" data-key="${esc(k)}"><label for="n-${esc(k)}">${esc(label)}</label>` +
      `<textarea id="n-${esc(k)}" rows="2" placeholder="Rewrite a line, add an idea, cut what does not work…"></textarea>` +
      `<span class="state"></span></div><div class="rewrite" data-rewrite="${esc(k)}" hidden></div>`
    );
  };
  const sfx = (ids?: string[]) =>
    ids?.length
      ? `<div class="sfx">${ids
          .map((id) =>
            sounds[id]
              ? `<button type="button" data-snd="${esc(id)}">▶ ${esc(id)}</button>`
              : `<span>♪ ${esc(id)}</span>`,
          )
          .join('')}</div>`
      : '';

  const nav = sb.boards
    .map((b, i) => `<a href="#b-${esc(docId(b.id))}"><span>${i + 1}</span>${esc(b.title)}</a>`)
    .join('');
  const boards = sb.boards
    .map((b, i) => {
      const room = g.rooms.find((r) => r.id === b.room);
      const d = decorFiles.has(b.id) ? decorT.get(decorFiles.get(b.id)!) : undefined;
      const pic = d
        ? `<img class="decor" src="${d.uri}" alt="${esc(room?.name ?? '')}" loading="lazy" width="640" height="400">`
        : `<div class="nodecor">${b.room ? `no decor image for ${esc(b.room)}` : 'no room'}</div>`;
      const parts = [
        `<section class="board" id="b-${esc(docId(b.id))}">`,
        `<div class="bh"><div><h2><span class="bnum">${i + 1}</span>${esc(b.title)}</h2>` +
          `<p class="room">${b.room ? `Room: ${esc(room?.name ?? '(unknown room)')} · <code>${esc(b.room)}</code>` : 'No room'}${b.music ? ` · ♪ ${esc(b.music)}` : ''}</p>` +
          (b.goal ? `<p class="goal"><span class="label">Goal</span>${esc(b.goal)}</p>` : '') +
          `</div>${pic}</div>`,
      ];
      if (b.arrival?.length)
        parts.push(`<div class="arrival"><span class="label">On arrival</span>${b.arrival.map(line).join('')}</div>`);
      parts.push(
        '<ol class="strip">' +
          b.panels
            .map(
              (p, k) =>
                `<li class="panel" id="p-${esc(docId(p.id))}">` +
                `<h3><span class="pid">${i + 1}.${k + 1}</span>${esc(p.title)}</h3>` +
                (p.action ? `<p class="act">${esc(p.action)}</p>` : '') +
                sfx(p.sfx) +
                (p.lines ?? []).map(line).join('') +
                notes(p.id) +
                '</li>',
            )
            .join('') +
          '</ol>',
      );
      const side: string[] = [];
      for (const [c, ts] of Object.entries(b.talks ?? {})) {
        const s = speaker(g, c);
        side.push(
          `<div class="box"><span class="label">Talk to <span class="who">${dot(s.color)}${esc(s.name)}</span></span><ul>` +
            ts
              .map((t) => `<li><p class="topic">“${esc(t.topic)}”</p>${(t.lines ?? []).map(line).join('')}</li>`)
              .join('') +
            '</ul>' +
            notes(`${b.id}__talk__${c}`, 'Notes on this conversation') +
            '</div>',
        );
      }
      if (b.reactions?.length)
        side.push(
          '<div class="box"><span class="label">Optional reactions</span><ul>' +
            b.reactions
              .map((r) => `<li><p class="act">${esc(r.action)}</p>${(r.lines ?? []).map(line).join('')}</li>`)
              .join('') +
            '</ul>' +
            notes(`${b.id}__reactions`, 'Notes on the reactions') +
            '</div>',
        );
      if (b.hints?.length) {
        const hv = g.hintVoice ? speaker(g, g.hintVoice) : undefined;
        side.push(
          `<div class="box"><span class="label">Hints${hv ? ` · ${esc(hv.name)}` : ''}, vague to precise</span><ol>` +
            b.hints.map((h) => `<li>${esc(h)}</li>`).join('') +
            '</ol>' +
            notes(`${b.id}__hints`, 'Notes on the hints') +
            '</div>',
        );
      }
      if (side.length) parts.push(`<div class="side">${side.join('')}</div>`);
      if (b.exit) parts.push(`<p class="goal"><span class="label">Exit</span>${esc(b.exit)}</p>`);
      parts.push('</section>');
      return parts.join('');
    })
    .join('\n');

  const title = sb.title ?? g.title;
  const body = `<main>
<header class="top">
  <p class="kicker">Storyboard · ${esc(ctx.gameId)}</p>
  <h1>${esc(title)}</h1>
  <p class="lede">${esc(sb.intro ?? 'The whole story, board by board. Write your notes under any panel: they are saved as you type, and the rewrites show up in green.')}</p>
  ${persistBar()}
  <nav class="chips">${nav}</nav>
  ${notes('general', 'General notes: tone, rhythm, characters')}
</header>
${boards}
</main>`;
  const script = `var PAGE_KEY = ${jsonForScript(`storyboard:${ctx.gameId}`)}; var GAME_ID = ${jsonForScript(ctx.gameId)}; var SOUNDS = ${jsonForScript(sounds)};\n${SCRIPT}`;
  return pageShell({
    title: `${title} storyboard`.slice(0, 60),
    description: `Storyboard of ${title} with notes per panel.`,
    css: CSS,
    body,
    script,
  });
}

if (isMain(import.meta.url)) {
  const { flags, out } = cliArgs();
  const ctx = await loadContext();
  let sb: Storyboard;
  try {
    sb = readStoryboard(ctx.gameDir);
  } catch (e) {
    console.error(String((e as Error).message ?? e));
    process.exit(1);
  }
  writePage(outPath(out, 'storyboard.html'), buildStoryboard(ctx, sb));
  if (flags.has('--md')) {
    const f = join(ctx.gameDir, 'storyboard.md');
    await writeGame('storyboard.md', [{ file: f, text: storyboardMarkdown(ctx, sb) }], { gameDir: ctx.gameDir });
    console.log(f);
  }
  console.log(`${sb.boards.length} board(s), ${sb.boards.reduce((n, b) => n + b.panels.length, 0)} panel(s)`);
}
