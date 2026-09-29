# Chord Pilot: stegvis portabel kärna

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
