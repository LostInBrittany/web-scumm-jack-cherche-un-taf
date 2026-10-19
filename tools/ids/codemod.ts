// Writes stable ids into a game's TypeScript sources (`npm run ids`): the ids come from `assignIds` on the loaded
// game, this file only finds the matching object literals and inserts `id: '…'` (or `stepIds: […]` on a script) as
// their first property, keeping the file's quotes and indentation. Anything that is not a plain literal (a spread, a
// `.map(...)`, an identifier) is skipped and reported with the id the engine expects, so the author adds it by hand.
import ts from '@typescript/typescript6';
import type {
  Cmd,
  EventRule,
  GameDef,
  GameRules,
  HintDef,
  ItemDef,
  KindRule,
  ListLine,
  RoomDef,
  Rule,
  ScriptDef,
  TalkTopic,
} from '../../src/engine/core/types';
import { encodeString, fileQuote, propKey, unwrap } from '../../studio-server/src/ops/source';

interface Inserted {
  path: string;
  id: string;
  line: number;
}
interface Skipped {
  path: string;
  line: number;
  reason: string;
  expected?: string;
}
export interface CodemodResult {
  code: string;
  inserted: Inserted[];
  skipped: Skipped[];
}

type Edit = { pos: number; text: string; end?: number };
type Obj = ts.ObjectLiteralExpression;

class Codemod {
  private edits: Edit[] = [];
  readonly inserted: Inserted[] = [];
  readonly skipped: Skipped[] = [];
  private q: string;
  constructor(private sf: ts.SourceFile) {
    this.q = fileQuote(sf);
  }

  private line(n: ts.Node) {
    return this.sf.getLineAndCharacterOfPosition(n.getStart(this.sf)).line + 1;
  }
  private skip(n: ts.Node, path: string, reason: string, expected?: string) {
    this.skipped.push({ path, line: this.line(n), reason, expected });
  }

  /** The property `name` of an object literal, when written as `name: value`. */
  prop(obj: Obj, name: string): ts.Expression | undefined {
    for (const p of obj.properties) if (propKey(p) === name && ts.isPropertyAssignment(p)) return unwrap(p.initializer);
    return undefined;
  }
  private has(obj: Obj, name: string) {
    return obj.properties.some((p) => propKey(p) === name);
  }

  /** Inserts `text` as the first property of `obj`, following the file's layout. */
  private insertFirst(obj: Obj, text: string) {
    this.edits.push(this.firstProp(obj, text));
  }

  /** The edit that inserts `text` as the first property of `obj`, following the file's layout. */
  private firstProp(obj: Obj, text: string): Edit {
    const code = this.sf.text;
    const open = obj.getStart(this.sf);
    const rest = code.slice(open + 1);
    if (/^[ \t]*\n/.test(rest)) {
      const firstLine = obj.properties.length
        ? code.slice(code.lastIndexOf('\n', obj.properties[0].getStart(this.sf) - 1) + 1)
        : '';
      const indent = /^[ \t]*/.exec(firstLine)?.[0] ?? '  ';
      return { pos: open + 1, text: `\n${indent}${text},` };
    }
    return { pos: open + 1, text: rest.startsWith(' ') ? ` ${text},` : ` ${text}, ` };
  }

  /** `{ id }` on an object literal that lacks it. */
  idObj(node: ts.Expression | undefined, runtime: { id?: string } | undefined, path: string, kind: string): Obj | null {
    if (!node) return null;
    const e = unwrap(node);
    if (!ts.isObjectLiteralExpression(e)) {
      this.skip(node, path, `${kind} is not an object literal`, runtime?.id);
      return null;
    }
    if (!this.has(e, 'id') && runtime?.id) {
      this.insertFirst(e, `id: ${encodeString(runtime.id, this.q)}`);
      this.inserted.push({ path, id: runtime.id, line: this.line(e) });
    }
    return e;
  }

  /** The elements of an array literal, or null (reported) when it cannot be indexed like the runtime array. */
  elements(node: ts.Expression | undefined, path: string, what: string): ts.Expression[] | null {
    if (!node) return null;
    const e = unwrap(node);
    if (!ts.isArrayLiteralExpression(e)) {
      this.skip(node, path, `${what} is not an array literal`);
      return null;
    }
    if (e.elements.some((x) => ts.isSpreadElement(x) || ts.isOmittedExpression(x))) {
      this.skip(node, path, `${what} has a spread: indices cannot be matched`);
      return null;
    }
    return [...e.elements] as ts.Expression[];
  }

