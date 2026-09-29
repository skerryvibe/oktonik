# Beta.23 – Bass Gesture recording and temporary step editing

## Scope

First incremental stage of the separate-part recorder. One 16-step chord lane
and one 16-step bass lane; no melody recorder or multiple clips yet.
Record captures both enabled parts. PART selects editing, not record arming.

## Hardware checklist

1. Enable BASS and GEST; use PAD velocity. Arm REC and start Move Play.
2. Hold C, then press Em and G on separate RATE cells. Release all pads.
3. Turn REC off. Expected: one C chord, with a separate C–E–G bass line.
4. On SEQ, set PART BASS. Hold a filled step; adjust NOTE, LEN and VEL.
   Shift + NOTE moves by octaves. Release closes the editor. Listen with Play.
5. Switch PART CHORD. Hold the C step; edit ROOT, EXT, LEN and VEL.
   Confirm bass events stay unchanged. EXT SAVED means the original snapshot;
   turning the control explicitly replaces its extension.
6. Delete + Step removes only the selected lane. STOP must silence both lanes.
7. Switch projects and return: both lanes and BASS SEQ mode must be restored;
   Record must remain off. Older projects should retain FOLLOW and their chords.
8. Select FOLLOW on BASS knob 8 to use saved chord bass again; CLIP restores
   independent bass playback. Verify B.OUT/B.CH with separate destinations.

## Automated verification

- 189 JavaScript tests: separate gesture events, saved chord preservation,
  clock loss, lane-specific editing, release behavior, project persistence,
  plus the existing performance/adapter suite.
- 41 DSP groups, including independent bass duration/routing, chord rests,
  preemption, wrap, Record mute, deletion and STOP.
- Address/undefined-behavior sanitizer run passes.
- Linux ARM64 build and archive contents verified.
- Production 128×64 display renderer preview inspected.

Physical Move testing is still required. Hardware was not installed or tested
as part of this build. Next: per-part recording/overdub, then original-pitch
melody recording and independent clip selection.
