# Beta.26 – non-destructive timing and quantization

## Test on Move

1. On SEQ, knob 6 is QNT. Record deliberately off-grid chord and bass events.
2. Compare QNT 0%, 70% and 100%. Return to 0%: original timing should return.
   Changing QNT finishes an active recording before updating playback.
3. Record several attacks inside one RATE cell. At 0%, hear each attack.
   At 100%, coincident attacks use one winner; lowering QNT recovers the others.
4. Hold that step and use knob 8 EVENT to select individual recorded events.
   Edit their velocity or length. Delete + Step removes the entire cell.
5. Verify bass-only recording, Undo, loop wrap, transport stop and project reload.
6. Verify old grid-only sequences still play unchanged. New timing is measured
   in RATE cells, so changing RATE scales both timing and duration.

Each cell supports eight events per lane. Exceeding this stops recording with
an explanatory message. Accepted events remain undoable. Step LEDs represent
original recording cells, not their current quantized playback positions.

## Verification

204 JavaScript tests and 45 DSP behavioral groups pass, including sanitizer
checks and 3000 malformed-input cases. Linux ARM64 build and archive verification
pass. The SEQ QNT preview was rendered and visually checked.

Physical Move verification remains required. Install the module archive through
Schwung and restart Move before testing. Avoid downgrading projects containing
new timing data: older versions discard these optional event fields.

Melody recording, retrospective Capture and clip view remain future work.
