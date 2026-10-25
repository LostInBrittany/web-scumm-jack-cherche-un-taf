"""Grandma's voice clips for "Who Am I Today?": a babble, one short tone per syllable of the line as it reads for
each hero, so every keyed clip (`garden.dust~form=gull`…) sounds different and lasts as long as its text. Stand-ins
for recorded voices (provenance.json): the mechanism is what the example shows. Deterministic (the text seeds the
melody). Writes games/heroes/audio/voice/<file>.mp3 with ffmpeg; run `python3 games/heroes/audio/babble.py`.
"""
import hashlib, os, re, subprocess, sys, tempfile, wave
import numpy as np

RATE = 22050
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'voice')

# file -> the line as it reads for that hero (game.ts `audio.voices` / `voicesByLang.fr`, locales/fr.json). Prefixed:
# public/assets/audio/voices is shared by every game.
CLIPS = {
    'heroes-dust-pixel': 'Under the watering can. Mind the dust: it tickles your whiskers.',
    'heroes-dust-biscuit': 'Under the watering can. Mind the dust: it tickles your big nose.',
    'heroes-dust-gull': 'Under the watering can. Mind the dust: it tickles your beak.',
    'heroes-bye': 'Off you go. Come back safe!',
    'heroes-fr-dust-pixel': "Sous l'arrosoir. Attention à la poussière : elle chatouille tes moustaches.",
    'heroes-fr-dust-biscuit': "Sous l'arrosoir. Attention à la poussière : elle chatouille ton gros nez.",
    'heroes-fr-dust-gull': "Sous l'arrosoir. Attention à la poussière : elle chatouille ton bec.",
    'heroes-fr-bye-gull': 'File. Reviens saine et sauve !',
    'heroes-fr-bye': 'File. Reviens sain et sauf !',
}

def syllables(text):
    return re.findall(r'[aeiouyàâéèêëîïôûù]+', text.lower())

def clip(text):
    seed = int(hashlib.sha256(text.encode()).hexdigest()[:8], 16)
    rng = np.random.default_rng(seed)
    parts = []
    base = 330.0  # Grandma's voice, a little high
    for word in re.findall(r"[\w'àâéèêëîïôûùç]+|[.,:!?]", text.lower()):
        if word in '.,:!?':
            parts.append(np.zeros(int(RATE * (0.18 if word in '.!?' else 0.09))))
            continue
        for _ in syllables(word) or ['_']:
            n = int(RATE * rng.uniform(0.07, 0.11))
            t = np.arange(n) / RATE
            f = base * 2 ** (rng.integers(-3, 5) / 12)
            glide = f * (1 + 0.04 * np.sin(np.pi * t / t[-1]))
            phase = 2 * np.pi * np.cumsum(glide) / RATE
            tone = np.sin(phase) + 0.45 * np.sin(2 * phase) + 0.2 * np.sin(3 * phase)
            env = np.minimum(1, np.minimum(t / 0.012, (t[-1] - t) / 0.025))
            parts.append(tone * env)
            parts.append(np.zeros(int(RATE * 0.025)))
        parts.append(np.zeros(int(RATE * 0.04)))
    s = np.concatenate(parts)
    return (s / np.abs(s).max() * 0.7 * 32767).astype(np.int16)

def main():
    os.makedirs(OUT, exist_ok=True)
    for name, text in CLIPS.items():
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            tmp = f.name
        with wave.open(tmp, 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(clip(text).tobytes())
        dst = os.path.join(OUT, f'{name}.mp3')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-b:a', '48k', '-ac', '1', '-map_metadata', '-1',
                        '-fflags', '+bitexact', dst], check=True)
        os.remove(tmp)
        print(f'✔  {os.path.relpath(dst)}')

if __name__ == '__main__':
    sys.exit(main())
