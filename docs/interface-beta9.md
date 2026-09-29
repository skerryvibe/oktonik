# Chord Pilot 0.0.4-beta.9 – egna basnoter

EDIT ligger kvar på en sida. B.NTE, ratt 8, har nu valen AUTO, ROOT, LOW och
C–B. En egen ton visas med oktav, exempelvis B1. Håll Shift och vrid ratt 8
för att flytta den tonen oktavvis. Vanlig vridning väljer ton inom oktaven.
PARTS → BASS måste vara ON för att basen ska höras.

## C → C/B → Am, med C2 → B1 → A1 i basen

1. Spela C och spara till step 1 med Shift + step 1.
2. Shift + C-paden öppnar EDIT. Vrid ratt 8 till B, håll sedan Shift och
   vrid samma ratt tills värdet är B1.
3. Shift + samma chord-pad avslutar EDIT. Spela C-paden igen: ackordet visas
   som C/B. Ackordinstrumentet spelar fortfarande C–E–G; baspartet spelar B1.
4. Spara till step 2. Det redan sparade C-ackordet på step 1 är oförändrat.
5. Öppna EDIT för Am-paden, välj A1 som bas, avsluta, spela och spara till step 3.

För C → G/B → Am väljer du B1 på G-paden i stället. För C → C/E → F väljer
du E2 på C-paden. Manuell bas kan också ligga utanför ackordets toner.

## Vad påverkar vad?

- Egen basnot styr bara baspartet, inte inversion, ackordtoner eller melodiskala.
- Egen basnot och oktav ignorerar globala B.OCT, C.OCT och LEAD.
- KEY och ackordets ROOT transponerar den egna basnoten tillsammans med live-
  ackordet. Modifierare som flyttar ackordets grundton flyttar basen lika mycket.
- Steps fryser den faktiskt spelade basnoten; efterföljande ändringar påverkar inte steget.
- B.VEL, BASS på/av och basspårets MIDI-utgång/kanal gäller fortfarande.
- AUTO återgår till global basfunktion. ROOT och LOW finns kvar. RESET tar bort padens egna val.
- Hela MIDI-omfånget 0–127 kan väljas. Om senare transposition hamnar utanför
  omfånget blir basnoten tyst; flytta tillbaka den med Shift + ratt 8.

Slash-namnet visas i EDIT även om basen är av, så att du ser det konfigurerade
ackordet. Vid spelning visas slash-basen när BASS är på.

## Status

Beta.8:s färger och melodiförval ingår: lila grundton, blå ackordtoner, vita
skaltoner; nya projekt startar SCALE / -1 / ADAPT ON.

Detta är manuell programmering av basgångar. Automatisk walking bass, separat
arpeggiator, ny slumpstrum och gitarrvoicings är inte implementerade ännu.
Arpeggiatorn är nästa planerade etapp.

Provspela exemplen på Move, spara/återöppna projektet och jämför med de frysta
stegen. Gamla projekt ska behålla ROOT/LOW/AUTO tills du väljer en egen basnot.
