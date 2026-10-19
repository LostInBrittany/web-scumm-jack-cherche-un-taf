# Analysis of games/jack/audio/projects/fin/source.mid
PPQ 480 | tempo 120.0 BPM @tick 0 | time sig [(0, 4, 4)] | 3 bars | 5.99 s

## Tracks
- [1] fanfare {} notes=16 range=G4-D6 poly=1 octave-pairs=0.0 bars 1-3 grid={8: 12, 16: 2, 32: 2} bends=0 vel=[100, 100]
- [2] bass {} notes=6 range=A1-E2 poly=1 octave-pairs=0.0 bars 1-3 grid={8: 6} bends=0 vel=[100, 100]
- [3] chords {} notes=11 range=A3-D5 poly=4 octave-pairs=0.18 bars 1-3 grid={8: 11} bends=0 vel=[80, 80]
- [4] drums DRUMS {} notes=10 range=C2-C#3 poly=2 octave-pairs=0.0 bars 1-3 grid={8: 8, 16: 2} bends=0 vel=[90, 90]
    drums: {'36 Kick 1': 5, '38 Snare 1': 4, '49 Crash 1': 1}

## Doublings between tracks (merge these, never spend two channels on them)
- track - / track -: none found

## Activity map (# >=4 onsets, + 1-3 onsets, ~ sustained, . silent); columns = tracks [1, 2, 3, 4]
  1 #+++
  2 #+##
  3 ++#+

## Track 1 fanfare
  1 0:A4/0.9 1:G4/0.9 2:A4/5.9 10:D5/1.9 12:F#5/1.9 14:A5/1.9
  2 0:G5/0.4 0.5:F#5/0.4 1:E5/0.4 1.5:D5/0.4 2:C#5/5.9 8:D5/1.9 10:F#5/1.9 12:A5/1.9 14:C#6/1.9
  3 0:D6/15.9

## Track 2 bass
  1 0:D2/7.9 8:A1/7.9
  2 0:A1/7.9 8:E2/3.9 12:A1/3.9
  3 0:D2/15.9

## Track 3 chords
  1 0:D4/15.9 0:F#4/15.9 0:A4/15.9
  2 0:A3/15.9 0:C#4/15.9 0:E4/15.9 0:G4/15.9
  3 0:D4/15.9 0:F#4/15.9 0:A4/15.9 0:D5/15.9

## Track 4 drums
  1 36:x.......x.......
  2 36:x.......x....... | 38:............xxxx
  3 36:x............... | 49:x...............