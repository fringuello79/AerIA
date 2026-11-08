<!-- AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati. -->
# Piano di volo

Modulo compilabile e stampabile sul modello del «Piano di volo» cartaceo dell'Aeroclub dei Marsi
(versione 2023, due pagine: log di navigazione; carburante, peso e centraggio). Vista «Piano di volo».

## Che cosa calcola (src/navlog.js, tests/navlog.test.js)

| Voce del modulo | Come la calcola il programma |
| --- | --- |
| TRACK | Rotta magnetica = rotta vera − declinazione (WMM2025, circa +4,3° est in Marsica) |
| DISTANCE (km) | Distanza tra i punti, anche in NM; scarto sotto lo 0,05 % rispetto alla geodetica WGS84 |
| IAS | Dal profilo dell'aereo o del singolo tratto, in km/h (predefinito per l'aeroclub) o nodi |
| LEG | Minuti del tratto, con la velocità al suolo (come nel modulo compilato dall'aeroclub) |
| P.T. / T.T. | P.T. lasciato vuoto come nel modulo compilato; T.T. tempo progressivo |
| HDG (aggiunta nella cella della rotta) | Prua magnetica corretta per il vento (triangolo del vento) |
| ETO | Orario di decollo + tempo progressivo; RETO, ATO e DELAY restano da scrivere in volo |
| GS | Velocità al suolo dal triangolo del vento, con la TAS ricavata da IAS, quota, QNH e temperatura |
| ALTERN ON TRACK | Campo più vicino a ogni punto (aeroporti e aviosuperfici openAIP) |
| ATIS/TWR/APP | Frequenze del campo nel punto, se presenti nei dati |
| T.O. e LANDING DATA | Pista, lunghezza, quota e frequenza da openAIP; vento, nubi, QNH e temperatura dal METAR solo se entro 25 km, altrimenti da inserire |
| FUEL | LEG = tempo × consumo; ALT = tratto destinazione → alternato; RVE = minuti di riserva × consumo (30 min predefiniti); MIN = somma; EXTRA a scelta; T.O.F. = MIN + EXTRA; autonomia |
| WEIGHT & BALANCE | Pesi × bracci = momenti; peso al decollo, baricentro al decollo e all'atterraggio (con il carburante consumato) |

In più rispetto al modulo: quota minima di sicurezza per tratto (rilievo più alto entro 5 NM più 1000 ft,
campionato ogni 500 m) e controlli automatici: peso massimo, baricentro al decollo e all'atterraggio, carburante
a bordo minore del minimo, dati dell'aereo mancanti, quota sotto la minima di sicurezza, vento più forte della velocità.

Vento per tratto: inserito a mano (ha la precedenza) oppure dal modello ICON-2I alla quota del tratto e all'ora
scelta nel pannello meteo.

## Verifiche

- Triangolo del vento su casi da manuale del computer E6B (per esempio rotta 090, TAS 100, vento 180/20:
  correzione +11,5°, velocità al suolo 98 kt).
- TAS in atmosfera standard (100 kt indicati a 5000 ft = 107,7 kt veri).
- Declinazione: griglia WMM2025 (pygeomag) contro un'altra implementazione (magvar), scarto sotto 0,02°.
- Peso e centraggio rifatti a mano nel test.
- Distanze e rotte contro la geodetica WGS84 di pyproj. **Correzione emersa da questo lavoro:** la funzione
  di distanza usava la lunghezza del grado di latitudine all'equatore (110,54 km invece di 111,08 km in Italia):
  le distanze erano sottostimate dello 0,5 %. Corretta in tutto il programma, compresi archi e cerchi degli
  spazi aerei; il vecchio test che fissava il valore sbagliato è stato corretto.

## Dati dell'aereo

Il programma non contiene dati di Tecnam P96 Golf o P2002 Sierra: velocità, consumo e peso a vuoto vanno
presi dal manuale di volo e dalla scheda di pesata di ogni aereo. Il profilo di partenza contiene solo
ciò che è stampato sul modulo: peso massimo 600 kg, limiti del baricentro 028,2 – 045,1 (interpretati come
0,282 – 0,451 m dal riferimento), bracci 0,30 / 0,52 / 0,52 / 0,21 / 1,09 m. Si possono creare più aerei
(«Nuovo aereo»); restano salvati sul dispositivo.

## Scambio dei dati

- **Stampa o PDF**: due pagine A4 con lo stesso schema del modulo cartaceo.
- **Salva piano / Apri piano**: file JSON con rotta, aereo e tutte le scelte; si riapre sullo stesso o su un altro dispositivo.
- **GPX**: esportazione e importazione della rotta (GPX 1.1, formato aperto letto dai principali navigatori e GPS).

## Indicazioni di Ale (6/11/2026) e piano compilato AQ01 → BO09 del 12/04/2024

- «LEG» è il tempo del tratto alla velocità prevista.
- I limiti del baricentro del modulo valgono per il P2002 Sierra; il baricentro 0,36 scritto sul modulo compilato
  conferma che sono in metri (0,282 – 0,451 m).
- Velocità di crociera 180 km/h per P96 Golf e P2002 Sierra, come riferimento e non come valore assoluto.
- Riserva 10 litri più l'extra.

Profili predefiniti ricavati da queste indicazioni (valori di riferimento, da verificare per ogni esemplare):

| | P2002 Sierra | P96 Golf |
| --- | --- | --- |
| IAS di crociera | 180 km/h | 180 km/h |
| Peso a vuoto | 370 kg (modulo compilato) | da inserire |
| Bracci, MTOW, limiti del baricentro | dal modulo | da inserire (il modulo vale per il Sierra) |
| Consumo | 19,5 l/h, ricavato da 80 l per 4 h 06′ di autonomia scritti sul modulo | da inserire |
| Densità del carburante | 0,78 kg/l, come sul modulo (AVGAS circa 0,72; benzina auto 0,72 – 0,775: valore prudente per il peso) | 0,78 kg/l |
| Riserva | 10 litri | 10 litri |

Verifica del piano compilato (tests/navlog.test.js): carburante (MIN 65, T.O.F. 80 l = 62,4 kg, autonomia 4 h 06′),
momenti (111; 39; 36,4; 13,1; 10,9) e baricentro 0,36 coincidono. Differenze trovate:

- **T.O.W.**: il modulo riporta 593,50 kg, ma 370 + 75 + 70 + 62,4 + 10 = **587,4 kg**. Il baricentro scritto (0,36)
  è comunque corretto.
- **Tempi**: senza vento, 20 km a 180 km/h sono 6,7 minuti (7, non 6) e 50 km sono 16,7 minuti (17, non 16); il
  totale è 1 h 52′ invece di 1 h 51′.
- Il modulo usa la IAS come velocità al suolo: senza correzione per quota, temperatura e vento. A 6000 ft la
  velocità vera è circa il 9 % più alta della IAS, quindi i tempi sul modulo sono prudenti senza vento ma possono
  risultare corti con vento contrario. Il programma applica entrambe le correzioni.

## Dati dai manuali di volo (6/11/2026)

Ale ha fornito i manuali del P2002 Sierra (Tecnam Doc. 2002/57, ed. 3 del 18/04/2008) e del P96 Golf (copia del
manuale Tecnam di ottobre 1998 da manualslib). Valori presi e verificati in `tests/navlog.test.js`:

| | P2002 Sierra (manuale) | P96 Golf (manuale) |
| --- | --- | --- |
| Peso massimo al decollo | **450 kg** (il modulo dell'aeroclub usa 600 kg) | 544 kg |
| Peso a vuoto standard | 289 kg (il modulo usa 370 kg) | 281 kg (serve quello della scheda di pesata) |
| Baricentro | 20–33 % CMA = 1,611–1,789 m dalla flangia = 0,274–0,452 m dalla linea del bordo d'attacco | 22–25 % della corda (1,4 m) = 0,308–0,350 m dalla linea del bordo d'attacco |
| Bracci di carico | non riportati | non riportati |
| Serbatoi | 2 × 50 l | 2 × 35 l (opzionale 90 l) |
| Consumo | 19,1 l/h al 70 %, 20,4 l/h al 75 % | 912 UL: 14 l/h a 4800 giri (95 kt), 16 l/h a 5000 giri (100 kt) |
| Salita | Vy 130 km/h; diagramma valido fino a 450 kg | Vy 65 kt; 4,5 m/s al livello del mare, 1,6 m/s a 3000 m (544 kg) |
| Planata | efficienza 12,8 a 123 km/h | 60 kt (efficienza non riportata) |
| Vento al traverso dimostrato | 15 kt | 15 kt |

Che cosa ne è stato fatto:

- **Sierra**: restano peso, bracci e limiti del modulo dell'aeroclub (i limiti del modulo, 0,282–0,451 m, stanno dentro
  quelli del manuale: il modulo è più prudente davanti). Dal manuale: serbatoi 100 l, Vy, efficienza 12,8, vento al
  traverso 15 kt. Il consumo del modulo (19,5 l/h) sta tra i valori al 70 e al 75 %: confermato.
  **Discrepanza da chiarire**: il manuale è per 450 kg, il modulo usa 600 kg e 370 kg a vuoto. L'aereo dell'aeroclub è
  quindi una versione diversa o ha un supplemento: serve il manuale (o il supplemento) di quell'esemplare. Il rateo di
  salita del manuale vale fino a 450 kg e non si usa: le rampe usano 500 ft/min, valore prudente dichiarato a schermo.
  Nota: nel manuale l'esempio del diagramma di salita dice 860 ft/min, mentre la lettura del grafico dà circa 960.
- **Golf**: dal manuale peso massimo, limiti del baricentro, serbatoi, consumo (16 l/h, il valore più alto vicino ai
  180 km/h), salita, vento al traverso. Mancano peso a vuoto e bracci di carico: senza, peso e centraggio non si
  calcolano e il programma lo dice. Se il Golf dell'aeroclub è la versione /100 (912 S) il consumo è più alto.

## Rampe di salita e discesa

Su indicazione di Ale (6/11/2026) le salite e le discese non sono più gradini: `src/vprofile.js`.

- Partenza da un campo: si sale dalla quota del campo col rateo dell'aereo (che cala con la quota, dati del manuale).
- Tratto più alto: la salita inizia sul punto e continua anche nel tratto dopo, se serve.
- Tratto più basso: la discesa è anticipata (TOD) per arrivare alla nuova quota sul punto.
- Arrivo su un campo: discesa per essere a quota di circuito (campo + 1000 ft, o il limite VDS se più basso).
- Velocità di salita = Vy, di discesa = crociera, 500 ft/min se l'aereo non ha un valore. Vento non considerato.
- Profilo, rotta 3D, controlli (terreno, spazi aerei, VDS) e simulazione usano le rampe. Vicino ai campi di partenza
  e arrivo il controllo del terreno segnala il rilievo sopra la rampa (oltre 1 km dal campo) e i margini sotto
  300 ft (oltre 3 km dal campo). I tempi del log sono ancora alla velocità di crociera.
- Verifica: `tests/vprofile.test.js` confronta con calcoli a mano (tempo = dislivello / rateo, distanza = tempo ×
  velocità) e con la formula esatta per il rateo variabile.

## Quota per tratto

**Regola (dalla 0.11.0, richiesta di Ale):** nessun punto di virata può stare a meno di 300 ft dal terreno. La quota
minima di un tratto è il terreno più alto tra i suoi due punti più 300 ft, arrotondata ai 100 ft superiori
(`legMinAltFt` in `src/rules.js`). Un tratto più basso viene alzato al minimo e l'avviso «Quota del tratto … alzata»
spiega perché; il cono blu non scende sotto il minimo; sotto ogni punto compare «min». Esenti i campi di partenza e
arrivo. Restano gli altri controlli lungo il tratto (terreno tra i punti, margine di 500 ft, rampe).

Ogni tratto può avere la sua quota: nella vista Pianifica, sotto ogni punto, «quota tratto» è la quota dal punto
al successivo (vuota = quota di crociera); la stessa quota compare e si cambia nel piano di volo. Profilo, rotta 3D,
controlli di terreno, spazi aerei, limite VDS, ostacoli, simulazione e log di navigazione usano la quota del tratto.
Sulla carta si può anche trascinare il punto arancione (sposta il punto, 2D e 3D) e il cono blu sopra il punto (cambia
la quota del tratto a passi di 100 ft, solo in 3D). Meteo previsto e altimetria usano ancora la quota di crociera.

## Limiti

- Su Android la stampa dalla WebView non funziona da sola e lo scaricamento dei file va verificato: servirà un
  modulo per creare il PDF e condividerlo.
- Il piano ICAO da presentare a ENAV (modulo FPL) non è ancora generato.
