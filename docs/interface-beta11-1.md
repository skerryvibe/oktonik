# Beta.11.1 – rättning av ARP-klockvillkoret

Installera `chord-pilot-module-v0.0.4-beta.11.1.tar.gz` och ladda om modulen.
Settings, projektformat och Bass Gesture v2 är oförändrade.

Din rapport från beta.11: C4 hörs, TX visar C4, SENT ökar; under ARP är
PLAY N/A, CLOCK YES, CHORD 4 n, STEP 0 och GEN/SENT står stilla.
Koden krävde uttrycklig RUNNING-status trots observerad beat-rörelse.
Regressionstestet återskapade samma tystnad före rättningen.

ARP använder nu färsk, observerad beat-rörelse när status saknas/är otillgänglig.
Uttrycklig STOPPED-status gäller fortfarande. Ogiltig beat-position stoppar
direkt; en fryst fallback-position släpper noten inom 500ms. Ingen friklocka införs.

## Test på Move

1. Behåll A.OUT/A.CH som gav hörbart C4. Slå på ARP, starta Play och håll ett ackord.
2. På A.MIDI > DIAG ska STEP/GEN/SENT nu ändras och arpeggiot höras.
   PLAY kan fortfarande visa N/A eftersom det är värdens råa status.
3. Stoppa transporten: ARP ska tystna. Starta igen och prova ett nytt ackord.
4. Testa STOP-paden: ingen ARP ska återkomma utan ett nytt ackord.

Rapportera om arpeggiot hörs och om transportstopp tystar det korrekt.
De tidigare [diagnostikinstruktionerna](interface-beta11.md) gäller i övrigt.

För nytt huvudackord med B.GST: släpp alla gesture-pads före nästa ackordtryck.
Överlapp räknas avsiktligt som ett nytt basval inom den pågående gesten.
