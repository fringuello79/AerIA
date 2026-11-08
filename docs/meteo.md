<!-- AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati. -->
# Meteo

## Fonte

Aviation Weather Center (NOAA, USA), Data API: <https://aviationweather.gov/data/api/>.
Ridistribuisce i bollettini ufficiali emessi dai servizi nazionali (in Italia Aeronautica Militare
ed ENAV). Dati pubblici, nessuna chiave richiesta, limite di 100 richieste al minuto.

| Richiesta | Uso |
| --- | --- |
| `/api/data/metar?bbox=lat0,lon0,lat1,lon1&format=json&taf=true` | METAR (o SPECI) e TAF delle stazioni nell'area allargata di 1° |
| `/api/data/isigmet?format=json` | SIGMET internazionali con poligono già decodificato, base e sommità in piedi |

Il programma mostra sempre il testo originale, l'ora e l'età di ogni bollettino. Un METAR più vecchio
di 90 minuti è segnalato come scaduto e non viene usato per il QNH.

## Nell'app Android e nel browser

Nell'app Android le richieste passano dal livello nativo (CapacitorHttp, attivato in
`capacitor.config.json`), quindi non dipendono dalle regole CORS dei browser. Nella pagina di
prova pubblicata su claude.ai le richieste esterne sono bloccate dalla pagina stessa: il programma lo
dice e funziona senza meteo.

## Che cosa si vede

- **Carta 3D e 2D**: per ogni aeroporto con METAR dentro l'area, una colonna colorata secondo le
  condizioni (verde VFR, blu MVFR, rosso IFR, viola LIFR, convenzione FAA usata dalla fonte), una
  freccia del vento (1 km ogni 2 nodi, verso dove soffia) e un disco di 8 km per ogni strato di nubi
  alla base riportata, convertita in quota sul mare. I SIGMET in corso sono volumi rossi.
- **Pannello Meteo** (vista Pianifica): QNH della stazione più vicina con distanza ed età e tasto per
  usarlo, elenco delle stazioni più vicine alla rotta con METAR e TAF originali.
- **Assistente**: avvisi a regole, verificati in `tests/weather.test.js`:
  - condizioni IFR o LIFR entro 25 km dalla rotta (critico), MVFR (attenzione);
  - temporali o cumulonembi nel METAR (critico) o previsti nel TAF (attenzione);
  - quota pianificata a meno di 1000 ft dalla base di uno strato BKN/OVC, oppure sopra di esso;
  - rotta dentro un SIGMET valido alla quota pianificata (critico);
  - nessuna stazione entro 25 km: il tempo sulla rotta non è osservato.

## Previsione 3D: modello ICON-2I

