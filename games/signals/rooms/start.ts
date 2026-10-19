import { defineRoom } from 'web-scumm/content';

// The sample game of the Reality Bridge (4.1.1): the gate opens when the right answer arrives by email (a signal from
// the world outside), or, if the outside never answers, when the radio on the bench is used (the signal's fallback).
// Geometry lives in layout/start.json.
export default defineRoom({
  id: 'start',
  name: 'The garden',
  decor: 'starter/decor/backyard',
  description: 'A quiet garden in the afternoon. Left: a wooden bench with an old radio on it. Right: a closed garden gate in a low wall. A sandy path as floor. Warm, calm, inviting',
  props: {
    bucket: { name: 'bucket', img: 'starter/items/bucket' },
  },
  hotspots: {
    bench: { name: 'radio' },
    gate: { name: 'gate' },
  },
  look: {
    bucket: 'A bucket. Red. Empty.',
    bench: 'An old radio on the bench. It hums.',
    gate: 'The gate. It opens for the right answer.',
  },
  on: [
    { id: 'start.take-bucket', verb: 'take', a: 'bucket', if: '!bucket_taken', do: [{ set: 'bucket_taken' }, { hide: 'bucket' }, { gain: 'bucket' }, 'Mine now.'] },
    { id: 'start.radio', verb: 'use', a: 'bench', if: '!gate_open', do: ['Static. Then a voice: "the answer is yes". Click.', { set: 'gate_open' }] },
    { id: 'start.locked-gate', verb: 'use', a: 'gate', if: '!gate_open', do: ['Locked. It waits for the right answer.'] },
    { id: 'start.open-gate', verb: 'use', a: 'gate', if: 'gate_open', do: ['The gate swings open.', { set: 'ended' }, { end: true }] },
    // The mailbox and the terminal (4.1.9): what the real connectors changed, seen in the garden.
    { id: 'start.radio-lamp', verb: 'look', a: 'bench', if: 'lamp_on', do: ['The radio hums along with the lamp in the shed.'] },
    { id: 'start.gate-shed', verb: 'look', a: 'gate', if: 'shed_open', do: ['Beyond the gate, the shed door stands open. A letter did that.'] },
    { id: 'start.bucket-ribbon', verb: 'look', a: 'bucket', if: 'badge_shown', do: ['A bucket. Red. Now with a ribbon on it.'] },
  ],
  events: [
    { id: 'start.mail-correct', on: 'mail.answer.correct', do: ['A letter arrives: "Yes." The gate clicks.', { set: 'gate_open' }] },
    { id: 'start.mail-wrong', on: 'mail.answer.wrong', do: ['A letter arrives: "No." Nothing happens.'] },
    { id: 'start.bell', on: 'hook.bell', once: false, do: [{ id: 'start.bell-lines', cycle: [['Ding.'], ['Dong.']] }] },
    { id: 'start.letter-door', on: 'letter.door', do: ['A letter slides under the shed door. Click: it opens.', { set: 'shed_open' }] },
    { id: 'start.letter-unclear', on: 'letter.unclear', once: false, do: ['A letter arrives. The handwriting is very confident and very unclear.'] },
    { id: 'start.lamp', on: 'terminal.lamp', do: ['In the shed, a lamp glows. Somebody typed the right thing.', { set: 'lamp_on' }] },
    { id: 'start.badge', on: 'badge.valid', do: ['A ribbon flutters down onto the bucket. Earned, apparently.', { set: 'badge_shown' }] },
    { id: 'start.badge-refused', on: 'badge.refused', once: false, do: ['A badge arrives, but nobody here can vouch for it.'] },
  ],
  hints: [
    { until: 'gate_open', lines: ['Send the right answer. Or try the radio.'] },
    { until: 'ended', lines: ['The gate is open.'] },
  ],
  onEnter: [{ id: 'start.first-arrival', once: ['A garden. The gate waits for an answer.'] }],
});

export const checkpoints = {
  start: { room: 'start', inventory: ['note'] },
};
