"""The ending jingle: "Embauché !", the Count's Toccata call turned into D major, written for the game.

`python3 compose.py [out.mid]` writes source.mid. D major, 4/4, 120 BPM, 3 bars and a ring-out: the call (A G A) and
a rising arpeggio, the little run down to C#, a snare roll, then the big D major chord with a crash. Played once.
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from jackmidi import line, write, drums  # noqa: E402

TUNE = ('A4:.25 G4:.25 A4:1.5 r:.5 D5:.5 F#5:.5 A5:.5 | '
        'G5:.125 F#5:.125 E5:.125 D5:.125 C#5:1.5 D5:.5 F#5:.5 A5:.5 C#6:.5 | D6:4')
CHORDS = 'D4+F#4+A4:4 | A3+C#4+E4+G4:4 | D4+F#4+A4+D5:4'
BASS = 'D2:2 A1:2 | A1:2 E2:1 A1:1 | D2:4'


def build():
    kit = (drums({36: 'x.......x.......'}, 1)
           + drums({36: 'x.......x.......', 38: '............xxxx'}, 1, start_bar=1)
           + drums({36: 'x...............', 49: 'x...............'}, 1, start_bar=2))
    return [line(TUNE, 0, 0, 100), line(BASS, 1, 0, 100), line(CHORDS, 2, 0, 80), kit]


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, 'source.mid')
    write(out, build(), 120, names=['fanfare', 'bass', 'chords', 'drums'])
    print('source.mid: 3 bars')
