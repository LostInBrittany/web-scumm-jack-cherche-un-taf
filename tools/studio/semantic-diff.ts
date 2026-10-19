// What changed between two revisions of a game, by what the game names (4.2.3 PR 4, plan H3). The game's sources are
// read, never run: in a TypeScript file every object that carries an `id` (a rule, a topic, a line, a choice…) is
// compared by its id, with the names of the fields that changed; a JSON file (a layout, the storyboard, the
// groupings…) is compared by the paths of its values. A file that is neither, or that is not text, is said "file
// changed", without fields. Bounded: past `MAX` entries a list is cut, and says so.
import ts from '@typescript/typescript6';

export interface IdChange {
  id: string;
  /** The fields whose value changed (their text, compared). */
  fields: string[];
}

export interface FileDiff {
  path: string;
  change: 'added' | 'removed' | 'changed';
  /** A TypeScript file: the ids added, removed, changed (with their fields). */
  ids?: { added: string[]; removed: string[]; changed: IdChange[] };
  /** A JSON file: the paths of the values added, removed or changed. */
  values?: { added: string[]; removed: string[]; changed: string[] };
  /** Neither, or not text: the file changed, nothing more is said. */
  opaque?: true;
  /** A list was cut at `MAX`. */
  cut?: true;
}

const MAX = 500;

/** Every object literal carrying `id: '<text>'` in a source: its id → its other fields' text. */
export function idsOf(path: string, text: string): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const nameOf = (n: ts.PropertyName) =>
    ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n) ? n.text : n.getText(file);
  const idOf = (n: ts.ObjectLiteralExpression) =>
    n.properties.find(
      (p): p is ts.PropertyAssignment =>
        ts.isPropertyAssignment(p) && nameOf(p.name) === 'id' && ts.isStringLiteralLike(p.initializer),
    );
  /** A field's text, each object inside it that has an id of its own shown as that id: compared through it. */
  const flat = (n: ts.Node): string => {
    const holes: [number, number, string][] = [];
    const find = (m: ts.Node) => {
      if (m !== n && ts.isObjectLiteralExpression(m)) {
        const id = idOf(m);
        if (id)
          return void holes.push([m.getStart(file), m.getEnd(), `#${(id.initializer as ts.StringLiteralLike).text}`]);
      }
      ts.forEachChild(m, find);
    };
    find(n);
    let t = n.getText(file);
    const at = n.getStart(file);
    for (const [s, e, r] of holes.reverse()) t = t.slice(0, s - at) + r + t.slice(e - at);
    return t;
  };
  const visit = (n: ts.Node) => {
    if (ts.isObjectLiteralExpression(n)) {
      const id = idOf(n);
      if (id) {
        // An id written twice in one file (a variant and a category of the same name): the next ones by occurrence.
        const text = (id.initializer as ts.StringLiteralLike).text;
        let key = text;
        for (let n = 2; out.has(key); n++) key = `${text}#${n}`;
        const fields = new Map<string, string>();
        for (const p of n.properties) {
          if (p === id) continue;
          const name = p.name && !ts.isComputedPropertyName(p.name) ? nameOf(p.name) : p.getText(file).slice(0, 40);
          // A field holding objects with ids of their own is compared through them, not as a block of text.
          fields.set(name, flat(p));
        }
        out.set(key, fields);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(file);
  return out;
}

/** A JSON value's leaves, by path (`boards[0].panels[2].title`). */
function leaves(v: unknown, at = '', out = new Map<string, string>()): Map<string, string> {
  if (Array.isArray(v)) {
    if (!v.length) out.set(at, '[]');
    v.forEach((x, i) => leaves(x, `${at}[${i}]`, out));
  } else if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (!keys.length) out.set(at, '{}');
    for (const k of keys) leaves((v as Record<string, unknown>)[k], at ? `${at}.${k}` : k, out);
  } else out.set(at, JSON.stringify(v));
  return out;
}

const cut = <T>(xs: T[], d: FileDiff): T[] => {
  if (xs.length <= MAX) return xs;
  d.cut = true;
  return xs.slice(0, MAX);
};

function compare<V>(a: Map<string, V>, b: Map<string, V>, same: (x: V, y: V) => boolean) {
  const added = [...b.keys()].filter((k) => !a.has(k)).sort();
  const removed = [...a.keys()].filter((k) => !b.has(k)).sort();
  const changed = [...a.keys()].filter((k) => b.has(k) && !same(a.get(k)!, b.get(k)!)).sort();
  return { added, removed, changed };
}

/** One side of a file's change: whether it is there, and its text (null: not text, or not kept). */
export interface Side {
  present: boolean;
  text: string | null;
}

/** One file's change between two sides. */
export function diffFile(path: string, a: Side, b: Side): FileDiff {
  const d: FileDiff = { path, change: !a.present ? 'added' : !b.present ? 'removed' : 'changed' };
  // Absent is empty; present but not text: nothing can be said by name.
  if ((a.present && a.text === null) || (b.present && b.text === null)) {
    d.opaque = true;
    return d;
  }
  const before = a.present ? a.text : null;
  const now = b.present ? b.text : null;
  const empty = new Map();
  try {
    if (/\.tsx?$/.test(path) && (before !== null || now !== null)) {
      const a = before === null ? empty : idsOf(path, before);
      const b = now === null ? empty : idsOf(path, now);
      const sameFields = (x: Map<string, string>, y: Map<string, string>) =>
        x.size === y.size && [...x].every(([k, v]) => y.get(k) === v);
      const c = compare(a, b, sameFields);
      // Nothing an id names changed, yet the text did: said as a file that changed.
      if (!c.added.length && !c.removed.length && !c.changed.length && before !== now) {
        d.opaque = true;
        return d;
      }
      d.ids = {
        added: cut(c.added, d),
        removed: cut(c.removed, d),
        changed: cut(
          c.changed.map((id) => {
            const x = a.get(id)!;
            const y = b.get(id)!;
            const fields = [...new Set([...x.keys(), ...y.keys()])].filter((k) => x.get(k) !== y.get(k)).sort();
            return { id, fields };
          }),
          d,
        ),
      };
      return d;
    }
    if (/\.json$/.test(path) && (before !== null || now !== null)) {
      const a = before === null ? empty : leaves(JSON.parse(before));
      const b = now === null ? empty : leaves(JSON.parse(now));
      const c = compare(a, b, (x, y) => x === y);
      d.values = { added: cut(c.added, d), removed: cut(c.removed, d), changed: cut(c.changed, d) };
      return d;
    }
  } catch {
    // Not what its name says (a JSON that does not parse): said as a file that changed.
  }
  d.opaque = true;
  return d;
}
