# OKTONIK
### Harmonic performance instrument

By **Skerry Vibe**.

Play chords, melody and bass together on Ableton Move through Schwung.
Explore harmony with your left hand, play melodies with your right, and route
each part to a different instrument. OKTONIK generates MIDI, not audio.

## OKTONIK 0.1.0

Co-run chain editing, persistent PLAY harmony feedback, signed inversions,
simple STRUM and opt-in melody poly aftertouch on MELODY knob 6.
 [Installation notes](docs/install-public.md).

- Five pages: PLAY, CHORD, MELODY, BASS and MIDI.
- Live Chord Map, harmonic modifiers and per-pad chord editing.
- Adaptive melody, Bass Gesture, independent sustain and MIDI routing.
- STRUM on CHORD.
- CHORD controls directly on PLAY, with parameter/value feedback.
- Longer Chord Map names use two lines without shrinking the text.
- Focused on live playing.

**[Illustrated user guide](docs/oktonik-public.md)** ·
**[Report a problem](https://github.com/skerryvibe/oktonik/issues)**

![Chords and modifiers on the left; sixteen melody pads on the right](docs/images/pad-layout.svg)

Requires Ableton Move, **Schwung 1.6.2 or newer**, and a receiving instrument.
Shift + Track 1-4 opens a Schwung chain while OKTONIK pads keep playing.
Back returns through the chain views to OKTONIK. This is a Tool, not a MIDI FX.

## Install

Download the Public installation archive from
[Releases](https://github.com/skerryvibe/oktonik/releases).

Upload `oktonik-module.tar.gz` through Schwung at `move.local:7700`.
Do not extract it. Restart Move and select **OKTONIK**. Back up projects first.

On first open, OKTONIK copies valid schema-7 Chord Pilot state for the same
project only if its own file is absent. Original files remain untouched. There
is no ongoing synchronization. Keep the old installation until imports are tested.

See [the illustrated user guide](docs/oktonik-public.md) for a first jam,
modifier examples, Bass Gesture, melody, sustain and MIDI routing.

## Help shape the instrument

Try chord changes, modifiers, Bass Gesture, melody and sustain with your own
instruments. For bug reports, include the OKTONIK version, Move/Schwung versions,
MIDI routes/channels and steps to reproduce the problem.

## Credits

Created by Skerry Vibe. Developed with assistance from OpenAI ChatGPT and Codex.
See [NOTICE](NOTICE.md) and [MIT license](LICENSE) for inherited attribution.
Independent project, not an official Ableton product.

GitHub: [skerryvibe/oktonik](https://github.com/skerryvibe/oktonik).

## In development

We are exploring richer harmonic suggestions, expressive strum and playing
patterns, and ways to capture musical ideas. These are not features of this
release and have no promised release date. The priority is a reliable,
playable live instrument.
