"""The reference chapter's second score and its two bridges, written for web-scumm (3.7): `python3 compose.py` writes
source.mid here and in ../bridge-to-market and ../bridge-to-theme.

"Night Market": D major, 4/4, 96 BPM, 16 bars in four phrases of four, a tune over off-beat chords and a walking bass.
The bridges join it to the theme (B minor, 80 BPM): two bars each, played once at the transition's landing
(games/reference/game.ts `audio.transitions`). Everything here is written for the project (SOURCE.md).
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../../../../tools/audio'))
from mdpipe.midi import Note, write_midi, parse_note  # noqa: E402

PPQ = 480
BEAT = PPQ
BAR = 4 * BEAT
PC = {n: i for i, n in enumerate('C C# D D# E F F# G G# A A# B'.split())}
TRIADS = {'D': ('D', 'F#', 'A'), 'G': ('G', 'B', 'D'), 'A': ('A', 'C#', 'E'), 'Bm': ('B', 'D', 'F#'), 'F#m': ('F#', 'A', 'C#'),
          'A7': ('A', 'C#', 'G'), 'F#': ('F#', 'A#', 'C#')}


def near(name, lo):
    return lo + (PC[name] - lo) % 12


def line(bars, ch=0, vel=96):
    out, t = [], 0
    for bar in bars:
        for n, beats in bar:
            d = int(beats * BEAT)
            if n: out.append(Note(t, t + d - 10, parse_note(n), vel, ch))
            t += d
    return out


def offbeats(chords, voice):
    """Chord stabs on the off-beats (the and of each beat): voice 0 the third on top, 1 the root below."""
    out = []
    for i, c in enumerate(chords):
        r, th, f = TRIADS[c]
        p = near(th, 64) if voice == 0 else near(r, 57)
        for k in range(4):
            s = i * BAR + k * BEAT + BEAT // 2
            out.append(Note(s, s + BEAT // 2 - 20, p, 72, 1 + voice))
    return out


def pads(chords, voice):
    out = []
    for i, c in enumerate(chords):
        r, th, f = TRIADS[c]
        p = near(th, 62) if voice == 0 else near(r, 55)
        out.append(Note(i * BAR, (i + 1) * BAR - 20, p, 70, 1 + voice))
    return out


def walking(chords, last_hold=True):
    """Root, fifth, root, fifth in quarters (the last bar: the root held)."""
    out = []
    for i, c in enumerate(chords):
        r, th, f = TRIADS[c]
        root = near(r, 38)
        if last_hold and i == len(chords) - 1:
            out.append(Note(i * BAR, (i + 1) * BAR - 20, root, 100, 3)); continue
        for k, p in enumerate([root, near(f, root), root, near(th, root)]):
            out.append(Note(i * BAR + k * BEAT, i * BAR + (k + 1) * BEAT - 20, p, 100 if k % 2 == 0 else 88, 3))
    return out


MARKET_CHORDS = ['D', 'G', 'A', 'D', 'Bm', 'G', 'A7', 'D', 'G', 'A', 'F#m', 'Bm', 'G', 'A7', 'D', 'D']
MARKET = [
    [('A4', .5), ('D5', .5), ('F#5', 1), ('E5', .5), ('D5', .5), ('E5', 1)],
    [('D5', .5), ('B4', .5), ('G4', 1), ('B4', .5), ('D5', .5), ('G5', 1)],
    [('F#5', .5), ('E5', .5), ('C#5', 1), ('E5', .5), ('A4', .5), ('C#5', 1)],
    [('D5', 2), ('F#5', 1), ('A5', 1)],
    [('B5', 1), ('A5', .5), ('F#5', .5), ('D5', 1), ('F#5', 1)],
    [('G5', 1), ('F#5', .5), ('E5', .5), ('D5', 1), ('B4', 1)],
    [('C#5', .5), ('D5', .5), ('E5', 1), ('A5', 1), ('G5', 1)],
    [('F#5', 2), ('D5', 2)],
    [('B4', .5), ('D5', .5), ('G5', 1), ('F#5', .5), ('E5', .5), ('D5', 1)],
    [('C#5', .5), ('E5', .5), ('A5', 1), ('G5', .5), ('F#5', .5), ('E5', 1)],
    [('F#5', .5), ('A5', .5), ('C#6', 1), ('A5', 1), ('F#5', 1)],
    [('D5', 1), ('F#5', 1), ('B5', 2)],
    [('G5', .5), ('F#5', .5), ('E5', .5), ('D5', .5), ('B4', 1), ('D5', 1)],
    [('E5', .5), ('F#5', .5), ('G5', .5), ('A5', .5), ('C#5', 1), ('E5', 1)],
    [('D5', 1), ('F#5', 1), ('A5', 1), ('F#5', 1)],
    [('D5', 4)],
]

# Theme (B minor) → market (D major): B minor turns to A7, the market's dominant.
TO_MARKET_CHORDS = ['Bm', 'A7']
TO_MARKET = [[('B4', 1), ('D5', 1), ('F#5', 2)], [('E5', 1), ('G5', 1), ('C#5', 1), ('A4', 1)]]
# Market → theme: D major turns to F#, the theme's dominant (it starts on F#).
TO_THEME_CHORDS = ['D', 'F#']
TO_THEME = [[('A5', 1), ('F#5', 1), ('D5', 2)], [('C#5', 1), ('A#4', 1), ('F#4', 2)]]

if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    names = ['tune', 'chords high', 'chords low', 'bass']
    write_midi(os.path.join(here, 'source.mid'), PPQ, [line(MARKET), offbeats(MARKET_CHORDS, 0), offbeats(MARKET_CHORDS, 1), walking(MARKET_CHORDS)], bpm=96, names=names)
    write_midi(os.path.join(here, '../bridge-to-market/source.mid'), PPQ, [line(TO_MARKET), pads(TO_MARKET_CHORDS, 0), pads(TO_MARKET_CHORDS, 1), walking(TO_MARKET_CHORDS, False)], bpm=88, names=names)
    write_midi(os.path.join(here, '../bridge-to-theme/source.mid'), PPQ, [line(TO_THEME), pads(TO_THEME_CHORDS, 0), pads(TO_THEME_CHORDS, 1), walking(TO_THEME_CHORDS, False)], bpm=88, names=names)
    print('night-market: 16 bars; bridges: 2 bars each')
