# Archived Lab guide and development history

Historical material below may describe superseded names and installation paths.
Use the root README and oktonik-public.md for current releases.

Version 0.1.0-rc.1 introduces Public and Lab build profiles from one codebase.
`npm test` exercises both profiles; `npm run build` produces verified
`dist/oktonik-public-0.1.0-rc.1.tar.gz` and `dist/oktonik-lab-0.1.0-rc.1.tar.gz`.
Source defaults to Lab. Packaging chooses a fixed profile, not a user setting.

Read [the Public guide](docs/oktonik-public.md) for its five-page live workflow.
Public disables ARP, sequence playback, steps, recording and Capture without
deleting their saved data. IDEAS opens temporarily via Menu. Public and Lab
replace each other: both retain the legacy `chord-pilot` identity and state paths
for compatibility. Simultaneous installation is not supported in this release.
Hardware acceptance testing remains required before public distribution.

Below is the retained Lab guide and development history (formerly Chord Pilot).

## Chord Pilot beta.26 development history

Chord Pilot is a fresh, two-handed harmony instrument for Ableton Move and
Schwung. The lower-left pads play eight scale-aware chords. All sixteen
right-hand pads play melody: chord tones, the selected scale, or chromatic
semitones. The left hand can hold harmony while the right hand phrases a melody.

The left-hand modifier rows support playing a ii–V–I on the same target pad.
Modifier pads are silent until you strike a chord.

```text
Top       II    SUB   BORROW STOP    M13 M14 M15 M16
          DOM   M/m   SUS2   SUS4    M9  M10 M11 M12
          A5    A6    A7     A8      M5  M6  M7  M8
Bottom    A1    A2    A3     A4      M1  M2  M3  M4
```

STOP has moved to the fourth pad of the top-left group, above SUS4 (MIDI 95).
The old STOP location (MIDI 92) is now the silent II modifier.

## Display

### New in beta.26: non-destructive quantization

SEQ knob 6 **QNT** sets 0–100% for recorded chords and bass:

- 0% retains played attack/release timing, within the host audio-block resolution.
- 70% moves timing 70% toward the RATE grid.
- 100% aligns to the grid, with a minimum one-cell length as before.

Original timing is saved, so changing QNT afterward is reversible. It affects
both recorded lanes; existing grid-only steps remain unchanged. Changing QNT
while Record is armed finalizes and disarms the take. RATE still controls the
length of a cell; changing RATE scales the stored relative timing too.

Up to eight attacks can now be stored in each original-time cell (128 per lane).
Hold a step and turn knob 8 EVENT to select which attack to edit. Step lights
represent the original recording cells, not their quantized playback positions.
Delete + Step removes all events in that cell. LEN explicitly edits the selected
event's duration; QNT alone never rewrites the original timing. Shift + Step
copies only the selected harmony onto the grid, without its recording offsets.

When quantization moves attacks to exactly the same position, the later event
in that cell wins. The other original attacks remain stored and are recovered
by reducing QNT. A ninth attack in one cell is rejected and stops Record with
`REC stopped: 8 per step`; Undo can restore the preceding take's contents.

Old projects retain their notes, routing and gate behavior. The legacy separate
SEQ OUT control is replaced by QNT; its saved routing is retained. To rejoin the
normal chord output, select the desired C.OUT on MIDI (cycle away and back if
needed). New timing/multiple-event metadata requires beta.26 or later: do not
downgrade an edited project to an earlier beta, which cannot retain those fields.

This release does not yet add melody recording, retrospective Capture or clips.

### New in beta.25: contextual steps and recording Undo

BASS shows/edits the bass steps; CHORDS shows/edits the chord steps. SEQ PART
still selects either lane. Hold a stored step on those pages to edit it.
MELODY steps are blank and cannot change chord/bass data: the melody recorder
is not implemented yet. All step audition/editing is blocked during Record,
including outside SEQ, so step buttons cannot introduce live chords into a bass take.

The physical Undo button restores the latest recording session, including events
it overwrote. It also works during a take: recording ends, playback stops and live
notes release before restoration. Only recorded lanes are restored. One undo
level, no redo; history stays in memory in the current project. A subsequent
manual step edit/store/delete or bass playback-mode change clears this history
to avoid erasing later edits. The restored data is saved normally.

R.PRT must still be BASS for bass-only recording; navigating to BASS does not
change arming. Saved chord accompaniment intentionally continues. The reported
chord-pad issue was confirmed to be R.PRT still set to BOTH, not a bass-only
engine bug. The new step guard also prevents unintended step auditions during
Record. BASS's idle footer shows the recording part while Record is armed.

Beta.26 adds variable quantization above. Real retrospective Capture and clip
view remain planned.

### New in beta.24: record one part over another

SEQ knob 8 **R.PRT** selects BOTH (default), CHORD or BASS. Knob 7 REC or the
physical Record button arms that selection. PART on knob 4 still selects only
the step editing lane. Changing R.PRT finishes the current take and disarms;
press Record again to begin the new selection. The choice saves per project,
but Record always starts OFF. LEN now lives in the hold-step editor.

- BOTH retains chord + Bass Gesture recording from beta.23.
- CHORD records chords only. An existing independent bass CLIP keeps playing;
  live automatic bass is muted and saved bass events are unchanged.
- BASS records bass only, while the stored chords, chord-following melody and
  ARP continue. BASS must be ON. The eight left chord pads become bass root
  selectors at B.OCT, with modifiers affecting their prepared roots. No live
  chord is triggered. Each press selects a new bass note; releasing an older
  pad never restores its note or ends a newer one. GEST need not be enabled.

Only the armed lane is muted during recording, and only captured spans in that
lane are overwritten. Silence is not recorded as an erase operation. STOP,
project changes, parking, changing RATE or disabling BASS finalize/disarm safely.
Record transitions release live held notes so the previous performance mode
cannot leave notes hanging. Existing sequence voices in the unarmed lane are
not restarted by Record transitions.

