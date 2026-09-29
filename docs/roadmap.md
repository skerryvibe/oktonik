# OKTONIK – fortsatt plan

## Aktuell prioritet: Public 0.1.0

- Namn: OKTONIK. Slogan: Harmonic performance instrument.
- En kodbas, två byggprofiler: Public och Lab. Beta.26-arkiven bevaras som referens.
- Public: PLAY, CHORD, MELODY, BASS, MIDI. IDEAS finns endast i Lab.
- Enkel STRUM på CHORD ratt 7. ARP, SEQ, recording, steps, Undo och Capture spärrade.
- Lab behåller experimenten. Public bevarar dess inställningar och inspelade data.
- rc.2 har separata ID:n oktonik och oktonik-lab, egna sparfiler och läser in
  giltiga schema-7 Chord Pilot-data när egna projektdata saknas. Original bevaras.
- 211 JS-tester och 45 DSP-testgrupper passerar; sanitizer kontrollerad.
- Före släpp: fysiskt Move-test av sustain/STOP, Bass Gesture, modifier-preview,
  IDEAS, routing, projektbyte och växling Public/Lab. Namntillgänglighet ska granskas.
- Inga fler funktioner i Public före stabilisering. Melodiinspelning, Capture,
  clips, vidare ARP/strum, ensemble och framtida M4L/Push ligger kvar i Lab-roadmap.

Äldre etapper nedan är historik; deras nästa-steg-prioriteringar är ersatta av
Public-stabiliseringen ovan.

## Beta.26 – QNT 0–100% och flera events per step

- Portabel timeline.mjs kompilerar sparad originaltiming till DSP-ticks.
- QNT på SEQ ratt 6; reversibel efter inspelning och projektsparning. Äldre
  gridsteps använder fortsatt sin tidigare längd/GATE, utan syntetisk originaltiming.
- Upp till åtta anslag per originalcell, 128 per del. EVENT i håll-step-editorn
  väljer enskilt anslag. Full kvantisering kan sammanföra anslag; originalen bevaras.
- Uppspelning söker tidslinjen varje audioblock; inga extra anslag vid missade
  händelser eller transporthopp. Ackord/bas separata, ARP följer aktuellt event.
- Rå timing lagras i RATE-cellenheter; RATE ändrar cellernas längd som tidigare.
- Undo omfattar nya events. Optional performance/more-data i schema 7; äldre
  betaversioner kan inte bevara dessa fält vid nedgradering.
- Nästa: melodiinspelning, riktig Capture och därefter clipvy. Dessa är inte
  implementerade i beta.26. Fysiskt speltest av nya timingmotorn återstår.

## Beta.25 – sidbundna steps och Undo

- BASS visar bassteg, CHORDS ackordsteg; båda har håll-step-editor. SEQ PART finns kvar.
- MELODY visar inga ackordsteg och tillåter ingen stegändring innan melodilagret finns.
- Alla step-auditions spärras under Record. Tidigare kunde andra sidor än SEQ
  trigga ackord under bass-only Record. Användaren bekräftade att det rapporterade
  padproblemet var R.PRT ej ändrat till BASS; bas-only fungerar på hårdvaran.
- Undo (MoveUndo CC56) återställer senaste tagningen och överskrivna events.
  Ett nivåsteg, endast aktuellt projekt/session; manuella stegredigeringar ogiltigförklarar historiken.

## Nästa inspelningsgrund: timing → melodi → Capture → clips

1. Spara ursprungliga on/off-beats i en gemensam, begränsad eventlista, inte bara
   ett kvantiserat event per cell. Flera anslag i samma steg måste kunna bevaras.
2. QNT 0–100%: `tid + q * (närmaste gridtid - tid)`. 0% bevarar framförandet,
   70% flyttar 70% mot grid, 100% helt till grid. Originaltiming sparas för
   reversibel ändring. Testa loopgräns, releaseordning och korta noter utan stuck notes.
3. Melodiinspelning med originalpitch och separat armering på samma tidsmodell.
4. Riktig Capture: tidsstämplad rullande historik som går att spara utan armerad Record.
5. Clipvy via Menu/Track med oberoende val av ackord-, bas- och melodiclips.

Dessa steg är kvar i planen, inte levererade i beta.25. Ingen lovad tidsfrist;
timinggrunden behövs för att Capture inte ska förlora det användaren spelade.

## Beta.24 – spela in en del över en annan

