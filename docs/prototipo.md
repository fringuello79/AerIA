<!-- AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati. -->
# Prototipo web 3D (fase 1)

Versione pubblicata (privata, visibile solo al proprietario): https://claude.ai/artifact/GXsqNDc9U6PRPsgSFTskKy

## Cosa fa
- Vista 3D di terreno e spazi aerei; esagerazione verticale e tetto di visualizzazione regolabili.
- Legge file locali: terreno Copernicus GeoTIFF (EPSG:4326) o SRTM `.hgt` (1201 o 3601 punti); spazi aerei openAIP GeoJSON o OpenAir (AC, AN, AY, AL, AH, DP, V X/D, DC, DA, DB).
- Converte i limiti in ft AMSL punto per punto: AGL sul terreno, FL con il QNH (27 ft/hPa).
- Rotta a punti toccando il terreno; profilo verticale con terreno, spazi aerei e quota pianificata.
- Assistente a regole: spazi attraversati alla quota pianificata, margine dal terreno sotto 500 ft, limite VDS basico 1000 ft (RAIT.5005 d)2), ogni giorno; 500 ft nelle zone VDS che lo prevedono) sul rilievo più alto entro 5 km (feriali e festivi automatici, incluse Pasquetta e 4 ottobre dal 2026).

## Verifiche fatte
- GeoTIFF sintetico con la struttura Copernicus (Float32, DEFLATE, predictor 3, blocchi 1024): quote ai punti di rotta 2310, 3539, 2304 ft, identiche ai valori attesi.
- GeoJSON con codici numerici openAIP: CTR e TMA riconosciuti; conflitto con la TMA rilevato alla quota pianificata.

## Verifica con dati reali (6 novembre 2026)
Dati: tessere Copernicus GLO-30 N41 E013 e N42 E013, export openAIP Italia (1558 spazi aerei).