For independent bass accompaniment use BASS SEQ=CLIP. FOLLOW remains derived
from chord snapshots and therefore follows later changes to those chords.
The recording grid remains RATE; this is not free-time or polyphonic recording.

### New in beta.23: independent bass recording and hold-step editing

Record captures chord and bass together when BASS is enabled. Holding C and
pressing Em then G records one long C chord plus separate C, E and G bass
events. Pad releases do not select notes. Both lanes use RATE quantization;
multiple presses in the same cell keep the latest event. Bass stores actual
MIDI pitch and played velocity, independent of later chord edits or octave changes.

On SEQ, knob 4 PART chooses CHORD or BASS for the sixteen step buttons.
Hold an occupied step to show a temporary editor; release that step to close it:

- CHORD: ROOT, EXT, LEN, VEL. EXT initially says SAVED; turning it explicitly
  replaces the saved extension. Root edits transpose the saved voicing.
- BASS: NOTE, LEN, VEL. Shift + NOTE changes octaves. No chord is modified.
- Delete + Step clears only the selected part. Shift + Step stores the active
  chord or currently sounding live bass. Hold chord + Step placement remains
  available with PART CHORD. Finish Record before opening the editor.
- Chord steps retain their press-to-audition behavior. Bass step editing is
  silent; use Play to hear the edited bass lane. Edits affect sequence playback.

BASS knob 8 SEQ selects FOLLOW (legacy chord-snapshot bass) or CLIP (independent
bass events). Recording/storing a bass event selects CLIP automatically. BASS
must remain ON to hear it. Route/channel use the existing B.OUT/B.CH controls.
Old projects open with FOLLOW and an empty bass lane; existing chord snapshots
are retained. PART changes editing only; R.PRT now chooses what Record captures.

Capture remains on the physical Capture button (the previous auto-fill behavior).
One 16-step lane per part is available in this release. Melody recording,
multiple clips, Menu/Track clip view and true
retrospective Capture are **not implemented yet**. Test this beta on physical
Move before relying on a recording; automated tests do not replace hardware testing.

The display starts on PLAY, a live Chord Map, and has eleven pages. Turn the main knob,
press it, or press Menu to navigate. Parameter pages keep the eight physical knob
positions; unused positions are blank. Touch an active knob for its full name
and value. An unavailable control shows `--` and explains how to enable it.

| Page | Knobs 1–4 | Knobs 5–8 |
| --- | --- | --- |
| PLAY | Chord pads A5–A8 | Chord pads A1–A4 |
| CHORDS | KEY, SCALE, EXT, OCT | SPRD, LEAD, —, SUST |
| STRUM | GAP, DIR, TIME, VEL | —, —, —, — |
| IDEAS | IDEAS, STYLE, NEW, MODE | —, —, —, — |
| MELODY | MODE, M.OCT, ADAPT, TRACK | SUST, —, —, — |
| BASS | BASS, B.OCT, B.VEL, B.NTE | GEST, SUST, VEL, SEQ (FOLLOW/CLIP) |
| ARP | ARP, RATE, DIR, RANGE | GATE, SWING, VEL, HOLD |
| A.CLOCK | CLOCK (SYNC/FREE), BPM, —, — | —, —, —, — |
| SEQ | RUN, RATE, GATE, PART | S.VEL, QNT, REC, R.PRT |
| MIDI | C.OUT, C.CH, M.OUT, M.CH | B.OUT, B.CH, A.OUT, A.CH |
| THEORY | Sounding notes and keyboard | Root, bass and top markers |

PLAY matches the physical chord-pad layout. Holding modifiers immediately previews
the next attack without sending notes; BORROW lock is also reflected. During Bass
Gesture the grid keeps the pad chords (Em, F, etc.), not temporary slash choices. The header shows
the played chord, while the grid shows prepared choices. Long grid names use ~;
touch the corresponding knob to expand the name in the footer. Turning PLAY knobs
does not edit anything. PLAY and IDEAS share the grid renderer and attack resolver.

Shift + a chord pad opens a contextual EDIT screen. It is not another normal
page and cannot change global settings. All eight EDIT controls fit on one
page; the main knob/Menu stay in EDIT. Shift + the same chord pad returns to the previous page.
The following sections describe each part of the interface.

## Strum

Navigate to STRUM with the main encoder. CHORDS knob 7 is unused.

In MELODY SCALE mode with ADAPT ON, holding or locking BORROW switches the
entire melody layout to the parallel scale used by borrowed chords. This works
before the next chord attack; held notes are not retriggered by the modifier.
Once a borrowed chord is played, ADAPT accommodates its additional colours.
Releasing/unlocking BORROW restores normal adaptation to the active chord in
the selected scale. ADAPT OFF, CHORD and CHROMATIC modes are unchanged.

- GAP: nominal spacing between notes, 0–100 ms. Zero plays simultaneously.
- DIR: UP (low to high), DOWN, ALT (alternating up/down attacks), RAND (shuffled).
- TIME: 0–100% random variation of each gap. The first note starts immediately;
  positive gaps remain ordered and at least 1 ms even at maximum variation.
- VEL: 0–100% random variation around the chord attack velocity, clamped to 1–127.
  This does not randomize the bass, melody or ARP parts.

These settings affect the next chord attack, not currently held notes. With
voice leading enabled, retained notes keep their existing ownership rather than
being forced to retrigger. STOP or release with SUST OFF cancels unplayed notes.
HOLD retains pending attacks; PEDAL sends note-off on release and cancels pending
attacks while the already sounded notes follow the receiving instrument's pedal.

Old projects retain UP, TIME 0%, VEL 0% and their saved spacing. Step snapshots
freeze the four strum parameters; random values are drawn afresh on replay, not
saved as an exact recorded performance. ALT starts upward on a fresh DSP instance.
This is expressive note strumming, not guitar fingering or guitar voicings.

## Clean first start

A new project starts with melody SCALE, M.OCT -1, ADAPT ON, SPRD CLOSE,
LEAD OFF and all sixteen progression
steps empty. No demo progression or state file ships in the install archive.
Chord Finder files are no longer automatically imported and the installer
does not move or modify that module. Project-scoped settings are independent;
older global Chord Pilot files are retained, not automatically copied into new
projects. See Project saving below for the older-host fallback.

