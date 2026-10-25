#!/usr/bin/env python3
"""npm run audio -- <command> …: the Mega Drive audio pipeline (tools/audio/mdpipe), from the repository root.

  npm run audio -- setup                                   # pinned Furnace + GM SoundFont (once per machine)
  npm run audio -- ingest song.mid games/<id>/audio/projects/<slug>
  npm run audio -- all games/<id>/audio/projects/<slug>/spec.json   # .fur + .wav + .vgm + .mp3 + QA
  npm run audio -- sfx games/<id>/audio/sfx.json           # the sound effects of a game, from the shared palette
See wiki/en/create.music.md.
"""
import os, runpy, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'audio'))
sys.argv[0] = 'mdpipe'
runpy.run_module('mdpipe', run_name='__main__')
