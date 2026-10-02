# OKTONIK — Harmonic performance instrument

By Skerry Vibe. Public 0.1.0. Requires Schwung 1.6.2+.

Back up projects, upload oktonik-public-0.1.0.tar.gz (or the identical
oktonik-module.tar.gz store package) through Schwung at
move.local:7700, restart Move and select OKTONIK. OKTONIK generates MIDI, not audio.

Eight lower-left pads play chords; sixteen right pads play melody. Upper-left
pads prepare harmonic modifiers. STOP releases module notes and sustain.

PLAY and CHORD share knobs 1–8: KEY, SCALE, EXT, OCT, SPRD, LEAD, STRUM, SUST.
PLAY retains the chord map; touch or turn a knob to see its parameter and value.
Long chord names use two lines; very long names still end in ~ when truncated.
Shift + chord pad opens/closes individual editing. Main encoder changes pages.

Online guide: https://github.com/skerryvibe/oktonik/blob/main/docs/oktonik-public.md

## New since rc.4

- Shift + Track 1-4 opens that Schwung chain. Knobs edit the visible instrument
  or effect. Back navigates up to the chain, then returns to OKTONIK. Pads
  continue to play OKTONIK; STOP remains available. This is still a Tool,
  not a chain MIDI FX module. No custom host patch is needed on Schwung 1.6.2+.
- PLAY keeps the active chord and harmonic function in the idle footer.
- EDIT INV: downward and upward inversions, with AUTO between -1 and ROOT.
  Shift + turn INV is also a shortcut to AUTO.
- PLAY/CHORD knob 7 is simple upward STRUM, with no advanced Shift menus.
- MELODY knob 6 is AT OFF/POLY. Default OFF; requires a receiving
  synth that responds to polyphonic key pressure. This is not MPE.

Five main pages remain. No Divisi, ARP, IDEAS, recording or sequence controls
are enabled in Public. Existing project settings retain schema 7.

Created by Skerry Vibe, with development assistance from OpenAI ChatGPT and Codex.
See LICENSE and NOTICE.md for inherited attribution.
