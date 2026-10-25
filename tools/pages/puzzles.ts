// npm run page:puzzles [-- --out <dir|file.html>]
// The puzzle graph as a page: what every rule, topic, script and listener needs and changes, a card per item / flag /
// prop (tap a node), the issues (read but never set, produced but never used), plus the DOT source. Read-only.
import {
  extraReads,
  liveClasses,
  puzzleGraph,
  puzzleIssues,
  puzzleMarkdown,
  STATE_KINDS,
  toPuzzleDot,
  toPuzzleSvg,
} from '../../src/engine/tools/puzzle';
import { cliArgs, esc, isMain, loadContext, outPath, pageShell, writePage, type PageContext } from './lib';

const CSS = `
main { max-width: 1200px; margin: 0 auto; padding: 20px 16px 60px; display: flex; flex-direction: column; gap: 16px; }
.kicker { font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: var(--accent); }
h1 { font-size: 26px; line-height: 1.2; }
.graph { overflow: auto; background: #fff; border-radius: 10px; padding: 10px; border: 1px solid #ddd; }
.graph svg { max-width: none; }
.warn { background: #fff3e0; border-left: 4px solid #e8a33d; padding: 8px 12px; border-radius: 6px; }
.card { background: #fff; border: 1px solid #ddd; border-radius: 10px; padding: 12px; white-space: pre-wrap; font-size: 14px; min-height: 3em; }
pre { background: #111; color: #eee; padding: 12px; border-radius: 8px; overflow: auto; font-size: 12px; }
`;

export function buildPuzzles(ctx: PageContext): string {
  const g = puzzleGraph(ctx.game, { commands: ctx.mod.commands });
  const issues = puzzleIssues(g);
  const extra = extraReads(ctx.game);
  const classes = Object.fromEntries(liveClasses(g, extra));
  const cards: Record<string, string> = {};
  for (const n of g.nodes) if (STATE_KINDS.has(n.kind)) cards[n.id] = puzzleMarkdown(g, n.id, { extra });
  const body = `<main>
<div class="kicker">${esc(ctx.game.title)}</div>
<h1>The puzzles: ${g.nodes.filter((n) => !STATE_KINDS.has(n.kind)).length} actions, ${g.nodes.filter((n) => STATE_KINDS.has(n.kind)).length} things</h1>
${issues.orphans.length ? `<p class="warn">Read but never produced: <b>${esc(issues.orphans.map((n) => `${n.kind} ${n.label}`).join(', '))}</b></p>` : ''}
${issues.deadEnds.length ? `<p class="warn">Produced but never used: ${esc(issues.deadEnds.map((n) => `${n.kind} ${n.label}`).join(', '))}</p>` : ''}
${issues.selfLocked.length ? `<p class="warn">Set only by actions that already need it: <b>${esc(issues.selfLocked.map((n) => n.label).join(', '))}</b></p>` : ''}
<p>Tap an item, flag, prop, place or event for its card. Coloured: things; white: actions (rules, topics, scripts, listeners, goals). Grey arrows: needed; dotted: read inside the commands; green: produced; red dashed: consumed.
<label><input type="checkbox" id="focus"> Critical path only (what leads to the end, a goal or an invariant: ${Object.values(classes).filter((c) => c === 'critical').length} nodes)</label></p>
<div class="graph" id="graph">${toPuzzleSvg(g)}</div>
<div class="card" id="card">Tap a node.</div>
<h2>Overview</h2>
<pre>${esc(puzzleMarkdown(g))}</pre>
<h2>DOT (Graphviz)</h2>
<pre>${esc(toPuzzleDot(g))}</pre>
</main>`;
  const script = `const cards = ${JSON.stringify(cards)};
const classes = ${JSON.stringify(classes)};
document.getElementById('focus').addEventListener('change', (ev) => {
  const on = ev.target.checked;
  for (const g of document.querySelectorAll('#graph g[data-node]')) g.style.opacity = on && classes[g.dataset.node] !== 'critical' ? '0.22' : '';
  for (const p of document.querySelectorAll('#graph path[marker-end]')) p.style.opacity = on ? '0.35' : '';
});
document.getElementById('graph').addEventListener('click', (ev) => {
  const g = ev.target.closest('[data-node]'); if (!g) return;
  const id = g.getAttribute('data-node');
  document.getElementById('card').textContent = cards[id] || id;
});`;
  return pageShell({
    title: `${ctx.game.title} — puzzles`,
    description: 'What every rule needs and changes',
    css: CSS,
    body,
    script,
  });
}

if (isMain(import.meta.url)) {
  const args = cliArgs();
  const ctx = await loadContext();
  const file = outPath(args.out, 'puzzles.html');
  writePage(file, buildPuzzles(ctx));
  console.log(`puzzles page: ${file}`);
}