- SEQ R.PRT (ratt 8): BOTH / CHORD / BASS; LEN finns i håll-step-editorn.
- CHORD bevarar bas-events och låter bas-CLIP spela utan live automatbas.
- BASS låter ackordsekvens och dess ARP/melodiharmoni fortsätta; vänsterpads
  väljer enbart basgrundtoner, utan att trigga ackord eller välja toner vid släpp.
- DSP använder separat inspelningsmask för ackord och bas, med bibehållen fas
  och note ownership i den oarmerade delen. Standard BOTH för äldre projekt.
- R.PRT-byte avslutar aktuell tagning och avarmerar. Valet sparas; armering gör det inte.
- FOLLOW-bas är fortfarande härledd; CLIP behövs för en oberoende sparad basgång.
- Nästa etapp: melodiinspelning med originalpitch och separat inspelningsval,
  därefter fler clips/clipvy och retrospektiv Capture. Hårdvarutest återstår.

## Beta.23 – separata bas-events och tillfällig step-editor

- Bass Gesture spelas in som absolut tonhöjd, längd och velocity i eget 16-stegslager.
- Ackord och bas spelar upp med oberoende onset/längd och befintliga separata MIDI-routes.
- Äldre projekt behåller FOLLOW; nya basinspelningar aktiverar CLIP. Schema 7 bevaras,
  med optional bassProgression och bassPlayback; gamla snapshots ändras inte.
- SEQ PART väljer steplager. Håll sparad step: temporär editor. Ackord: ROOT/EXT/LEN/VEL;
  bas: NOTE/LEN/VEL. Delete påverkar endast vald del. Fysisk Capture finns kvar.
- Inspelning armerar fortfarande ackord + aktiverad bas samtidigt. PART väljer bara redigering.
- Nästa: separat record-arm/overdub så bas kan ersättas utan att ackord skrivs om;
  därefter melodi med originalpitch, separata clipval via Menu/Track och retrospektiv Capture.
- Ett lager per del nu; inte flera clips ännu. Hårdvarutest av beta.23 återstår.

## Beta.22 – ackordlängder och Record

- Genomfört: host-beat-tidsstämplad ackordinspelning, armering med MoveRec/SEQ REC,
  velocity, och explicit längd 1–16 steg. Kvantisering följer RATE i denna version.
- SEQ LEN redigerar valt steps längd. Sparade äldre steps behåller global GATE.
- En portabel recorder håller musikalisk tagning, adaptern hämtar DSP-klockan.
- Tagning skrivs vid släpp/nästa ackord/stopp; ersätter bara täckt tidsintervall.
- Basgestens selectors blir inte egna händelser; melodin spelas inte in ännu.
- Ny optional timing-metadata i befintliga steps, inga gamla noter omberäknas.
- Nästa: separat kvantisering/finare beatupplösning och melodiinspelning med
  originalpitch bevarad, därefter clipvy och riktig retrospektiv Capture.
- Fysisk Move-verifiering av Record och nya längder återstår.

## Ny sequencer-etapp – beta.21 och fortsatt ordning

Användaren har återprioriterat SEQ. Detta ersätter tidigare paus för SEQ nedan.
Beta.21 genomför första delen: alltid 16 tidssteg, även i ett tomt klipp,
RATE som steglängd, och håll ackord + tryck step för placering på SEQ-sidan.
Gamla snapshots behålls; efter sista ackordet blir det nu pauser till steg 16.
En tom sekvens tar inte över live-ARP eller klipper hållna liveackord per steg.

Återstår i rekommenderad ordning:
1. Ackordhändelser med separat start/längd/velocity, övergång från enkla
   snapshot-celler utan förlust av sparade ackord. Kvantisering skild från RATE.
2. Record-knapp och tidsstämplad liveinspelning av ackord. Verifiera fysisk
   Record-mappning mot Schwung; använd DSP/host-beat, inte UI-polltid som klocka.
3. Separat melodiinspelning: originaltoner bevaras; FIXED/FOLLOW är återspelning.
4. Clipvy med ackord/melodi först och verifierade meny-/trackknappar.
5. Riktig retrospektiv Capture från en avgränsad spelbuffert. Befintlig
   autofyllnadsfunktion behålls tills den kan ersättas tydligt.