  cmds(node: ts.Expression | undefined, runtime: Cmd[] | undefined, path: string) {
    const els = this.elements(node, path, 'command list');
    if (!els || !runtime) return;
    els.forEach((el, i) => {
      const c = runtime[i];
      if (c === undefined || typeof c === 'string') return;
      const here = `${path}[${i}]`;
      const e = unwrap(el);
      const line = 'say' in c || 'toast' in c || 'guide' in c ? (c as { id?: string }) : null;
      // `--lines=all`: the runtime turned this plain string into `{ say: ['hero', text], id }`; the source follows.
      if (line?.id && ts.isStringLiteralLike(e) && 'say' in c) {
        this.edits.push({
          pos: e.getStart(this.sf),
          end: e.getEnd(),
          text: `{ say: [${encodeString(c.say[0], this.q)}, ${e.getText(this.sf)}], id: ${encodeString(line.id, this.q)} }`,
        });
        this.inserted.push({ path: here, id: line.id, line: this.line(e) });
        return;
      }
      if (!ts.isObjectLiteralExpression(e)) {
        if (!ts.isStringLiteralLike(e)) this.skip(el, here, 'command is not a literal', (c as { id?: string }).id);
        return;
      }
      if (line) {
        this.idObj(e, line, here, 'line');
        return;
      }
      const kind = (['once', 'nth', 'cycle', 'random'] as const).find((k) => k in c);
      if (kind) {
        this.idObj(e, c as { id?: string }, here, kind);
        const lists = kind === 'once' ? [(c as { once: Cmd[] }).once] : (c as unknown as Record<string, Cmd[][]>)[kind];
        if (kind === 'once') this.cmds(this.prop(e, 'once'), lists[0], `${here}.once`);
        else {
          const subs = this.elements(this.prop(e, kind), `${here}.${kind}`, kind);
          subs?.forEach((s, j) => this.cmds(s, lists[j], `${here}.${kind}[${j}]`));
        }
        return;
      }
      if ('choice' in c) {
        const opts = this.elements(this.prop(e, 'choice'), `${here}.choice`, 'choice');
        opts?.forEach((o, j) => {
          const obj = this.idObj(o, c.choice[j], `${here}.choice[${j}]`, 'choice option');
          if (obj) this.cmds(this.prop(obj, 'do'), c.choice[j]?.do, `${here}.choice[${j}].do`);
        });
        return;
      }
      if ('if' in c) {
        this.cmds(this.prop(e, 'then'), c.then, `${here}.then`);
        this.cmds(this.prop(e, 'else'), c.else, `${here}.else`);
      } else if ('parallel' in c) {
        const subs = this.elements(this.prop(e, 'parallel'), `${here}.parallel`, 'parallel');
        subs?.forEach((s, j) => this.cmds(s, c.parallel[j], `${here}.parallel[${j}]`));
      } else if ('cutscene' in c) this.cmds(this.prop(e, 'cutscene'), c.cutscene, `${here}.cutscene`);
      else if ('minigame' in c) this.cmds(this.prop(e, 'then'), c.then, `${here}.then`);
      else if ('phone' in c) this.cmds(this.prop(e, 'do'), c.do, `${here}.do`);
      else if ('anim' in c && c.at) {
        const at = this.prop(e, 'at');
        if (at && ts.isObjectLiteralExpression(at))
          for (const p of at.properties) {
            const k = propKey(p);
            if (k !== undefined && ts.isPropertyAssignment(p))
              this.cmds(p.initializer, (c.at as Record<string, Cmd[]>)[k], `${here}.at[${k}]`);
          }
      } else if ('ending' in c || 'reveal' in c)
        this.cmds(this.prop(e, 'after'), (c as { after?: Cmd[] }).after, `${here}.after`);
    });
  }

