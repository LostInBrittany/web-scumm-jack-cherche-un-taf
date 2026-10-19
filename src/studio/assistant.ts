// The Assistant: a drawer on the right of the Studio where the author asks any chat model (OpenAI, Anthropic, Ollama,
// Mistral, any OpenAI-compatible endpoint) to help complete the game, with the same tools as the MCP server, about what
// is selected. On the dev server the conversation goes through the relay (POST /__studio/api/assistant/chat, server-sent
// events; tools/studio/assistant.ts); in demo mode the page runs the same loop itself (tools/studio/assistant-loop.ts)
// against the browser backend. Without a key, "Send as a task" writes a note for an MCP-connected agent.
// The key stays in this tab's sessionStorage and is sent with each request; the Studio never writes it to disk.
import agentsMd from '../../AGENTS.md?raw';
import type {
  AssistantContext,
  AssistantEvent,
  ChatTurn,
  Provider,
  ProviderKind,
} from '../../tools/studio/assistant-loop';
import type { DocName, ToolBackend } from '../../tools/studio/tools';
import { api, studioFetch, type GameInfo } from './api';
import type { BrowserApi } from './api-browser';
import { h, select, toast } from './ui';
import { must } from '../engine/core/must';

type PresetId = 'openai' | 'anthropic' | 'ollama' | 'mistral' | 'custom';
interface Preset {
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  models: string[];
}
const PRESETS: Record<PresetId, Preset> = {
  openai: {
    label: 'OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com',
    models: ['gpt-5', 'gpt-5-mini', 'gpt-4.1'],
  },
  anthropic: {
    label: 'Anthropic',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5'],
  },
  ollama: {
    label: 'Ollama (local)',
    kind: 'ollama',
    baseUrl: 'http://localhost:11434',
    models: ['llama3.1', 'qwen3', 'mistral-small'],
  },
  mistral: {
    label: 'Mistral',
    kind: 'openai',
    baseUrl: 'https://api.mistral.ai',
    models: ['mistral-large-latest', 'mistral-small-latest'],
  },
  custom: { label: 'Custom', kind: 'openai', baseUrl: '', models: [] },
};
const KIND_LABEL: [ProviderKind, string][] = [
  ['openai', 'OpenAI-compatible'],
  ['anthropic', 'Anthropic'],
  ['ollama', 'Ollama'],
];

interface Settings {
  preset: PresetId;
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  apiKey: string;
}
const STORE = 'web-scumm.studio-assistant';
const SESSION_KEY = `${STORE}.apiKey`;
const DEFAULTS: Settings = {
  preset: 'anthropic',
  kind: 'anthropic',
  baseUrl: PRESETS.anthropic.baseUrl,
  model: 'claude-sonnet-5',
  apiKey: '',
};

function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? '{}');
    delete saved.apiKey;
    return { ...DEFAULTS, ...saved, apiKey: sessionStorage.getItem(SESSION_KEY) ?? '' };
  } catch {
    return { ...DEFAULTS };
  }
}
function saveSettings(s: Settings) {
  try {
    const { apiKey: _secret, ...safe } = s;
    localStorage.setItem(STORE, JSON.stringify(safe));
  } catch {
    /* private mode: this page only */
  }
  try {
    if (s.apiKey) sessionStorage.setItem(SESSION_KEY, s.apiKey);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* keep in memory */
  }
}

/** What the Studio tells the Assistant. */
export interface AssistantCtx {
  info: GameInfo;
  /** The demo backend (no relay: the loop runs in the page), or null on the dev server. */
  demo: BrowserApi | null;
  /** The current selection: tab, room + entity, or storyboard panel. */
  selection(): {
    tab: string;
    room?: string;
    entity?: { kind: 'prop' | 'hotspot' | 'actor'; id: string; name?: string };
    panel?: { id: string; title?: string; board?: string; data?: unknown };
  };
  /** After a turn that wrote: refresh the tabs (the names of the writing tools that ran). */
  refresh(wrote: string[]): void;
}

// ------------------------------------------------------------------------------------------- markdown-lite

