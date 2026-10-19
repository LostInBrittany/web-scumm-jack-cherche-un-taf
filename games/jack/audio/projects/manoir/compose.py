"""The Count's manor: the opening of Bach's Toccata in D minor, BWV 565 (public domain), written out for the game.

`python3 compose.py [out.mid]` writes source.mid. D minor, 4/4, 72 BPM, 16 bars that loop: the famous call three
times, an octave lower each time (1-6), the diminished chord over the pedal and its D minor answer (7-8), then a
running organ figure over an A pedal in Bach's manner (9-16), which is ours, as are the chords and the thunder.
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from jackmidi import line, write, drums  # noqa: E402

CALL = 'A{o}:.25 G{o}:.25 A{o}:2.5 r:1 | G{o}:.125 F{o}:.125 E{o}:.125 D{o}:.125 C#{o}:1.5 D{o}:2'
RUN_D = 'A4:.25 G4:.25 A4:.25 F4:.25 A4:.25 E4:.25 A4:.25 D4:.25 A4:.25 C#4:.25 A4:.25 D4:.25 A4:.25 E4:.25 A4:.25 F4:.25'
RUN_G = 'Bb4:.25 A4:.25 Bb4:.25 G4:.25 Bb4:.25 F4:.25 Bb4:.25 E4:.25 Bb4:.25 D4:.25 Bb4:.25 E4:.25 Bb4:.25 F4:.25 Bb4:.25 G4:.25'
RUN_A = 'G4:.25 F4:.25 E4:.25 D4:.25 C#4:.25 E4:.25 G4:.25 Bb4:.25 A4:.25 G4:.25 F4:.25 E4:.25 D4:.25 C#4:.25 D4:.25 E4:.25'
FALL = 'D6:.25 C#6:.25 Bb5:.25 A5:.25 G5:.25 F5:.25 E5:.25 D5:.25 C#5:.25 Bb4:.25 A4:.25 G4:.25 F4:.25 E4:.25 D4:.25 C#4:.25'

MELODY = (CALL.format(o=5) + ' | ' + CALL.format(o=4) + ' | ' + CALL.format(o=3) + ' | '
          + 'C#3:.5 E3:.5 G3:.5 Bb3:.5 C#4:.5 E4:.5 G4:.5 Bb4:.5 | D5:4 | '
          + ' | '.join([RUN_D, RUN_G, RUN_D, RUN_A]) + ' | ')
PEDAL = 'r:4 | r:2 D2:2 | r:4 | r:2 D2:2 | r:4 | r:2 D2:2 | D2:4 | D2:4 | D2:4 | G1:4 | D2:4 | A1:4 | D2:4 | G1:4 | A1:4 | D2:4'
CHORDS = ('r:4 | r:2 D4+F4+A4:2 | r:4 | r:2 A3+D4+F4:2 | r:4 | r:2 F3+A3+D4:2 | C#4+E4+G4+Bb4:4 | D4+F4+A4:4 | '
          'D4+F4:4 | D4+G4:4 | D4+F4:4 | C#4+E4:4 | F4+A4:4 | G4+Bb4:4 | C#4+E4:4 | D4+F4+A4:4')


def build():
    mel = line(MELODY, 0, 0, 100)
    mel += line(RUN_D + ' ' + RUN_G, 0, 48, 100, transpose=12)   # bars 13-14: the figure an octave up
    mel += line(FALL + ' | D4:4', 0, 56, 100)                     # bars 15-16: the fall and the last D
    bass = line(PEDAL, 1, 0, 100)
    chords = line(CHORDS, 2, 0, 80)
    thunder = drums({49: 'x...............'}, 1) + drums({49: 'x...............', 41: 'x...x...x...x...'}, 1, start_bar=6)
    return [mel, bass, chords, thunder]


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, 'source.mid')
    write(out, build(), 72, names=['organ', 'pedal', 'chords', 'thunder'])
    print('source.mid: 16 bars')
