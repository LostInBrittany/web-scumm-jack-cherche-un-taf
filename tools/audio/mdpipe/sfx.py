"""Sound effects from the house palette: short Furnace modules (one pattern, one row = one tick at 60 Hz) rendered to
WAV, trimmed, normalised and written as MP3 into a game's audio/sfx folder (what `npm run assets` ships). The recipes live in a game's sfx.json
(wiki/en/create.sound-effects.md#recipes): every effect uses the palette's FM patches, PSG envelopes and noise, so the
effects and the music share one sonic identity.

  sfx.json:
  {
    "rate": 60,                       # rows per second (Furnace hz, speed 1)
    "sfx": {
      "door_open": {
        "desc": "a latch, then a creak",
        "tracks": [
          {"ch": "FM1", "ins": "muted_pluck", "events": [{"row": 0, "note": "C3", "vol": 110, "fx": [["01", "08"]]}, {"row": 10, "off": true}]},
          {"ch": "NOISE", "ins": "noise_hat", "events": [{"row": 0, "note": "C6", "vol": 12}]}
        ],
        "rows": 24,                   # length (rows); trailing silence is trimmed anyway
        "gain": 0.9                   # peak after normalisation (default 0.9)
      }
    }
  }
Events: `note` (name or MIDI number; PSG tone channels get the Furnace octave compensation), `ins` (per track, or per
event), `vol` (FM 0-127, PSG 0-15), `fx` (list of [code, value] hex pairs: 01/02 pitch slide up/down, 00xy arpeggio,
04xy vibrato, 0Axy volume slide, EDxx delay…), `off` (note off), `legato`.
"""
import json, os, shutil, subprocess, wave
import numpy as np
from . import furwriter as fw
from .arrange import Bank, CHANNELS, IS_PSG, NOTE_OFF, pattern_note, DEFAULT_PALETTE, SpecError
from .midi import parse_note
from . import render


def build_fur(name, recipe, bank, rate):
    rows = int(recipe.get('rows') or 32)
    grid = {c: [None] * rows for c in CHANNELS}
    for tr in recipe.get('tracks', []):
        ch = tr['ch']
        if ch not in grid:
            raise SpecError(f'{name}: unknown channel {ch} ({", ".join(CHANNELS)})')
        for ev in tr.get('events', []):
            r = int(ev['row'])
            if r >= rows:
                raise SpecError(f'{name}: event at row {r} beyond length {rows}')
            cell = grid[ch][r] or {'fx': []}
            grid[ch][r] = cell
            if ev.get('off'):
                cell['note'] = NOTE_OFF
            elif 'note' in ev:
                p = parse_note(ev['note'])
                cell['note'] = p + 48 if ch == 'NOISE' else pattern_note(ch, p)
                ins = ev.get('ins', tr.get('ins'))
                if not ins:
                    raise SpecError(f'{name}: {ch} row {r} needs an instrument')
                cell['ins'] = bank.ins(ins)
                if 'vol' in ev:
                    cell['vol'] = int(ev['vol'])
                elif 'vol' in tr:
                    cell['vol'] = int(tr['vol'])
            elif 'vol' in ev:
                cell['vol'] = int(ev['vol'])
            for code, val in ev.get('fx', []):
                cell['fx'] = [f for f in cell['fx'] if f[0] != int(code, 16)] + [(int(code, 16), int(val, 16))]
            if len(cell['fx']) > 4:
                raise SpecError(f'{name}: {ch} row {r}: more than 4 effects')
    # stop at the end
    last = grid['FM1'][rows - 1] or {'fx': []}
    grid['FM1'][rows - 1] = last
    last['fx'] = [f for f in last['fx'] if f[0] != 0xFF] + [(0xFF, 0)]
    for ch in CHANNELS:
        if not IS_PSG[ch]:
            c0 = grid[ch][0] or {'fx': []}
            grid[ch][0] = c0
            if not any(f[0] == 0x08 for f in c0['fx']):
                c0['fx'].append((0x08, 0xFF))
    patlen = max(16, -(-rows // 16) * 16)
    pats, effcols, orders = [], [], []
    for ci, ch in enumerate(CHANNELS):
        cells = grid[ch] + [None] * (patlen - rows)
        pats.append(fw.pattern_block(ci, 0, cells, patlen))
        effcols.append(max(2, max((len(c['fx']) for c in cells if c), default=1)))
        orders.append([0])
    cv = bank.p['mix']['chip_volume']
    return fw.build_fur(name=name, author='web-scumm sfx', comment=recipe.get('desc', ''), systems=[0x83, 0x03],
                        sysvols=[cv['ym2612'], cv['sn76489']], patlen=patlen, orders=orders, effcols=effcols,
                        speeds=[1], hz=float(rate), instruments=bank.blocks, samples=bank.samples, patterns=pats,
                        chan_names=list(CHANNELS), hl=(4, 16))


def finish(wav, out_mp3, gain=0.9, tail_db=-50):
    """Trim the trailing silence, normalise the peak, fade the last 10 ms, encode MP3."""
    w = wave.open(wav); sr = w.getframerate(); n = w.getnframes(); nch = w.getnchannels()
    a = np.frombuffer(w.readframes(n), dtype=np.int16).reshape(-1, nch).astype(float) / 32768
    w.close()
    env = np.abs(a).max(axis=1)
    loud = np.where(env > 10 ** (tail_db / 20))[0]
    if not len(loud):
        raise SpecError(f'{os.path.basename(wav)}: silent render')
    end = min(len(a), loud[-1] + sr // 50)
    a = a[:end]
    peak = np.abs(a).max()
    a = a / peak * gain
    fade = min(len(a), sr // 100)
    a[-fade:] *= np.linspace(1, 0, fade)[:, None]
    out_wav = out_mp3[:-4] + '.wav'
    with wave.open(out_wav, 'wb') as o:
        o.setnchannels(nch); o.setsampwidth(2); o.setframerate(sr)
        o.writeframes(np.clip(np.round(a * 32767), -32768, 32767).astype(np.int16).tobytes())
    render.ffmpeg('-i', out_wav, '-c:a', 'libmp3lame', '-b:a', '128k', out_mp3)
    os.remove(out_wav)
    return {'seconds': round(len(a) / sr, 3), 'peak_in': round(float(peak), 3)}


def run(spec_path, out_dir=None, only=None):
    spec = json.load(open(spec_path))
    base = os.path.dirname(os.path.abspath(spec_path))
    pal_path = spec.get('palette')
    pal_path = os.path.join(base, pal_path) if pal_path else DEFAULT_PALETTE
    palette = json.load(open(pal_path))
    rate = spec.get('rate', 60)
    out_dir = out_dir or os.path.join(base, 'sfx')
    os.makedirs(out_dir, exist_ok=True)
    work = os.path.join(out_dir, '.sfx-build')
    os.makedirs(work, exist_ok=True)
    results = {}
    for name, recipe in spec['sfx'].items():
        if only and name not in only:
            continue
        bank = Bank(palette)
        fur = os.path.join(work, name + '.fur')
        open(fur, 'wb').write(build_fur(name, recipe, bank, rate))
        render.check_loads(fur)
        wav = os.path.join(work, name + '.wav')
        render.render_wav(fur, wav)
        results[name] = finish(wav, os.path.join(out_dir, name + '.mp3'), recipe.get('gain', 0.9))
        print(f"  {name:14} {results[name]['seconds']:5.2f} s  {recipe.get('desc', '')}")
    shutil.rmtree(work, ignore_errors=True)
    print(f'{len(results)} sound effect(s) in {out_dir}')
    return results
