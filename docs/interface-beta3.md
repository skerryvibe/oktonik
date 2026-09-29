# Chord Pilot 0.0.4-beta.3 – gränssnitt

Sex vanliga sidor. Varje inställning har en hemvist. Rattarnas platser är
oförändrade inom varje sida; tomma rutor är oanvända. Rör en ratt för hela namnet.
Reglage som inte gäller i valt läge visar `--` och förklaras vid beröring.

| Sida | Ratt 1–4 | Ratt 5–8 |
| --- | --- | --- |
| HARMONY | KEY · SCALE · EXT · PAD8 | INV · SPRD · LEAD · STRUM |
| MELODY | MODE · M.OCT · ADAPT · TRACK | REHIT · — · — · — |
| PARTS | C.OCT · SUST · — · — | BASS · B.OCT · B.VEL · — |
| LOOP | RUN · RATE · GATE · CAPT | — · — · — · — |
| MIDI | C.OUT · C.CH · M.OUT · M.CH | B.OUT · B.CH · L.OUT · TEST |
| THEORY | Klingande toner och klaviatur | Grundton, bas och toppton |

## Vad har flyttats?

- VOICING har fördelats på HARMONY, MELODY och ackordets EDIT-läge.
- PLAY har blivit LOOP; dess MIDI-inställningar finns på MIDI.
- PARTS har ackordoktav, sustain och bas. Melodioktav och REHIT finns på MELODY.
- Grundton och skala ändras på HARMONY och visas som information på MELODY.
- COLOR heter PAD8 för att visa att det valet påverkar åttonde ackordpaden.
- MIDI samlar alla utgångar och kanaler. TEST bläddrar och provspelar ackord,
  melodi och bas. L.OUT visar CHORD när loopen använder ackordens utgång.

## Redigera ett ackord

Håll Shift och tryck på en ackordpad. Rubriken blir EDIT 1–8 och alla reglage
gäller den valda paden:

| Ratt 1–4 | Ratt 5–8 |
| --- | --- |
| PAD · LOCK · EXT · KEEP | INV · SPRD · RESET · DONE |

PAD väljer ackord, LOCK låser inversionen och KEEP sparar den variant du
spelat på just den paden. RESET återställer dess globala grundinställningar.
DONE, Shift + samma pad eller sidbyte avslutar redigeringen.

## Sustain och STOP

SUST finns på PARTS och har OFF/HOLD. HOLD är samma hållfunktion som tidigare
hette AUTO: släppta toner fortsätter till nästa ackord. GATE på LOOP visar
HOLD eftersom sustain då håller hela ackordlängden.

Den blå paden längst upp till vänster, direkt ovanför DOM, är STOP.
Tryck en gång för att avsluta ackord, melodi, bas, förhandslyssning och
testtoner. Väntande strum-toner avbryts och loopen stoppas och avarmeras.
Paden lyser vitt medan den hålls nere. Funktionen gäller på alla sidor.
Inställningar och sparade ackord behålls; spela en ny pad för att fortsätta.

STOP skickar notsläpp samt sustain-off, All Notes Off och All Sound Off till
utgångar/kanaler som Chord Pilot har spelat på under sessionen. Det omfattar
även tidigare utgångar som kan ha kvar ljudsvansar. En synths stöd avgör om
långa release- eller effektsvansar tystnar helt. Andra toner på samma
MIDI-kanal kan också tystna; separata kanaler ger oberoende delar.
Move-enhetens globala transport eller mastervolym ändras inte.

## Testa på Move

1. Bläddra runt och kontrollera läsbarheten och att tomma rattplatser är tysta.
2. Öppna EDIT, ändra EXT och byt sida. Återvänd till HARMONY: globalt läge.
3. Välj SCALE på MELODY och prova ADAPT. TRACK gäller endast CHORD-läget.
4. Slå på HOLD och BASS, spela ackord och melodi, släpp allt och tryck STOP.
5. Upprepa med en loop, lång STRUM och en synth med lång release.
6. Spela direkt efter STOP. Gamla hållna toner ska inte komma tillbaka.

Bygget verifieras med automatiska tester; fysisk skärm- och lyssningskontroll
återstår hos användaren.
