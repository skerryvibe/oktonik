# Beta.11: Bass Gesture v2 och ARP-diagnostik

Installera `chord-pilot-module-v0.0.4-beta.11.tar.gz` via Schwung Manager.
Ladda om modulen så att både JS och DSP använder beta.11. Projekt/settings
använder samma schema och filnamn som tidigare.

## Bass Gesture

Aktivera BASS och B.GST på PARTS. I C major:

1. Tryck C, håll kvar, tryck Em: C/E.
2. Släpp C: fortfarande C/E, inga nya anslag.
3. Tryck C igen medan Em hålls: bas C, ackordet återanslås inte.
4. Släpp Em: ingen musikalisk ändring.
5. Släpp C: gestens ackord och bas avslutas, även om SUST är HOLD.
6. Tryck Em: nu börjar ett nytt, vanligt Em-ackord.

Endast senaste trycket väljer baston. Släpp återställer aldrig föregående bas.
STOP, projektbyte och avstängd B.GST rensar gestens ägande.

## ARP: testa output före klocka

Hårdvaruorsaken är ännu inte fastställd; detta är en diagnostisk release.

1. Öppna A.MIDI. Välj A.OUT och A.CH till ett instrument som du vet tar emot
   noter. Du kan tillfälligt använda samma utgång/kanal som fungerande ackorddelen.
2. Med transport stoppad, vrid ratt 4 TEST medurs. Den skickar C4 med velocity 100
   och automatisk note-off efter 350ms. Ingen ARP ON eller ackordpad krävs.
3. Notera om tonen hörs samt TX, FAIL och SENT. SENT ska öka när värden accepterar
   note-on. TX ska visa C4. FAIL räknar avvisade försök, inklusive återförsök.
4. Aktivera ARP, tryck Move Play och håll ett ackord. Öppna A.MIDI och vrid
   ratt 8 DIAG. Läs ARP, PLAY, CLOCK, CHORD, STEP, GEN och SENT.
5. Ratt 8 BACK återgår till routing/test. STOP ska kunna tysta både test och ARP.

## Tolkning

| Observation | Vad den visar |
| --- | --- |
| `--`/WAIT överallt | Ingen läsbar DSP-diagnostik; kontrollera att modulen laddats om med beta.11. |
| PLAY NO | Värden rapporterar stoppad transport. |
| PLAY N/A | Värden saknar tillgänglig transportstatus. |
| CLOCK NO | Ingen observerad förändring i beat-position senaste 0,5 sekunden; detta är inte bara ett API-existenstest. |
| CHORD 0 n | DSP har inget ackord att arpeggiera. |
| DSP-räknaren står still | Render-callbacks eller återläsningen går inte framåt. |
| CLOCK YES, CHORD >0, GEN står still | Motor/gate/fas behöver undersökas; rapportera RATE/GATE också. |
| GEN ökar, SENT står still | Noter genereras men note-on accepteras inte; kontrollera FAIL/route. |
| SENT ökar men tyst | Värden accepterar paket; mottagande instrument/kanal eller värdens leveransväg återstår att kontrollera. |

SENT bevisar inte att instrumentet hörs. Vid BOTH kan ett anslag ge två
accepterade paket. GEN/SENT/FAIL inkluderar C4-testet och räknas från DSP-start.
Fotens TX-destination/kanal avser det senaste accepterade paketet, inte en gissning.
STEP är sekvensens anslagsräknare och återställs vid nytt ackord/transportstopp.

Rapportera: Schwung-version, A.OUT/A.CH, om C4-testet hörs, ARP-inställningarna,
värdena på båda A.MIDI-vyerna (gärna före/efter några sekunder), och om mottagaren
är internt Move-ljud, Schwung-instrument eller extern synth. Ändra inte flera
utgångs-/klockinställningar samtidigt under jämförelsen.

Inga fler ARP-lägen eller strumfunktioner införs före fungerande hårdvarutest.
