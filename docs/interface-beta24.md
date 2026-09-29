# Beta.24 – per-part recording

## Test on Move

1. Keep a saved chord progression and bass CLIP from beta.23.
2. On SEQ, knob 8 R.PRT = BASS. Enable BASS, then Record and Move Play.
3. Play left chord pads as bass root selectors. Try C, E, G; release an older
   held pad while the newer one is down. No extra chord or bass choice should sound.
4. Stop Record. Verify the chord progression is unchanged and the new bass
   plays at its recorded positions, lengths and velocities.
5. Select R.PRT = CHORD, record different chords. The independent bass CLIP
   should continue playing and remain unchanged.
6. Verify that unarmed parts do not restart when Record turns on/off mid-note.
   ARP should follow the saved chord progression during BASS recording.
7. During a take change R.PRT: the take should finalize and REC turn OFF.
   Start Record again deliberately. Test STOP and a project switch too.
8. Return to the project: recording choice is remembered, arming is not.
9. Hold a saved step for LEN; SEQ knob 8 no longer edits length.

## Boundaries

- BOTH retains combined chord/Bass Gesture capture. BASS-only uses direct
  root selectors and does not require GEST. Bass octave/velocity/MIDI remain
  the existing BASS controls. Disabled BASS prevents bass-only arming.
- PART chooses editing; R.PRT chooses recording. Recorded spans replace only
  the armed lane. Silence does not erase an existing event.
- CLIP bass is independent. FOLLOW is derived from chord snapshots, not a
  separate saved bass performance.
- No melody recording, multiple clips or retrospective Capture in this release.
- Existing schema 7 remains; recordPart is optional and defaults to BOTH.

## Verification

194 JavaScript tests, including physical-adapter knob/Record input; 43 DSP
behavioral groups, including lane ownership, continued playback, ARP source,
transport stop and FOLLOW compatibility. DSP sanitizer passes. Production
128×64 display preview inspected. Physical Move verification remains required.
