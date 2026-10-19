// The diff a 409 shows (4.2.3, H10): lines kept, removed, added, in order; only the changes and their context; a text
// too long given up on rather than freezing the page.
import { describe, expect, it } from 'vitest';
import { changedOnly, lineDiff } from '../src/studio/line-diff';

describe("a file's change, line by line", () => {
  it('keeps the common lines and says what was removed and added, in order', () => {
    expect(lineDiff('a\nb\nc', 'a\nB\nc\nd')).toEqual([
      [' ', 'a'],
      ['-', 'b'],
      ['+', 'B'],
      [' ', 'c'],
      ['+', 'd'],
    ]);
    expect(lineDiff('x\ny', '')).toEqual([
      ['-', 'x'],
      ['-', 'y'],
      ['+', ''],
    ]);
    expect(lineDiff('same', 'same')).toEqual([[' ', 'same']]);
  });

  it('gives up past its bound on either side', () => {
    expect(lineDiff('a\nb\nc', 'a', 2)).toBe('too long');
    expect(lineDiff('a', 'a\nb\nc', 2)).toBe('too long');
    expect(lineDiff('a\nb', 'a\nc', 2)).not.toBe('too long');
  });

  it('shows the changes with their context, a gap once for each run of unchanged lines', () => {
    const d = lineDiff('1\n2\n3\n4\n5\n6\n7\n8\n9', '1\n2\n3\n4\nV\n6\n7\n8\n9') as never;
    expect(changedOnly(d, 1)).toEqual(['…', [' ', '4'], ['-', '5'], ['+', 'V'], [' ', '6'], '…']);
    expect(changedOnly(lineDiff('a', 'b') as never)).toEqual([
      ['-', 'a'],
      ['+', 'b'],
    ]);
  });
});
