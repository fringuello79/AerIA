<!-- AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati. -->
# Fonti dati

Aggiornato all'8 novembre 2026.

## Fonti ufficiali (obiettivo)

| Dato | Fonte | Stato |
| --- | --- | --- |
| Spazi aerei, aeroporti, radioaiuti (Italia) | ENAV AIFS, AIXM 5.1.1, ciclo AIRAC (in esercizio dal 30/4/2025 secondo il registro SWIM europeo; accesso con registrazione ENAV, OAuth2 e certificato X.509) | Email ad aimswimservices@enav.it da inviare |
| NOTAM e PIB (Italia) | ENAV Self Briefing | Email a selfbriefing@enav.it da inviare |
| NOTAM ed EAD (Europa) | EUROCONTROL EAD Pro (con contratto) | Da valutare; EAD Basic non è per uso operativo |
| Attivazione aree (AUP/UUP) | EUROCONTROL NM B2B | Accesso soggetto ad accordo |
| Ostacoli | AIP ENR 5.4 (solo ostacoli ≥ 100 m) | Serve fonte per ostacoli bassi (cavi, tralicci) |
| Meteo METAR/TAF | aviationweather.gov Data API | Gratuita, max 100 richieste/min |

## Fonti usate ora nel prototipo

| Dato | Come ottenerlo | Note |
| --- | --- | --- |
| Spazi aerei Italia | https://s3.openaip.net/openaip-system-exports/it_asp.geojson | Export openAIP rigenerato ogni notte. Codici numerici confermati: 1 R, 2 Q, 3 P, 4 CTR, 7 TMA, 13 ATZ, 14 MATZ, 26 CTA, 36 CTR militare |
| Terreno 30 m | https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N42_00_E013_00_DEM/Copernicus_DSM_COG_10_N42_00_E013_00_DEM.tif (e N41 per il sud del Fucino) | Modello di superficie: include edifici e vegetazione |

I file scaricati vanno nella cartella `data/`, esclusa da git.

## Pacchetto «Italia centrale» (6/11/2026)

Area: latitudine 40–45 N, longitudine 9,5–16 E (Toscana, Umbria, Marche, Lazio, Abruzzo, Molise, Emilia-Romagna
meridionale, Campania settentrionale). Costruito in due parti:

| Parte | Script | Dove gira | Dove finisce |
| --- | --- | --- | --- |
| Terreno, vette, base cartografica | `tools/make_region.py` | GitHub Actions, workflow «Pacchetto dati», ogni mese | ramo `pacchetti` (31 MB) |
| Spazi aerei, aeroporti, ostacoli, punti, geoide, declinazione | `tools/make_centro.py` | in locale, dagli export openAIP | `web-prototype/data/centro/` |

- **Terreno**: Copernicus DEM GLO-30 dalla copia ufficiale del registro AWS Open Data (`s3://copernicus-dem-30m`).
  31 tessere di terra da 1°, griglia 3" (circa 90 m) con il **massimo** di ogni blocco 3×3; 4 tessere sono solo mare
  secondo l'elenco ufficiale `tileList.txt` (una tessera di terra che non si scarica blocca la costruzione).
  Più una griglia d'insieme a 30" (circa 900 m, massimo per blocco) per la vista intera e per i calcoli finché la
  tessera fine non è caricata: è sempre più alta o uguale, quindi più prudente.
- **Vette**: il modello a 30 m smussa le cime aguzze: il Corno Grande risulta 2878 m invece di 2912 m. Ogni blocco che
  sta entro circa 180 m da una vetta OpenStreetMap (`natural=peak` con `ele`) più alta del modello fino a 300 m viene
  alzato alla quota della vetta (il blocco più alto vicino: le coordinate delle cime sono spesso spostate sul
  versante). Scelta prudente: una cima vera sottostimata è un pericolo, una falsa dà al più un avviso in più. Esempi
  reali: Corno Grande Vetta Orientale 2903 m, modello 2798 m; Monte Procinto 1173 m, modello 957 m. Oltre 300 m la
  vetta si considera un errore e si elenca in `region.json`. Il controllo automatico verifica che entro 180 m da ogni
  vetta accettata la quota del pacchetto non sia più bassa. Controllo automatico su
  Corno Grande, Velino, Monte Amaro, Vettore, Terminillo, Cimone: dopo la correzione la quota coincide con quella nota.
