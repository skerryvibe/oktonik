# Chord Pilot: stegvis portabel kärna

## Lab .11: opt-in stable ensemble allocation

`dsp/divisi.h::ensemble_assign` is a bounded, allocation-free minimum-distance
matching of supplied notes to eight logical voice IDs. It does not change pitches.
`LEAD` still chooses voicings in theory. Initial ties assign voices low-to-high;
later assignments minimize total semitone motion, with cost 128 for unused voices.
Silent voices retain their last pitch; voices may cross. No instrument register
limits, fixed-size orchestration, doubling or voice-specific expression yet.
The caller supplies unique MIDI notes and count 1..8.

DSP snapshots the resulting MIDI channels into the existing Voice ownership.
Live harmony (across pad owners) and sequencer have separate transient memories.
Release sends no new notes and retains history. Panic/STOP/config rerouting clears
it; an on-command's changed map/route also resets history before matching.
Duplicate output channels remain allowed, but cannot give independent MIDI voices.
Existing retained-note/strum/pedal/pressure/retry code uses actual note+channel.

Lab Shift+CHORD knob 5 VOICE RANK/SMTH selects optional `ensembleSmooth` (default
false within schema 7); knob 7 DIV OFF/NOTE still enables distribution. Protocol
`divisi:2` selects stable matching, `1` keeps rank behavior, `0` remains off.
Pedal membership remains the union of the full eight-channel map. Public never
sends mode 1/2, including when opening settings written with Lab options.

## Lab .8: signed inversions

`chordNotes` accepts signed inversion intent. Negative inversion moves the
highest k source tones below the rest using a shared octave displacement,
preserving their spacing and pitch classes before spread and MIDI-range fitting.
Positive inversion output is unchanged. Serialized chords/overrides accept
-7..7; the edit control bounds the effective value by actual tone count.
AUTO uses `lockInversion:false`, not a numeric sentinel. EDIT Shift+INV clears
the lock; negative manual inversion is therefore independent of automatic
voice leading. No new schema or DSP protocol is introduced.
MELODY/BASS extras use the existing view-only Shift layer; routing and musical
parameters are not duplicated or rebound just because the layer opens.

## Lab .7: extra views and ensemble routing

`EXTRA_PAGES` binds a parent page to a temporary control view. `shift(held)`
changes only view state; the Move adapter translates the physical modifier.
EDIT, project transitions and co-run reset/override the layer. No settings
schema or musical state is tied to Shift being held.

Settings `ensembleChannels[8]` stores zero-based channels, normalized to 0–15.
Without the field, the old C.CH series is preserved. `on`, `config`, `pedal`
accept an optional fixed-length `channels` array. Parsing rejects invalid
length/range atomically, but preserves duplicates. `config` stores the loop map;
live commands snapshot it. Pedal membership is the union of mapped channels.
Legacy commands without a map retain consecutive-channel behavior.

## Lab .5–.7: pitch-rank divisi

`dsp/divisi.h` fördelar unika toner på kanaler efter tonhöjdsrang utan Move-
eller transportberoenden. Tonernas arrayordning bevaras för strum. DSP Voice
sparar `channels[]` per ton; notägande, tryck, legato och release använder denna
adress, inte bara Voice.channel. Legato behåller endast samma ton OCH kanal.
`on.divisi` styr live-ackord; `config.divisi` styr loopackord. Melodi/bas/ARP
använder fortfarande en enda kanal. Controllern stoppar live-noter vid kanalbyte.
Från .7 väljer varje stämma egen kanal; `pedal.divisi` för chord-owner 0 äger CC64
över de valda kanalerna; andra pedalägare delar den befintliga bitmasken.
Settings-fältet divisi är valfritt, default false, schema 7. Public ignorerar det.
Detta är inte persistent röstmatchning; sådan logik ska senare tillkomma som
en musikalisk fördelare, inte genom Move-knappar eller displayberoenden.

## Lab .4: uttryck och notägande

