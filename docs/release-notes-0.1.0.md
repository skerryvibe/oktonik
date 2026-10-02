# OKTONIK 0.1.0

Harmonic performance instrument for Ableton Move / Schwung, by Skerry Vibe.

Play chords, adaptive melodies and independent bass together. Five focused
pages: PLAY, CHORD, MELODY, BASS and MIDI. This release is for live playing,
not sequencing or recording chord progressions.

## Changes since rc.4

- Shift + Track 1-4 opens a Schwung chain without leaving the performance.
  Knobs edit the visible synth/effect. Back navigates to the chain and then
  OKTONIK. Requires official Schwung 1.6.2+; no custom host patch.
- PLAY retains the active chord and harmonic function in the idle footer.
- Per-chord inversion can move downward or upward; AUTO is selectable between
  -1 and ROOT, with Shift+turn as an additional shortcut.
- Optional polyphonic melody aftertouch: MELODY knob 6 AT OFF/POLY, default OFF.
  The receiving instrument must support polyphonic key pressure; this is not MPE.
- Simple upward STRUM remains on PLAY/CHORD knob 7. No Shift menu pages.

## Install

Back up projects. Download **oktonik-module.tar.gz**, upload it through
Schwung Manager at `move.local:7700`, restart Move and select OKTONIK.
Do not select GitHub's Source code archives. OKTONIK generates MIDI, not audio:
set a receiving instrument and match routes/channels.

Existing schema-7 project settings are retained. Previous releases remain
available. This is still a Tool, not a chain MIDI FX module.

## Verification and feedback

261 JavaScript tests and 55 DSP test groups pass locally, including DSP
address/undefined-behavior sanitizers. Linux ARM64 builds and package contents
are verified. The author has reported positive physical Move testing and
approved release. This is not exhaustive certification of every destination,
synth's aftertouch response or screen-reader interaction.

Please report issues with Move/Schwung versions, MIDI routes/channels and
reproduction steps: https://github.com/skerryvibe/oktonik/issues

Guide: https://github.com/skerryvibe/oktonik/blob/main/docs/oktonik-public.md

Thanks to Charles Vestal and Schwung contributors, and Luke for the original
Chord Finder foundation. Developed with OpenAI ChatGPT/Codex assistance.
MIT license; inherited notices are retained. Independent of Ableton/OpenAI.
