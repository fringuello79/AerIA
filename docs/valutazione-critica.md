<!-- AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati. -->
# Valutazione critica del prototipo (6 novembre 2026)

Questo documento dice che cosa il programma sa fare bene, quanto ci si può fidare di ogni numero e che
cosa manca. Lo scopo è evitare la fiducia eccessiva: un navigatore che sembra preciso ma non lo è
è più pericoloso di una carta di carta.

## 1. Bilancio degli errori sulla quota

La domanda «sono sopra o sotto quel limite?» dipende da quattro numeri. Ognuno ha il suo errore.

| Grandezza | Fonte nel programma | Errore tipico | Note |
| --- | --- | --- | --- |
| Quota GPS del tablet | Geolocation API (Android) | ±10–30 m (±30–100 ft), peggio con pochi satelliti | Verticale circa 1,5 volte peggiore dell'orizzontale. Il programma mostra la precisione dichiarata dal dispositivo («±» accanto alla quota) quando c'è. |
| Riferimento della quota GPS | Ellissoide WGS84 | **sistematico +44…+50 m (+145…+165 ft) in Marsica** | Android e i browser danno la quota sull'ellissoide, non sul mare. Corretto dalla v0.3 con il geoide EGM96 (vedi §3). |
| Quota barometrica (strumento esterno) | $PGRMZ, altitudine di pressione a 1013,25 hPa | ±20–50 ft dello strumento, più l'errore di temperatura | Corretta con il QNH (27 ft/hPa). Con aria più fredda della standard l'altimetro legge **più alto** del vero: circa 4 % ogni 10 °C. Il programma non lo corregge ancora. |
| Quota del terreno | Copernicus GLO-30 ridotto a 90 m col massimo | Copernicus dichiara errore verticale assoluto < 4 m (90 % dei casi); la riduzione col massimo rende il dato prudente (mai più basso del vero) | Verificato su tre vette: scarti tra −6 e −34 m rispetto alle quote IGM, dovuti alla risoluzione. Non contiene ostacoli artificiali (antenne, cavi, pale eoliche). |
| Limiti degli spazi aerei | openAIP, comunitario | Non garantito | Il confronto con l'AIP ufficiale non è ancora possibile (servono i dati ENAV). 19–21 parchi hanno il tetto sotto il terreno: errore probabile della fonte, segnalato. |
| Conversione FL → quota | QNH impostato, 27 ft/hPa | ±50 ft per hPa di QNH sbagliato | Se il QNH non è aggiornato, tutto si sposta. Il programma propone quello del METAR più vicino, con distanza ed età. |

Conseguenza pratica: con il solo GPS del tablet, un margine sotto i **200 ft** da un limite non è
distinguibile dall'errore di misura. Il programma per ora avvisa a margine fisso; va aggiunta
una fascia di incertezza («potresti essere dentro») calcolata da questi numeri.

## 2. Meteo: che cosa dice e che cosa non dice

- I METAR descrivono l'aeroporto e i suoi dintorni (pochi chilometri). In Marsica l'unico aeroporto
  con METAR sulla carta è Frosinone (LIRH); Rieti, Ciampino e Pescara sono fuori. **Il tempo sulla
  Marsica non è osservato da nessun METAR.** Il programma lo dice esplicitamente quando la rotta è a
  più di 25 km dalla stazione più vicina, e non interpola tra stazioni separate da montagne:
  sarebbe un dato inventato.
- Le nubi sulla carta 3D sono dischi di 8 km attorno all'aeroporto, alla base riportata. Non sono
  una mappa delle nubi.
- I TAF sono mostrati in testo originale, non decodificati: la decodifica di TEMPO, BECMG e PROB è
  delicata e un errore darebbe una falsa sicurezza. Il programma segnala solo temporali e cumulonembi
  previsti (regola semplice e verificata).
- Mancano AIRMET e GAMET italiani, che sono proprio le previsioni per il volo a bassa quota. Non
  sono nella fonte usata. Vanno presi da ENAV o Aeronautica Militare (link nel programma).
- La previsione ICON-2I ha solo 5 livelli di pressione: tra 850 hPa (circa 1500 m) e 700 hPa
  (circa 3100 m) non ci sono dati. Uno strato basso tra i due livelli può non comparire (nel campione
  del 6/11 la nuvolosità «bassa» del modello superava il 50 % in 92 punti su 121, mentre a 850 hPa
  solo in 23). Le nubi 3D vanno lette come «dove il modello prevede nubi», non come la base esatta.
- Fonte: Aviation Weather Center (NOAA), che ridistribuisce i bollettini ufficiali. Il 6/11/2026 il
  servizio SIGMET internazionale non conteneva SIGMET italiani: questo **non** significa che non ce ne
  siano. Il programma scrive «nessun SIGMET in questa fonte», mai «nessun SIGMET».

## 3. Correzione del geoide: verifica

Due implementazioni indipendenti del modello EGM96 (NGA):