## Live bass gesture

Enable BASS and GEST on BASS (GEST defaults OFF, including existing projects).
Hold an F chord pad and press the Em pad: only the bass moves to E, producing F/E.
The original chord, melody harmony and ARP notes remain unchanged. Releasing
either pad preserves F/E while at least one gesture pad remains held. Pressing
F again after releasing it selects F as bass without restriking the chord.
Only presses choose the bass; releases never restore an older choice.
Bass chooses the nearest
MIDI octave, with the lower note winning equal distances.

Targets use their current root, including pad edits, IDEAS and held modifiers.
This is a temporary performance gesture: EDIT settings are never overwritten.
Shift + Step captures the sounding bass together with the original chord.
The final gesture-pad release ends the gesture. Chord and bass then follow
their own SUST settings independently (OFF, HOLD or PEDAL).
The next press starts a fresh full chord, never another bass selection from
the finished gesture. STOP clears both held sound and gesture.
Disable GEST for ordinary overlapping full-chord attacks.

## Separate arpeggiator

Beta.11 hardware diagnostics showed PLAY N/A, CLOCK YES, chord input and a
working C4 output probe. The ARP incorrectly required explicit RUNNING status.
Beta.11.1 accepts observed beat progress when status is unavailable; an explicit
STOPPED status still stops playback. Frozen fallback beats release ARP within
500ms; invalid beats stop it immediately. PLAY may remain N/A while STATE is
RUN and GEN/SENT advance. The user confirmed audible ARP after restarting Move.
After updating, restart Move so the new DSP is loaded.
Diagnostic pages and the C4 test control are removed in beta.13. Internal DSP
telemetry remains available for development but is not polled by the UI.

ARP is an additional MIDI part, not a replacement for chords. Enable ARP on its
page and select A.OUT and A.CH on MIDI. Choose the clock on A.CLOCK:

- SYNC (default, including old projects): follows Move Play and host tempo.
- FREE: starts from a chord without Move Play, using an audio-sample clock.
  BPM is editable from 30 to 300 (default 120). A new chord source restarts phase.
  HOLD keeps the source after release; without HOLD it stops when the chord ends.
  SUST HOLD can keep that chord alive. STOP clears either kind of hold.
  Changing clock, tempo or rate restarts the arpeggio; FREE does not run SEQ.

Fresh defaults: OFF, 1/16, UP, range 1, gate 70%, swing 0%, velocity 100,
HOLD OFF, MOVE output, MIDI channel 2. Choose the receiving instrument's channel;
use a different channel from chords/bass/melody for an independent sound.

- RATE: 1/16, 1/8, 1/4, 1/2 or one bar (four beats).
- DIR: UP, DOWN, UP/DN without repeated endpoints, RAND, or CHORD.
- CHORD pulses the complete source voicing simultaneously at each RATE interval.
  GATE, SWING, VEL, SYNC/FREE and HOLD apply normally; output is still the ARP part.
  RANGE is disabled in CHORD, avoiding added octave doublings; its saved value
  is retained for the single-note modes. Use a separate ARP channel/instrument
  if you want sustained chords and rhythmic pulses to have independent envelopes.
- RANGE: 1–4 octaves upward in single-note modes; duplicate and out-of-MIDI notes are omitted.
- GATE: 10–100% of each swung step. SWING: 0–50% delay on alternate attacks.
- VEL: 1–127. HOLD keeps the last live chord after pad release, independently
  of SUST. Turning HOLD off releases it if no live chord is still held/sustained.

ARP follows the actual chord voicing, including BORROW, IDEAS and frozen step
pitches, but never adds a slash bass to its note pool. The running progression
takes priority over live pads; empty loop slots are rests even with HOLD enabled.
Its gate and rate are independent from LOOP gate/rate and chord strum.
Changed chord pitches reset the note sequence on the current clock step; unchanged
pitches keep it moving. RESET/CONTINUE selection is deferred to a later version.
In SYNC, transport stop releases ARP; restarting can resume a still-held/HOLD source.
STOP clears that source, cancels ARP notes and disarms the loop. A new chord can
restart ARP if the transport is still running. Project changes clear runtime
notes while saving ARP controls per project. Guitar voicings remain a future feature.

## IDEAS / NEXT

Play a starting chord, navigate to IDEAS, then turn knob 1 clockwise to enable
the temporary suggestion bank. Merely browsing to IDEAS does not remap pads.
The display changes from controls to eight chord names in physical pad order:
A5-A8 on the upper display row and A1-A4 below. Strike a chord pad to audition it;
the header shows the played chord and the footer explains its suggested function.
Long grid names are shortened; the played chord is shown in the header.
All sixteen melody pads remain available, with the existing CHORD/SCALE + ADAPT
behavior. Bass, strum, sustain, routing and voice leading use the same engine.

- Knob 1 IDEAS: ON/OFF. OFF restores the original chord-pad mapping.
- Knob 2 STYLE: SAFE favors common tones, small harmonic movement and resolution;
  SAFE limits generated choices to triads and sevenths, prioritizing triads even
  when global EXT is 9/11/13. Being in-scale alone does not imply low tension.
  COLOR balances proximity and harmonic colour, using at most five tones through
  the ninth; WILD retains the broader extension pool and gives more weight to
  contrast and larger harmonic movement. SAFE stays in-scale, COLOR keeps four
  in-scale/four outside choices, and WILD keeps two in-scale/six outside choices.
  White pads are in-scale; yellow pads are outside;
  sounding pads are green. With BORROW locked, these categories refer to the
  parallel context rather than the original scale.
- Knob 3 NEW: generate a new bank from the last actually played chord.

