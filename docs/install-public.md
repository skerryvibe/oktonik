# OKTONIK — Harmonic performance instrument

By Skerry Vibe. Public **0.2.0**. Tested with Schwung 1.7.3; earlier host
versions have not been validated for the recording workflow.

Back up your Move projects and OKTONIK settings first. Open move.local:7700 on
the same Wi-Fi and upload `oktonik-module.tar.gz`. When the upload is
done, restart Move so that the new version, including its audio part, is
loaded. Then open OKTONIK from Schwung's tools as before. This updates OKTONIK;
OKTONIK Lab remains a separate installed module.
Their settings are independent. Returning to 0.1.0 may discard new clip/settings
fields when saving: restore a backup rather than relying on lossless downgrade.

## Play and navigation

Eight lower-left pads play chords; sixteen right-hand pads play melody.
Upper-left pads prepare harmonic modifiers. STOP releases notes and sustain.
OKTONIK generates MIDI, not audio; select the receiving instruments and channels.

PLAY shows the chord map. Its knobs match CHORD:
**KEY, OCT, EXT, SCALE, SPRD, LEAD, STRUM, SUST**.
Touch/turn a knob to see its value. OCT is knob 2 and SUST knob 8 on each part.

- Main encoder: PLAY, EXT PROF, MOD PADS, MIDI. Pads keep playing chords.
- Track 2: BASS and B.EXTRA. Track 3: MELODY.
- Press the open Track again, or Back, to return to PLAY. Back leaves the local
  editor or track view before leaving OKTONIK.
- Menu toggles the clip view.
- Shift + Track 1–4 opens the Schwung chain. Knobs edit that synth/effect while
  pads still play OKTONIK. Back goes up to the chain, then back to OKTONIK.

Bass and bass gesture are on in new projects: hold a chord pad and press another
chord pad to move only the bass (for example C/E); release all pads before the
next chord. Turn GEST off on BASS for plain chord changes while holding.

Shift + chord pad edits that chord. Shift + modifier pad now edits its function.
To lock BORROW, hold its pad and press the main encoder; repeat to unlock.
This replaces 0.1.0's Shift + BORROW lock gesture.

LEAD CNTR keeps voice leading near the selected octave; FREE permits more drift.
SPRD WIDE puts the bass alone with the rest spaced above it; with LEAD on, OPEN
and WIDE keep the root in the bass and voice-lead the upper notes.
APPR (MOD PADS, knob 4) selects basic or profile-coloured approaches. EXT PROF offers style presets
and one CUSTOM combination per project. Individual pad overrides take priority.

MELODY includes CHORD, SCALE, CHROM, PENTA and BLUES. PENTA/BLUES TYPE selects
AUTO, MAJOR or MINOR. SCALE ADAPT TARGET follows the harmonic destination of
approach modifiers; CHORD adapts chord tones without that target-scale change.
MELODY AT OFF/POLY sends polyphonic key pressure to compatible synths, not MPE.
A held melody note keeps sounding through a chord change; strike it again for
the new chord's tone.

R.PAD on BASS knob 3 or MELODY knob 4 selects MEL/BASS for all sixteen
right-hand pads. Both controls change the same saved setting. Enable BASS first;
R.PAD says so while BASS is off.
BASS uses the bass octave, sustain, velocity and output; left-hand pads still
play chords, without adding automatic bass. Bass is monophonic, last press wins.
Release held pads and finish recording before switching. Released sustain notes
are cleared safely on switching. Melody AT does not apply to the bass surface.
For bass recording, arm ALL from PLAY or BASS from Track 2; MELODY-only recording
does not record bass notes. VEL mode and fixed B.VEL are both on B.EXTRA.

## Record an accompaniment

1. On PLAY, press the **sampling button next to Capture** to arm all three parts.
   On Track 2 or 3 it arms only bass or melody; Track 1 records what SETUP C.REC
   says (ALL by default, or C+B, or CHORD).
2. Press Play and perform. Existing clips remain audible while recording.
   If Move is already playing, recording starts at once (overdub).
3. Press the sampling button again to disarm. Improvise over your loop.
4. Undo restores the previous recording take. M + Track 1/2/3 mutes that part.

