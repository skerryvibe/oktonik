# OKTONIK — Harmonic performance instrument

By Skerry Vibe. Public preview 0.1.0-rc.2.

## Install

Upload `oktonik-public-0.1.0-rc.2.tar.gz` in Schwung at move.local:7700 and restart
Move. Choose OKTONIK. For experiments install the separate OKTONIK Lab package.
IDs are `oktonik` and `oktonik-lab`: both can be installed with independent saves.
Back up projects. Each profile copies valid schema-7 Chord Pilot data only when
its own save file is absent; original data is never written. No ongoing sync.

## Play

- Main encoder or Menu: PLAY, CHORD, MELODY, BASS, MIDI.
- Eight lower-left pads: chords; sixteen right-hand pads: melody.
- Hold modifiers for dominant, major/minor, sus2/sus4, ii, substitute or borrowed
  harmony. Shift + BORROW locks/unlocks borrowed harmony.
- Shift + chord pad opens per-pad editing; repeat to exit.
- CHORD knob 7 STRUM: ascending note spacing in milliseconds.
- Bass Gesture: hold a chord pad, press another to choose its root as bass.
  Release all pads before the next chord.
- Each part has sustain options and MIDI routing. CC64 affects an entire channel;
  use separate channels for parts with different sustain requirements.
- STOP pad releases all module notes and sustain.

Public has no IDEAS, ARP, sequence playback, steps, Record, Undo or Capture.
These remain in Lab. Stored experimental data is retained but inactive in Public.
Physical Move acceptance testing is required before general release.

Created by Skerry Vibe. Developed with assistance from OpenAI ChatGPT and Codex.
See LICENSE and NOTICE.md for inherited attribution.
