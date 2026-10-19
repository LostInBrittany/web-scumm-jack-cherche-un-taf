"""Tiny helpers to write the game's scores by hand (each project's compose.py writes its source.mid).

A line is a string of tokens `<note>:<beats>`, `r:<beats>` for a rest, `A4+C5+E5:<beats>` for a chord; `|` marks a bar
and is ignored. Unlike tools/audio's write_midi, `write` also stores the time signature (the fair's waltz is in 3/4).
"""
import os, struct, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../../tools/audio'))
from mdpipe.midi import Note, parse_note  # noqa: E402

PPQ = 480


def line(text, ch=0, start=0.0, vel=96, gap=12, transpose=0, weak=None):
    """Notes of a line of tokens, from beat `start`. `weak`: velocity of the notes off the beat (an accent pattern)."""
    out, t = [], start
    for tok in text.split():
        if tok == '|':
            continue
        name, beats = tok.rsplit(':', 1)
        d = float(beats)
        if name != 'r':
            for n in name.split('+'):
                a, b = int(round(t * PPQ)), int(round((t + d) * PPQ)) - gap
                v = weak if (weak is not None and abs(t - round(t)) > 1e-6) else vel
                out.append(Note(a, max(a + 1, b), parse_note(n) + transpose, v, ch))
        t += d
    return out


def length(text):
    """Beats in a line."""
    return sum(float(t.rsplit(':', 1)[1]) for t in text.split() if t != '|')


def write(path, tracks, bpm, num=4, den=4, names=None):
    """A format-1 MIDI: tempo and time signature on the first track, then one track per list of notes."""
    def vlq(v):
        out = [v & 0x7f]; v >>= 7
        while v:
            out.insert(0, (v & 0x7f) | 0x80); v >>= 7
        return bytes(out)
    dd = {1: 0, 2: 1, 4: 2, 8: 3}[den]
    meta = (vlq(0) + b'\xff\x51\x03' + int(60e6 / bpm).to_bytes(3, 'big')
            + vlq(0) + b'\xff\x58\x04' + bytes([num, dd, 24, 8]) + vlq(0) + b'\xff\x2f\x00')
    chunks = [b'MTrk' + struct.pack('>I', len(meta)) + meta]
    for ti, notes in enumerate(tracks):
        ev = []
        for n in notes:
            ev.append((n.start, 1, bytes([0x90 | n.channel, n.pitch, max(1, n.vel)])))
            ev.append((n.end, 0, bytes([0x80 | n.channel, n.pitch, 0])))
        ev.sort(key=lambda e: (e[0], e[1]))
        body, last = b'', 0
        if names and ti < len(names):
            nm = names[ti].encode()
            body += vlq(0) + b'\xff\x03' + vlq(len(nm)) + nm
        for t, _, data in ev:
            body += vlq(t - last) + data; last = t
        body += vlq(0) + b'\xff\x2f\x00'
        chunks.append(b'MTrk' + struct.pack('>I', len(body)) + body)
    open(path, 'wb').write(b'MThd' + struct.pack('>IHHH', 6, 1, len(chunks), PPQ) + b''.join(chunks))


def drums(pattern, bars, beats_per_bar=4, start_bar=0, steps_per_beat=4):
    """GM drums (channel 10) from a step pattern per voice, e.g. {36: 'x...x...', 38: '....x...'}, for `bars` bars."""
    out = []
    step = 1 / steps_per_beat
    for b in range(bars):
        for pitch, pat in pattern.items():
            for i, c in enumerate(pat):
                if c in 'xX':
                    t = (start_bar + b) * beats_per_bar + i * step
                    a = int(round(t * PPQ))
                    out.append(Note(a, a + PPQ // 8, pitch, 110 if c == 'X' else 90, 9))
    return out
