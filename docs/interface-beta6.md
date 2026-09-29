# Chord Pilot 0.0.4-beta.6

## Prova IDEAS

1. Spela ett ackord som utgångspunkt.
2. Vrid huvudratten till IDEAS, direkt efter HARMONY.
3. Vrid ratt 1 till ON. De åtta ackordpadsen blir en tillfällig förslagsbank.
4. Displayen visar fyra ackord ovanför fyra, i samma ordning som padsen:

   ```text
   A5 A6 A7 A8
   A1 A2 A3 A4
   ```

5. Spela på de vanliga ackordpadsen och jämför alternativen. Högerhandens
   16 melodipads fungerar som tidigare. Det spelade förslaget markeras;
   rubriken visar ackordet och nederkanten en kort förklaring.
6. Vrid ratt 3, NEW, när du vill gå vidare från det senast spelade ackordet.
7. Shift + Step sparar förslaget i progressionen. Capture fungerar också.

Ratt 2, COLOR, väljer IN (åtta förslag inom skalan), MIX (fyra inom/fyra utanför)
eller OUT (två inom/sex utanför). Vita förslag ligger inom skalan, gula utanför
och klingande pads lyser grönt. Med BORROW låst räknas parallelltonarten som
utgångspunkt. Rör en ratt för att se dess funktion i displayens nederkant.

Förslagen flyttar sig inte medan du provspelar. NEW utgår från det senast
spelade ackordet; COLOR uppdaterar alternativen från samma tidigare utgångspunkt.
Med exakt samma underlag ger NEW samma resultat, inte slumpmässig blandning.
Långa ackordnamn kortas i rutorna; rubriken visar mer när ackordet spelas.

Vrid ratt 1 till OFF eller lämna IDEAS-sidan för att återgå till ordinarie pads.
Dina sparade ackord ändras inte, och toner som hålls fortsätter tills de släpps,
ett nytt sustain-ackord spelas eller STOP används. NEW/COLOR ändrar inte heller
klingande toner. För att redigera ordinarie pads med Shift + pad: stäng först
av IDEAS. I denna version sparas förslag till steg, inte direkt över ackordpads.

II/DOM/SUB utgår från det visade förslaget. BORROW-låset räknas bara en gång.
Om låset ändras i IDEAS uppdateras banken uttryckligen, utan att klingande
ackord påverkas. Det är NEXT-läget som finns nu; TO och ALT kommer senare om
vi går vidare med dem.

## Renare standardläge

En helt ny installation börjar med SPRD CLOSE, LEAD OFF och åtta tomma steg.
Det följer inte med någon demonstration eller sparad progression i paketet.
Automatisk import från Chord Finder är borttagen.

En uppgradering behåller däremot dina sparade Chord Pilot-inställningar och
steg. Om de två tidigare stegen finns kvar är de sparade data; Delete + respektive
Step tar bort dem. Ställ själv SPRD till CLOSE och LEAD till OFF om du vill
ändra dessa värden i en redan sparad uppsättning.

Global INV har tagits bort från HARMONY. Välj inversion i EDIT eller aktivera
LEAD för automatisk stämföring. Äldre sparad global voicing behålls internt för
kompatibilitet; en explicit lokal inversion har företräde.

REHIT är borttaget från MELODY. Nya melodianslag triggar alltid om gemensamma
toner; automatisk flytt av en hållen meloditon ger inte ett extra anslag.

## Bas: ROOT eller LOW

PARTS > B.NTE (ratt 8):

- ROOT: basen spelar grundtonen, även när ackordet inverteras eller LEAD är på.
- LOW: basen följer ackordets faktiskt lägsta stämma, efter inversion/LEAD.

B.OCT bestämmer fortfarande basens eget register. LOW tar den lägsta spelade
ackordtonen och flyttar den med skillnaden mellan B.OCT och C.OCT. En ändring
av ackordets oktavläge flyttar alltså inte i sig basens oktavläge.

EDIT > B.NTE (ratt 8) väljer AUTO, ROOT eller LOW för ett enskilt ackord.
AUTO följer PARTS-inställningen. Ett inverterat C/E kan därmed ha C i basen
med ROOT eller E med LOW. PARTS > BASS måste vara ON för att basdelen ska höras.
Individuella val följer med när ackord sparas i progressionen.

EDIT ryms fortfarande på en sida:

```text
ROOT   TYPE   EXT    INV
SPRD   KEEP   RESET  B.NTE
```

## Installation

Välj `chord-pilot-module-v0.0.4-beta.6.tar.gz` på `move.local:7700`.
Inställningar skrivs till v6; äldre Chord Pilot-filer läses vid behov och
lämnas kvar. Ta backup före webbinstallation om du vill skydda egna presets
mot hur din version av Schwung Manager hanterar uppgraderingar.

Paketet och beteenden är testade lokalt, men MIDI-ljud, ergonomi och långa
sustainförlopp behöver fortfarande provspelas på Move.