  rules(node: ts.Expression | undefined, runtime: Rule[] | undefined, path: string) {
    const els = this.elements(node, path, 'rules');
    els?.forEach((el, i) => {
      const obj = this.idObj(el, runtime?.[i], `${path}[${i}]`, 'rule');
      if (obj) this.cmds(this.prop(obj, 'do'), runtime?.[i]?.do, `${path}[${i}].do`);
    });
  }
  events(node: ts.Expression | undefined, runtime: EventRule[] | undefined, path: string) {
    const els = this.elements(node, path, 'listeners');
    els?.forEach((el, i) => {
      const obj = this.idObj(el, runtime?.[i], `${path}[${i}]`, 'listener');
      if (obj) this.cmds(this.prop(obj, 'do'), runtime?.[i]?.do, `${path}[${i}].do`);
    });
  }
  topics(node: ts.Expression | undefined, runtime: Record<string, TalkTopic[]> | undefined, path: string) {
    if (!node) return;
    const e = unwrap(node);
    if (!ts.isObjectLiteralExpression(e)) {
      this.skip(node, path, 'talk is not an object literal');
      return;
    }
    for (const p of e.properties) {
      const actor = propKey(p);
      if (actor === undefined || !ts.isPropertyAssignment(p)) continue;
      const els = this.elements(p.initializer, `${path}.${actor}`, 'topics');
      els?.forEach((el, i) => {
        const obj = this.idObj(el, runtime?.[actor]?.[i], `${path}.${actor}[${i}]`, 'topic');
        if (obj) this.cmds(this.prop(obj, 'do'), runtime?.[actor]?.[i]?.do, `${path}.${actor}[${i}].do`);
      });
    }
  }
  scripts(node: ts.Expression | undefined, runtime: ScriptDef[] | undefined, path: string) {
    const els = this.elements(node, path, 'scripts');
    els?.forEach((el, i) => {
      const sc = runtime?.[i];
      const e = unwrap(el);
      if (!ts.isObjectLiteralExpression(e)) {
        this.skip(el, `${path}[${i}]`, 'script is not an object literal', sc?.stepIds?.join(', '));
        return;
      }
      if (sc?.stepIds && !this.has(e, 'stepIds')) {
        this.insertFirst(e, `stepIds: [${sc.stepIds.map((x) => encodeString(x, this.q)).join(', ')}]`);
        this.inserted.push({ path: `${path}[${i}].stepIds`, id: sc.stepIds.join(', '), line: this.line(e) });
      }
      this.cmds(this.prop(e, 'do'), sc?.do, `${path}[${i}].do`);
    });
  }
  propAnims(node: ts.Expression | undefined, runtime: RoomDef['props'], path: string) {
    if (!node) return;
    const e = unwrap(node);
    if (!ts.isObjectLiteralExpression(e)) return;
    for (const p of e.properties) {
      const pid = propKey(p);
      if (pid === undefined || !ts.isPropertyAssignment(p)) continue;
      const po = unwrap(p.initializer);
      if (!ts.isObjectLiteralExpression(po)) continue;
      const anims = this.prop(po, 'anims');
      if (!anims || !ts.isObjectLiteralExpression(anims)) continue;
      for (const a of anims.properties) {
        const an = propKey(a);
        if (an === undefined || !ts.isPropertyAssignment(a)) continue;
        const ao = unwrap(a.initializer);
        if (!ts.isObjectLiteralExpression(ao)) continue;
        const at = this.prop(ao, 'at');
        if (!at || !ts.isObjectLiteralExpression(at)) continue;
        for (const k of at.properties) {
          const key = propKey(k);
          if (key === undefined || !ts.isPropertyAssignment(k)) continue;
          this.cmds(
            k.initializer,
            (runtime?.[pid]?.anims?.[an]?.at as Record<string, Cmd[]> | undefined)?.[key],
            `${path}.${pid}.anims.${an}.at[${key}]`,
          );
        }
      }
    }
  }

