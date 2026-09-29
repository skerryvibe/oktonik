# Chord Pilot 0.0.4-beta.7

## Steg 1–16 och fast sparade ackord

- Shift + valfri step-knapp sparar det aktuella ackordet.
- Tryck på steget för att provspela; Delete + step tömmer det.
- Capture fyller nästa lediga plats, inklusive steg 9–16.
- LOOP → S.VEL, ratt 5, väljer anslag 1–127 för alla steg (standard 100).
  Det gäller både provspelning och nästa anslag i loopen. Vanliga ackordpads
  behåller anslagskänsligheten från fingrarna.

Stegen sparar de faktiskt spelade tonerna: voicing/inversion, spread och resultatet
av LEAD, plus tonart/skala, basnot, STRUM och LEAD-val. Senare globala ändringar
skriver inte om dessa. Melodin och ackordnamnet använder det sparade stegets
tonala sammanhang när du spelar det. Vanliga ackordpads använder aktuell global
tonart som tidigare. Spara på samma step igen för att ersätta ackordet.

RATE, GATE/SUST, S.VEL, B.VEL, BASS på/av och MIDI-routing är fortfarande
gemensamma uppspelningskontroller. Det går alltså att ändra anslag, tempo,
notlängd eller stänga av basen utan att skriva om ackorden.

## Melodifärger

Samma färger gäller i CHORD, SCALE och CHROM, även när SUST står på HOLD:

- Lila: grundtonen i det spelade ackordet.
- Vitt: övriga ackordtoner.
- Blått: skaltoner som inte är ackordtoner.
- Grått: kromatiska toner utanför skalan.
- Släckt: utanför MIDI-omfånget, kan inte spelas.

Ackordfärgerna har företräde även för lånade ackord och secondary dominants.
Med ADAPT på utgår blå/grå från den tillfälligt anpassade skalan. CHROM behåller
sin kromatiska tonföljd; färgerna visar hur den förhåller sig till harmonin.
Att hålla eller släppa en melodipad ändrar inte dess harmoniska färg.

## Projekt

Modulen använder samma aktiva set-ID som Schwungs inbyggda Song Mode. Varje
nytt ID börjar tomt, med CLOSE och LEAD OFF. Inställningar, egna ackord och
steg sparas separat och återkommer när samma projekt öppnas igen.

På MIDI-sidan har TEST försvunnit. Sista rutan visar nu enbart sparstatus:
STATE SET = projektsparning, GLOBL = global reservfunktion på värdar utan
tillgängligt projekt-ID, WAIT = väntar på ett giltigt ID. Ratten har ingen funktion.

Ett upptäckt projektbyte släpper toner och avaktiverar loopen. Tillfälliga
BORROW/IDEAS-lägen återställs. Saknat eller provisoriskt ID efter ett känt projekt
stoppar spelning och redigering tills identiteten är tydlig igen. ID kontrolleras
vid start/återgång och högst två gånger per sekund efter att Schwung publicerat det.

Projektfiler ligger utanför modulens installationsmapp:
`/data/UserData/schwung/set_state/<set-id>/chord_pilot_v7.json`.
Äldre globala filer behålls, men kopieras inte automatiskt in i nya projekt.
Vid GLOBL används den äldre globala sparningen; då finns inte automatisk
nollställning per projekt. Avstängning vid Save pending kan förlora osparat arbete.
Kopiering/import av Move-set behöver testas separat; beteendet beror på om Schwung
tar med sin set_state-data. Inga projekt matchas genom enbart liknande namn.

## Basnamnet

B.NTE behåller ROOT / LOW. LOW betyder den lägsta faktiskt spelade ackordtonen,
med basens valda oktav. Den kan komma från både LEAD och en manuellt vald INV;
därför är LOW mer heltäckande än något av de två namnen.

## Viktigt speltest på Move

1. Spara olika ackord på steg 1, 9 och 16; ändra KEY, SPRD, LEAD och oktaver.
   Stegen ska behålla exakt sina toner även efter omstart.
2. Ändra S.VEL mellan 40 och 110. Både provspelning och loopen ska reagera.
3. Spela melodier med HOLD i alla tre lägen. Färgerna ska förbli tydliga.
4. Kontrollera STATE SET, ändra projekt A, öppna ett nytt B och återgå till A.
   B ska börja tomt och A återställas. Gör samma sak med modulen parkerad.
5. Kontrollera att inga gamla toner fortsätter efter projektbyte eller STOP.

Automatiska tester och ARM64-paket kontrolleras lokalt. Verifiering på fysisk
Move, inklusive den installerade Schwung-versionens projektbyten, återstår.
