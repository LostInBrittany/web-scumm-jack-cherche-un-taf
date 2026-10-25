// The JSON the wiki's tools write (4.5.0 "Wiki", phase A3): stable and readable in a diff. An object is expanded one
// key per line unless it only holds plain values and fits the line; an array of plain values stays on one line when it
// fits, otherwise one item per line. Two spaces, a final newline: the same file for the same data, every time.

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const WIDTH = 120;
const plain = (v: unknown): v is string | number | boolean | null => v === null || typeof v !== 'object';

function write(value: Json, indent: string, prefix: number): string {
  if (plain(value)) return JSON.stringify(value);
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    if (value.every(plain)) {
      const line = `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
      if (prefix + line.length <= WIDTH) return line;
    }
    return `[\n${value.map((v) => `${inner}${write(v, inner, inner.length)}`).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  if (!entries.length) return '{}';
  if (entries.every(([, v]) => plain(v))) {
    const line = `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')} }`;
    if (prefix + line.length <= WIDTH) return line;
  }
  return `{\n${entries
    .map(([k, v]) => {
      const key = `${inner}${JSON.stringify(k)}: `;
      return `${key}${write(v, inner, key.length)}`;
    })
    .join(',\n')}\n${indent}}`;
}

/** `value` as the wiki's tools write it, with its final newline. */
export const formatJson = (value: unknown): string => `${write(value as Json, '', 0)}\n`;