Touch a knob for its function in the footer. Suggestions remain on the same pads
while comparing them. NEW and STYLE regenerate deliberately without changing
any sounding chord/melody or writing over the regular bank. STYLE keeps the
current generation's source chord. NEW with unchanged input is deterministic,
not a shuffle. The engine ranks bounded scale, borrowed and approach candidates
by common tones, pitch movement and harmonic destination, preferring distinct
roots and the current chord family's shapes. Explicit approach destinations
remain prioritized, with a RESOLVE explanation, even in WILD. Harmonic movement
here is measured by pitch classes; LEAD still handles actual voicing/register.
Suggestions are options, not rules. Existing projects retain IN/MIX/OUT storage
IDs, displayed as SAFE/COLOR/WILD; saved progression chords are not regenerated.

Shift + Step saves a suggestion in the existing progression; Capture works too.
Shift + chord pad is blocked while IDEAS is on to avoid editing a different,
hidden regular pad. Switch IDEAS off to use EDIT. Turning IDEAS off or navigating
away restores regular pads for the next attack without cutting held notes.
Parking/reopening also leaves IDEAS off. STOP kills notes but keeps the current
suggestion bank available for a deliberate new attack.

II/DOM/SUB approach the displayed suggestion. BORROW lock is applied once when
generating the bank, never twice at attack. Toggling the lock while in IDEAS
explicitly refreshes suggestions from the same source, without changing sounding
notes. Momentary modifiers can take an IN suggestion outside the scale.
Existing saved steps are never reinterpreted by IDEAS. NEXT and TO are implemented;
progression-aware ALT and GO TO KEY are later stages.

### IDEAS / TO

Knob 4 MODE selects NEXT or TO. Play the desired target chord, then enable
IDEAS with knob 1. TO captures the actual played chord, including edits,
extensions and played modifiers. The footer shows TO and the destination.
There is no separate target selector. In TO, NEW captures the last played
chord as a new target; in NEXT it updates the source as before.

For major/minor targets, the first three lower-left chord pads are II, V and
TARGET: play them left-to-right. C gives Dm7 -> G7 -> C; Am gives
Bm7b5 -> E7 -> Am. COLOR/WILD put SUB on pad 4; the remaining pads offer
ranked connections. SAFE keeps these basic II/V approaches even if they need
notes outside the global scale; its additional suggestions stay in-scale.
These are choices you play yourself, not an automatically started sequence.

Diminished, augmented and sus targets use target on pad 1 plus exploratory
connections, rather than labeling a conventional ii-V cadence to those shapes.
Changing MODE/STYLE or BORROW lock refreshes the bank silently. Entering TO
captures the last played chord; STYLE and BORROW lock retain that literal target.
Momentary modifiers still transform the displayed choices. NEW is required to
adopt a newly auditioned chord as target. Mode is saved per project; target and
IDEAS enable are temporary. Older projects default to NEXT. Steps and ordinary pad edits are
unchanged. Release gesture pads before playing II/V/TARGET if Bass Gesture is on.

## Harmony

The twelve scales are Major, Natural Minor, Harmonic Minor, Melodic Minor,
Dorian, Phrygian, Lydian, Mixolydian, Aeolian, Locrian, Major Pentatonic and
Minor Pentatonic. Extensions cycle through TRIAD, 6, ADD9, 7TH, 9TH, 11TH and
13TH. ADD9 has no seventh; 9TH includes one. Scale-aware sixths and upper
extensions can be altered in some modes. Unusual shapes display their actual
intervals rather than a misleading standard chord name.
The old PAD8/Color special case has been removed. In seven-note scales, the
eighth pad is the high tonic; pentatonic layouts retain their ascending sequence.
Every pad can be edited in the same way. A migrated Color chord is preserved
as a normal custom eighth pad; RESET restores its default.

## Edit one chord

Shift + a chord pad opens EDIT 1–8. ROOT replaces the redundant PAD selector.

| EDIT | Knobs 1–4 | Knobs 5–8 |
| --- | --- | --- |
| One page | ROOT, TYPE, EXT, INV | SPRD, KEEP, RESET, B.NTE |

ROOT transposes that pad's chord in semitones relative to the global key;
it does not change KEY. Later changes to KEY transpose custom roots too.
TYPE chooses AUTO, MAJ, MIN, DIM, AUG, SUS2 or SUS4. AUTO uses the underlying
scale chord's type, or the kept chord's type. Changing ROOT alone retains it.

EXT offers AUTO, TRIAD, 6, ADD9, 7, MAJ7, 9, MAJ9, 11, MAJ11, 13, MAJ13,
and DIM7 for diminished chords. Explicit 7/9/11/13 use a minor seventh;
MAJ7/MAJ9/MAJ11/MAJ13 use a major seventh. With ROOT C, MAJ + 7 is C7,
MAJ + MAJ7 is Cmaj7, and MIN + MAJ7 is Cm(maj7).
AUTO retains the underlying scale/saved chord's extensions. Existing
per-pad scale extensions remain readable as 7TH/9TH/etc until changed.
Explicit upper extensions are literal intervals and can lie outside the scale.

INV AUTO follows global voicing/voice leading. Choose ROOT or an inversion
number to lock it. There is no separate LOCK control. SPRD spreads the notes.
B.NTE chooses AUTO (follow BASS), ROOT, LOW, then C through B for this pad.
An explicit note includes its octave, e.g. B1; hold Shift and turn knob 8 to
move it by octaves. Ordinary turns select pitch class without changing octave.
All MIDI pitches 0–127 are available. Choosing an explicit bass note does not
change the chord instrument's inversion or add that note to the melody scale.
An explicit bass ignores global B.OCT/C.OCT/LEAD; it transposes with KEY and
the pad's root (including root-changing modifiers). The display shows slash
bass in EDIT, and while playing when BASS is ON. Turn back to AUTO/ROOT/LOW
to leave explicit-note mode. Shift+knob 8 in those modes gives a hint, not an edit.
This does not
enable bass by itself; BASS > BASS must be ON. Live AUTO follows the current
global bass-note setting. A saved step freezes the resulting bass pitch even
when the source pad used AUTO.
There are no MORE/BACK/DONE controls. Shift + the same chord pad returns to
the previous page. Shift + a different chord pad selects it.

