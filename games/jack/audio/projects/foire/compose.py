"""The fair: "Le Manège Hanté", an original haunted-carousel waltz written for the game.

`python3 compose.py [out.mid]` writes source.mid. E minor, 3/4, 138 BPM, 32 bars that loop, the tune twice (the second time on other instruments): the carousel tune with its
chromatic creep (1-8), a sweeter answer in C and A minor (9-12), the return (13-16). A calliope lead, a music-box
double an octave up, oom on the downbeat, pah-pah on the chords, a faint tss-tss on beats 2 and 3.
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from jackmidi import line, write, drums  # noqa: E402

TUNE = ['B4:1 E5:1 G5:1', 'B5:2 A#5:1', 'A5:1 F#5:1 D#5:1', 'B4:3',
        'B4:1 E5:1 G5:1', 'B5:2 C6:1', 'E6:1 C6:1 A5:1', 'F#5:2 D#5:1',
        'E5:1 G5:1 C6:1', 'B5:2 A5:1', 'A5:1 E5:1 C5:1', 'B4:2 C5:1',
        'B4:1 E5:1 G5:1', 'F#5:1 A5:1 D#5:1', 'E5:3', 'E5:1 r:2']
CHORDS = ['Em', 'Em', 'B7', 'Em', 'Em', 'C', 'Am', 'B7', 'C', 'G', 'Am', 'B7', 'Em', 'B7', 'Em', 'Em']
# (root, fifth, the pah-pah voicing)
CH = {'Em': ('E2', 'B1', 'G3+B3+E4'), 'B7': ('B1', 'F#2', 'F#3+A3+D#4'), 'C': ('C2', 'G2', 'G3+C4+E4'),
      'Am': ('A1', 'E2', 'A3+C4+E4'), 'G': ('G1', 'D2', 'G3+B3+D4')}


def build():
    mel, bass, pah = [], [], []
    for i, bar in enumerate(TUNE * 2):
        t = i * 3
        mel += line(bar, 0, t, 100)
        r, f, v = CH[CHORDS[i % 16]]
        same = i % 16 > 0 and CHORDS[i % 16 - 1] == CHORDS[i % 16]
        bass += line(f'{f if same else r}:1 r:2', 1, t, 100)
        pah += line(f'r:1 {v}:.75 r:.25 {v}:.75 r:.25', 2, t, 80)
    kit = drums({42: '....x...x...'}, 32, beats_per_bar=3)
    return [mel, bass, pah, kit]


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, 'source.mid')
    write(out, build(), 138, num=3, names=['calliope', 'oom', 'pah', 'drums'])
    print('source.mid: 32 bars of 3/4')