  /** A list of lines (look, hint, fallback answers): ids on its objects; `--lines=all` turned its strings into `{ id, text }`. */
  listLines(node: ts.Expression | undefined, runtime: string | ListLine[] | undefined, path: string) {
    if (!node || !Array.isArray(runtime)) return;
    const e = unwrap(node);
    if (ts.isStringLiteralLike(e)) return; // a single line, keyed by its owner
    const els = this.elements(node, path, 'line list');
    els?.forEach((el, i) => {
      const l = runtime[i];
      if (l === undefined || typeof l === 'string' || !l.id) return;
      const x = unwrap(el);
      const here = `${path}[${i}]`;
      if (ts.isStringLiteralLike(x)) {
        this.edits.push({
          pos: x.getStart(this.sf),
          end: x.getEnd(),
          text: `{ id: ${encodeString(l.id, this.q)}, text: ${x.getText(this.sf)} }`,
        });
        this.inserted.push({ path: here, id: l.id, line: this.line(x) });
        return;
      }
      if (!ts.isObjectLiteralExpression(x)) {
        this.skip(el, here, 'line is not a literal', l.id);
        return;
      }
      this.idObj(x, l, here, 'line');
    });
  }
  /** `look: { k: '…' | [...] }` of a room. */
  looks(node: ts.Expression | undefined, runtime: Record<string, string | ListLine[]> | undefined, path: string) {
    if (!node) return;
    const e = unwrap(node);
    if (!ts.isObjectLiteralExpression(e)) {
      this.skip(node, path, 'look is not an object literal');
      return;
    }
    for (const p of e.properties) {
      const k = propKey(p);
      if (k !== undefined && ts.isPropertyAssignment(p)) this.listLines(p.initializer, runtime?.[k], `${path}.${k}`);
    }
  }
  hints(node: ts.Expression | undefined, runtime: HintDef[] | undefined, path: string) {
    const els = this.elements(node, path, 'hints');
    els?.forEach((el, i) => {
      const obj = this.idObj(el, runtime?.[i], `${path}[${i}]`, 'hint');
      if (obj) this.listLines(this.prop(obj, 'lines'), runtime?.[i]?.lines, `${path}[${i}].lines`);
    });
  }
  fallbacks(node: ts.Expression | undefined, runtime: GameRules['fallbacks'] | undefined, path: string) {
    if (!node) return;
    const e = unwrap(node);
    if (!ts.isObjectLiteralExpression(e)) {
      this.skip(node, path, 'fallbacks is not an object literal');
      return;
    }
    for (const p of e.properties) {
      const k = propKey(p);
      if (k !== undefined && ts.isPropertyAssignment(p))
        this.listLines(p.initializer, (runtime as Record<string, ListLine[]> | undefined)?.[k], `${path}.${k}`);
    }
  }
  kinds(node: ts.Expression | undefined, runtime: KindRule[] | undefined, path: string) {
    const els = this.elements(node, path, 'kinds');
    els?.forEach((el, i) => this.idObj(el, runtime?.[i], `${path}[${i}]`, 'reaction by kind'));
  }
  items(node: ts.Expression, runtime: Record<string, ItemDef>, path: string) {
    const e = unwrap(node);
    if (!ts.isObjectLiteralExpression(e)) {
      this.skip(node, path, 'items is not an object literal');
      return;
    }
    for (const p of e.properties) {
      const k = propKey(p);
      if (k === undefined || !ts.isPropertyAssignment(p)) continue;
      const o = unwrap(p.initializer);
      if (ts.isObjectLiteralExpression(o)) this.listLines(this.prop(o, 'look'), runtime[k]?.look, `${path}.${k}.look`);
    }
  }