KEEP captures the variation actually played on the selected pad. The exact
chord transposes with KEY but retains its shape across scale changes. Kept
chords can be edited and replaced again. RESET clears all custom settings for
that pad. Shift + Delete + a chord pad is the same reset shortcut.
Old per-pad extension choices still follow the scale until replaced by an
explicit choice or kept snapshot. Shift + Step/Capture stores a separate
progression snapshot.

### Lock BORROW

Shift + BORROW toggles a temporary latch. The BORROW pad stays blue and a
boxed B remains in the display header on every page, including EDIT. Normal
momentary BORROW remains available when unlocked; a plain press while locked
does not release the latch. Shift + BORROW again unlocks it immediately for
the next chord attack, even before the pad is released.

With the latch on, II/DOM/SUB approach the borrowed target without needing to
hold BORROW. In C major, use the F pad with II, DOM, then no other modifier:
Gm7b5 → C7 → Fm. Unlock and the same pad returns to F at the next attack.
KEY, SCALE and saved pad definitions never change. Existing CHORD melody and
SCALE + ADAPT follow the actually played harmony as before.

Lock/unlock never changes sounding notes by itself. Page navigation, STOP,
routing changes and parking retain the latch; closing/reopening the module
clears it. It is not saved to the settings file. KEEP commits the played
variation and clears the latch to avoid borrowing the newly saved chord again.
Saved progression steps are not transformed by the latch.

## Momentary harmony exploration

| Modifier | What it prepares for the target chord pad |
| --- | --- |
| II | Minor seventh a whole tone above a major target; half-diminished seventh above a minor target. |
| DOM | Dominant seventh a fifth above the target. |
| SUB | Substitute dominant seventh a semitone above the target. |
| BORROW | Corresponding scale-degree chord from parallel minor/major. |
| M/m | Swap major/minor third, preserving other tones. |
| SUS2 / SUS4 | Replace the third with 2 or 4. |

Hold II and strike the G pad: Am7. Hold DOM and strike the same G pad: D7.
Release modifiers and strike it: G. For a Dm target: Em7b5 → A7 → Dm.
SUB on the C pad gives Db7; Dm7 → Db7 → C is another playable approach.

BORROW in C major gives Cm, Ddim, Eb, Fm, Gm, Ab, Bb and high Cm. In natural
minor it borrows from parallel major. Pentatonic roots keep their seven-degree
identity (G remains V). An off-scale custom root has no matching scale degree:
BORROW keeps that root and swaps MAJ/MIN when possible instead.
It preserves the extension family while the parallel scale supplies the
actual tones. This can change both root and chord quality.

BORROW is applied first, then one approach (II/DOM/SUB), then M/m and SUS.
The last-held II/DOM/SUB wins; the last-held SUS wins. Releasing one can prepare
another still-held modifier for the next attack. These gestures alone never
start, stop or change sounding notes. Every attack starts from the saved chord,
so approaches do not accumulate from the previous temporary chord.
Minor targets are detected by their minor third; diminished targets use the
same minor preparation, while suspended/augmented targets use major preparation.
These are playable starting points, not a conventional cadence for every target.

The played variant stays active after releasing modifiers. Chord-mode melody,
SCALE + ADAPT and automatic bass follow it. Saved loop slots and their previews
are not changed by modifier switches.

## Smooth changes

CHORDS > LEAD defaults to OFF. Enable it for nearby voicings in live chords
within a bounded register. Saving a step keeps that actual voicing and LEAD
choice; later LEAD changes affect live pads, not stored steps. A chosen per-pad INV enables
a locked inversion; select INV AUTO in EDIT to release it. LEAD OFF restores the
specified voicings without automatic inversion selection.

Common notes remain held across overlapping chord pads and compatible voicing edits.
For loop ties use GATE 100%; shorter gates deliberately release each chord.
Releasing every chord pad stops its notes when auto sustain is off. Voice leading changes note
placement, not pitch bends or portamento.

In CHORD mode, MELODY > TRACK NEAR retains a held melody tone when possible,
otherwise moving it to a
nearby chord tone within two octaves of that pad's normal register. TRACK PAD
uses the pad's fixed position in the new chord. New melody presses always use
the sixteen ascending chord-tone positions. SCALE follows the chosen scale
(with ADAPT if enabled); CHROM uses fixed semitone positions.

## Melody surface

All sixteen pads on the right ascend left-to-right from the bottom row upward.
The MELODY page controls:

| Knob | Control | Meaning |
| --- | --- | --- |
| 1 | MODE | CHORD, SCALE (new-project default) or CHROM. |
| 2 | M.OCT | Independent melody octave (-3 to +3; new-project default -1). |
| 3 | ADAPT | In SCALE mode, temporarily fit chord tones into the scale (new-project default ON). |
| 4 | TRACK | In CHORD mode, held notes follow NEAR or PAD positions. |

Knobs 5–8 are unused. Melody reattack is always enabled; the old REHIT control
has been removed. KEY and SCALE live on CHORDS; all outputs and channels
live on MIDI. ADAPT is unavailable in CHORD/CHROM; TRACK is unavailable in
SCALE/CHROM. Their stored choices are retained when switching modes.

CHORD follows the last actually played chord, including its extensions and
variation; merely holding a modifier does not change the melody. SCALE starts
on the selected tonic and walks through the selected scale. CHROM starts on
the same tonic and walks in semitones. SCALE pads change pitch on chord changes
only with ADAPT ON. CHROM never changes its semitone spacing. All modes share
the same note-color meanings: the played chord's root is purple, its other
chord tones blue, other scale tones white, and notes outside the scale grey.
When ADAPT is enabled, white/grey membership follows that temporary scale in
all modes; the CHROM pitches themselves stay chromatic. Chord-tone colors
take priority even for chords outside the key. Pressing or sustaining melody
notes never overrides these colors, so HOLD cannot leave false chord guides.
Out-of-range pads remain dark.

