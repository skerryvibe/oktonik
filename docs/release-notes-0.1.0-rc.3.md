# OKTONIK 0.1.0-rc.3 — local test candidate

Public PLAY now shares CHORD's eight controls: KEY, SCALE, EXT, OCT, SPRD,
LEAD, STRUM, SUST. The Chord Map remains visible. Touching or turning a knob
shows the parameter and value in the footer; after releasing the knob and a
short timeout, the normal map status returns.

The controls share CHORD's existing implementation, note handling and saving.
Per-pad EDIT still takes precedence. No save schema changes. Lab is unchanged.

The Public in-module help now documents these shortcuts and removes experimental
profile references. Packaged installation notes link to the online guide rather
than embedding a guide with unavailable relative image files.

Hardware check before publishing: try all eight knobs on PLAY, confirm the same
values on CHORD, try a modifier and Bass Gesture, and verify project persistence
and STOP. GitHub rc.2 remains the public release until this candidate is accepted.