Framtida clipmodell: separata typade eventlistor för chord och melody på en
gemensam beat-tidslinje. Ackordevent behåller musikalisk avsikt och valfri fryst
voicing, melodievent behåller originalpitch samt eventuell relativ tonroll.
Aktivt clip/längd/loopgränser skiljs från transient Record/transport-state.
Detta är en designriktning; ingen tom parallell clipmotor eller nytt schema
har införts i beta.21. Bas/ARP fortsätter följa ackord, inga egna clips ännu.

## Korrigeringar i beta.20 – aktuell funktion

- SAFE begränsar genererade alternativ till enklare treklanger/septimackord;
  COLOR upp till nona/fem toner, WILD behåller större extensionspalett.
- TO fångar spelat ackord vid aktivering eller inträde i TO; NEW byter mål till
  senast spelat ackord. Ingen TGT-ratt. STYLE/BORROW-kontext ändrar inte fångat mål.
  Detta ersätter beta.19:s målpadsväljare. Äldre sparat målpadfält ignoreras.
- SEQ använder samma host-clock-validering som ARP: observerad beat-rörelse
  accepteras när transportstatus saknas. Fryst fallback-klocka släpper efter
  500 ms; uttryckligt STOP och ogiltiga beats stoppar direkt.
- SEQ RUN armerar fortfarande uppspelningen; Move Play behövs. Ingen fri
  SEQ-klocka har införts. Hårdvaruverifiering av rättningen återstår.
- 172 JS-tester och 36 DSP-grupper, inklusive fallback-klocka med/utan callback.

## Genomfört i beta.19 – IDEAS TO

- MODE NEXT/TO, TGT väljer ordinarie pad 1–8 med edits och BORROW-lås.
- Dur/moll: pad 1 II, pad 2 V, pad 3 mål; COLOR/WILD har SUB på pad 4.
- Övriga platser rankas som kopplingar från källackord mot valt mål.
- Andra ackordtyper får mål på pad 1 och utforskande alternativ utan påstådd ii–V-kadens.
- SAFE tillåter de explicita II/V-vägarna utanför skalan, men filtrerar övriga förslag.
- Portabel generator; inga nya MIDI-/klockvägar. Val ändrar inte klingande noter.
- Mode/mål sparas med bakåtkompatibla defaults utan ändrad schemaversion.
- Nästa steg: provspela TO, därefter LEAD/Smart Bass enligt ordningen nedan.
  Äldre formuleringar nedan om TO som nästa funktion är nu genomförda.

## Aktuell roadmap – 2026-09-24, beta.18

Detta avsnitt ersätter tidigare formuleringar om nästa steg längre ned.
Versionsavsnitten nedan är historik, inte en aktuell att-göra-lista.
Produktprincip: ett spelbart real-time harmonic performance instrument,
inte en menybaserad kompositionsapp. Inspiration från Nopia, Orchid och
Scaler är användarens designreferenser, inte påståenden om deras implementation.

### Finns redan – ska förfinas, inte byggas igen

- CHORD/BASS/MELODY/ARP har separata MIDI-rutter och kanaler.
- LEAD ger automatisk stämföring; SPRD styr voicingens bredd separat.
- Bass Gesture och explicit bas per ackord ger slash-ackord.
- IDEAS NEXT med STYLE SAFE/COLOR/WILD, modifierare och gemensam ackordresolver.
- STRUM har tonavstånd, riktning och timing-/velocityvariation.
- ARP har SYNC/FREE, HOLD och rytmiskt CHORD-läge.
- Chord Map, BORROW-lås, adaptiv melodi och projektspecifik lagring.

### Rekommenderad arbetsordning

1. **Genomfört i beta.18: UI-underhåll.** Parameter och värde får företräde
   vid rattändring; CC64-varning finns kvar på MIDI-sidan i viloläge.
   Regressionstest täcker delsidor, EDIT, MIDI och den renderade fotraden.
   Ingen ändring av själva CC64-/notägandet.
2. **IDEAS:** första NEXT-förfiningen genomförd i beta.18. STYLE
   SAFE/COLOR/WILD väger gemensamma toner, harmonisk rörelse och upplösning
   olika, utöver befintliga skaltonskvoter. Avsiktliga approach-mål prioriteras
   i alla lägen. Förslagen är deterministiska och stabila under provspelning.
   Nästa kontroll är musikalisk lyssning; nästa funktion är TO mot ett valt
   målackord. Interna IN/MIX/OUT-ID:n och frysta progressioner bevaras.
