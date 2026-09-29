# Chord Pilot 0.0.4-beta.5

## EDIT på en sida

Shift + en ackordpad öppnar dess editor. Nu ligger allt på samma sida:

```text
ROOT   TYPE   EXT    INV
SPRD   KEEP   RESET  —
```

MORE, BACK och DONE är borttagna. Huvudratten och Menu stannar kvar på
EDIT-sidan, eftersom det inte finns fler sidor att bläddra till just nu.
Shift + samma ackordpad avslutar EDIT. Shift + en annan väljer den paden.
Knob 8 är tom och gör ingenting.

## Lås BORROW

Tryck Shift + BORROW och släpp båda. BORROW lyser blått och ett inverterat
B syns i displayens överkant, även på andra sidor och i EDIT. Tryck samma
kombination igen för att låsa upp. Vanlig BORROW utan Shift fungerar
fortfarande momentant när låset är av; ett vanligt tryck låser inte upp.

Med låset på utgår II, DOM och SUB från de lånade ackorden. Exempel med
C-dur och global EXT TRIAD, på F-paden (A4):

1. Lås BORROW.
2. Håll II och spela A4: Gm7b5.
3. Släpp II, håll DOM och spela A4: C7.
4. Släpp DOM och spela A4: Fm.
5. Lås upp BORROW och spela A4: F.

Låsning och upplåsning ändrar inte redan klingande toner. Grundinställningarna
KEY/SCALE och de sparade ackorden är också oförändrade. Nästa ackordanslag
använder det nya läget. Melodiläget CHORD följer ackordet; SCALE behöver
ADAPT ON för att anpassas, precis som tidigare.

Låset ligger kvar genom STOP, sidbyte, routingbyte och tillfällig parkering.
Det sparas inte mellan omstarter. KEEP släpper låset när den spelade
varianten sparas som ett eget ackord, så att varianten inte lånas om vid
nästa anslag. Sparade progressioner spelas oförändrade.

## Installation och provspelning

Välj `chord-pilot-module-v0.0.4-beta.5.tar.gz` på `move.local:7700`.
Äldre paket finns kvar för återgång. Inställningsformatet är fortfarande v5;
ta som vanligt backup av egna inställningar före webbinstallation.

Prova framför allt låsning/upplåsning med sustain, bas och melodi, och att
Shift + pad lämnar EDIT. Lokala automatiska tester och displayförhandsvisning
ersätter inte provspelning på Move.
