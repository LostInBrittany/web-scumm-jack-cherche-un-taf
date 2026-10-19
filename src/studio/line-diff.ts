// What changed in a file between two texts, line by line (4.2.3, H10: the 409 of a file another member wrote since it
// was read shows this). The longest common subsequence of the lines, then the lines kept (' '), removed ('-') and added
// ('+') in order. Bounded: past `max` lines on either side it gives up and says so, rather than freeze the page.

export type DiffLine = [' ' | '-' | '+', string];

export function lineDiff(before: string, now: string, max = 2000): DiffLine[] | 'too long' {
  const a = before.split('\n');
  const b = now.split('\n');
  if (a.length > max || b.length > max) return 'too long';
  // lcs[i][j]: the common lines of a[i..] and b[j..].
  // Typed rows: 2,000 × 2,000 counts in 8 MB rather than 32 (a count never passes `max`).
  const lcs = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push([' ', a[i]!]);
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) out.push(['-', a[i++]!]);
    else out.push(['+', b[j++]!]);
  }
  while (i < a.length) out.push(['-', a[i++]!]);
  while (j < b.length) out.push(['+', b[j++]!]);
  return out;
}

/** Only the changed lines and `context` lines around each, a gap said as `…`. */
export function changedOnly(lines: DiffLine[], context = 2): (DiffLine | '…')[] {
  const keep = lines.map(() => false);
  lines.forEach(([k], n) => {
    if (k !== ' ')
      for (let m = Math.max(0, n - context); m <= Math.min(lines.length - 1, n + context); m++) keep[m] = true;
  });
  const out: (DiffLine | '…')[] = [];
  lines.forEach((l, n) => {
    if (keep[n]) out.push(l);
    else if (out.at(-1) !== '…') out.push('…');
  });
  return out;
}