3. **Stämföring och Smart Bass:** provlyssna på befintlig LEAD och förbättra
   registerkontroll, gemensamma toner och stämmornas rörelser. Håll rörelse
   (LEAD) åtskild från bredd (SPRD), undvik överlappande CLOSE/OPEN-val.
   Utforska snabbt val av ackordets grundton, ters och kvint som bas,
   utan att ersätta Bass Gesture eller tvinga ackorddelen till samma inversion.
4. **Harmoniska performance-patterns:** separat avgränsad prototyp efter
   IDEAS/stämföring. Börja med några piano-/kompfigurer, därefter inspelning
   av egna figurer från melodiytan. Ingen SEQ-ombyggnad i denna etapp.

### Patterns – ny framtida funktion, inte vanlig strum

STRUM sprider ett anslag i tiden; PATTERN beskriver en återkommande fras med
rytm, pauser, längder, velocity och eventuell flerstämmighet. Exempel är
brutna pianoackord, växlande bas/ackord och synkoperat komp.

Mål: spela in en kort figur på melodipads, återanvänd den över nya ackord.
Spara inte bara absoluta MIDI-toner eller fysiska padnummer. En portabel
frasmodell behöver relativa beat-positioner, duration, velocity, oktav och
musikalisk tonroll (ackordton eller skalsteg med eventuell kromatisk färgning).
Skilj en rytmfigur från framtida analys som föreslår ackord till en melodi.

Designbeslut före implementation:
- ACKORD-följande respektive SKALA-följande återspelning; hur extra toner och
  saknad sjua/nona mappas när ackordets tonantal ändras.
- Inspelningslängd, kvantisering/groove och ersättning kontra overdub.
- Ackordbyte: fortsätt frasfas eller starta om; hur hållna toner avslutas.
- HOLD/STOP, tempo och notägande; återanvänd befintlig klocka/schemaläggning.
- Egen musikalisk del eller utökning av ARP, samt routing och lagring.
  Ingen ny separat timer eller MIDI-del beslutas innan detta är utprovat.

### Senare idébank – ingen utfäst version eller leveransordning

- **Melodi till ackordförslag:** fånga en kort spelad fras och föreslå flera
  harmoniseringar utifrån tonart, rytmisk tyngd och stabila toner/passertoner.
- **IDEAS ALT:** ackordersättningar med relevant harmonisk kontext.
- **GO TO KEY:** musikalisk väg till en ny tonart via pivotackord, dominanter
  och ii–V; skiljs från TO, som först bara har ett målackord.
- **Ensemble/divisi:** fördela ackordtoner till separata MIDI-röster/instrument.
  Börja eventuellt med fast fördelning av låg–hög röst; senare registergränser,
  stabil stämidentitet och röstspecifik stämföring. Definiera hantering av
  fler/färre toner än röster, dubbleringar, kanalbudget, pedal och note-offs.
  Separat BASS ska kunna fortsätta följa Bass Gesture. Mottagande instrument
  måste kunna adresseras separat; hårdvarans möjligheter verifieras då.
- **Gitarrvoicings och strum-patterns:** riktiga sträng-/registerbegränsningar,
  dubblerade/utelämnade toner och grepp, inte enbart omordnade ackordtoner.
- ARP RESET/CONTINUE, mer musikalisk interaktion mellan delarna.
- Fler lånekällor, passerande förminskade ackord och sparade ackorduppsättningar.

### Arkitektur och avgränsning

Alla delar ska utgå från samma harmoniska tillstånd: ackord, voicing och
separat basavsikt. Bass Gesture ska inte oavsiktligt ändra ARP eller övriga
stämmor. Patterns beskriver musikaliska händelser; adapterlagret sköter Move-
input, display, MIDI-rutter och värdklocka. Kärnan separeras stegvis med tester,
inte med en stor rewrite. SEQ och bred UI-omorganisation är fortsatt pausade.
M4L/Push kommer först som ett litet separat proof-of-concept när Move är stabil.
Push Standalone-kompatibilitet är ännu inte fastställd.

Övriga framtidsfunktioner ovan är inte implementerade. Beta.18 avgränsas till
CC64-fotraden och första IDEAS STYLE-etappen. TO, LEAD/Smart Bass och patterns
kommer i separata steg, så varje musikalisk förändring kan provspelas på Move.

## Genomfört i beta.17 – BORROW-melodi och liten UI-förenkling

