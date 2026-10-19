"""The ghost train: Grieg's "In the Hall of the Mountain King" (1875, public domain), notes written out for the game.

`python3 compose.py [out.mid]` writes source.mid (or out.mid, to ingest it: `npm run audio -- ingest out.mid <here>`). B minor, 4/4, 132 BPM, 16 bars that loop: the theme low (1-4), an octave up
(5-8), the theme on the dominant (9-12), the theme again with the whole band (13-16). The harmony, the bass and the
drums are ours. Grieg's famous accelerando is left out: one tempo per build (docs/en/AUDIO.md).
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from jackmidi import line, write, drums  # noqa: E402

A = ('B3:.5 C#4:.5 D4:.5 E4:.5 F#4:.5 D4:.5 F#4:1 | F4:.5 C#4:.5 F4:1 E4:.5 C4:.5 E4:1 | '
     'B3:.5 C#4:.5 D4:.5 E4:.5 F#4:.5 D4:.5 F#4:.5 B4:.5 | A4:.5 F#4:.5 D4:.5 F#4:.5 A4:2')
B = ('F#4:.5 G#4:.5 A#4:.5 B4:.5 C#5:.5 A#4:.5 C#5:1 | D5:.5 A#4:.5 D5:1 C#5:.5 A#4:.5 C#5:1 | '
     'F#4:.5 G#4:.5 A#4:.5 B4:.5 C#5:.5 A#4:.5 C#5:.5 F#5:.5 | E5:.5 C#5:.5 A#4:.5 C#5:.5 E5:2')

# One chord a bar: (bass root, fifth, the chord stabbed on the off-beats).
A_CH = [('B1', 'F#2', 'D4+F#4+B4'), ('C#2', 'G#2', 'C#4+F4+G#4'), ('B1', 'F#2', 'D4+F#4+B4'), ('D2', 'A2', 'D4+F#4+A4')]
B_CH = [('F#1', 'C#2', 'C#4+F#4+A#4'), ('F#1', 'C#2', 'D4+F#4+A#4'), ('F#1', 'C#2', 'C#4+F#4+A#4'), ('C#2', 'G#2', 'C#4+E#4+G#4')]
FORM = [(A, A_CH, -12), (A, A_CH, 0), (B, B_CH, -12), (A, A_CH, 0)]


def build():
    mel, bass, stabs = [], [], []
    for k, (tune, chords, tr) in enumerate(FORM):
        start = k * 16
        mel += line(tune, 0, start, 100, transpose=tr + 12)
        for i, (r, f, ch) in enumerate(chords):
            t = start + i * 4
            bass += line(f'{r}:.5 r:.5 {f}:.5 r:.5 {r}:.5 r:.5 {f}:.5 r:.5', 1, t, 100)
            if k > 0:
                stabs += line(f'r:.5 {ch}:.5 r:.5 {ch}:.5 r:.5 {ch}:.5 r:.5 {ch}:.5', 2, t, 80)
    kit = (drums({36: 'x.......x.......'}, 4)
           + drums({36: 'x.......x.......', 38: '....x.......x...'}, 4, start_bar=4)
           + drums({36: 'x.......x.......', 38: '....x.......x...', 42: 'x.x.x.x.x.x.x.x.'}, 8, start_bar=8))
    return [mel, bass, stabs, kit]


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, 'source.mid')
    write(out, build(), 132, names=['theme', 'bass', 'stabs', 'drums'])
    print('source.mid: 16 bars')
