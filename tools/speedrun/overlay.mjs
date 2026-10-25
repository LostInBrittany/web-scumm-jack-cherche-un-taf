#!/usr/bin/env node
// npm run speedrun:overlay -- [--port=7777] (4.1.14 "Time Attack", D23): a local page for an OBS Browser Source. The
// player's page posts its run's events here (open the game with `?speedrunTool=7777`); OBS shows
// http://127.0.0.1:7777/?mode=full (timer and splits), `compact` (the timer and the last split) or `transparent` (the
// same on no background). Server-Sent Events, 127.0.0.1 only, no secret: an event carries a category's name, split ids
// and names and times, nothing else (local.mjs). Node only: never on the Bridge, never in the PWA.
import { arg, cleanEvent, DEFAULT_ORIGINS, localServer, originsOf } from './local.mjs';

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>quest'n'click speedrun</title><style>
:root{--bg:rgba(10,10,20,.82);--fg:#f4f1e8;--ahead:#5bd96b;--behind:#f06a5f;--dim:#9a98a8}
body{margin:0;font:600 22px/1.25 system-ui,sans-serif;color:var(--fg);background:transparent}
.box{display:inline-block;min-width:260px;padding:.4em .7em;background:var(--bg);border-radius:8px}
body.transparent .box{background:transparent;text-shadow:0 0 4px #000}
.time{font:700 40px/1.1 ui-monospace,monospace;font-variant-numeric:tabular-nums}
.cat{font-size:14px;color:var(--dim)} ol{margin:.3em 0 0;padding:0;list-style:none}
li{display:flex;justify-content:space-between;gap:1em;font-size:16px} li.missed{color:var(--dim);text-decoration:line-through}
.ahead{color:var(--ahead)} .behind{color:var(--behind)} body.compact ol li:not(:last-child){display:none}
</style></head><body><div class="box"><div class="cat" id="cat">waiting for a run…</div><div class="time" id="time">0:00.000</div><ol id="splits"></ol></div>
<script>
const mode=new URLSearchParams(location.search).get('mode')||'full';document.body.className=mode;
const $=(id)=>document.getElementById(id);const fmt=(ms)=>{if(ms==null)return'—';const m=Math.floor(ms/60000),s=Math.floor(ms%60000/1000),f=String(Math.floor(ms%1000)).padStart(3,'0');return m+':'+String(s).padStart(2,'0')+'.'+f};
let st={splits:[],done:{},timing:'igt',t:0,at:0,running:false};
function show(){$('time').textContent=fmt(st.running&&st.timing==='rta'?st.t+(performance.now()-st.at):st.t);const ol=$('splits');ol.textContent='';
for(const s of st.splits){const d=st.done[s.id];const li=document.createElement('li');if(d&&d.missed)li.className='missed';
const n=document.createElement('span');n.textContent=s.name||s.id;const v=document.createElement('span');
if(d&&!d.missed){v.textContent=fmt(d.t)+(d.delta!=null?' '+(d.delta>0?'+':'−')+(Math.abs(d.delta)/1000).toFixed(2):'');if(d.delta!=null)v.className=d.delta>0?'behind':'ahead'}
li.append(n,v);ol.append(li)}}
const es=new EventSource('/events');es.onmessage=(m)=>{const e=JSON.parse(m.data);
if(e.category)$('cat').textContent=e.category;if(e.timing)st.timing=e.timing;if(e.splits)st.splits=e.splits;
const t=st.timing==='rta'?e.rtaMs:e.igtMs;if(t!=null){st.t=t;st.at=performance.now()}
if(e.kind==='start'||e.kind==='reset'){st.done={};st.running=e.kind==='start'}
if(e.kind==='split'&&e.split)st.done[e.split.id]={t:st.t,delta:e.deltaMs};if(e.kind==='missed'&&e.split)st.done[e.split.id]={missed:true};
if(e.kind==='finish')st.running=false;if(e.kind==='pause')st.running=false;if(e.kind==='resume')st.running=true;show()};
setInterval(()=>{if(st.running&&st.timing==='rta')show()},50);show();
</script></body></html>`;

/** Starts the overlay: returns the server (tests close it) and how many viewers are connected. */
export async function startOverlay(port = 7777, origins = DEFAULT_ORIGINS) {
  const viewers = new Set();
  const state = { last: null, splits: null, category: null };
  const send = (e) => {
    const line = `data: ${JSON.stringify(e)}\n\n`;
    for (const v of viewers) v.write(line);
  };
  const server = await localServer({
    port,
    origins,
    onEvent: (e) => {
      if (e.splits) state.splits = e.splits;
      if (e.category) state.category = e.category;
      state.last = e;
      send(e);
    },
    route: (req, res, path) => {
      if (req.method === 'GET' && path === '/') {
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'content-security-policy':
            "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
        });
        res.end(PAGE);
        return true;
      }
      if (req.method === 'GET' && path === '/events') {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-store',
          connection: 'keep-alive',
        });
        res.write(": quest'n'click speedrun overlay\n\n");
        // A viewer that connects mid-run gets the split list and the last event.
        if (state.splits || state.category)
          res.write(
            `data: ${JSON.stringify(cleanEvent({ kind: 'tick', splits: state.splits ?? [], category: state.category ?? undefined }))}\n\n`,
          );
        if (state.last) res.write(`data: ${JSON.stringify(state.last)}\n\n`);
        viewers.add(res);
        req.on('close', () => viewers.delete(res));
        return true;
      }
      return false;
    },
  });
  return { server, viewers };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(arg(process.argv, 'port') ?? 7777);
  const { server } = await startOverlay(port, originsOf(process.argv));
  const at = server.address();
  console.log(
    `Overlay: http://127.0.0.1:${at.port}/?mode=full (compact, transparent) · open the game with ?speedrunTool=${at.port}`,
  );
}