/** Paragraphs, fenced code, lists, headings, `code` and **bold**: built as DOM nodes (never innerHTML). */
function renderMarkdown(src: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const inline = (s: string): (Node | string)[] =>
    s
      .split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/)
      .filter(Boolean)
      .map((p) =>
        p.startsWith('`') && p.endsWith('`') && p.length > 1
          ? h('code', null, p.slice(1, -1))
          : p.startsWith('**') && p.endsWith('**') && p.length > 3
            ? h('b', null, p.slice(2, -2))
            : p,
      );
  const lines = src.split('\n');
  let para: string[] = [];
  let list: HTMLElement | null = null;
  const flush = () => {
    if (para.length) {
      const p = h('p');
      para.forEach((l, i) => {
        if (i) p.append(h('br'));
        p.append(...inline(l));
      });
      frag.append(p);
      para = [];
    }
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const l = must(lines[i], 'markdown line');
    const fence = /^\s*```(\S*)/.exec(l);
    if (fence) {
      flush();
      const body: string[] = [];
      for (i++; i < lines.length && !/^\s*```/.test(must(lines[i], 'markdown line')); i++)
        body.push(must(lines[i], 'markdown line'));
      frag.append(h('pre', null, h('code', null, body.join('\n'))));
      continue;
    }
    const ul = /^\s*[-*•]\s+(.*)$/.exec(l);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(l);
    if (ul || ol) {
      if (para.length) flush();
      const tag = ul ? 'UL' : 'OL';
      if (!list || list.tagName !== tag) {
        list = h(ul ? 'ul' : 'ol');
        frag.append(list);
      }
      list.append(h('li', null, ...inline(must((ul ?? ol)![1], 'list item text'))));
      continue;
    }
    const hd = /^\s*#{1,6}\s+(.*)$/.exec(l);
    if (hd) {
      flush();
      frag.append(h('h4', null, ...inline(must(hd[1], 'heading text'))));

      continue;
    }
    if (!l.trim()) {
      flush();
      continue;
    }
    if (list) list = null;
    para.push(l);
  }
  flush();
  return frag;
}

// ------------------------------------------------------------------------------------------- the panel

export class AssistantPanel {
  readonly el = h('aside', { class: 'assistant', 'aria-label': 'Assistant', hidden: true });
  private s = loadSettings();
  private turns: ChatTurn[] = [];
  private log = h('div', { class: 'alog', role: 'log', 'aria-live': 'polite' });
  private about = h('div', { class: 'aabout' });
  private input = h('textarea', {
    rows: 3,
    placeholder: 'Ask the Assistant… (Enter sends, Shift+Enter: new line)',
    'aria-label': 'Message',
  });
  private sendBtn = h('button', { class: 'primary', onclick: () => void this.send() }, 'Send');
  private stopBtn = h('button', { class: 'danger', hidden: true, onclick: () => this.stop() }, 'Stop');
  private taskBox = h('div', { class: 'atask', hidden: true });
  private settingsEl = h('div', { class: 'asettings', hidden: true });
  private providerLine = h('span', { class: 'muted small aprov' });
  private quick = h('div', { class: 'aquick' });
  private abort: AbortController | null = null;

