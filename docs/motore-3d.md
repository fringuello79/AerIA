<!-- AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati. -->
# Motore 3D: misure e alternative (8 novembre 2026, versione 0.19.0)

Domanda di Ale: le carte 3D di app come Strava sono molto più fluide; ce ne sono di migliori da usare?

## Che cosa usano quelle app

Strava usa le carte di Mapbox (Mapbox GL): carte a **tessere vettoriali** disegnate dalla scheda grafica, con il terreno
3D ricavato da tessere di quote. L'equivalente libero è **MapLibre GL JS** (licenza BSD, nato dalla versione aperta di
Mapbox GL): terreno 3D da tessere di quote (raster-dem), rilievo ombreggiato, tessere anche senza rete in un solo file
(PMTiles), e livelli personalizzati con three.js per gli oggetti 3D.

La fluidità di quei motori viene da quattro cose: tessere a livelli di dettaglio, poche chiamate di disegno (molti
oggetti in una sola maglia), lavoro pesante fuori dal filo principale (worker), cache delle tessere.

## Che cosa ha fatto la 0.19.0 con lo stesso approccio

Misure in Chrome senza scheda grafica (SwiftShader, 1280 × 800, vista iniziale sull'Italia centrale). I tempi assoluti
non valgono per il tablet; contano i rapporti.

| | 0.18.4 | 0.19.0 |
| --- | --- | --- |
| Terreno | griglia d'insieme da 1,2 km + un riquadro fine attorno alla vista, rifatto intero (circa 48.000 vertici) a carta ferma | tessere a livelli: fini vicino, grandi lontano; 1–2 ms a tessera, poche per fotogramma, anche in movimento |
| Bordo tra dettaglio e resto | netto, fermo finché la carta non si ferma | nessuno |
| Chiamate di disegno per fotogramma | circa 555–635 | circa 100–230 |
| Di cui spazi aerei | 627 oggetti | 8 |
| Triangoli | circa 240.000 | circa 320.000–410.000 (più dettaglio lontano) |

Sul tablet il collo di bottiglia di WebGL sono soprattutto le chiamate di disegno (lavoro del processore) e i pixel
(risoluzione): i triangoli in più pesano poco su una scheda grafica vera. La qualità automatica continua ad abbassare
risoluzione e dettaglio se la carta non scorre.

## Passare a MapLibre?

**Vantaggi**: motore maturo e ottimizzato da anni, etichette senza sovrapposizioni, zoom e rotazione molto fluidi,
carte vettoriali nitide a ogni zoom, tessere senza rete.

**Costi e rischi**:
- Gli spazi aerei come volumi con base e tetto in quota (AMSL, AGL, FL) non sono oggetti nativi: vanno disegnati con un
  livello three.js dentro MapLibre, cioè si rifà la parte più delicata.
- Da rifare e riprovare anche: rotta sopra il terreno disegnato, nodi trascinabili, profilo collegato, colori del
  terreno rispetto alla quota (pericolo), aereo e scia, colonna d'aria, radar.
- Servono le tessere: quote in formato Terrarium dal Copernicus (strumento nuovo) e base cartografica vettoriale in
  PMTiles. Dimensione dell'APK da misurare.
- Le regole di sicurezza non cambiano (sono in moduli separati), ma ogni prova visiva va rifatta.

**Proposta**: prima provare la 0.19.0 sul tablet. Se la carta non è ancora fluida, fare un **prototipo MapLibre
separato** (stessa area, terreno, spazi aerei e rotta) e confrontarlo con questo sullo stesso tablet, con le stesse
misure (fotogrammi al secondo mentre si ruota e si sposta, tempo di apertura, memoria). Si decide sui numeri.
