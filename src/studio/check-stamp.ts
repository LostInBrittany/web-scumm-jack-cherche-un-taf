// The Check tab's stamp (4.2.2, G3): when its results were made, at which revisions, and whether they are stale. A
// result is stale as soon as the head is past the revision it was made at: the oldest of them decides, since a write
// can land between the tab's requests.
export function checkStamp(at: string, revs: number[], head: number | undefined): { text: string; stale: boolean } {
  if (!revs.length) return { text: at, stale: false };
  const lo = Math.min(...revs);
  const hi = Math.max(...revs);
  const stale = head !== undefined && head > lo;
  const rev = lo === hi ? ` · revision ${hi}` : ` · revisions ${lo}–${hi}`;
  return { text: `${at}${rev}${stale ? ` · stale: the head is at revision ${head}` : ''}`, stale };
}