- SCALE + ADAPT ON följer hela BORROW-skalan direkt, även vid låsning.
- Hållna toner retriggas inte av modifiern; nästa melodianslag använder nya layouten.
- Spelade borrowed-ackords extra färgningar kan fortfarande anpassa skalan.
- CHORDS ratt 7 är tom; STRUM nås via vanlig sidbläddring.
- Projektformat och sparade inställningar är oförändrade.

## Genomfört i beta.16 – uttrycksfull STRUM

- STRUM-sida efter CHORDS, med genväg på CHORDS ratt 7.
- GAP, UP/DOWN/ALT/RAND, separat TIME- och VEL-variation.
- Portabel fixed-size attack-planerare i dsp/strum.h utan värdberoenden.
- Gamla projekt och snapshots får UP och noll variation.
- Sparade steps fryser parametrar; nya slumpvärden genereras per återspelning.
- Ingen ändring av ackordtoner eller bas/melodi/ARP.
- Nästa etapp: IDEAS TO. Gitarrvoicings kvarstår som separat framtida funktion.

## Genomfört i beta.15 – sustain per live-del och basanslag

- CHORDS, MELODY och BASS har egna OFF/HOLD/PEDAL-val.
- PEDAL använder CC64 med retry och notsäker nedstängning.
- Kanalägande och varning för delad pedal, även över BOTH-rutter.
- BASS VEL PAD/FIXED; nya projekt PAD, äldre behåller FIXED.
- Befintligt globalt sustainval migreras till alla tre delarna.
- Ingen SEQ-ombyggnad; automatisk sekvensbas behåller fast B.VEL.
- Fysisk kontroll av CC64 med användarens instrument återstår.
- Nästa etapp: STRUM, därefter IDEAS TO och senare melodibaserade förslag.

## Genomfört i beta.14 – sustain/basgest och rytmiska ackord

- Sista släppet avslutar gesten, men SUST HOLD behåller ackord och vald bas.
- Nästa padtryck börjar ett nytt helt ackord. ARP HOLD är fortsatt oberoende.
- DIR CHORD spelar hela källvoicingen rytmiskt med RATE/GATE/SWING/VEL.
- RANGE är inaktivt i CHORD; sparat oktavomfång behålls för övriga lägen.
- Release-order-, clock-, gate-, återanslags- och note-ownership-tester.
- Återstår att provspela kombinationerna på fysisk Move.

## Genomfört i beta.13 – delarnas sidor och fri ARP-klocka

- PLAY behåller padackord under basgest; klingande slash-bas visas i rubriken.
- CHORDS samlar harmoni, oktav och sustain. BASS ersätter PARTS.
- Alla fyra MIDI-par på MIDI. A.MIDI och användardiagnostik borttagna.
- LOOP heter SEQ. Äldre separat sekvensroute behålls som villkorlig SEQ OUT.
- A.CLOCK väljer SYNC eller FREE med egen samplebaserad 30–300 BPM-klocka.
- Regressioner och sanitizer-test körs; fysisk FREE-verifiering återstår.

## Genomfört i beta.12 – Chord Map och sidordning

- PLAY är startvy, med åtta ackord i padarnas fysiska ordning.
- Live modifier-preview och BORROW-lås utan att trigga eller ändra klingande noter.
- Samma ackordresolver för anslag, PLAY och IDEAS; gemensam grid-rendering.
- Egna padval, voicings och explicit bas syns; basgest visar ankare/bas-val.
- Berör motsvarande ratt för längre ackordnamn. EDIT återgår till föregående sida.
- ARP ligger intill PARTS; testton och diagnostik samlade bakom A.MIDI DIAG.
- Schema 7 och projektinställningar bevaras. Ingen ändring av ARP-motorn.
- Nästa kontroll: läsbarhet och spelbarhet på fysisk Move.

## Underhåll beta.11.1 – ARP-klocka

Användarens beta.11-test bekräftade fungerande C4-probe och stigande DSP/beat,
men PLAY N/A och inga ARP-anslag. Detta återskapades i regressionstest.
ARP accepterar nu observerad beat-rörelse när transportstatus saknas.
Uttryckligt stopp, ogiltiga beatvärden och fryst fallback-klocka släpper noter.
Användaren har nu bekräftat fungerande ARP efter omstart av Move.

## Historisk prioritet från beta.11

