# Beta.25 – contextual steps and Undo

## Test on Move

1. Open CHORDS: sixteen steps show the chord lane. Hold a saved step for editing.
2. Open BASS: steps now show the independent bass lane. Hold a bass step, change
   NOTE/LEN/VEL, release it. Confirm chord events remain unchanged.
3. Open MELODY: no chord/bass steps should appear or be modified there. Melody
   recording is a future feature, so these steps intentionally stay blank.
4. Set SEQ R.PRT=BASS, arm Record and play a bass line over saved chords.
   Try step buttons from BASS/CHORDS/PLAY: they must not audition extra chords.
5. Stop Record, press Undo: the previous bass events (including overwritten
   events) return, playback stops and live notes release. Chords are unchanged.
6. Repeat Undo while a recording is still in progress. Also test BOTH and CHORD.
7. Undo is one level, in-memory and project-local. Manual step edits invalidate
   the previous recording undo. No redo. Restored events save normally.

The user confirmed that the reported live-chord issue was R.PRT not set to BASS;
the bass-only engine itself works. Saved chord accompaniment is intentionally
not muted. The step guard is separate protection against unwanted auditions.

## Verification

198 JavaScript tests; 43 DSP groups; sanitizer passes. Tests cover active-take
Undo, overwritten events, save/reload, subsequent-edit protection, page step
routing/LEDs and the real adapter's MoveUndo handling.

Undo uses MoveUndo (CC56) from the official Schwung constants:
https://github.com/charlesvestal/schwung/blob/main/src/shared/constants.mjs

Quantization strength, melody recording, retrospective Capture and clip view
are not included. See roadmap.md for the shared event-timing prerequisites.
Physical Move verification of the new features remains required.
