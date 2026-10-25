"""The village square: "La Place des Monstres", an original tiptoe march written for the game.

`python3 compose.py [out.mid]` writes source.mid. D minor, 4/4, 108 BPM, 16 bars that loop: the sneaky tune with its
chromatic neighbour notes (1-8), a rounder middle part in F (9-12), the tune again (13-16). Pizzicato lead, a bone
xylophone an octave up, a walking staccato bass that creeps into each chord by a semitone, light hats on the off-beats.
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from jackmidi import line, write, drums  # noqa: E402
from mdpipe.midi import parse_note  # noqa: E402

A1 = 'D4:.5 r:.5 F4:.5 r:.5 A4:.5 G#4:.5 A4:1'
A2 = 'Bb4:.5 r:.5 A4:.5 r:.5 F4:.5 E4:.5 F4:1'
A3 = 'G4:.5 r:.5 Bb4:.5 r:.5 D5:.5 C#5:.5 D5:1'
A4 = 'E5:.5 D5:.5 C#5:.5 Bb4:.5 A4:2'
A8 = 'E5:.5 C#5:.5 A4:.5 C#5:.5 D5:2'
B1 = 'F5:1.5 E5:.5 D5:1 C5:1'
B2 = 'Bb4:1.5 A4:.5 G4:2'
B3 = 'A4:1.5 Bb4:.5 C5:1 D5:1'
B4 = 'E5:.5 F5:.5 E5:.5 D5:.5 C#5:2'
TUNE = [A1, A2, A3, A4, A1, A2, A3, A8, B1, B2, B3, B4, A1, A2, A3, A8]

# A chord a bar: (root, fifth, held voicing).
CH = {'Dm': ('D2', 'A2', 'D3+F3+A3'), 'Bb': ('Bb1', 'F2', 'D3+F3+Bb3'), 'Gm': ('G1', 'D2', 'D3+G3+Bb3'),
      'A': ('A1', 'E2', 'C#3+E3+A3'), 'F': ('F1', 'C2', 'C3+F3+A3'), 'C': ('C2', 'G2', 'C3+E3+G3')}
CHORDS = ['Dm', 'Bb', 'Gm', 'A', 'Dm', 'Bb', 'Gm', 'A', 'F', 'C', 'Dm', 'A', 'Dm', 'Bb', 'Gm', 'A']


def name(p):
    return ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'][p % 12] + str(p // 12 - 1)


def build():
    mel, bass, held = [], [], []
    for i, bar in enumerate(TUNE):
        mel += line(bar, 0, i * 4, 100)
        r, f, v = CH[CHORDS[i]]
        nxt = parse_note(CH[CHORDS[(i + 1) % len(CHORDS)]][0])
        creep = name(nxt - 1 if nxt - 1 != parse_note(r) else nxt + 1)   # a semitone under the next root
        bass += line(f'{r}:.5 r:.5 {f}:.5 r:.5 {r}:.5 r:.5 {creep}:.5 r:.5', 1, i * 4, 100)
        held += line(f'{v}:4', 2, i * 4, 70)
    kit = drums({36: 'x...............', 42: '..x...x...x...x.', 38: '..............x.'}, 16)
    return [mel, bass, held, kit]


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, 'source.mid')
    write(out, build(), 108, names=['tune', 'bass', 'bassoons', 'drums'])
    print('source.mid: 16 bars')
