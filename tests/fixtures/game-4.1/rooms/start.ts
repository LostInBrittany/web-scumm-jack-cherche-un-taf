import { defineRoom } from 'web-scumm/content';

// One room to start from. Logic lives here; geometry lives in layout/start.json (placement editor: ?edit=start).
export default defineRoom({
  id: 'start',
  name: 'The garden',
  decor: 'starter/decor/backyard',
  description:
    'A quiet garden in the afternoon. Left: a wooden bench under a tree. Right: a closed garden gate in a low wall. A sandy path as floor. Warm, calm, inviting',
  props: {
    bucket: { name: 'bucket', img: 'starter/items/bucket' },
  },
  hotspots: {
    bench: { name: 'bench' },
    gate: { name: 'gate' },
  },
  look: {
    bucket: ['A bucket. Red. Empty.', 'Still a bucket.', 'I could fit in it. I will not.'],
    bench: 'A bench. Good for naps.',
    gate: 'The gate. The world is behind it.',
  },
  on: [
    {
      verb: 'take',
      a: 'bucket',
      if: '!bucket_taken',
      do: [{ set: 'bucket_taken' }, { hide: 'bucket' }, { gain: 'bucket' }, 'Mine now.'],
    },
    { verb: 'use', a: 'gate', if: '!bucket_taken', do: ['Locked. Every adventure starts with a locked gate.'] },
    {
      verb: 'use',
      a: 'bucket',
      b: 'gate',
      do: ['Bucket on head. Gate opened. Adventure started.', { lose: 'bucket' }, { set: 'ended' }, { end: true }],
    },
  ],
  hints: [
    { until: 'bucket_taken', lines: ['Try taking the bucket.'] },
    { until: 'ended', lines: ['The gate. With the bucket. Trust me.'] },
  ],
  onEnter: [{ once: ['A garden. A quiet one. For now.'] }],
});

export const checkpoints = {
  start: { room: 'start', inventory: ['note'] },
};