ADAPT is deliberately conservative. It begins with the selected global scale,
adds the pitch classes required by the actually played chord, and replaces the
nearest conflicting scale positions so the layout stays playable. If a chord
has more distinct pitch classes than a pentatonic scale can hold, extra
positions are added so every chord tone remains available. For example,
an A7 variation in C major supplies C#, while the rest of the original scale
remains available where possible; Fm supplies Ab. The global tonic and scale are never
permanently changed, and each new chord recalculates from the original scale so
chromatic changes do not accumulate. This is temporary chord-scale color, not
a modulation of the song's key. Set ADAPT OFF to compare the untouched scale.

M.OCT 0 anchors the melody tonic at MIDI 60 + KEY (plus the chord root offset
in CHORD mode). A note outside MIDI 0–127 is a dark, silent pad, not an octave
fold or a duplicated note. At high melody octaves, lower M.OCT to use all pads.
Switching MODE remaps held pads and releases previously released/sustained
melody notes so old pitches cannot linger in the new mode. Changing KEY or
the selected SCALE in SCALE mode likewise updates the mapping.

## Parts, retrigger and auto sustain

| Page / knob | Control | Meaning |
| --- | --- | --- |
| CHORDS 4 | OCT | Chord octave (-3 to +3); also available on Up/Down. |
| CHORDS 8 | SUST | HOLD keeps released notes until the next chord (initially OFF). |
| BASS 1 | BASS | Enable automatic bass (initially OFF). |
| BASS 2 | B.OCT | Independent bass octave (-5 to +6). |
| BASS 3 | B.VEL | Fixed bass velocity (1–127); inactive with VEL PAD. |
| BASS 4 | B.NTE | ROOT (default) or LOW (actual bottom chord voice). |
| BASS 5 | GEST | Press-only live bass gesture (initially OFF). |
| BASS 6 | SUST | Bass sustain: OFF, HOLD, PEDAL. |
| BASS 7 | VEL | PAD follows attack; FIXED uses B.VEL. |
| MELODY 5 | SUST | Melody sustain: OFF, HOLD, PEDAL. |

BASS knob 8 is unused. M.OCT lives on MELODY.
New projects default to VEL PAD. Existing projects retain FIXED and their saved
velocity. Live bass uses the chord-pad attack, or the last bass-selector attack
during a gesture. Saved step previews use S.VEL as their PAD attack; automatic
sequence bass still uses B.VEL, preserving the existing sequencer behavior.
STOP is always available above SUS4, fourth in the top-left group.

ROOT uses the root of the actual chord, including DOM and saved variations,
not the lowest inversion note. Changing C.OCT, inversion or voice leading does
not move a ROOT bass. Its base is MIDI 48 + KEY + chord root offset, plus the
chord pad's register and B.OCT × 12. For the first C pad, B.OCT -1/0/+1 gives
MIDI 36/48/60, regardless of C.OCT. The bass also follows stored loop slots.
Notes outside MIDI 0–127 stay silent rather than wrapping into another octave.

LOW follows the lowest note of the actual voicing after LEAD/manual inversion,
with its own register: lowest voiced MIDI note + (B.OCT - C.OCT) × 12. Thus
transposing the chord octave does not itself move the bass octave. C/E can have
E in a LOW bass or C in a ROOT bass. Per-pad B.NTE overrides the global choice.
Both live and loop bass use the actual voiced chord, not an estimated inversion.

### Bass walks with explicit notes

Enable BASS > BASS. Play C and save step 1. Shift + its chord pad opens EDIT;
turn knob 8 past AUTO/ROOT/LOW to B, then hold Shift and turn it to B1.
Exit EDIT, play the chord again and save step 2: C/B, with the chord voices
unchanged. Edit Am's bass to A1, play it and save step 3. The bass line is
C2–B1–A1 (MIDI 36–35–33). G/B instead of C/B uses the G pad with B1; C/E
uses C with E2. Each step freezes the played bass pitch, independent of later
edits to the source pad. These are programmed bass walks; automatic walking
bass patterns are not part of this release.

Explicit notes are stored as signed semitone offsets from the pad's root
anchor, including register, not as chord inversions. Changing KEY or ROOT
therefore transposes them with the live chord. Transpositions beyond MIDI
range are silent; use Shift+knob 8 to move back into range. Saved steps stay
absolute and do not transpose. B.VEL, BASS enable and bass routing remain live.

Always-on reattack fixes the shared-note problem: striking a melody note owned by
the chord sends an off/on pair, using the melody velocity, while retaining the
chord's ownership. Releasing the melody therefore does not cut that chord note.
On the same destination and MIDI channel, an identical pitch is necessarily
shared: the reattack is heard in the chord sound too. Separate channels or
outputs provide independent voices when the receiving instrument supports them.
Automatic melody revoicing does not request a fresh attack.

Each live part has its own SUST setting. OFF sends note-off on release; HOLD
keeps note ownership until the next chord. PEDAL sends CC64=127 before playing
and sends ordinary note-offs on pad release, leaving the receiving instrument's
pedal active. The pedal lifts at the next harmony boundary and a new pedal period
starts with the next notes. Released pedal voices are not retriggered by previews.
ARP HOLD still controls the arpeggio source independently, not a pedal.

CC64 affects a whole destination/channel. Independent part behavior requires
separate channels (including ARP); a shared-channel warning appears on MIDI and
when changing conflicting controls. BOTH counts as overlapping either output.
Shared pedal ownership prevents one part from lifting another part's pedal,
but it cannot make CC64 note-specific. Instrument CC64 support and decay vary.
STOP, routing changes, project switching, parking and unload release pedals.
Failed controller sends are retried; new notes wait for pending pedal changes.
Old projects map their former global SUST choice to all three live parts.

With HOLD, loop gates are effectively 100% (LOOP shows HOLD); turning it off
restores the saved gate percentage and stops released live notes. GATE shows
HOLD and cannot be adjusted while sustain overrides it. Loop step
boundaries and transport stop release latched notes in the DSP. STOP, parking
and unloading clear live held notes. Ordinary synthesized release tails still
depend on the receiving sound's envelope. Auto sustain is independent of reattack.
Existing AUTO settings are displayed as
HOLD without changing their behavior.

