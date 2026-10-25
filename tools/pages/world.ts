// npm run page:world [-- --out <dir|file.html>]
// The map of the world as a page: rooms, the ways between them (declared exits solid, gotos dashed, map places marked),
// unreachable rooms and exits with no way back, plus the DOT source to paste into Graphviz. Read-only: nothing to
// annotate, so it needs no artifact db; it is the picture to look at before adding rooms.
import { toDot, toSvg, worldGraph } from '../../src/engine/tools/graph';
import { cliArgs, esc, isMain, loadContext, outPath, pageShell, writePage, type PageContext } from './lib';

const CSS = `
main { max-width: 1100px; margin: 0 auto; padding: 20px 16px 60px; display: flex; flex-direction: column; gap: 16px; }
.kicker { font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: var(--accent); }
h1 { font-size: 26px; line-height: 1.2; }
.graph { overflow: auto; background: #fff; border-radius: 10px; padding: 10px; border: 1px solid #ddd; }
.graph svg { max-width: none; }
.warn { background: #fff3e0; border-left: 4px solid #e8a33d; padding: 8px 12px; border-radius: 6px; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
td, th { border-bottom: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
pre { background: #111; color: #eee; padding: 12px; border-radius: 8px; overflow: auto; font-size: 12px; }
`;

export function buildWorld(ctx: PageContext): string {
  const g = worldGraph(ctx.game);
  const rows = g.edges
    .filter((e) => e.kind !== 'map')
    .map(
      (e) =>
        `<tr><td>${esc(e.from)}</td><td>→ ${esc(e.to)}</td><td>${esc(e.kind)}</td><td>${esc(e.via)}${e.oneWay ? ' (one way)' : ''}</td></tr>`,
    )
    .join('\n');
  const places = [...new Set(g.edges.filter((e) => e.kind === 'map').map((e) => `${e.via} → ${e.to}`))];
  const body = `<main>
<div class="kicker">${esc(ctx.game.title)}</div>
<h1>The world: ${g.rooms.length} rooms</h1>
${g.unreachable.length ? `<p class="warn">Unreachable from the start: <b>${esc(g.unreachable.join(', '))}</b></p>` : ''}
${g.oneWay.length ? `<p class="warn">No way back: ${g.oneWay.map((e) => `<b>${esc(e.from)} → ${esc(e.to)}</b> (${esc(e.via)})`).join(', ')} — add <code>oneWay: true</code> if intended.</p>` : ''}
<div class="graph">${toSvg(g)}</div>
<p>Solid arrows: declared exits. Dashed: <code>goto</code> commands in rules, topics, scripts or events. ◎: on the map${places.length ? ` (${esc(places.join(', '))})` : ''}. Bold frame: the start room.</p>
<table><thead><tr><th>From</th><th>To</th><th>Kind</th><th>Via</th></tr></thead><tbody>${rows}</tbody></table>
<h2>DOT (Graphviz)</h2>
<pre>${esc(toDot(g))}</pre>
</main>`;
  return pageShell({
    title: `${ctx.game.title} — world`,
    description: 'The rooms and the ways between them',
    css: CSS,
    body,
    script: '',
  });
}

if (isMain(import.meta.url)) {
  const args = cliArgs();
  const ctx = await loadContext();
  const file = outPath(args.out, 'world.html');
  writePage(file, buildWorld(ctx));
  console.log(`world page: ${file}`);
}