  /**
   * The three lines UPGRADING.md leaves to the author, on `defineGame({...})`: `schemaVersion: 3`, `saveVersion` + 1,
   * the ids' migration step appended to `migrations` and imported from `./ids.migration.json`. All three or none: when
   * one cannot be written (a computed `saveVersion`, a shorthand property), none is, and each is said skipped, so that a
   * second run never appends the step twice.
   */
  schema3(root: Obj, saveVersion: number) {
    const edits: Edit[] = [];
    const done: Inserted[] = [];
    const problems: Skipped[] = [];
    const set = (name: string, value: string) => {
      const p = root.properties.find(
        (x) => propKey(x) === name || (ts.isShorthandPropertyAssignment(x) && x.name.text === name),
      );
      if (p && !ts.isPropertyAssignment(p))
        return problems.push({
          path: name,
          line: this.line(p),
          reason: `${name} is not written \`${name}: …\``,
          expected: value,
        });
      if (p) edits.push({ pos: p.initializer.getStart(this.sf), end: p.initializer.getEnd(), text: value });
      else edits.push(this.firstProp(root, `${name}: ${value}`));
      done.push({ path: name, id: value, line: this.line(p ?? root) });
    };
    const sv = this.prop(root, 'saveVersion');
    if (sv && ts.isNumericLiteral(sv) && Number(sv.text) === saveVersion) set('saveVersion', String(saveVersion + 1));
    else
      problems.push({
        path: 'saveVersion',
        line: this.line(sv ?? root),
        reason: 'saveVersion is not a number literal',
        expected: String(saveVersion + 1),
      });
    const m = this.prop(root, 'migrations');
    if (!m) set('migrations', '[idsMigration]');
    else if (ts.isArrayLiteralExpression(m)) {
      const last = m.elements.at(-1);
      edits.push({
        pos: last ? last.getEnd() : m.getStart(this.sf) + 1,
        text: last ? ', idsMigration' : 'idsMigration',
      });
      done.push({ path: 'migrations', id: 'idsMigration', line: this.line(m) });
    } else set('migrations', `[...${m.getText(this.sf)}, idsMigration]`);
    // Inserted last, so that it comes first when inserted beside `migrations`.
    set('schemaVersion', '3');
    if (!/\bimport\s+idsMigration\b/.test(this.sf.text)) {
      const imports = this.sf.statements.filter(ts.isImportDeclaration);
      const line = `import idsMigration from ${encodeString('./ids.migration.json', this.q)};`;
      edits.push(imports.length ? { pos: imports.at(-1)!.getEnd(), text: `\n${line}` } : { pos: 0, text: `${line}\n` });
    }
    if (problems.length) {
      // None written: every one of the three is said, the ones that could have been written too.
      for (const d of done)
        if (!problems.some((x) => x.path === d.path))
          problems.push({
            path: d.path,
            line: d.line,
            reason: 'not written: another of the three lines cannot be',
            expected: d.id,
          });
      this.skipped.push(...problems);
      return;
    }
    this.edits.push(...edits);
    this.inserted.push(...done);
  }

  result(): CodemodResult {
    let code = this.sf.text;
    for (const e of [...this.edits].sort((a, b) => b.pos - a.pos))
      code = code.slice(0, e.pos) + e.text + code.slice(e.end ?? e.pos);
    return { code, inserted: this.inserted, skipped: this.skipped };
  }
}