1. Beta.11: Bass Gesture v2, press-only. Separat portabel state machine,
   full åttapads release-order-täckning, note-safe avslut även med SUST HOLD.
   ARP-diagnostik och klockoberoende C4-probe. ARP fungerar efter beta.11.1 och omstart.
2. Beta.12: CHORD MAP för vanlig bank, samma grid-rendering som IDEAS och
   samma beräkning av spelbart ackord. Live modifier-preview utan MIDI-effekter.
3. Beta.13+: ARP-förfining/strum först efter bekräftad ARP-output på fysisk Move.
4. Senare: gitarrvoicings; separat liten M4L-proof-of-concept; Push-layout och
   eventuell Standalone-kompatibilitet utvärderas separat.

Ny musiklogik ska använda logiska ingångar och rena musikaliska tillstånd.
Flytta Move/Schwung-I/O till adaptrar successivt, utan stor rewrite eller
onödiga settings-schemaändringar. Se [arkitektur](architecture.md).
Avsnitten nedan beskriver tidigare releaser och tidigare planering.

## Genomfört i 0.0.4-beta.10

- Valbar B.GST på PARTS: håll första ackordet och välj tillfällig bas med fler ackordpads.
- Närmaste basoktav, sista extra pad vinner, släpp återställer basen; släpp ankaret först för nytt ackord.
- Shift + Step sparar den tillfälliga basen utan att ändra EDIT.
- Separat ARP med åtta reglage och egen A.MIDI-sida; följer Moves transport.
- UP, DOWN, UP/DN, RAND, oktavomfång, gate, swing, velocity och HOLD.
- Följer liveharmoni eller frysta loopackord; basgesten ändrar inte ARP-tonerna.
- Tester för routing, notägande, transport, tomma steg, STOP och projektbyte.
- Kräver fortfarande speltest på fysisk Move. Nästa etapp: utökad strum/gitarrvoicings.
- ARP startar om tonsekvensen vid nya ackordtoner. Valbart RESET/CONTINUE och friklocka återstår.

## Genomfört i 0.0.4-beta.9

- Egen basnot per ackord utan att ändra ackorddelens inversion eller toner.
- EDIT ratt 8: AUTO, ROOT, LOW, C–B. Shift + ratt 8: oktav för egen basnot.
- Visning som C/B, G/B eller C/E; egna basnoter sparas i projekt och frysta steps.
- Tester för C2–B1–A1, C2–E2–F2, alla 128 MIDI-noter, transposition,
  modifierare, MIDI-gränser, återläsning och fysisk Shift/knob-hantering.
- Föreslaget bassteg nedan är nu genomfört; ARP är nästa funktionsetapp.

## Genomfört i 0.0.4-beta.8

- Melodi: lila grundton, blå ackordtoner, vita övriga skaltoner, grå kromatiska toner.
- Nya projekt: MODE SCALE, M.OCT -1, ADAPT ON. Sparade projekt behåller sina val.
- Användaren har bekräftat projektspecifik sparning/återläsning på fysisk Move.

## Utvecklingsordning (bas och första ARP-versionen genomförda)

1. **Genomfört i beta.9:** egen basnot och oktav per ackord, oberoende av ackordets inversion.
   Stöd för slash-ackord som C/B, G/B och C/E; spara resultatet i steps.
   Behåll ROOT/LOW/AUTO och låt valda basnoter transponera med live-ackordet.
   Automatisk basvandring med passerande toner blir ett senare, separat val.
2. **Genomfört i beta.10:** ett separat ARP-part som följer faktiskt spelad harmoni, inklusive steps,
   BORROW och IDEAS, utan att ersätta ackordpartet. Egen MIDI-utgång/kanal.
   Första sidan: ON, RATE, DIR, RANGE, GATE, SWING, VEL, HOLD.
   Andra sidan: routing. Valbart beteende vid ackordbyte (RESET/CONTINUE) återstår.
   Move-klocka, transportstopp, projektbyte och STOP måste hanteras säkert.
3. STRUM: riktning UP/DOWN/ALT/RAND, separata mängder timing- och
   velocityvariation. Slumpad tonordning ska hålla sig till ackordets toner.
   GUITAR blir en särskild voicing-algoritm med högst sex strängstämmor och
   begränsat greppomfång, inte bara en ny sortering av befintliga toner.

Basnoter, basgest och första ARP-versionen är genomförda. Därefter strumvariation och gitarrvoicings.
STRUM-utökning och GUITAR är fortfarande designförslag, inte funktioner i beta.10.

