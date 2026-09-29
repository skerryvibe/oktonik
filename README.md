# OKTONIK
### Harmonic performance instrument

By **Skerry Vibe**.

Play chords, melody and bass together on Ableton Move through Schwung.
Explore harmony with your left hand, play melodies with your right, and route
each part to a different instrument. OKTONIK generates MIDI, not audio.

## Public preview 0.1.0-rc.2

- Five pages: PLAY, CHORD, MELODY, BASS and MIDI.
- Live Chord Map, harmonic modifiers and per-pad chord editing.
- Adaptive melody, Bass Gesture, independent sustain and MIDI routing.
- Simple STRUM on CHORD.
- No IDEAS, ARP, sequencer, step programming, recording or Capture in Public.

Requires Move with a compatible Schwung installation and a receiving instrument.
This is a release candidate; physical Move acceptance testing remains required.

## Install

Download the Public installation archive from
[Releases](https://github.com/skerryvibe/oktonik/releases).

Upload `oktonik-public-0.1.0-rc.2.tar.gz` through Schwung at `move.local:7700`.
Do not extract it. Restart Move and select **OKTONIK**. Back up projects first.

The experimental **OKTONIK Lab** can be built from the same source, using ID `oktonik-lab`;
Public uses `oktonik`. Both can be installed, with independent global and
per-project settings. This does not mean both should control MIDI simultaneously.

On first open, each profile copies valid schema-7 Chord Pilot state for the same
project only if its own file is absent. Original files remain untouched. There
is no ongoing synchronization. Keep the old installation until imports are tested.

See [the playing guide](docs/oktonik-public.md) and
[release checklist](docs/release-checklist.md).

## Development

Both profiles share one musical core. Source defaults to Lab; packaging chooses
the profile. Node.js 22+ and a native C compiler are needed for `npm test`.
`npm run build` uses the cross-compiler setup in `scripts/build-dsp.sh`, creates
both archives in `dist/` and checks their contents byte for byte. `npm run verify`
checks existing archives. No build or test publishes anything.

IDEAS, ARP and sequencing stay in Lab. Melody recording, retrospective Capture,
clips and further harmony features are future work, not Public promises.

## Credits

Created by Skerry Vibe. Developed with assistance from OpenAI ChatGPT and Codex.
See [NOTICE](NOTICE.md) and [MIT license](LICENSE) for inherited attribution.
Independent project, not an official Ableton product.

GitHub: [skerryvibe/oktonik](https://github.com/skerryvibe/oktonik).
Only the Public installation package is distributed in this prerelease;
Lab source is included for ongoing development.
