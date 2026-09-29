# Chord Pilot 0.0.4-beta.8

Den här uppdateringen ändrar melodifärger och förval. Basnoter per ackord,
arpeggiator och utökad strum är ännu designförslag, inte implementerade.

## Melodi

- Grundton i spelat ackord: lila.
- Övriga ackordtoner: blå.
- Övriga skaltoner: vita.
- Kromatiska toner utanför skalan: grå.

Färgerna har samma betydelse i CHORD, SCALE och CHROM, även under HOLD.
Ackordtoner prioriteras framför skaltillhörighet. Med ADAPT på visar färgerna
förhållandet till den tillfälligt anpassade skalan, som i beta.7.

Nya projekt startar med MODE SCALE, M.OCT -1 och ADAPT ON. Befintliga projekt
behåller sina sparade inställningar. Vill du ha dessa val i ett befintligt
projekt ställer du in dem på MELODY-sidan; projektsparningen behåller dem sedan.

Sparformatet är fortsatt v7, så tidigare projekt och frysta steps läses som
tidigare utan någon ny migrering. Alla andra beta.7-funktioner är oförändrade.

## Kontroll på Move

1. Öppna ett nytt projekt: kontrollera SCALE, -1, ADAPT ON.
2. Spela ett C-ackord: C lila, E/G blå, D/F/A/B vita.
3. Växla till CHROM: C#/D#/F#/G#/A# ska vara grå i C-dur.
4. Med HOLD, spela och släpp toner. Färgerna ska behålla sin betydelse.
5. Öppna ett äldre projekt: dess tidigare melodival och sparade steps ska bestå.

Föreslagen fortsättning finns i roadmap.md: egna basnoter → separat ARP →
utökad STRUM → gitarrvoicings.