- `egm96` 0.3.0 per Python (griglia 5'), usata per creare `geoid.json`;
- `egm96-universal` 1.1.1 per JavaScript (griglia 15', verificata dall'autore contro il programma
  Fortran ufficiale NGA).

Su 25 punti della Marsica lo scarto massimo è 0,12 m. Il test `tests/geoid.test.js` lo ricontrolla
a ogni modifica. Le frasi NMEA $GPGGA di un GPS esterno danno già la quota sul mare e non vengono
corrette una seconda volta.

## 4. Che cosa è verificato e come

| Parte | Verifica |
| --- | --- |
| Quote del terreno | Confronto con rasterio (lettura indipendente del GeoTIFF) e con quote note delle vette |
| Spazi aerei attraversati | Confronto con shapely (calcolo indipendente in Python) |
| Festivi e limiti VDS | Calendario 2026–2027, incluse Pasquetta e il 4 ottobre (L. 151/2025) |
| METAR | Campione reale del 6/11/2026: categoria di volo ricalcolata uguale a quella della fonte su tutte le stazioni |
| NMEA | Frasi di esempio con checksum noto; frase alterata scartata |
| GDL90 | CRC del messaggio d'esempio della specifica FAA (heartbeat), messaggi con escape, messaggio corrotto scartato |
| Altimetria | Tabella ISA (1500 m = 845,6 hPa); quota vera esatta in atmosfera standard; QNH stimato dal modello (1021,3 hPa medio) uguale entro 0,3 hPa ai METAR di Frosinone e Rieti (Q1021) |
| Interfaccia | Prova automatica con Chrome (tools/shot.py): nessun errore JavaScript, schermate di ogni vista |

## 5. Rischi aperti, in ordine di gravità

1. **Dati spazi aerei non ufficiali.** Finché non arrivano i dati ENAV (AIP, AIRAC), ogni limite va
   controllato sulla carta ufficiale. Il programma lo scrive in ogni scheda.
2. **NOTAM e attivazioni AUP non integrati.** Una zona R attiva oggi può non risultare.
3. **Ostacoli artificiali assenti.** Il margine sul terreno non vale per antenne e cavi.
4. ~~Nessuna fascia di incertezza negli avvisi~~: dalla v0.5 avvisi «vicino al limite» entro ±200 ft in
   pianificazione e «potresti entrarci» in volo, con l'incertezza della fonte di quota (GPS: precisione dichiarata, minimo 100 ft; barometrica: 150 ft).
5. **Correzione di temperatura dell'altimetro**: dalla v0.5 la quota vera è stimata dalle quote dei livelli di
   pressione del modello ICON-2I (serve la connessione). Il margine dal terreno non usa ancora la quota vera.
6. ~~Distanza di 5 km dagli aeroporti per il VDS non controllata~~: controllata dalla v0.6.
8. **Cime sottostimate dal modello del terreno** (scoperto il 6/11/2026). Copernicus GLO-30 dà il Corno Grande a
   2878 m invece di 2912 m (−34 m), la Vetta Orientale 2798 invece di 2903 m (−105 m), il Monte Procinto 957 invece di
   1173 m; su Velino, Sirente e Monte Greco lo scarto è di 4–8 m. Corretto alzando i blocchi vicini a una vetta
   OpenStreetMap con quota (fino a 300 m sopra il modello) e controllato in automatico;
   restano possibili sottostime su cime senza quota in OpenStreetMap. Il margine di 500 ft sul terreno le copre.
9. **Manuale del P2002 Sierra non coerente con l'aereo dell'aeroclub.** Il manuale ricevuto è per 450 kg, il modulo
   dell'aeroclub usa 600 kg e 370 kg a vuoto. Peso e centraggio usano il modulo; serve il manuale (o il supplemento)
   dell'esemplare. Il rateo di salita a 600 kg non è noto: le rampe usano 500 ft/min dichiarati.
10. **Salita verso il rilievo subito dopo il decollo.** Con le rampe il programma ora segnala quando, al rateo
   pianificato, la salita incontra il rilievo (per esempio Celano → Rieti diritto verso il Velino). Prima, con i
   gradini, l'aereo risultava già in quota sul campo e il problema non si vedeva.
7. **Prova su tablet reale non ancora fatta.** GPS, consumo di batteria, leggibilità al sole e
   Bluetooth vanno misurati sul Lenovo.

## 6. Piano di validazione proposto

1. Volo di prova con registrazione: GPS del tablet, GPS esterno e quota dell'altimetro di bordo
   annotata ogni 2 minuti. Confronto a posteriori: errore medio e massimo per ogni fonte.
2. Confronto dei limiti openAIP con l'AIP ENAV appena disponibile: ogni differenza diventa un test.
3. Prova di leggibilità: cinque piloti, metà «vecchio stampo», compiti a tempo (trovare la frequenza,
   capire se si può entrare in una zona, leggere il margine sul terreno). Errori e tempi decidono le
   modifiche all'interfaccia, non le opinioni.
4. Prova di durata: due ore in volo simulato con schermo acceso, misura di batteria e temperatura.
