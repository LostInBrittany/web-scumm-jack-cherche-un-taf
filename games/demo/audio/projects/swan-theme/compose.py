"""The demo's theme, written for web-scumm (3.7): `python3 compose.py` writes source.mid.

The tune is the oboe theme of Tchaikovsky's Swan Lake (1876, public domain), set down here note by note with our own
harmony, harp, strings and bass: no third-party transcription is used, so the arrangement and its renders carry the
project's licence (SOURCE.md). B minor, 4/4, 80 BPM, 17 bars: the theme (1-4), its answer (5-8), the harp's
descending sequence (9-12), the rise and the cadence (13-17).
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../../../../tools/audio'))
from mdpipe.midi import Note, write_midi, parse_note  # noqa: E402

PPQ = 480
BEAT = PPQ
BAR = 4 * BEAT

# The melody: (note, beats) per bar; None is a rest.
MELODY = [
    [('F#5', 3), ('B4', .5), ('C#5', .5)],
    [('D5', .5), ('E5', .5), ('F#5', 1.5), ('D5', .5), ('F#5', 1)],
    [('D5', .5), ('F#5', 1.5), ('B4', .5), ('D5', .5), ('B4', .5), ('G4', .5)],
    [('B4', 4)],
    [('F#5', 3), ('B4', .5), ('C#5', .5)],
    [('D5', .5), ('E5', .5), ('F#5', 1.5), ('D5', .5), ('F#5', 1)],
    [('D5', .5), ('F#5', 1.5), ('B4', .5), ('D5', .5), ('B4', .5), ('G4', .5)],
    [('B4', 2), ('C#5', 1), ('D5', 1)],
    [('E5', 2), ('D5', 1), ('C#5', 1)],
    [('D5', 2), ('C#5', 1), ('B4', 1)],
    [('C#5', 2), ('B4', 1), ('A#4', 1)],
    [('B4', 4)],
    [('B4', 1), ('D5', 1), ('F#5', 1), ('B5', 1)],
    [('A5', 2), ('G5', 1), ('F#5', 1)],
    [('E5', 2), ('G5', 1), ('E5', 1)],
    [('F#5', 4)],
    [('B4', 4)],
]

# One chord a bar: root, third, fifth (pitch classes as names, placed by each part in its register).
CHORDS = ['Bm', 'Bm', 'G', 'Bm', 'Bm', 'Bm', 'G', 'Em', 'Em', 'Bm', 'F#', 'Bm', 'Bm', 'D', 'Em', 'F#', 'Bm']
TRIADS = {'Bm': ('B', 'D', 'F#'), 'G': ('G', 'B', 'D'), 'Em': ('E', 'G', 'B'), 'D': ('D', 'F#', 'A'), 'F#': ('F#', 'A#', 'C#')}

PC = {n: i for i, n in enumerate('C C# D D# E F F# G G# A A# B'.split())}


def near(name, lo):
    """The pitch of a pitch class at or above `lo` (a MIDI number)."""
    p = lo + (PC[name] - lo) % 12
    return p


def melody():
    out, t = [], 0
    for bar in MELODY:
        for n, beats in bar:
            d = int(beats * BEAT)
            if n: out.append(Note(t, t + d - 10, parse_note(n), 96, 0))
            t += d
    return out


def strings(voice):
    """A sustained chord tone a bar (voice 0: the fifth or the third on top, 1: the root below), held as a pad."""
    out = []
    for i, c in enumerate(CHORDS):
        r, th, f = TRIADS[c]
        p = near(th, 62) if voice == 0 else near(r, 55)
        out.append(Note(i * BAR, (i + 1) * BAR - 20, p, 70, 1 + voice))
    return out


def harp():
    """Rising and falling eighths over each chord: root, third, fifth, octave, and back."""
    out = []
    for i, c in enumerate(CHORDS):
        r, th, f = TRIADS[c]
        root = near(r, 50)
        seq = [root, near(th, root), near(f, root), root + 12, near(th, root + 12), root + 12, near(f, root), near(th, root)]
        if i == len(CHORDS) - 1: seq = [root, near(th, root), near(f, root), root + 12]
        step = BAR // len(seq)
        for k, p in enumerate(seq):
            out.append(Note(i * BAR + k * step, i * BAR + (k + 1) * step - 10, p, 80 if k % 2 == 0 else 64, 3))
    return out


def bass():
    """The root on the downbeat, the fifth on the third beat (the last bar: the root alone)."""
    out = []
    for i, c in enumerate(CHORDS):
        r, th, f = TRIADS[c]
        root = near(r, 35)
        if i == len(CHORDS) - 1:
            out.append(Note(i * BAR, (i + 1) * BAR - 20, root, 100, 4)); continue
        out.append(Note(i * BAR, i * BAR + 2 * BEAT - 20, root, 100, 4))
        out.append(Note(i * BAR + 2 * BEAT, (i + 1) * BAR - 20, near(f, root), 90, 4))
    return out


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    write_midi(os.path.join(here, 'source.mid'), PPQ, [melody(), strings(0), strings(1), harp(), bass()], bpm=80,
               names=['oboe', 'strings high', 'strings low', 'harp', 'bass'])
    print('source.mid:', len(MELODY), 'bars')
