# OKTONIK 0.2.0

**Harmonic performance instrument · by Skerry Vibe**

0.2.0 adds clips and recording to the live instrument of 0.1.0. Back up your
Move projects before updating. Tested with Schwung 1.7.3.

## New since 0.1.0

- **Clips for chords, bass and melody:** eight clips per part in the clip view
  (Menu), each with its own length (16/32/64 steps), rate and quantize. A bass
  clip with notes plays its own line; an empty one follows the chord clip.
- **Recording:** the Sample button arms recording. PLAY records every part,
  Track 2 bass, Track 3 melody and Track 1 what SETUP C.REC says. Pressed while
  Move plays, recording starts at once (overdub). Undo restores the previous
  take; Mute + Track mutes a part.
- **Count-in and metronome:** a one-bar count-in from stop, and a metronome
  (OFF / ON / REC) with its own volume.
- **Step sequencing, as on Move:** tap a step to store, hold a step and press
  a later one for length, Left/Right to nudge, Copy + step to copy, Loop + step
  for clip length.
- **Shift + step shortcuts in Move's layout,** with lit icons under the steps.
- **Quantize per clip,** off by default and non-destructive (Shift + 16).
- **Harmony:** editable modifier pads, twelve extension profiles from POP to
  AMB, PENTA/BLUES melody palettes with adaptive SCALE TARGET.
- **Voicing:** CLOSE, OPEN or WIDE spread; LEAD OFF, CNTR or FREE.
- **Right-hand bass:** R.PAD (knob 7 on BASS or MELODY) switches all sixteen
  right-hand pads to bass.
- **Strum menu:** gap, direction, timing and velocity variation.
- **Co-run:** Shift + Track opens a Schwung chain while OKTONIK keeps playing.
- The illustrated guide comes with the package as **GUIDE.html**.

## Changes to existing behavior

- 0.1.0 projects keep their settings. New projects start with BASS and bass
  gesture on.
- New navigation: the main encoder turns through PLAY, EXT PROF, MOD PADS and
  MIDI; Track 1–3 open CHORD, BASS and MELODY (press again to return to PLAY);
  Menu opens the clip view.
- A held melody note keeps sounding through chord changes; strike it again for
  the new chord. MELODY's TRACK control is gone.
- LEAD has OFF / CNTR / FREE instead of LEAD ON/OFF plus REG. WIDE sounds
  narrower and clearer than in 0.1.0.
- Bass always follows how hard you play; the fixed bass velocity (VEL/B.VEL)
  is gone. Shift + step 10 plays everything at 127.
- To lock BORROW, hold its pad and press the main encoder (was Shift + BORROW).
  Shift + modifier pad now edits that pad's function.
- The step buttons, Loop, Copy, Delete and Sample are now used by OKTONIK.
- Returning to 0.1.0 can lose clips and newer settings; restore a backup.

## Install

Download **oktonik-module.tar.gz** from this release's assets (not GitHub's
Source code archives), upload it at `move.local:7700` on the same Wi-Fi,
restart Move and open OKTONIK from Schwung's tools.

## Known limits

- Tested on one Move. Please [report problems](https://github.com/skerryvibe/oktonik/issues).
- Tempo follows Move; OKTONIK has no tempo of its own.
- MIDI only: choose the receiving instruments and channels on MIDI.