Ordinary Play controls Move and OKTONIK together. Stop before changing clip
length/rate. The native transport Record button is not OKTONIK's arm button;
pressing it shows "REC: use Sample button".
COUNT (in SETUP, Shift + step 3, and in the clip view) adds a one-bar count-in
when you start from stop; a chord on the downbeat, or up to a sixteenth early,
lands on beat one. METRO (Shift + step 6) clicks on every beat: ON while Move
plays, REC only while a take records; SETUP sets its volume. Please verify both
against your native Move drum loop on hardware.

## Clips and steps

Menu opens CLIPS: top pad row = chords, next = bass, third = melody; eight clip
places per part. Empty pads are dark. Select a Track to show that part's steps.
The selected clip's controls are LEN (16/32/64 steps), RATE, QNT (this clip's
quantize, OFF by default), PAGE, COUNT and METRO. As on Move, hold Loop and press step 1, 2 or 4 to set the length in
16-step bars.
Shortening a clip does not erase events beyond its end; extending it restores them.
Use the page arrows/PAGE to reach steps after 16.

Use Copy with clip pads to copy a clip and X/Delete with a clip pad to clear it.
Clip selection during playback is queued; verify switches against your loop.

Tap an empty step to store the last chord/bass/melody event. Hold a populated
step to audition and edit it: length, velocity and timing NUDGE; chord steps also
offer root, extension, inversion and strum. Each Track auditions only its part.

Move-style step gestures:

- Hold a step and press a later step: the note lasts until that step. Steps a
  note still sounds through light faintly.
- Hold a step and press Left/Right: nudge it by 10 % of a step (Shift: 1 %).
- Hold Copy, press a step, then press the target step: copy it.
- Delete + step clears it. Hold a chord pad (or a melody pad on Track 3) and
  press steps to write that chord or note to each, replacing what was there.

## Shift + step shortcuts

As on Move, hold Shift: the icons under the step buttons light for every
shortcut, and the step itself shows the setting: dark when off, lit when on.
The metronome step is blue for ON and red for REC. Where Move has the same
function, OKTONIK uses the same step.

| Step | Shortcut |
|---|---|
| 2 | MIDI page (routes and channels) |
| 3 | SETUP: quantize amount for Shift + 16, COUNT, METRO, metronome volume, and what Track 1 records (ALL, C+B or CHORD); Back closes |
| 5 | Tempo: OKTONIK follows Move's tempo |
| 6 | Metronome OFF / ON / REC |
| 7 | Opens/closes the STRUM menu: GAP, DIR, TIME, VEL; knob 5 turns strum on/off |
| 8 | Right-hand pads MEL / BASS (BASS must be on) |
| 9 | SCALE page: key, scale, melody mode and adaptation; Back closes |
| 10 | Full velocity: every pad plays at 127 |
| 14 | Select the next empty clip for the current part |
| 15 | Double the loop and copy its notes (16 to 32 to 64 steps; Undo reverts) |
| 16 | Quantize the active clip at the SETUP amount, or switch it off; on PLAY all three parts |

Quantize belongs to each clip and is non-destructive: recordings keep their
played timing, and switching it off restores it. New clips start unquantized.
Shift + 16 on a Track (or in CLIPS) affects only that part's clip, so clips can
use different amounts; QNT in the clip view fine-tunes the selected clip.
Older projects keep their previous clip quantize.

What is recorded: PLAY records every part, Track 2 only bass and Track 3 only
melody. Track 1 records what SETUP C.REC says: ALL (default), C+B or CHORD.

Step 13 remains Schwung's tool menu.
Stored chord voicings stay fixed when global LEAD, spread or extensions change.
Bass Gesture is recorded as separate bass events, so its line can be edited
without replacing the chord part.

## Problems

Report problems at github.com/skerryvibe/oktonik/issues with the OKTONIK
version, Move and Schwung versions, MIDI routes and the steps that cause it.
If Move restarts or freezes, say whether only OKTONIK froze or Move rebooted,
plus the time, power connection, synths and last action.
GUIDE.html (open in a browser) is the illustrated guide.

Created by Skerry Vibe, with development assistance from OpenAI ChatGPT and Codex.
See LICENSE and NOTICE.md for inherited attribution.