## Genomfört i 0.0.4-beta.7

- Alla 16 step-knappar kan spara, provspela och loopa ackord.
- LOOP S.VEL styr velocity 1–127 för steg, separat från vanliga ackordpads.
- Steg fryser spelad voicing, tonalt sammanhang, basnot, strum och LEAD-val.
- Samma melodifärger i alla lägen; HOLD döljer inte längre harmonisk funktion.
- MIDI TEST borttaget; read-only STATE visar SET/GLOBL/WAIT.
- Projektsparning via Schwungs aktiva set-ID, tomma nya projekt och separata filer.
- Skydd för provisoriska projekt-ID:n och misslyckade skrivningar till tidigare projekt.
- Nästa verifiering på Move: projektbyten/parkerad modul, gammal värd, återläsning,
  steg 9–16, velocity, LED-färger och frysta voicings med olika synthar.

## Genomfört i 0.0.4-beta.6

- IDEAS / NEXT med en tillfällig åttapadsbank och padkarta i displayen.
- ON/OFF, COLOR IN/MIX/OUT och NEW; befintlig Shift + Step och Capture sparar förslag.
- Stabila förslag mellan anslag; NEW/COLOR ändrar inte klingande toner.
- BORROW-lås och befintliga modifierare, melodiföljning, bas och routing fungerar med IDEAS.
- Första start: CLOSE, LEAD OFF och tom progression; ingen automatisk Chord Finder-import.
- Global INV och REHIT borttagna ur menyerna; melodins återanslag är alltid på.
- B.NTE ROOT/LOW globalt och AUTO/ROOT/LOW per ackord, även i sparade steg.

## Förfinat i 0.0.4-beta.5

- EDIT samlat på en sida: ROOT, TYPE, EXT, INV, SPRD, KEEP, RESET och en tom ruta.
- MORE/BACK/DONE borttagna; Shift + samma pad avslutar EDIT.
- Shift + BORROW låser/låser upp, med blå pad och permanent B-markering i rubriken.
- II/DOM/SUB fungerar mot lånade ackord utan att BORROW behöver hållas nere.
- Tyst låsning/upplåsning påverkar först nästa ackordanslag, inte klingande toner.
- Låset är tillfälligt; STOP behåller det, KEEP eller stängd modul släpper det.

## Genomfört i 0.0.4-beta.4

- Två lokala EDIT-sidor med ROOT, TYPE, EXT, INV och SPRD på första sidan.
- KEEP, RESET och DONE på verktygssidan; borttagen redundant PAD-väljare.
- INV AUTO eller uttryckligen vald inversion ersätter separat LOCK-kontroll.
- Fler individuella extensioner och ackordtyper, med fortsatt global grundinställning.
- PAD8/Color borttaget och äldre färgackord migrerade till en vanlig pad.
- Övre vänstra raden II, SUB, BORROW, STOP i den önskade ordningen.
- Mollanpassad ii–V, tritonussubstitution, modal låning och melodiföljning.
- Tester för gamla inställningar, egna grundtoner, KEEP och överlappande modifierare.

## Nästa steg: lyssning och finjustering på Move

- Bekräfta padordning, modifierargrepp och läsbarhet i EDIT.
- Lyssna på ii–V–I till dur och moll, SUB och BORROW med olika extensioner.
- Kontrollera stämföring, sustain, gemensamma melodi-/ackordtoner och STOP
  med både interna och externa instrument.
- Justera namn, värdeordning och standardval utifrån speltesterna.

## Nästa funktionsetapp: förfina IDEAS och utöka med TO/ALT

NEXT är implementerat. Först provspelar vi kvaliteten och ordningen på förslagen,
displayens läsbarhet och växlingen mellan vanlig bank och IDEAS. Därefter kan
TO föreslå vägar till ett valt målackord och ALT ersättningar med hänsyn till
ackorden före/efter. Direkt sparning till en ordinarie ackordpad behöver en
tydlig separat bekräftelse; i första versionen sparas förslag till progressionen.

## Senare idébank

- Fler låneackord och valbar källa för BORROW.
- Passerande förminskade ackord och kromatiska förbindelser.
- Enklare jämförelse mellan voicings och tydligare harmonisk funktion.
- Spara/återkalla hela ackorduppsättningar och progressioner.

Detta är möjligheter, inte beslutade funktioner eller löften om leverans.