  constructor(private ctx: AssistantCtx) {
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        void this.send();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        this.toggle(false);
      }
    });
    this.el.append(
      h(
        'header',
        { class: 'ahead' },
        h('h2', null, 'Assistant'),
        this.providerLine,
        h(
          'button',
          {
            class: 'icon gear',
            title: 'Settings: provider, model, key',
            'aria-label': 'Settings',
            onclick: () => this.toggleSettings(),
          },
          '⚙',
        ),
        h('button', { title: 'Start a new conversation', onclick: () => this.newChat() }, 'New chat'),
        h(
          'button',
          { class: 'icon', title: 'Close (Esc)', 'aria-label': 'Close', onclick: () => this.toggle(false) },
          '✕',
        ),
      ),
      this.settingsEl,
      this.log,
      h(
        'div',
        { class: 'acompose' },
        this.about,
        this.quick,
        this.taskBox,
        this.input,
        h(
          'div',
          { class: 'arow' },
          h(
            'span',
            { class: 'muted small' },
            ctx.demo ? 'Demo: the page calls the provider itself.' : 'Through the Studio server.',
          ),
          this.stopBtn,
          this.sendBtn,
        ),
      ),
    );
    this.renderSettings();
    this.renderEmpty();
    this.updateState();
    // A selection changes on a click (list, tabs) or a message from the engine view: follow it in the About line.
    const follow = () => setTimeout(() => this.refreshContext(), 0);
    document.addEventListener('click', follow);
    window.addEventListener('message', follow);
  }

  get open() {
    return !this.el.hidden;
  }

  toggle(open = !this.open) {
    this.el.hidden = !open;
    document.body.classList.toggle('with-assistant', open);
    if (open) {
      this.refreshContext();
      this.input.focus();
    }
  }

  /** The selection changed (tab, room, entity, panel): update the "About" line. */
  refreshContext() {
    if (this.open) {
      this.about.replaceChildren(h('span', { class: 'muted' }, 'About: '), h('b', null, this.context().label ?? ''));
      this.renderQuick();
    }
  }

  // ------------------------------------------------------------------ settings

  private needsKey() {
    return this.s.kind !== 'ollama' && !this.s.apiKey.trim();
  }

  private updateState() {
    const p = PRESETS[this.s.preset];
    this.providerLine.textContent = `${p.label} · ${this.s.model || '(no model)'}`;
    const noKey = this.needsKey();
    this.taskBox.hidden = !noKey;
    this.sendBtn.textContent = noKey ? 'Send as a task' : 'Send';
    this.sendBtn.title = noKey
      ? 'No API key: write the request as a task note for an AI agent connected through MCP'
      : 'Send to the model (Enter)';
    this.taskBox.replaceChildren(
      h(
        'p',
        null,
        h('b', null, 'No API key set.'),
        ' You can still ask: ',
        h('b', null, 'Send as a task to the AI agent'),
        ' writes your request in ',
        h('code', null, 'notes.json'),
        ' (tagged ',
        h('code', null, 'task: true'),
        '). An AI agent connected to this game through MCP (',
        h('code', null, 'npm run -s mcp'),
        ': Claude Code, Cursor, Codex, Gemini CLI… see docs/en/MCP.md) reads it with ',
        h('code', null, 'get_notes'),
        ' and does it; you see its edits here live.',
      ),
      h(
        'p',
        { class: 'muted small' },
        'Or add a key (or pick Ollama, no key) in ',
        h('button', { class: 'link', onclick: () => this.toggleSettings(true) }, 'Settings'),
        ' to chat here.',
      ),
    );
  }

  private toggleSettings(open = this.settingsEl.hidden) {
    this.settingsEl.hidden = !open;
    if (open) this.renderSettings();
  }

  private renderSettings() {
    const s = this.s;
    const commit = () => {
      saveSettings(this.s);
      this.updateState();
    };
    const base = h('input', { type: 'text', value: s.baseUrl, 'aria-label': 'Base URL', placeholder: 'https://…' });
    base.addEventListener('change', () => {
      this.s.baseUrl = base.value.trim();
      commit();
    });
    const models = PRESETS[s.preset].models;
    const model = h('input', { type: 'text', value: s.model, 'aria-label': 'Model', list: 'assistant-models' });
    model.addEventListener('change', () => {
      this.s.model = model.value.trim();
      commit();
    });
    const key = h('input', {
      type: 'password',
      value: s.apiKey,
      'aria-label': 'API key',
      autocomplete: 'off',
      placeholder: s.kind === 'ollama' ? 'not needed for Ollama' : 'sk-…',
    });
    key.addEventListener('change', () => {
      this.s.apiKey = key.value.trim();
      commit();
    });
    this.settingsEl.replaceChildren(
      h(
        'div',
        { class: 'agrid' },
        h('label', null, 'Provider'),
        select(
          Object.entries(PRESETS).map(([k, p]) => [k, p.label] as [string, string]),
          s.preset,
          (v) => {
            const p = PRESETS[v as PresetId];
            this.s = {
              ...this.s,
              preset: v as PresetId,
              kind: p.kind,
              baseUrl: p.baseUrl || this.s.baseUrl,
              model: p.models[0] ?? this.s.model,
            };
            commit();
            this.renderSettings();
          },
          { 'aria-label': 'Provider' },
        ),
        h('label', null, 'API format'),
        select(
          KIND_LABEL,
          s.kind,
          (v) => {
            this.s.kind = v as ProviderKind;
            commit();
            this.renderSettings();
          },
          { 'aria-label': 'API format' },
        ),
        h('label', null, 'Base URL'),
        base,
        h('label', null, 'Model'),
        h(
          'div',
          null,
          model,
          h(
            'datalist',
            { id: 'assistant-models' },
            models.map((m) => h('option', { value: m })),
          ),
          models.length
            ? h(
                'div',
                { class: 'amodels' },
                models.map((m) =>
                  h(
                    'button',
                    {
                      class: `chip${m === s.model ? ' on' : ''}`,
                      onclick: () => {
                        this.s.model = m;
                        commit();
                        this.renderSettings();
                      },
                    },
                    m,
                  ),
                ),
              )
            : null,
        ),
        h('label', null, 'API key'),
        h(
          'div',
          null,
          key,
          s.apiKey
            ? h(
                'button',
                {
                  class: 'link danger',
                  onclick: () => {
                    this.s.apiKey = '';
                    commit();
                    this.renderSettings();
                  },
                },
                'Forget the key',
              )
            : null,
        ),
      ),
      h(
        'p',
        { class: 'awarn' },
        '⚠ The key is kept only for this browser tab (sessionStorage) and sent with each request ',
        this.ctx.demo
          ? 'directly to the provider.'
          : 'to the Studio server, which passes it to the provider and never writes or logs it.',
        ' Use a key with a spending limit, and forget it on a shared computer.',
      ),
      h(
        'p',
        { class: 'muted small', hidden: s.kind !== 'ollama' },
        'Ollama runs on your machine: ',
        h('code', null, 'ollama pull ' + (s.model || 'llama3.1')),
        '. ',
        this.ctx.demo
          ? h(
              'span',
              null,
              'From this page it needs ',
              h('code', null, `OLLAMA_ORIGINS=${location.origin} ollama serve`),
              '.',
            )
          : 'Pick a model that supports tools.',
      ),
      h('div', { class: 'arow' }, h('button', { class: 'primary', onclick: () => this.toggleSettings(false) }, 'Done')),
    );
  }

  // ------------------------------------------------------------------ context and quick actions

  private context(): AssistantContext {
    const sel = this.ctx.selection();
    if (sel.tab === 'rooms' && sel.room) {
      const label = sel.entity ? `${sel.room} › ${sel.entity.id} (${sel.entity.kind})` : `${sel.room} (room)`;
      return {
        tab: 'rooms',
        room: sel.room,
        entity: sel.entity ? { kind: sel.entity.kind, id: sel.entity.id } : undefined,
        label,
      };
    }
    if (sel.tab === 'storyboard' && sel.panel) {
      return {
        tab: 'storyboard',
        panel: sel.panel,
        label: `storyboard › ${sel.panel.board ? `${sel.panel.board} › ` : ''}${sel.panel.title || sel.panel.id} (panel)`,
      };
    }
    return { tab: sel.tab, label: 'the whole game' };
  }

  /** `about` of a task note: room.entity, room, panel id, or nothing. */
  private aboutKey(c: AssistantContext) {
    return c.room ? (c.entity ? `${c.room}.${c.entity.id}` : c.room) : (c.panel?.id ?? '');
  }

  private renderQuick() {
    const c = this.context();
    const what = c.label ?? 'the whole game';
    const room = c.room ?? 'the current room';
    const ent = c.entity?.id;
    const actions: [string, string][] = [
      [
        'Write 3 look lines',
        `Write 3 new look lines for ${ent ? `${ent} in room ${room}` : what} in the game's voice (normal, normal, absurd). Read the room first, append them with set_text, then validate.`,
      ],
      [
        'Suggest a puzzle for this room',
        `Read room ${room} and the storyboard, then suggest one puzzle for this room that fits the story: the items, who is involved, the steps, a few lines. Propose it; don't write anything yet.`,
      ],
      [
        'Write the talk topics for this character',
        `Write the talk topics for ${c.entity?.kind === 'actor' ? `the character ${ent} in room ${room}` : `the character of ${what}`}: read the storyboard and the room's talk section, propose 3 topics with their lines, and ask me before writing them.`,
      ],
      [
        "Find what's missing (validate + solve)",
        "Run validate and solve, then list what is missing or broken, the most important first, with the fix you suggest for each. Don't change anything yet.",
      ],
      [
        'Draft the hint chain',
        `Draft the hint chain for ${c.room ? `room ${room}` : 'the game'}: ordered hints from vague to explicit, following the solve path. Show them, and ask me before writing them.`,
      ],
      [
        'Generate the art prompts for this sheet',
        `Call asset_prompts and give me, as-is, the prompt section for the sheet of ${ent ? `${ent} (room ${room})` : what}. If it is not one sheet, list the sheets it involves.`,
      ],
    ];
    this.quick.replaceChildren(
      ...actions.map(([label, prompt]) =>
        h(
          'button',
          {
            class: 'chip',
            title: prompt,
            onclick: () => {
              this.input.value = prompt;
              void this.send();
            },
          },
          label,
        ),
      ),
    );
  }

  // ------------------------------------------------------------------ conversation

  private renderEmpty() {
    this.log.replaceChildren(
      h(
        'div',
        { class: 'aempty muted' },
        h(
          'p',
          null,
          'Ask anything about your game: the Assistant reads and edits it with the same tools as the MCP server (rooms, texts, storyboard, notes, validate, solve…), starting from what you have selected.',
        ),
        h(
          'p',
          { class: 'small' },
          'It asks before destructive changes. Every edit lands in your files (or in this browser in the demo) and shows up in the tabs.',
        ),
      ),
    );
  }

  newChat() {
    this.stop();
    this.turns = [];
    this.renderEmpty();
    this.input.focus();
  }

  stop() {
    this.abort?.abort();
  }

  private busy(on: boolean) {
    this.stopBtn.hidden = !on;
    this.sendBtn.disabled = on;
  }

  private async send() {
    const text = this.input.value.trim();
    if (!text || this.abort) return;
    const c = this.context();
    if (this.needsKey()) {
      await this.sendTask(text, c);
      return;
    }
    if (!this.s.model || !this.s.baseUrl) {
      toast('Set a base URL and a model in Settings first.', 'error');
      this.toggleSettings(true);
      return;
    }

    if (!this.turns.length) this.log.replaceChildren();
    this.input.value = '';
    this.turns.push({ role: 'user', content: text });
    this.log.append(
      h(
        'div',
        { class: 'amsg user' },
        h('div', { class: 'awho' }, 'you', h('span', { class: 'muted small' }, ` · ${c.label}`)),
        h('p', null, text),
      ),
    );
    const bubble = h('div', { class: 'amsg bot' }, h('div', { class: 'awho' }, this.s.model));
    const typing = h('div', { class: 'atyping muted small' }, 'thinking…');
    bubble.append(typing);
    this.log.append(bubble);
    this.scroll();

    let answer = '';
    let seg: { el: HTMLElement; text: string } | null = null;
    const chips = new Map<string, HTMLElement>();
    const onEvent = (ev: AssistantEvent) => {
      typing.remove();
      if (ev.type === 'text') {
        if (!seg) {
          seg = { el: h('div', { class: 'atext' }), text: '' };
          bubble.append(seg.el);
        }
        seg.text += ev.delta;
        answer += ev.delta;
        seg.el.replaceChildren(renderMarkdown(seg.text));
      } else if (ev.type === 'tool_call') {
        seg = null;
        if (answer && !answer.endsWith('\n')) answer += '\n';
        const args = typeof ev.args === 'string' ? ev.args : JSON.stringify(ev.args, null, 2);
        const brief =
          ev.args && typeof ev.args === 'object'
            ? Object.values(ev.args as Record<string, unknown>)
                .filter((v) => typeof v === 'string')
                .map((v) => String(v).slice(0, 40))
                .join(' ')
            : '';
        const chip = h(
          'details',
          { class: 'atool running' },
          h(
            'summary',
            null,
            h('span', { class: 'aname' }, ev.name),
            brief ? h('span', { class: 'muted' }, ` ${brief}`) : null,
            h('span', { class: 'astatus' }, ' …'),
          ),
          h('div', { class: 'small muted' }, 'arguments'),
          h('pre', null, args),
        );
        chips.set(ev.id, chip);
        bubble.append(chip);
      } else if (ev.type === 'tool_result') {
        const chip = chips.get(ev.id);
        if (chip) {
          chip.classList.remove('running');
          chip.classList.toggle('failed', !!ev.isError);
          chip.querySelector('.astatus')!.textContent = ev.isError ? ' ✗' : ' ✓';
          chip.append(h('div', { class: 'small muted' }, 'result'), h('pre', null, ev.result));
        }
      } else if (ev.type === 'error') {
        bubble.append(h('p', { class: 'error aerr' }, ev.message));
      } else if (ev.type === 'done') {
        const u =
          ev.usage && (ev.usage.input || ev.usage.output) ? `${ev.usage.input} in · ${ev.usage.output} out tokens` : '';
        bubble.append(
          h('div', { class: 'muted small ausage' }, [ev.stopped ? 'stopped' : '', u].filter(Boolean).join(' · ')),
        );
        if (ev.wrote?.length) this.ctx.refresh(ev.wrote);
      }
      this.scroll();
    };

    this.abort = new AbortController();
    this.busy(true);
    try {
      const provider: Provider = {
        kind: this.s.kind,
        baseUrl: this.s.baseUrl,
        model: this.s.model,
        apiKey: this.s.apiKey || undefined,
      };
      if (this.ctx.demo) await this.runInPage(provider, c, onEvent, this.abort.signal);
      else await this.runOnServer(provider, c, onEvent, this.abort.signal);
    } catch (e) {
      if (!this.abort.signal.aborted) onEvent({ type: 'error', message: (e as Error).message });
      else onEvent({ type: 'done', stopped: true });
    } finally {
      typing.remove();
      this.abort = null;
      this.busy(false);
      this.turns.push({ role: 'assistant', content: answer.trim() || '(no answer)' });
    }
  }

  private scroll() {
    this.log.scrollTop = this.log.scrollHeight;
  }

  /** Dev server: the relay runs the loop; its events come back as server-sent events. */
  private async runOnServer(
    provider: Provider,
    context: AssistantContext,
    emit: (ev: AssistantEvent) => void,
    signal: AbortSignal,
  ) {
    const r = await studioFetch('assistant/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal,
      body: JSON.stringify({ provider, messages: this.turns, context }),
    });
    if (!r.ok || !r.body) {
      const data = await r.json().catch(() => ({ error: `${r.status} ${r.statusText}` }));
      throw new Error(data.error ?? `${r.status}`);
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = block
          .split('\n')
          .filter((l) => l.startsWith('data: '))
          .map((l) => l.slice(6))
          .join('\n');
        if (data) emit(JSON.parse(data) as AssistantEvent);
      }
    }
  }

  /** Demo mode: the same loop in the page, the tools on the browser backend. */
  private async runInPage(
    provider: Provider,
    context: AssistantContext,
    emit: (ev: AssistantEvent) => void,
    signal: AbortSignal,
  ) {
    const demo = this.ctx.demo!;
    const { runAssistant, systemPrompt, contextDetails } = await import('../../tools/studio/assistant-loop');
    const backend: ToolBackend = {
      game: () => demo.game(),
      room: (id) => demo.room(id),
      setLayout: (id, l) => demo.setLayout(id, l),
      setText: (id, p, v) => demo.setText(id, p, v),
      // Structured writes edit the room's code through the TypeScript parser on the dev server: not in the demo.
      setValue: async () => {
        throw new Error('set_value needs the dev server (npm run studio): the demo only edits texts and layouts');
      },
      add: (id, e) => demo.add(id, e),
      storyboardRaw: () => demo.storyboardRaw(),
      setStoryboard: (sb) => demo.setStoryboard(sb),
      notes: () => demo.notes(),
      addNote: (n) => demo.addNote(n),
      validate: () => demo.validate(),
      solve: (from, prove, reality) => demo.solve(from, prove, undefined, reality),
      author: () => provider.model,
      readDoc: async (name: DocName) => {
        const d = demo.doc(name);
        if (d === undefined)
          throw new Error(
            `${name} is not in the demo (only ${demo.docNames().join(', ') || 'no document'}); see docs/en/${name}.md in the repository`,
          );
        return d;
      },
    };
    const details = await contextDetails(context, backend).catch(() => '');
    await runAssistant({
      provider,
      backend,
      emit,
      signal,
      browser: true,
      messages: this.turns,
      system: systemPrompt({ agents: agentsMd, info: this.ctx.info, context, details }),
    });
  }

  /** No key: the request becomes a note tagged task, for an agent connected through MCP. */
  private async sendTask(text: string, c: AssistantContext) {
    try {
      const about = this.aboutKey(c);
      if (this.ctx.demo) await api.addNote({ about, author: 'you', text, task: true });
      else {
        const r = await studioFetch('assistant/task', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ about, text }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error ?? `${r.status}`);
      }
      this.input.value = '';
      if (!this.turns.length) this.log.replaceChildren();
      this.log.append(
        h(
          'div',
          { class: 'amsg task' },
          h(
            'div',
            { class: 'awho' },
            'task for the AI agent',
            h('span', { class: 'muted small' }, about ? ` · ${about}` : ' · general'),
          ),
          h('p', null, text),
          h(
            'p',
            { class: 'muted small' },
            'Written to notes.json (Notes tab). Ask your MCP agent to "do the tasks in get_notes".',
          ),
        ),
      );
      this.scroll();
      toast('Task written to the notes');
      this.ctx.refresh(['add_note']);
    } catch (e) {
      toast(`Task: ${(e as Error).message}`, 'error');
    }
  }
}
