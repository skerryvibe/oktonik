# Chord Pilot 0.0.4-beta.4

## Pads

Vänster halva, uppifrån och ned:

```text
 II     SUB    BORROW  STOP
 DOM    M/m    SUS2    SUS4
 A5     A6     A7      A8
 A1     A2     A3      A4
```

Alla 16 pads till höger spelar fortfarande melodi. STOP har flyttat till
fjärde plats i översta vänstra raden, ovanför SUS4. Den gamla STOP-positionen
är nu II. STOP släpper alla delar och stoppar loopen; sparade ackord behålls.

Håll en variationspad och slå sedan an en ackordpad. Variationspadsen ger
inga toner på egen hand. När du släpper dem ändras inte det klingande
ackordet: ändringen hörs först vid nästa ackordanslag.

## Spela ii–V–I mot valfri målpad

Välj C-dur och global EXT TRIAD för exemplen:

- På G-paden (A5): II + A5 → DOM + A5 → A5 ger Am7 → D7 → G.
- På Dm-paden (A2): II + A2 → DOM + A2 → A2 ger Em7b5 → A7 → Dm.
- SUB + G-paden ger Ab7, tritonussubstitutet för D7, som kan leda till G.
- BORROW lånar samma skalsteg från parallell naturlig moll/dur. I C-dur
  blir exempelvis F till Fm och Am till Ab.

Släpp föregående variationspad mellan stegen. Om II, DOM och SUB överlappar
vinner den senast nedtryckta som fortfarande hålls. BORROW görs först, sedan
II/DOM/SUB, och sist M/m eller SUS. Målackordet är alltid padens sparade
ackord, inte den variant som råkar klinga.

För pentatoniska skalor behåller BORROW skalstegets diatoniska betydelse.
För en manuellt vald kromatisk grundton utanför skalan behålls grundtonen
och dur/moll byts när det är möjligt.

Melodiläget CHORD följer det spelade ackordet. SCALE följer dess främmande
ackordtoner när ADAPT är ON; övriga skaltoner behålls så långt det går.
CHROM förblir kromatiskt. II och SUB spelar sjundeackord oavsett global EXT.

## Redigera ett ackord

Shift + ackordpad öppnar EDIT för just den paden. Rubriken visar padnumret.

| Ratt | EDIT 1/2 | EDIT 2/2 |
| --- | --- | --- |
| 1 | ROOT — grundton | KEEP — spara spelad variant |
| 2 | TYPE — ackordtyp | RESET — återställ denna pad |
| 3 | EXT — extension | — |
| 4 | INV — inversion | — |
| 5 | SPRD — spridning | BACK — tillbaka |
| 6 | — | — |
| 7 | — | — |
| 8 | MORE — sida 2 | DONE — lämna EDIT |

Huvudratten eller Menu växlar mellan EDIT-sidorna utan att lämna valt ackord.
DONE eller Shift + samma pad avslutar redigeringen.

TYPE erbjuder AUTO, MAJ, MIN, DIM, AUG, SUS2 och SUS4. EXT har AUTO, TRIAD,
6, ADD9, 7, MAJ7, 9, MAJ9, 11, MAJ11, 13 och MAJ13. DIM7 finns för DIM.
7 betyder liten septima; MAJ7 betyder stor septima. MAJ + 7 ger exempelvis
C7, medan MIN + MAJ7 ger Cm(maj7). Extensionerna är bokstavliga, även om
de tillför toner utanför den valda skalan.

AUTO använder padens underliggande skala/ackord. Efter KEEP används den
sparade formen som utgångspunkt i stället. Äldre individuella extensioner
behålls tills du själv ändrar EXT eller återställer paden.

INV AUTO tillåter automatisk stämföring när LEAD är på. Väljer du ROOT eller
en numrerad inversion behålls den; ingen separat LOCK-ruta behövs.

KEEP sparar den spelade varianten som ett vanligt eget ackord. Formen
transponeras med KEY men byggs inte om när SCALE ändras. RESET tar bort
alla individuella val för just den paden, utan att påverka övriga pads.

## Uppgradering och test

PAD8/Color finns inte längre som global inställning. A8 är en vanlig
redigerbar pad. Ett tidigare sparat Color-ackord migreras till ett eget
ackord på A8 för att behålla klangen. RESET på A8 ger åter skalans ackord.

Inställningar sparas i `pilot-state-v5.json`. Äldre filer läses vid behov
och lämnas kvar. Ta gärna backup före uppgradering: hur filer behålls vid
webbinstallation beror på versionen av Schwung Manager.

Installera `chord-pilot-module-v0.0.4-beta.4.tar.gz` via den vanliga
modulinstallationen på `move.local:7700`. Välj inte source-arkivet.

Testa först STOP på den nya platsen. Prova sedan exemplen ovan, ett eget
ROOT/TYPE/EXT-ackord och båda melodilägena med sustain och bas. Kontrollera
att sparade val överlever att modulen öppnas igen. Automatiska tester och
displayförhandsvisning är gjorda lokalt; ljud och ergonomi behöver provas
på din Move.