- **Base cartografica**: OpenStreetMap tramite Overpass API (licenza ODbL): 6572 località (città, paesi, frazioni),
  vette con quota, autostrade, superstrade e strade principali, ferrovie principali, fiumi, 82 laghi oltre 0,3 km².
  Linee semplificate a circa 50 m. Controllo automatico di località e laghi noti.
- **Spazi aerei**: 690 dall'export openAIP Italia (solo Italia: la Corsica non è coperta).
- **Campi e punti**: 276 aeroporti e aviosuperfici, 3885 ostacoli, 209 punti di riporto, 53 radioassistenze.

## Aeroporti, ostacoli, punti di riporto, radioassistenze (6/11/2026)

Export openAIP per l'Italia, aggiornati ogni notte (`https://s3.openaip.net/openaip-system-exports/it_apt.geojson`,
`it_obs`, `it_rpp`, `it_nav`). Il pacchetto Marsica (`features.json`) è creato da `tools/make_features.py`.

| File | In Italia | Nel pacchetto | Note |
| --- | --- | --- | --- |
| it_apt | 583 | 23 (area più 0,1°) | Codici dei tipi verificati sui nomi: 0 aeroporto, 1 volo a vela, 2 aviosuperficie o aeroporto civile, 3 internazionale, 5 militare, 6 ultraleggeri, 7 elisuperficie, 8 chiuso, 9 IFR, 10 idroscalo |
| it_obs | 7336 | 86 | **Importati da OpenStreetMap: licenza ODbL**, attribuzione «© OpenStreetMap contributors». In Marsica 85 su 86 sono pale eoliche **senza altezza**: il programma le considera alte 200 m per prudenza e lo dichiara. Mancano cavi, elettrodotti e quasi tutte le antenne. |
| it_rpp | 476 | 14 | Punti di riporto VFR obbligatori di Frosinone (RHW1, RHW2), L'Aquila (APS1, APS2, APN2, APNE1) e Pescara (BPW1, BPSW2) |
| it_nav | 115 | 7 (area più 0,5°) | Nella zona: VOR-DME Frosinone FRS 115.600 |

Regola per il limite dei 5 km del VDS non avanzato: conta come aeroporto ciò che ha un codice ICAO oppure è
di tipo 0, 3, 5 o 9; i campi chiusi sono esclusi. Le aviosuperfici generano solo un avviso di traffico.
È una classificazione derivata dai dati openAIP: va confrontata con l'elenco ufficiale ENAC degli aeroporti.

Verifica incrociata del geoide: per 9 aeroporti e radioassistenze della zona openAIP riporta l'ondulazione del
geoide calcolata in modo indipendente; la griglia EGM96 del pacchetto coincide entro 0,5 m (scarto medio −0,2 m).

## NOTAM: fonti valutate (8/11/2026)

Regola del progetto: un NOTAM mostrato dal programma deve venire da una fonte ufficiale o da un fornitore che lo
riceve con licenza dalla fonte ufficiale, con data e ora di aggiornamento visibili. Una fonte incompleta è peggio di
nessuna, perché fa credere che non ci sia niente.