/** The object passed to `defineRoom(...)` / `defineGame(...)`, or the initializer of `export const <name> = {...}`, or the default export. */
function findRoot(sf: ts.SourceFile, callee: string, variable?: string): Obj | undefined {
  let root: Obj | undefined;
  const visit = (n: ts.Node) => {
    if (root) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === callee && n.arguments[0]) {
      const a = unwrap(n.arguments[0]);
      if (ts.isObjectLiteralExpression(a)) {
        root = a;
        return;
      }
    }
    if (
      variable &&
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === variable &&
      n.initializer
    ) {
      const a = unwrap(n.initializer);
      if (ts.isObjectLiteralExpression(a)) {
        root = a;
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!root)
    for (const st of sf.statements)
      if (ts.isExportAssignment(st)) {
        const e = unwrap(st.expression);
        if (ts.isObjectLiteralExpression(e)) root = e;
      }
  return root;
}

const parse = (code: string, fileName: string) =>
  ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

/** The `id` literal of a room file's root object, to match it with the loaded game's rooms. */
export function roomIdOf(code: string, fileName = 'room.ts'): string | undefined {
  const sf = parse(code, fileName);
  const root = findRoot(sf, 'defineRoom');
  const id = root && new Codemod(sf).prop(root, 'id');
  return id && ts.isStringLiteralLike(id) ? id.text : undefined;
}

export function addIdsToRoomSource(code: string, room: RoomDef, fileName = 'room.ts'): CodemodResult {
  const sf = parse(code, fileName);
  const root = findRoot(sf, 'defineRoom');
  const cm = new Codemod(sf);
  if (!root) {
    cm.skipped.push({ path: '', line: 1, reason: 'no defineRoom({...}) object found' });
    return cm.result();
  }
  cm.rules(cm.prop(root, 'on'), room.on, 'on');
  cm.topics(cm.prop(root, 'talk'), room.talk, 'talk');
  cm.events(cm.prop(root, 'events'), room.events, 'events');
  cm.scripts(cm.prop(root, 'scripts'), room.scripts, 'scripts');
  cm.cmds(cm.prop(root, 'onEnter'), room.onEnter, 'onEnter');
  cm.propAnims(cm.prop(root, 'props'), room.props, 'props');
  cm.looks(cm.prop(root, 'look'), room.look, 'look');
  cm.hints(cm.prop(root, 'hints'), room.hints, 'hints');
  return cm.result();
}

/** `rules.ts`: `export const rules: GameRules = { on: [...] }`. */
export function addIdsToRulesSource(code: string, rules: GameRules, fileName = 'rules.ts'): CodemodResult {
  const sf = parse(code, fileName);
  const root = findRoot(sf, 'defineRules', 'rules');
  const cm = new Codemod(sf);
  if (!root) {
    cm.skipped.push({ path: '', line: 1, reason: 'no `rules` object found' });
    return cm.result();
  }
  cm.rules(cm.prop(root, 'on'), rules.on, 'on');
  cm.fallbacks(cm.prop(root, 'fallbacks'), rules.fallbacks, 'fallbacks');
  cm.kinds(cm.prop(root, 'kinds'), rules.kinds, 'kinds');
  return cm.result();
}

/** `items.ts`: `export const items = { key: { look: [...] } }`: ids on the lines of look lists. */
export function addIdsToItemsSource(
  code: string,
  items: Record<string, ItemDef>,
  fileName = 'items.ts',
): CodemodResult {
  const sf = parse(code, fileName);
  const root = findRoot(sf, 'defineItems', 'items');
  const cm = new Codemod(sf);
  if (!root) {
    cm.skipped.push({ path: '', line: 1, reason: 'no `items` object found' });
    return cm.result();
  }
  cm.items(root, items, 'items');
  return cm.result();
}

/** `game.ts`: the `defineGame({...})` object: `events`, `scripts`, `start.intro`, and `rules` when written inline. */
export function addIdsToGameSource(code: string, game: GameDef, fileName = 'game.ts'): CodemodResult {
  const sf = parse(code, fileName);
  const root = findRoot(sf, 'defineGame', 'game');
  const cm = new Codemod(sf);
  if (!root) {
    cm.skipped.push({ path: '', line: 1, reason: 'no defineGame({...}) object found' });
    return cm.result();
  }
  cm.events(cm.prop(root, 'events'), game.events, 'events');
  cm.scripts(cm.prop(root, 'scripts'), game.scripts, 'scripts');
  const start = cm.prop(root, 'start');
  if (start && ts.isObjectLiteralExpression(start)) cm.cmds(cm.prop(start, 'intro'), game.start.intro, 'start.intro');
  const rules = cm.prop(root, 'rules');
  if (rules && ts.isObjectLiteralExpression(rules)) {
    cm.rules(cm.prop(rules, 'on'), game.rules.on, 'rules.on');
    cm.fallbacks(cm.prop(rules, 'fallbacks'), game.rules.fallbacks, 'rules.fallbacks');
    cm.kinds(cm.prop(rules, 'kinds'), game.rules.kinds, 'rules.kinds');
  }
  const items = cm.prop(root, 'items');
  if (items && ts.isObjectLiteralExpression(items)) cm.items(items, game.items, 'items');
  return cm.result();
}

/**
 * `game.ts` brought to schema 3 (4.2.3, a hosted `migrate`): the lines UPGRADING.md says to write by hand once the ids
 * are written (`schemaVersion: 3`, `saveVersion` + 1, `migrations: [..., idsMigration]` and its import).
 */
export function addSchema3ToGameSource(code: string, saveVersion: number, fileName = 'game.ts'): CodemodResult {
  const sf = parse(code, fileName);
  const root = findRoot(sf, 'defineGame', 'game');
  const cm = new Codemod(sf);
  if (!root) cm.skipped.push({ path: '', line: 1, reason: 'no defineGame({...}) object found' });
  else cm.schema3(root, saveVersion);
  return cm.result();
}
