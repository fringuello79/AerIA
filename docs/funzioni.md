<!-- AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati. -->
# Funzioni: stato e lacune (7 novembre 2026)

Elenco delle funzioni che un navigatore VFR deve offrire, ricavato dalle esigenze dei piloti dell'Aeroclub dei Marsi,
dalle norme (DPR 133/2010, regole dell'aria) e dalle linee guida sugli EFB. Il 7/11/2026 l'elenco è stato confrontato
con i manuali d'uso di altri navigatori per tablet e di un orologio per piloti: le idee utili sono state riscritte da zero
per AerIA VFR (comandi, nomi e grafica propri), quelle non ancora fatte sono nella roadmap (sezione B2). Lo scopo è
trovare ciò che **manca di essenziale**.

Legenda: ✅ presente · 🟡 parziale · ❌ manca · ⛔ non fattibile oggi con dati ufficiali o con licenza compatibile

## Pianificazione

| Funzione | Stato | Note |
| --- | --- | --- |
| Rotta sulla carta, punti agganciati a campi e punti di riporto | ✅ | |
| Spostare i punti trascinandoli | ✅ 6/11 | prima si seleziona (anello arancio), poi si trascina; un tocco altrove deseleziona (7/11) |
| Annullare l'ultima modifica alla rotta | ✅ 7/11 | carta, lista dei punti, Ctrl+Z; fino a 50 passi |
| Quote dal profilo altimetrico | ✅ 7/11 | nodo del punto alla quota della sua casella: tocco per selezionare, poi trascinare su o giù (la casella segue) |
| Rotta mai dentro le montagne | ✅ 7/11 | tratti dritti almeno 500 ft sopra il rilievo più alto entro 600 m (quota alzata in automatico); salita/discesa sul campo |
| Cercare campi, punti, radioassistenze, località | ✅ 6/11 | dati openAIP e OpenStreetMap del pacchetto |
| Quota per tratto | ✅ | campo «quota tratto» o cono blu trascinabile in 3D |
| Salite e discese realistiche (TOC/TOD) | ✅ 6/11 | rateo del manuale (P96 Golf) o valore prudente dichiarato; arrivo a quota di circuito |
| Profilo verticale con terreno e spazi aerei | ✅ | con rampe e meteo previsto |
| Controllo spazi aerei, terreno, limiti VDS, ostacoli | ✅ | regole verificabili, incertezza di quota |
| Log di navigazione, carburante, peso e centraggio, stampa | ✅ | modulo dell'Aeroclub dei Marsi |
| Vento sulle piste e limite al traverso | ✅ 6/11 | METAR entro 25 km, limite del manuale (15 kt) |
| Capacità dei serbatoi | ✅ 6/11 | 100 l Sierra, 70 l Golf |
| Tempi del log con salita e discesa | 🟡 | rampe nel profilo e nei controlli; i tempi del log sono ancora a velocità di crociera |
| Piano di volo ICAO da presentare | ❌ | previsto (roadmap B) |
| Giorno aeronautico (effemeridi) | ✅ 7/11 | VDS: sorgere/tramonto ± 30 min (DPR 133/2010) entro il crepuscolo civile; PPL: crepuscolo civile (SERA); controllo del decollo e dell'arrivo |
| Rilievo vicino alla quota di crociera | ✅ 7/11 | pulsante sulla carta: rosso entro 100 ft o sopra, giallo entro 1000 ft |
| Tempo della rotta col vento previsto | ✅ 7/11 | stesso calcolo del piano di volo |
| Minimi personali del pilota | ✅ 7/11 | base nubi, visibilità, vento, raffiche, traverso contro METAR e TAF di partenza e arrivo |
| NOTAM sulla carta e nei controlli | ⛔ | serve una fonte autorizzata (ENAV/EAD): richiesta in corso |
| Attivazione zone (AUP/UUP) | ⛔ | condizioni d'uso EUROCONTROL da verificare |
| Carte di avvicinamento a vista (VAC) | ⛔ | AIP ENAV: solo collegamento alla fonte ufficiale |

## Carta

| Funzione | Stato | Note |
| --- | --- | --- |
| Carta 3D e 2D | ✅ | |
| Temi Giorno, Notte e Cabina | ✅ 7/11 | Cabina: stile dei navigatori di bordo, fondo nero e tasti scuri |
| Area coperta | ✅ 6/11 | Italia centrale (lat 40–45 N, lon 9,5–16 E), terreno a 90 m caricato a tessere |
| Località, strade, ferrovie, fiumi, laghi, vette | ✅ 6/11 | OpenStreetMap (ODbL), aggiornati ogni mese |
| Spazi aerei di tutti i tipi presenti in openAIP | ✅ | CTR, TMA, CTA, ATZ, R, P, D, TMZ, RMZ, parchi, attività sportive, FIR (Esperto) |
| Carta aeronautica ICAO 1:500.000 come sfondo | ⛔ | non disponibile con licenza compatibile |
| Ostacoli completi (cavi, elettrodotti) | ⛔ | serve eTOD di ENAV |

## Volo

| Funzione | Stato | Note |
| --- | --- | --- |
| Mappa mobile, avvisi davanti all'aereo, voce | ✅ | |
| Campi più vicini con distanza, rotta, tempo | ✅ 6/11 | pulsante «Campi vicini» |
| «Diretto a» | ✅ 6/11 | dai campi vicini |
| Area raggiungibile in planata | ✅ 7/11 | efficienza del manuale (Sierra 12,8), vento previsto, margine scelto dal pilota |
| Pulsante Emergenza | ✅ 7/11 | campi raggiungibili, «diretto», messaggio di soccorso compilato |
| Rilievo colorato rispetto all'aereo | ✅ 7/11 | spento a terra e vicino ai campi sotto 1000 ft |
| Vettore della traccia | ✅ 7/11 | 2 minuti, tacca a ogni minuto |
| Strumenti a scelta | ✅ 7/11 | 8 caselle, 23 dati |
| Tempo di volo, cronometro, promemoria | ✅ 7/11 | decollo e atterraggio dal GPS |
| Carburante stimato in volo | ✅ 7/11 | dal tempo di volo e dal consumo: stima, non misura |
| Diario dei voli | ✅ 7/11 | automatico, esportazione CSV |
| Liste di controllo | ✅ 7/11 | liste dell'Aeroclub dei Marsi per P96 Golf (Rev3) e P2002 Sierra I-A952 (V 1.0), trascritte dai documenti originali; liste personali; lista di emergenza personale |
| Orologio | ❌ | progetto in orologio.md |
| Distanza dalla rotta (fuori rotta) | ✅ 6/11 | |
| Registrazione della traccia e GPX | ✅ 6/11 | |
| Strumenti esterni (NMEA, GDL90) | 🟡 | NMEA via Bluetooth LE e USB; GDL90 decodificato ma non ancora collegato (serve il flusso binario o il Wi-Fi); moduli nativi Android da scrivere |
| Traffico (FLARM, ADS-B) sulla carta | 🟡 7/11 | FLARM $PFLAA/$PFLAU via Bluetooth LE e USB, filtro di quota, finestra d'allarme; GDL90 traffico decodificato, non ancora collegato |
| Promemoria legati ai punti | ✅ 7/11 | minuti prima, sopra, al traverso |
| Rivedere il volo | ✅ 7/11 | traccia contro terreno, limite VDS, spazi aerei, rotta e quote pianificate |
| Orari reali ai punti (ATO) e ritardi | ❌ | roadmap B3 |
| Funzionamento senza rete | ✅ 7/11 | dati, liste, radio, guida nel pacchetto dell'APK; meteo salvato usato con l'età ricalcolata; radar e previsioni richiedono rete |
| Aggiornamento automatico dell'app | ✅ 7/11 | controllo all'avvio e ogni 6 ore a terra, APK verificato con SHA-256, installazione confermata dal pilota; serve il canale pubblico (docs/rilasci.md) |
| Qualità grafica adattiva | ✅ 7/11 | risoluzione e dettaglio del terreno scalati in base alla fluidità; Alta, Media, Bassa a mano |
| Guida all'uso nell'app | ✅ 7/11 | leggibile senza rete |

## Che cosa resta di essenziale, in ordine di rischio

1. NOTAM e attivazioni: senza, il controllo degli spazi aerei è incompleto. Dipende da ENAV.
2. Dati ufficiali AIP (spazi aerei, aeroporti) al posto di openAIP.
3. Ostacoli completi (eTOD).
4. Tempi del log con salita e discesa, piano ICAO, ATO in volo.
5. Prove sul tablet in volo: GPS, leggibilità, batteria.
