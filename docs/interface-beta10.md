# Chord Pilot 0.0.4-beta.10 – basgest och ARP

Installera `chord-pilot-module-v0.0.4-beta.10.tar.gz` via Schwungs sida.
Ta gärna en säkerhetskopia av viktiga projekt före speltestet. Befintliga projekt
och inställningar bevaras; B.GST och ARP börjar OFF.

## Testa basgesten

1. På PARTS: slå på BASS (ratt 5) och B.GST (ratt 3).
2. I C major: håll F-paden. Tryck Em medan F hålls: displayen visar F/E.
3. Släpp Em: ursprungsbasen återkommer. Ackordet och melodiharmonin ska inte bytas.
4. Upprepa, men släpp F först: Em blir nu ett vanligt ackord.
5. Håll C och välj Bdim, Am, G som tillfälliga basval. Basen väljer närmaste oktav.
6. Shift + Step sparar aktuell kombination; EDIT är oförändrat.

Flera extra pads använder sista-nedtryckta-prioritet. B.GST OFF återställer
vanlig överlappande ackordspelning. SUST styr hur sista ackordet släpps.
Basvalen följer aktuella padgrundtoner, inklusive modifierare och IDEAS.

## Testa ARP

1. Bläddra till ARP (efter THEORY), aktivera ratt 1.
2. På A.MIDI: välj utgång och mottagarens kanal. Standard är MOVE, kanal 2.
3. Tryck Moves Play och håll ett ackord. ARP kör parallellt med ackorddelen.
4. Prova RATE, DIR, RANGE, GATE, SWING, VEL och HOLD.
5. Prova BORROW, DOM och sparade steps. ARP ska följa ackordets faktiska toner.
6. Prova basgesten: F/E ska fortfarande ge F–A–C i ARP, med E endast i basen.
7. STOP ska tysta allt. ARP kan starta igen vid nytt ackord om transporten går.

Första versionen kräver att Move-transporten kör. Det finns ingen friklocka.
Ett spelande loopmönster prioriteras framför liveackord; tomma steg är pauser även
med ARP HOLD. ARP har egen gate och påverkas inte av ackorddelens strum.
Nya ackordtoner börjar om ARP-sekvensen på aktuell klockposition.
Använd separata MIDI-kanaler för separata instrument; samma kanal ger delade toner
och ARP återanslår dem. Kanalens faktiska instrumentdestination bestäms av värden.

## Verifiering

Automatiska tester täcker padgest, sparade basnoter, fysiska knappar/rattar,
projektåterläsning, ARP-riktningar, oktavgränser, swing, gate, klockhopp,
transportstopp, routing, misslyckade MIDI-släpp, delade toner och STOP.
DSP-testsviten körs även med AddressSanitizer/UndefinedBehaviorSanitizer.
Fysisk Move och musikalisk känsla behöver fortfarande verifieras av speltest.

Utökad strum, gitarrvoicings och fler modifieringssidor ingår inte i beta.10.