| Fonte | Da dove prende i NOTAM italiani | Accesso | Giudizio |
| --- | --- | --- | --- |
| ENAV Self Briefing (selfbriefing.enav.it) | è la fonte (ARO-CBO Italy) | sito web gratuito con registrazione; nessuna API pubblica nota | **Ufficiale.** Oggi il pilota la usa a mano. Il programma può leggere il bollettino (PIB) che il pilota copia o scarica: nessun contratto, dato ufficiale |
| ENAV servizi SWIM | AIFS (spazi, campi, radioaiuti in AIXM) è in esercizio; un servizio Digital NOTAM di ENAV non risulta nel registro SWIM europeo | registrazione, OAuth2, certificato mTLS | Ufficiale. Da chiedere ad aimswimservices@enav.it se e a quali condizioni lo danno a un aeroclub |
| EUROCONTROL EAD Pro / INO | banca dati europea, alimentata da ENAV | contratto a pagamento | Ufficiale, costosa e complessa |
| EUROCONTROL EAD Basic | come sopra | gratuita con registrazione | **Non usabile**: EUROCONTROL la definisce uno strumento dimostrativo, non collegato alla banca dati operativa e non per uso operativo |
| NOTAMbriefing.com | EAD e Network Manager B2B (anche AUP/UUP), incrociati con AIP e SUP | briefing gratuito; dati per altre app con richiesta di accesso (pagina «Partnerships», condizioni non pubbliche) | Secondaria ma alimentata dalle fonti ufficiali e aggiornata di continuo: **candidata** per NOTAM e zone attive, se le condizioni lo permettono |
| FAA NOTAM API (NMS) | NOTAM internazionali scambiati con gli Stati Uniti | gratuita su richiesta (NOTAMS@faa.gov) | **Non adatta come unica fonte per l'Italia**: chi la usa avverte che l'elenco internazionale può essere incompleto; i NOTAM a diffusione solo nazionale non ci sono |
| ICAO iSTARS, Aviation Edge, Notamify e simili | rilanciano FAA (DINS) o fonti non dichiarate | API a pagamento o a crediti | Non adatte: stessa incompletezza o provenienza non verificabile |

Prova dell'8/11/2026 (workflow «Prova NOTAM», tools/prova_notam.py): la ricerca NOTAM pubblica della FAA
(notams.aim.faa.gov) risponde 403 ai programmi; le API di NOTAMbriefing.com sono vietate ai programmi nel robots.txt
e richiedono un'app registrata (accesso con account EasyVFR, termini per sviluppatori). **Nessuna fonte NOTAM si può
leggere in automatico senza un account.** Decisione di Ale (8/11): NOTAM automatici da servizi esistenti anche non
certificati, senza che il pilota incolli nulla, con l'avviso di controllare il briefing ufficiale; richieste agli enti
solo per servizi gratuiti (bozze in [richieste-enti.md](richieste-enti.md)), dalla casella dedicata ad AerIA.

Proposta precedente (superata dalla decisione di Ale):
1. **Subito, senza contratti**: lettura del bollettino ENAV (PIB) incollato o scaricato dal pilota. Il codice a regole
   legge ogni NOTAM nel formato ICAO (riga Q con centro e raggio, quote F e G, orari B, C e D), lo disegna sulla carta e
   in 3D e controlla se tocca la rotta nell'orario del volo. Un NOTAM che non si riesce a leggere resta in elenco come
   testo, con l'avviso di leggerlo. L'età del bollettino si vede sempre; oltre le 2 ore prima del decollo, avviso.
2. **Automatico**: chiedere a ENAV (Digital NOTAM o PIB via servizio) e, in parallelo, a NOTAMbriefing.com le condizioni
   per un aeroclub. Si integra solo una fonte con licenza scritta.
3. **Mai**: estrarre dati da siti che non lo permettono; fonti che rilanciano NOTAM senza dire da dove.

## Età dei dati (8/11/2026)

- Il programma calcola il ciclo AIRAC del giorno del volo (date ICAO, ogni 28 giorni dal 2/1/2020) e lo confronta con
  la data di scarico degli spazi aerei (0.18.4). Dati installati: openAIP del 6/11/2026, ciclo 2611 (dal 29/10/2026);
  il 2612 inizia il 26/11/2026.
- Nel pacchetto Italia centrale, 523 dei 692 spazi aerei hanno come ultima modifica alla fonte il **24/04/2023**
  (un'importazione in blocco); 98 sono stati modificati nel 2026, l'ultimo il 23/09/2026. Gli spazi italiani di openAIP
  sono curati da volontari: non c'è garanzia che seguano ogni emendamento AIRAC. Nel riquadro intorno ad Avezzano (13,2–13,9 E, 41,8–42,3 N)
  26 spazi su 35 sono fermi al 24/04/2023 (CTA Roma Z4 Marsica, CTR Frosinone, P247 Collarmele, P249 Ortucchio…); P80 Avezzano è del 2/8/2024.
- Aggiornamento: workflow «Dati aeronautici» ogni venerdì; le differenze vanno confrontate con l'AIP prima di accettarle.