## STOP / kill notes

The blue pad above SUS4 (fourth in the top-left group) is STOP on every page, including
EDIT and THEORY. Press it once to release all chord, melody, bass and preview
notes, cancel pending strums and test notes, and disarm the progression.
The pad turns white while held. Play a new chord to continue; saved chords,
routing and the HOLD setting are retained.

Explicit STOP also sends sustain-off (CC64), All Notes Off (CC123) and
All Sound Off (CC120) to destination/channel pairs where this module has sent
notes during the current session, including earlier routes with release tails.
Ordinary chord changes and routing changes do not send these channel-wide
kill commands. Failed sends are retried before new notes on the same channel.

These messages follow the [MIDI channel-mode specification](https://midi.org/summary-of-midi-1-0-messages).
How quickly release/effect tails end depends on the receiving synth's support.
Channel-wide commands also affect other notes on the same destination/channel;
use separate channels when another part must keep playing independently.
Chord Pilot does not mute Move's master audio or stop its global transport.

## Independent routing

MIDI offers C.OUT/C.CH, M.OUT/M.CH, B.OUT/B.CH and A.OUT/A.CH: destination and MIDI
channel for chords, melody, bass and ARP. Each supports Move/USB-C, USB-A, Both and
Schwung, with channels 1–16. These are MIDI parts, not newly created Move tracks.
The receiving device/chain must be configured to listen to the chosen channel.

C.OUT sets both live and sequence chord destinations. Existing projects with a
different saved sequence route retain it, exposed as SEQ OUT (knob 6) only while
different. Select the chord destination there to remove that legacy override. Bass and melody
keep their own outputs/channels. Changing routing stops current live notes on their
original destinations; play again to audition the new routing. An armed loop
uses the new routing from its next step.

MIDI TEST and STATE are removed. Project saving continues unchanged; pending
project identity or failed saves still show an explicit warning in the footer.

## Progressions and MIDI

Shift + Step 1–16 stores the active chord. Delete + Step clears a slot. Capture
fills the next free slot as chords are played. Play arms the saved progression;
Shift + Play disarms it. SEQ contains RUN, RATE, GATE, CAPT and S.VEL (knob 5,
1–127, default 100). S.VEL controls steps without a recorded velocity;
physical step-button velocity is ignored. Chord pads keep their played velocity.
Routes are Move/USB-C,
USB-A, Both and Schwung. Chord Pilot only generates MIDI and needs a Move
instrument, external MIDI device or Schwung chain to make sound.

Each saved step stores absolute chord pitches, the resulting inversion/spread/
voice-leading voicing, original key/scale, bass pitch and strum/LEAD choice.
Changing global KEY, SCALE, EXT, SPRD, LEAD, C.OCT, B.OCT or B.NTE does not
rewrite it. Melody guides and chord labels use the saved tonal context while
that step is active; playing a regular pad returns to the live global context.
Save over a step to replace its snapshot. Rate, gate/HOLD, S.VEL, B.VEL,
BASS on/off and MIDI routing remain live playback controls. Empty slots are
rests; loop length is always 16 steps, including trailing empty steps.
An entirely empty sequence also displays a moving playhead when armed and
Move transport is running. RATE sets each cell to 1/16, 1/8, 1/4, 1/2 or one bar.

On the SEQ page, hold a chord pad and press any step to place or replace that
cell. Delete + Step clears it. Outside SEQ, plain steps retain their audition
behavior; Shift + Step still stores the active chord everywhere. Existing
stored snapshots remain unchanged, but short progressions now have trailing
rests instead of immediately wrapping after their last chord.

### Chord Record and multi-step lengths (beta.22)

Press the transport Record button (CC86 / Schwung MoveRec), or turn SEQ knob 7
REC on, then start Move Play and play chord pads. Start/end are quantized to
the nearest RATE cell, with minimum length one and maximum sixteen steps.
RATE is also the recording grid in this first version; separate/free recording
quantization is not yet available. No valid clock means no notes are recorded.
Timing comes from fresh DSP host-beat reads at input, not the display playhead.

Each chord's physical hold duration and attack velocity are captured. A new
chord press ends the preceding take; an old pad release cannot end a newer take.
With Bass Gesture, recording ends when all gesture pads are released. From beta.23,
bass selector changes are separate recorded events (see below). SUST HOLD
and PEDAL do not extend the recorded physical hold duration.

While REC is armed, the selected recording lane is muted so you hear your live playing.
Record off resumes chord output at the next attack and bass at the current active event. Captured spans overwrite
existing starts only inside those spans (including across step 16 -> 1).
Release notes to finish each capture; STOP, project change, parking and changing
RATE also finalize the pending take and disarm Record. Record is never restored
as armed when opening a project. Capture auto-fill and Record are mutually exclusive.

Hold a stored step on SEQ, then LEN sets its duration to 1-16 cells.
Explicit lengths hold without per-cell retrigger and override global GATE;
the next stored attack interrupts the earlier event, which never resumes later.
To extend into occupied cells, clear those starts with Delete + Step first.
Earlier saved steps without an explicit length keep their original one-cell
GATE behavior. Recorded velocities override S.VEL; S.VEL still controls manual
steps without a recorded velocity. Chord intent and frozen notes remain stored.

Melody recording, multiple clips and retrospective Capture remain future steps;
the existing CAPT auto-fill behavior is unchanged. Avoid editing/saving new
length recordings with older module versions, which do not retain timing fields.

## Project saving

The module reads the same `active_set.txt` identity used by Schwung's built-in
[Song Mode](https://github.com/charlesvestal/schwung/blob/main/src/modules/tools/song-mode/ui.js).
With a valid project ID, settings, edited pads and all 16 steps save to
`/data/UserData/schwung/set_state/<set-id>/chord_pilot_v7.json` outside the
replaceable module folder. New IDs start clean; returning to an existing ID
restores it, and renaming the same ID preserves it. Runtime note ownership,
BORROW latch, IDEAS enable, Capture and loop arming are not restored.

Identity is checked at startup/resume and at most twice a second while open
or parked, after Schwung publishes it. A detected switch releases old voices,
disarms the loop, saves to the old ID and loads the new one. Missing, incomplete
or temporary `__pending-*` identities after a detected set cause a waiting
state, not a global fallback. Failed writes retain their original path for
retry while the module stays loaded; do not power off while Save pending is
shown. This still needs on-device verification with your installed Schwung.
Project duplication/import semantics depend on whether Schwung copies its
per-set state directory; this release does not infer copies by song name.

If no identity source is available on startup, the
module uses its previous global-file behavior. No automatic fresh-per-project
behavior is possible in that fallback. If a valid ID subsequently appears,
the module switches to isolated per-project storage. Older global files are
never silently assigned to a new project or deleted.

## Install

Requirements: Ableton Move 1.8+, Schwung 1.0+, and a network connection to the
Move. Build the ARM64 package with:

```sh
./scripts/build.sh
./scripts/install.sh
```

The installer uses an atomic swap for upgrades and retains this module's own
settings. It does not import, move or modify Chord Finder. You can also upload
`dist/chord-pilot-module.tar.gz` using
Schwung Manager's custom module installer.

The global fallback writes `pilot-state-v7.json`. Versions v6 through v1 are
read when no v7 state exists and remain untouched. Older Color/PAD8 harmony is
converted into an ordinary custom eighth pad, including its saved voicing.
Routing, part octaves, bass register, old per-pad edits and progressions are
retained. Legacy steps are frozen once using their existing loop voicings.
The SSH installer carries all seven global state files forward; project files
live outside its install directory.
Web installation state retention depends on the installed Schwung Manager;
save a copy of settings before replacing the module if those presets matter.

## Test on Move

1. Choose C Major; play A1 then A4 with LEAD ON and OFF and compare movement.
2. Shift + A2, set EXT to 9, then exit edit mode. A2 should be Dm9 while A1
   still uses the global extension. Reopen the module to check persistence.
3. Hold A2 and a melody pad; press/release DOM without striking a chord. Nothing
   should change. Hold DOM and strike A2: hear A7. Release DOM: A7 stays in force.
   Strike A2 again without DOM: hear Dm9. Repeat with MAJ/MIN and both SUS pads.
4. Save C and F to two steps, set LOOP > GATE 100%, and play the loop with a held
   melody. Stop playback and release pads; no notes should remain stuck.
5. Check screen readability, modifier-pad orientation and sustained-note sound
   on your actual instrument. Automated tests do not replace this listening test.
6. Put melody and chords in overlapping registers and repeatedly play a melody
   pitch held by the chord. Every press should sound; releasing
   melody should not cut the still-held chord.
7. Enable SUST HOLD, play and release a chord and several melody notes. Change
   chords, disable sustain, use STOP and reopen the module; check for stuck notes.
8. Enable BASS, compare -2/-1/0/+1 and change C.OCT; bass octave must stay fixed.
   Then route each part to different channels/outputs.
   Confirm that note-offs return to the original destinations when changing routes.
9. Use all sixteen right-hand pads. Compare CHORD, SCALE and CHROM while changing
   chords. With ADAPT OFF, only CHORD should remap pitches; purple/blue chord-tone guides update
   in the others. With SCALE + ADAPT ON, play DOM and verify the temporary scale.
10. Switch melody modes and octaves while holding/releasing pads with sustain on.
    Dark out-of-range pads must stay silent.
11. With HOLD on, play/release chord, bass and melody, then press the STOP pad
    above SUS4 on several pages. Test a long-release synth and a running loop.
    Verify no queued strum or loop notes restart until you deliberately play again.
12. Shift + a chord pad: check EDIT has eight controls on one page, no global
    KEY/SCALE controls and no MORE/BACK/DONE. The main knob stays in EDIT;
    Shift + the same pad exits. Knob 8 selects AUTO/ROOT/LOW bass notes.
13. On the G pad, play II → DOM → no modifier. Hear Am7 → D7 → G.
    On Dm, hear Em7b5 → A7 → Dm. Try SUB and BORROW with CHORD and SCALE + ADAPT.
14. In EDIT, compare TYPE MAJ + EXT 7 with MAJ7, then change ROOT and KEY.
    Save/reopen and check the custom chord and progression both survive.
15. Shift + BORROW, release both, and check the blue pad and boxed B. Play
    II → DOM → plain F pad: Gm7b5 → C7 → Fm. Toggle off while holding notes:
    nothing changes until the next chord attack, which should return to F.
    Test both Shift/pad release orders, STOP, KEEP and module reopening.
16. Enter IDEAS, enable it and compare suggestions on the eight left chord pads.
    Hold a chord and melody while using NEW/STYLE: sounding notes must not change.
    Compare SAFE/COLOR/WILD from the same source using knob 2.
    Save a suggestion using Shift + Step. Leave IDEAS and confirm regular pads return.
17. Compare global ROOT/LOW with LEAD ON and with a fixed per-pad inversion.
    Override one pad to ROOT while global is LOW, save it to a step, reopen and compare.
18. Save different voicings to steps 1, 9 and 16. Change global KEY/SPRD/LEAD
    and octaves. Preview each step and loop: its saved pitches must not change.
    Adjust SEQ knob 5 S.VEL and check the next step attacks respond.
19. Edit project A, create/open B (clean), then return
    to A. Settings and steps must return, with the loop disarmed. Repeat after
    parking and module reload. Back up important sets before device testing.
20. With HOLD, press/release every melody pad in all modes. Root stays purple,
    other chord tones blue, scale tones white, non-scale chromatic tones grey.

New defaults apply only when no saved settings exist for that project. Existing
projects and legacy files keep their melody mode, octave and ADAPT choices.

## Development

Run the test wrapper; it automatically selects a bundled modern Node runtime
when the system `node` is older:

```sh
npm test
```

Run `npm run preview` to regenerate `docs/display-preview.svg` from the same
renderer used on Move.