Fonte: modello **ICON-2I** di ItaliaMeteo-ARPAE (il modello di riferimento delle amministrazioni
italiane: 2,2 km, corse alle 00 e 12 UTC, 72 ore, assimila radar della Protezione Civile e
osservazioni dell'Aeronautica Militare), letto tramite Open-Meteo
(`https://api.open-meteo.com/v1/forecast?...&models=italia_meteo_arpae_icon_2i`).
Dati CC BY 4.0, attribuzione e collegamento a open-meteo.com accanto ai dati (presente nel pannello).
Il servizio gratuito è solo per uso non commerciale e fino a 10 000 chiamate al giorno: per una
versione commerciale serve l'abbonamento Open-Meteo oppure la lettura diretta dei file del modello da
ItaliaMeteo (Meteo-Hub), da verificare.

Richiesta: griglia di 11×11 punti sull'area (ogni 0,1°, circa 9–11 km), 12 ore, 41 variabili:
nuvolosità, vento, umidità, temperatura e quota geopotenziale a 1000, 925, 850, 700 e 500 hPa;
pioggia, raffiche, zero termico e CAPE al suolo.

Che cosa si vede:

- **Nubi**: per ogni livello di pressione, la base e la sommità dello strato che quel livello
  rappresenta (metà strada dai livelli vicini), con trasparenza proporzionale alla copertura. Gli strati
  interamente sopra la quota di crociera mostrano solo la base. Nella carta 2D si vede solo lo strato
  della quota di crociera.
- **Pioggia**: colonne azzurre dal suolo alla base delle nubi, tre intensità (0,1 / 1 / 4 mm/h).
- **Vento alla quota di crociera**: frecce (verso dove soffia) ogni due punti di griglia, colore per
  intensità; in Esperto anche il valore in nodi. Nel pannello: vento su ogni tratto con componente
  contraria o in coda e al traverso.
- **Profilo verticale**: nubi, pioggia e zero termico previsti lungo la rotta.
- **Ora**: si sceglie tra le 12 ore disponibili; all'apertura quella più vicina all'ora attuale.
- **Avvisi** (tutti di livello «attenzione», perché è una previsione): nubi di almeno metà cielo nello
  strato della quota pianificata; nubi alla quota pianificata vicino o sopra lo zero termico (da 300 m
  sotto), rischio di ghiaccio; pioggia di almeno 0,5 mm/h; vento di almeno 25 kt in quota o raffiche
  di almeno 25 kt al suolo; CAPE di almeno 500 J/kg.

Verifiche (tests/forecast.test.js, campione reale del 6/11/2026 09 UTC):

- **Livelli sotto il terreno.** Il modello fornisce valori anche per i livelli di pressione che in
  montagna sono sotto il suolo. Sulla griglia 11×11 scaricata, il livello 925 hPa era sotto il
  terreno in 61 punti su 121 e il 1000 hPa in 115. Vengono scartati: usarli avrebbe voluto dire
  mostrare vento e nubi dentro la montagna.
- Strati e vento interpolato confrontati con un calcolo indipendente in Python.
- Vento interpolato per componenti (u, v): due venti opposti si annullano, come devono.

### Windy

Windy non si può usare per questo: le sue condizioni d'uso vietano di estrarre, modificare o
rielaborare i dati e di crearne opere derivate. Un'immagine 3D costruita sui suoi dati sarebbe
un'opera derivata. È consentito solo incorporare la sua mappa (servizio a pagamento), che resterebbe 2D.

## Radar della Protezione Civile (dato osservato)

Radar-DPC, Dipartimento della Protezione Civile, licenza CC BY-SA 4.0 (citare «Radar-DPC»; le opere
derivate restano CC BY-SA). API: `GET https://radar-api.protezionecivile.it/findLastProductByType?type=SRI`
e `POST /downloadProduct`, che restituisce un indirizzo valido 5 minuti di un file GeoTIFF.
La piattaforma web (radar.protezionecivile.it) **non ha un pulsante di download**: i file si ottengono solo dall'API.

Formato verificato sui file del 6/11/2026 13:40 UTC (SRI e CAPPI_2), scaricati da Ale con PowerShell:

- GeoTIFF float32, 1200 × 1400 celle da 1 km, LZW, pixel ad area;
- Trasversa di Mercatore sull'ellissoide WGS84, origine 42° N 12,5° E, fattore di scala 1, senza falsa
  origine; angolo in alto a sinistra x = −600 km, y = +650 km;
- **SRI**: mm/h; il file servito come «SRI» è in realtà **SRI_adj** (corretto con i pluviometri, come dice il
  nome interno); 0 = niente pioggia, −9999 = non osservato;
- **CAPPI**: riflettività in dBZ; −9998 = nessun eco a quella quota, −9999 = non osservato; la quota del
  CAPPI_2 **non è scritta nel file né nella documentazione trovata**: il programma presume 2000 m e lo dichiara;
- il nome del file restituito dall'API usa l'ora italiana, il nome interno e l'API (epoch) l'ora UTC: il
  programma usa solo l'epoch dell'API.

Verifiche (tests/radar.test.js e tools/shot.py):

- proiezione scritta nell'app (formule di Snyder) contro pyproj in 7 punti da Aosta alla Puglia e a Lampedusa:
  scarto sotto 0,5 m;
- lettura completa nel browser (geotiff.js e proiezione dell'app) contro rasterio e pyproj in 301 punti casuali
  della Marsica, per entrambi i file: **0 differenze**;
- avvisi su un ritaglio reale: la cella più piovosa della zona (19,2 mm/h) produce l'avviso critico.

Che cosa si vede e che cosa fa:

- pioggia al suolo colorata sul terreno (azzurro sotto 1 mm/h, blu, giallo da 4, arancio da 10, viola da 30);
- in Esperto, la riflettività CAPPI come strato alla quota presunta di 2000 m (solo dove il terreno è più basso);
- avvisi entro 2 km dalla rotta: pioggia da 1 mm/h (attenzione), da 10 mm/h (critico, possibili temporali),
  eco da 45 dBZ in quota (critico); età del dato sempre indicata, avviso se più vecchio di 20 minuti; avviso se
  il radar non copre gran parte della rotta;
- il radar vede la pioggia, non le nubi senza pioggia: per quelle restano METAR e modello.

Da verificare sul tablet: che lo scaricamento del file binario funzioni attraverso CapacitorHttp.
