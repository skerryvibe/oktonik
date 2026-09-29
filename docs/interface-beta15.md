# Beta.15 – sustain och anslag

Installera modularkivet via Schwung och starta om Move.

- CHORDS ratt 8: ackordens SUST.
- MELODY ratt 5: melodins SUST.
- BASS ratt 6: basens SUST.
- Varje del väljer OFF / HOLD / PEDAL. PEDAL skickar CC64; note-off kommer
  när paden släpps. Vid nästa ackord lyfts pedalen innan nästa pedalperiod.
- Välj separata MIDI-kanaler för oberoende beteende. CC64 påverkar hela kanalen,
  även ARP eller andra noter där. MIDI-sidan varnar för överlappande delar.
- Testa CHORDS PEDAL, BASS OFF, MELODY OFF. Ackordets pedal ska ligga kvar
  efter släpp, men bas och melodi ska sluta. Testa STOP och projektbyte.
- Prova basgest C/E, släpp båda och tryck F med olika SUST-val.
- BASS ratt 7 VEL: PAD eller FIXED. PAD följer ackordanslaget, och vid basgest
  det nya basvalets anslag. B.VEL på ratt 3 används endast med FIXED för live-bas.
- Gamla projekt behåller fast basvelocity och tidigare sustainval för alla delar.
  Nya projekt börjar med PAD. Sparformatet och projektfilernas namn behålls.
- ARP HOLD är oberoende. SEQ är inte ombyggd: automatisk sekvensbas använder B.VEL.

Pedalstöd och klang skiljer sig mellan instrument. PEDAL garanterar inte
avklingning: lyssna med både korta och uthållna ljud. Rapportera destination,
kanaler och instrument om något fortsätter klinga efter STOP.