Move-adaptern översätter poly pressure till `pressure(logicalMelodyIndex, value)`.
Controllern samlar senaste värdet per hållen ingång till nästa UI-tick och skickar
`{op: 'pressure', owner, pressure}`. DSP väljer ägarens faktiska toner, kanal och
destination; fysisk padpitch får aldrig användas som utgående notnummer.
Tryckåterställning ingår i DSP:s release/revoice/kill-livscykel och misslyckad
MIDI-utmatning återförsöks. Delade pitch/kanal-destinationer använder högsta
ägda tryckvärdet. Det är MIDI:s gemensamma uttrycksadress, inte oberoende MPE.
Opt-in-inställningen `melodyAftertouch` är valfri inom schema 7 och default false.
Public ignorerar tryckinput; Lab har AT på MELODY. Framtida divisi behöver stabila
röstidentiteter och separata kanaler för oberoende uttryck mellan ensemble-delar.

Move/Schwung är produktionsplattformen. M4L/Push utvecklas inte i beta.12.

- `theory.mjs`: rena skalor, ackord, voicings, modifierare, meloditonval och namn.
- `ideas.mjs`: musikaliska förslag; återanvänder theory.
- `recording.mjs`: portabel monofon ackordtagning med logiska owner-ID:n,
  host-beats, payload och velocity. Inga Move-knappar, UI-timers eller MIDI.
  Beta.22 lagrar valfri `timing: {steps, velocity?}` bredvid stegackordets snapshot.
  Avsaknad behåller gammal gate/velocity; explicit längd håller över tomma celler.
  DSP skiljer playhead-slot från event-slot; UI/adaptern hämtar färsk `clock`
  vid anslag/släpp. Detta är fortfarande en kvantiserad 16-cellsmodell, inte
  en färdig polyfon clipmotor. Uppgraderingar får inte kasta originalnoter.
- `dsp/strum.h`: ren attack-planerare. Tar toner, anslag och parametrar och
  returnerar relativa fördröjningar och velocity per ton, utan Move-beroenden.
  DSP-adaptern omvandlar fördröjningar till sample-positioner och sköter MIDI.
- `bass-gesture.mjs`: plattformsoberoende state machine med logiska input-ID:n.
  `press` ger start/bass/none; `release` ger wait/end/none. Anchor lever till
  sista släppet. Inga klockor, fysiska MIDI-padnummer, display eller filvägar.
- `pilot.mjs`: befintlig controller med performance, ägande, grid/layout,
  Move-padöversättning och DSP-kommandon. Detta är fortfarande ett blandat lager.
  Nya musikaliska state machines extraheras härifrån när respektive funktion ändras.
- `ui.js`, `display.mjs`, `project.mjs`: hårdvaru-/värd-I/O, display och projektlagring.
- `settings.mjs`: normalisering/snapshot-format plus befintlig lagringsadapter.
- `dsp/chord_pilot.c`: realtime note ownership, ARP, strum och loop samt Schwung
  callback-adapter. Tidsschemaläggning är fortfarande värdbunden; ingen ny
  duplicerad JS-arpeggiator införs bara för portabilitet.

I beta.12 frågar pad-anslag, PLAY och IDEAS samma `chordForInput(index)` i
controllern. Den återanvänder theory och arbetar med logiska bankindex.
`inputPreview(index)` beräknar voicing/namn utan att ändra state eller skicka MIDI,
utan basgestens tillfälliga slash-val (från beta.13). Rubriken visar fortfarande
det klingande resultatet. Displayen tar bara emot ett
`chordMap`-snapshot; samma grid-renderer används för båda vyerna.
Resolvern är ännu en controller-closure, inte en färdig portabel performance-core.
Inför en framtida port kan logisk performance ta emot press/release, tempo/beat
och inställningar, och lämna note events samt musikaliska snapshots till adaptrar.
Midi-routing och fysisk layout binds då av respektive adapter.

FREE i beta.13 använder DSP:ns sample-räknare och sample rate för egen beat-position.
Samma ARP-sekvensering, gate, swing och note ownership används av SYNC och FREE.
Inget separat UI-timerbaserat ARP införs. Klockval och BPM sparas med säkra defaults.

Schema 7 och projektfilernas namn bevaras i beta.13. Gesture-state och diagnostik
är tillfälliga och sparas inte i projekten. En M4L-proof-of-concept ska senare
pröva återanvändning av åtta ackordingångar och åtta följande meloditonval.
Push 3 Standalone är ett framtida kompatibilitetstest, inte utlovat stöd.