- **Terreno**: vette massime entro 1,5 km dal punto noto: Monte Velino 2480 m (2486 m), Monte Sirente 2331 m (2348 m), Corno Grande 2878 m (2912 m). Avezzano centro 689 m, piana del Fucino 650 m.
- **Georeferenziazione**: le tessere Copernicus sono PixelIsPoint (campioni centrati sui secondi d'arco interi); il prototipo ora ne tiene conto. Quote ai punti di prova 3480, 2695, 2633 ft, identiche all'interpolazione bilineare fatta in Python con rasterio.
- **Conflitti lungo la rotta di prova a 4000 ft**: il prototipo trova LI-P247-COLLARMELE da 23,9 a 25,3 NM e terreno sopra la quota (5136 ft); un controllo indipendente in Python (shapely) dà lo stesso risultato.
- **Codici openAIP** confermati sui nomi del file italiano: 0 altro, 1 R, 2 pericolose (poligoni di tiro), 3 P, 4 CTR, 5 TMZ, 6 RMZ, 7 TMA, 8 TRA, 9 TSA, 10 FIR, 13 ATZ, 14 MATZ, 26 CTA, 28 attività sportive e lavoro aereo, 29 parchi (sorvolo limitato). Classi: 0 A, 2 C, 3 D, 6 G, 8 non classificato. Unità: 0 m, 1 ft, 6 FL; riferimenti: 0 GND, 1 MSL, 2 STD.
- **Dati sospetti nella fonte**: 21 aree protette nell'area hanno il tetto in ft AMSL sotto il terreno (per esempio SFC–1640 ft AMSL, cioè 500 m): probabilmente il limite reale è riferito al suolo. Il prototipo le segnala come «Dati da verificare» invece di nasconderle in silenzio.

## Limiti noti
- Non ancora gestiti: ostacoli artificiali, distanza di 5 km dagli aeroporti, NOTAM, AUP, orari di attività.
- Superfici AGL approssimate sui vertici del poligono (bordi densificati a 1 km).
- Codici openAIP diversi da quelli confermati sono da verificare: il codice originale è mostrato nei dettagli.

## Versione 0.2 (6 novembre 2026)
- Codice diviso in moduli (`web-prototype/src/`): geometria, terreno, spazi aerei, regole, radio, interfaccia. Le regole sono funzioni pure coperte da test automatici (`npm test`, 19 test).
- Pacchetto dati «Marsica e Fucino» caricato all'avvio. Le quote del pacchetto sono il massimo di blocchi 3×3 (90 m), quindi leggermente più alte del dato a 30 m: ai punti di prova 3543, 2738 e 2653 ft contro 3480, 2695 e 2633 ft. È una scelta prudente.
- Tre schede (Pianifica, Vola, Radio), due livelli (Principiante, Esperto), temi Giorno e Notte.
- In volo: GPS del dispositivo o simulazione lungo la rotta, previsione dei conflitti nei 5 minuti successivi con avvisi a tempo e a voce, profilo «davanti a te».


## Versione 0.3 (6 novembre 2026)

Novità, chieste da Ale: approccio critico, grafica più pulita, carta 2D, meteo in 3D, informazioni
ufficiali, strumenti esterni.

- **Carta 3D o 2D** (tasto in alto). La 2D è una vista dall'alto senza prospettiva, nord in alto, con
  scala grafica in miglia nautiche (controllata: 10 NM = 131 px con 1° di longitudine su 585 px).
- **Meno confusione**: gli spazi aerei attraversati dalla rotta (o in arrivo durante il volo) sono
  evidenziati con spigoli verticali e impronta sul terreno; gli altri restano tenui. I nomi si vedono
  solo per quelli rilevanti (in Esperto si possono mostrare tutti). Etichette a dimensione costante
  sullo schermo. Le sezioni meno usate del pannello sinistro sono richiudibili. La rotta è un tubo
  spesso, non più una linea di un pixel.
- **Meteo**: METAR, TAF e SIGMET dell'Aviation Weather Center (vedi meteo.md). Avvisi a regole nell'assistente.
- **Quota GPS corretta per il geoide**: la quota del tablet era alta di circa 155 ft in Marsica
  (ellissoide invece del mare). Correzione EGM96 verificata con due implementazioni indipendenti.
- **Strumenti esterni**: NMEA e GDL90, Bluetooth LE e USB (vedi dispositivi.md).
- **Informazioni ufficiali**: collegamenti a ENAV, Aeronautica Militare, EUROCONTROL e ricerca
  limitata ai siti di ENAV ed ENAC.

Verifiche: 39 test automatici superati; prova completa con Chrome senza errori JavaScript; meteo
provato con il campione reale salvato e con la connessione bloccata (messaggio corretto).
Valutazione dei limiti e degli errori: [valutazione-critica.md](valutazione-critica.md).

## Versione 0.4 (6 novembre 2026)

- **Previsione 3D ICON-2I** (ItaliaMeteo-ARPAE): nubi per strati, pioggia, vento alla quota di
  crociera, zero termico nel profilo, vento contrario e al traverso per ogni tratto, avvisi.
- Windy escluso: le sue condizioni vietano la rielaborazione dei dati.
- Radar della Protezione Civile: API verificata, formato dei file ancora da verificare.
- 45 test superati; prova con Chrome senza errori JavaScript.

## Versione 0.10 (6 novembre 2026)

- **Italia centrale**: terreno a 90 m a tessere (caricate solo dove servono) con correzione delle vette, località,
  strade, ferrovie, fiumi, laghi e vette da OpenStreetMap, 690 spazi aerei e 276 campi. Si disegna in 3D ciò che sta
  entro 90 km dal centro della vista; i controlli usano tutto. Pacchetto ricostruito ogni mese da GitHub Actions.
- **Rampe di salita e discesa** (TOC/TOD) nel profilo, nella rotta 3D, nei controlli e nella simulazione.
- **Punti trascinabili** (nodo arancione, 2D e 3D) e **quota trascinabile** (cono blu, 3D).
- **Ricerca** di campi, punti di riporto, radioassistenze, località e vette.
- **In volo**: campi vicini con rotta magnetica, tempo e planata; «diretto a»; area di planata sul terreno;
  distanza dalla rotta; traccia GPX.
- **Vento sulle piste** di partenza e arrivo dal METAR e limite al traverso dell'aereo.
- **Dati dei manuali** di P2002 Sierra e P96 Golf (vedi piano-di-volo.md) e capacità dei serbatoi nei controlli.
- **APK** con firma fissa e numero di versione: si aggiorna senza disinstallare (vedi android.md).
- Stato delle funzioni e lacune: [funzioni.md](funzioni.md).

Verifiche: 91 test automatici; prove in Chrome (tools/shot.py e tools/shot_centro.py).
