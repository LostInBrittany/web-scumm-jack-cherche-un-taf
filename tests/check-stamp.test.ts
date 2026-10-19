// The Check tab's stamp (4.2.2, G3): its results' revisions, and stale as soon as the head is past the oldest of them
// (a write between the tab's requests leaves some at the older revision).
import { describe, expect, it } from 'vitest';
import { checkStamp } from '../src/studio/check-stamp';

describe("the Check tab's stamp", () => {
  it('says nothing of revisions where the answers carry none (the dev server, the demo)', () => {
    expect(checkStamp('checked at 10:00', [], 4)).toEqual({ text: 'checked at 10:00', stale: false });
  });
  it('says the revision, and stale once the head is past it', () => {
    expect(checkStamp('checked', [3, 3], 3)).toEqual({ text: 'checked · revision 3', stale: false });
    expect(checkStamp('checked', [3], undefined).stale).toBe(false);
    expect(checkStamp('checked', [3], 5)).toEqual({
      text: 'checked · revision 3 · stale: the head is at revision 5',
      stale: true,
    });
  });
  it('is stale when a write landed between its requests, even at the head', () => {
    expect(checkStamp('checked', [1, 2, 2], 2)).toEqual({
      text: 'checked · revisions 1–2 · stale: the head is at revision 2',
      stale: true,
    });
  });
});
