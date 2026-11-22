<!-- AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati. -->
# Registro delle versioni

Numerazione MAJOR.MINOR.PATCH (vedi [docs/rilasci.md](docs/rilasci.md)): MINOR per funzioni nuove, PATCH per
correzioni e aggiustamenti. Finché la versione inizia con 0 il programma è un prototipo: non usarlo per navigare.

Ogni versione indica il commit da cui è stata creata. Il repository pubblico `fringuello79/AerIA` riparte con la
0.20.0 (8/11/2026) da un solo commit: le versioni precedenti restano descritte qui, senza commit né pagina di rilascio. Il workflow «App Android» crea in automatico l'etichetta
(tag) `vX.Y.Z` su quel commit e, per la versione più recente, la pagina di rilascio su GitHub con l'APK.

## [0.23.1] - 2026-11-22

Dalla prova sul tablet di Ale: la posizione compariva un attimo e poi restava «persa», e il programma andava a
scatti. Correzioni misurate con la CPU rallentata 6 volte (come un tablet di fascia media).

### GPS
- **Posizione dal ricevitore GPS del tablet** con un modulo nativo (`PosizionePlugin.java`) invece che dalla WebView:
  una posizione al secondo, satelliti visti e usati, permessi, presenza del ricevitore. La posizione dalla rete arriva
  solo come ripiego, segnata «dalla rete». Nella pagina web resta la posizione del browser.
- **Il programma dice perché la posizione manca** (`gpsdiag.js`, con test): permesso solo «approssimativo» (Android dà
  allora una posizione ogni pochi minuti), permesso negato, tablet senza ricevitore GPS, posizione di Android spenta,
  in attesa dei satelliti (dopo un minuto con pochi satelliti: «serve il cielo libero»). Nel semaforo e nell'avviso
  grande, con il pulsante per aprire le impostazioni giuste.
- Prima della prima posizione si legge «In attesa della prima posizione», non «persa»; la voce non dice «persa» se una
  posizione non c'è mai stata.
- La richiesta di posizione della WebView non si riavvia più ogni 30 s senza posizione (ogni riavvio poteva far
  ripartire da capo la ricerca dei satelliti): si riavvia solo se resta muta, senza posizioni né errori, per 90 s.

### Fluidità
- **Terreno che arriva durante il volo o spostando la carta:** si rifanno solo gli spazi aerei sopra l'area nuova, e il
  resto si ridisegna a pezzi, un lavoro per fotogramma. Prima si ricalcolava tutto in un colpo: il blocco più lungo in
  volo simulato passa da 4,6 s a 1,3 s (CPU rallentata 6 volte). Le aree arrivate insieme si sommano (prima valeva solo
  l'ultima).
- **Spazi aerei:** le maglie condivise si costruiscono solo quando cambia ciò che è in vista; quando cambia soltanto
  l'evidenziazione (spazi davanti, vicini, dentro) si riscrive la trasparenza e si disegnano a parte solo quelli
  evidenziati.
- **Profilo davanti all'aereo:** dentro o fuori dagli spazi calcolato una volta lungo la linea (`insideAlong`, provato
  contro il calcolo punto per punto su 24 200 punti) e solo per gli spazi entro 10,5 NM: da 809 a 260 ms nella prova.
- **Previsione a 5 minuti:** solo gli spazi raggiungibili nel tempo della previsione (stesso risultato, meno lavoro).

### Diagnosi
- **Impostazioni → «Diagnosi (GPS e fluidità)»:** un rapporto da copiare con modello del tablet, versione di Android e
  della WebView, scheda grafica, qualità grafica, tempi dei fotogrammi e del passo di volo, attività lunghe, stato
  completo del GPS e diagnosi. Nessuna posizione nel testo.
- Prova automatica del GPS nativo e della diagnosi con un modulo finto: `tools/shot_gps.py`.

## [0.23.0] - 2026-11-20 · commit 84f0eb40a2fb233c804c0be0a78863b4c0dcdb94

Avvisi in volo più precisi e meno invadenti, discesa guidata, quote sicure. Regole nuove in `alerts.js` e
`descent.js`, con test a valori calcolati a parte; prove in Chrome in `tools/shot_023.py`.

### Spazi aerei in volo
- **Evidenza per quota:** si evidenziano gli spazi entro 5 NM e a meno di 1000 ft dalla quota dell'aereo (escono oltre
  6 NM o 1300 ft, così ai margini non lampeggiano); gli altri si attenuano. I limiti verticali sono scritti sul bordo
  più vicino all'aereo, anche nella carta 2D.
- **«Vicino»:** entro 2 NM dal bordo, con la quota dentro i limiti (o entro l'incertezza della quota), compare l'avviso
  con distanza, lato rispetto alla traccia, limiti, che cosa serve e frequenza; la voce lo dice una volta per volo.
  Per «Davanti» resta la previsione a 5 minuti.
- **Dentro uno spazio:** fra quanto se ne esce proseguendo diritto alla quota attuale.

### Terreno e avvisi
- **Avvisi di terreno regolabili** (Impostazioni → «Avvisi in volo»): margine (automatico 300 ft, 150 ft per il VDS non
  avanzato; oppure 150, 300, 500, 1000 ft), anticipo dell'avviso di attenzione (60, 90, 120 s) e «solo gravi».
  Il grave resta entro 60 s.
- **«Cinquecento»:** scendendo a 500 ft sopra il campo d'arrivo, entro 5 NM, la voce lo annuncia una volta (si riarma
  risalendo oltre 600 ft).
- **Tocco sull'avviso grande = conferma:** sparisce per 30 s e la voce non lo ripete; torna se cambia o peggiora.
  L'avviso «Posizione non aggiornata» si nasconde per un minuto.
- **GPS perso:** punto interrogativo rosso lampeggiante sull'aereo, niente vettore della traccia, rilievo non colorato
  (il colore senza posizione direbbe il falso). Il rilievo non si colora nemmeno senza quota.
- Voce del limite VDS: i piedi da scendere si arrotondano per eccesso (con 44 ft di troppo diceva «Scendi di 0 piedi»).
- L'avviso grande sta al centro della carta visibile e non finisce più sotto il pannello di destra.

### Discesa e quote
- **Discesa guidata verso il campo d'arrivo** (ultimo punto della rotta o «Diretto» su un campo): punto d'inizio
  discesa per arrivare alla quota di circuito sopra il campo con il rateo del profilo dell'aereo, lungo la rotta che
  resta. Casella «Discesa per l'arrivo» (prima: fra quanto si inizia; dopo: sul profilo, sopra o sotto) e voce
  «Inizio discesa tra un minuto» e «Inizia la discesa». Tace se un tratto più avanti chiede di salire.
- **«Rateo per l'arrivo»** con lo stesso obiettivo e la distanza lungo la rotta (prima in linea retta e sempre +1000 ft);
  rosso se serve più di una volta e mezza il rateo pianificato. Anche «All'arrivo» e l'autonomia contano la rotta che
  resta.
- **Caselle «Quota sicura qui»** (1000 ft sopra il rilievo e gli ostacoli più alti entro 5 km) e **«Quota sicura sulla
  rotta»** (il minimo più alto dei tratti che restano, come in pianificazione).
- **«Sopra il terreno» onesto:** con l'incertezza della quota scritta accanto; «incerto» quando l'incertezza è almeno
  metà dell'altezza.

### Altro
- **Campi vicini filtrati per pista minima** (qualsiasi, 300 … 1000 m) e lunghezza della pista in ogni riga; i campi
  senza lunghezza nei dati restano, segnati «pista non nota».
- **Colonna d'aria in volo:** rotta magnetica, distanza e tempo dall'aereo al punto toccato.
- Caselle degli strumenti: il testo intero compare anche come suggerimento (per i valori lunghi).

## [0.22.0] - 2026-11-20 · commit 42be5d8b7ca1c3e5acdd5cfc177c604a840f4d7e

Collaudo critico della 0.21.0 e studio dei navigatori di riferimento: correzioni di sicurezza e fluidità, più funzioni
nuove. Ogni correzione è stata riprodotta prima e verificata dopo (test automatici e prove in Chrome).

### Sicurezza in volo
- **Il GPS non si spegne più da solo.** Prima un solo «timeout» (20 s senza posizione, frequente col tablet sotto il
  parabrezza) fermava tutta la navigazione. Ora solo il permesso negato ferma il GPS; altrimenti il programma resta in
  ascolto e, se dopo 30 s non arriva nulla, riavvia la richiesta.
- **Posizione vecchia sempre dichiarata.** Dopo 3 s senza posizione gli strumenti diventano grigi; dopo 10 s compare
  «Posizione non aggiornata da N s», gli avvisi previsti si sospendono (prima restavano fermi e sembravano attuali) e la
  voce lo dice. Un GPS esterno che manda frasi «non valide» non ripresenta più la vecchia posizione come nuova.
- **Semaforo di integrità** in vista Volo: posizione (età e precisione), quota (fonte e precisione), dati (ciclo AIRAC,
  terreno dettagliato presente), tablet (batteria, orologio confrontato col GPS). Verde, giallo, rosso; tocco = dettaglio.
- **GPS esterno muto:** si passa da soli al GPS del tablet e si torna all'esterno appena riprende.
- **Prossimo punto corretto su ogni rotta.** Il tratto attivo ora ha memoria: sulle rotte a U e di andata e ritorno il
  programma indicava un punto già passato e non calcolava il fuori rotta. Passaggio al tratto successivo entro 0,5 NM,
  oltre la bisettrice della virata o già allineati sul tratto nuovo (anche con la virata anticipata). Tocco su una casella
  degli strumenti: «Tratto precedente» e «Tratto successivo».
- **Spazi aerei con limiti dubbi sempre nei controlli.** 46 spazi (tra cui la zona regolamentata LI-R319 Rieti e una zona
  proibita) avevano nella fonte il tetto sotto il terreno ed erano esclusi da disegno e avvisi. Ora il tetto si legge, per
  prudenza, sopra il terreno: si vedono, danno avvisi e sono segnati «limite incerto».
- **Quote dei punti che seguono la crociera.** Scrivendo la crociera cifra per cifra il programma alzava i punti alle
  quote intermedie e li lasciava lì (crociera 5500, primi tratti a 2700 ft). Ora un punto alzato al minimo torna a
  seguire la crociera: la quota è sempre la più alta tra crociera e minimo del tratto.
- **Livelli di volo con la formula ISA esatta** al posto dei 27 ft/hPa fissi (errore fino a 55 ft a FL 105 con QNH alti),
  anche per l'altitudine di pressione degli strumenti esterni, il traffico e la velocità vera.
- **Data locale** al posto di quella UTC (tra mezzanotte e l'una il programma proponeva il giorno prima); «Luce
  restante» in volo calcolata sul giorno vero, non sul campo «Data».
- GPS esterno: una frase GGA senza quota non vale più «0 ft» (falso allarme di terreno).

### Avvisi
- **Avvisi sonori e a voce nell'app Android.** La WebView di Android non ha la sintesi vocale del web: fino alla 0.21.0
  l'app restava muta. Ora usa la voce di Android (serve la voce italiana installata). Un avviso grave suona due toni,
  interrompe le frasi in corso e parla subito; con «Voce» acceso si sente una prova.
- **Orizzonti del terreno e degli ostacoli:** grave entro 60 s, attenzione entro 120 s, oltre nulla (prima 5 minuti in
  linea retta: troppi falsi allarmi in valle). La previsione segue la virata in corso. Gli spazi aerei restano a 5 minuti.
- **Un solo avviso principale**, per priorità: terreno e ostacoli, limite VDS, spazi aerei.
- **«Ho l'autorizzazione» / «In contatto»** su uno spazio aereo in volo: niente più voce né banda rossa per quello
  spazio in questo volo; l'avviso resta in elenco.

### Fluidità
- **Spazi aerei senza ricostruzioni:** la geometria di ogni spazio si calcola una volta. In volo i blocchi più lunghi
  passano da 470 a 135 ms (su computer), il 95 % dei passi da 388 a 88 ms; un tocco sulla carta non ricostruisce più
  tutto (da circa 0,4 s a pochi millisecondi).
- **Campi numerici** (crociera, QNH): si ricalcola alla conferma o dopo 0,8 s di pausa, non a ogni cifra (scrivere
  «4500» bloccava l'app 3,1 s, ora circa 1 s una volta sola).

### Novità
- **Liste di controllo a pagine:** una sezione per pagina (anche i sottotitoli, per esempio «Controlli motore» e
  «Controlli esterni»), mai l'inizio della sezione dopo. Si sfogliano di lato col dito o con le frecce; la barra delle
  pagine mostra le sezioni complete; a pagina completata si passa da soli alla successiva.
- **Consigliere di quota** («Scegli la quota di crociera…»): per ogni quota terreno, limite VDS, spazi aerei da
  chiamare o evitare, tempo, carburante, vento e livello semicircolare VFR; ★ = quota suggerita; un tocco la applica.
- **Pronto al volo?** (tocco sul semaforo, a terra): terreno della rotta presente senza rete, problemi della rotta,
  carburante, peso, meteo, NOTAM, voce.
- **Fondovalle nel profilo:** il terreno più basso entro 1 NM dalla rotta (linea verde), per vedere le vie di fuga in
  montagna.
- **Colonna d'aria in scala:** quota che cresce verso l'alto, fasce numerate con nome e limiti alla loro quota, elenco
  nello stesso ordine (dall'alto in basso). In volo la finestra si chiude da sola dopo 30 s, salvo «Tieni aperta».
- **Carta di volo:** torna da sola sull'aereo dopo 30 s senza tocchi.

### Interfaccia
- Tempi senza ambiguità: «24 min», «1 h 05», «4′30″» (prima «0:24» e «11:10» si confondevano).
- Virgola decimale negli avvisi e nelle distanze.
- Bersagli tattili più grandi (caselle 22 px, pulsanti da 40–48 px, «già in volo» non più di 13 px).
- Barra in alto intera anche col tablet in verticale e sul telefono; «Prototipo» sempre visibile.
- Etichette della carta e del profilo che non si sovrappongono (resta la più importante).
- «Sali sul campo» solo quando la partenza è un campo; altrimenti «sopra il punto di partenza».

## [0.21.0] - 2026-11-08 · commit ae567db531fd7361fa2ecd71a4382f8577af3eed

### Sostegno
- **Cuore «Sostieni AerIA»** nella barra in alto, a destra dell'ingranaggio: apre una finestra con il grazie volontario
  via PayPal e la pagina del progetto su GitHub (anche per una stella). «Diventa sponsor» (GitHub Sponsors) compare solo
  quando il profilo sponsor sarà attivo. Si apre solo a richiesta; il programma funziona allo stesso modo per tutti.
  Resta anche la voce «Un caffè per AerIA» in fondo alle Impostazioni.

## [0.20.1] - 2026-11-08 · commit 5812d0b40809a90ce31123ba381b169115cb7cf5

- Tutela della paternità del programma (© fringuello79, tutti i diritti riservati, vedi COPYRIGHT.md); icone ricompresse.

## [0.20.0] - 2026-11-08 · commit 044b9c6be8278fb53dc724bdcac52fb60efed0a0

Pronto per il repository pubblico.

### Sicurezza
- **Nuova chiave di firma privata**, fuori dal repository (segreti di GitHub); ritirata la chiave di prova pubblica
  con cui chiunque, a repository pubblico, avrebbe potuto firmare un falso aggiornamento di AerIA. Il workflow controlla
  l'impronta di ogni APK prima di pubblicarlo. **Una sola volta**: sui tablet con la 0.19.x disinstallare e installare
  la 0.20.0 (prima esportare i piani che servono).

### Sostegno
- Voce discreta **«Un caffè per AerIA»** in fondo alle Impostazioni, chiusa: un grazie volontario via PayPal, senza
  obblighi; il programma funziona allo stesso modo per tutti.

### Documenti
- Tolto il documento di visione con il confronto con altri programmi; tolti riferimenti a servizi non usati.

## [0.19.1] - 2026-11-08
Correzioni dopo la prova di Ale della 0.19.0.

### Volo
- **Carta libera in volo**: se ruoti, sposti o ingrandisci la carta col dito, resta dove l'hai portata anche quando
  arrivano nuove posizioni GPS (prima tornava subito sulla prua). Un tocco senza movimento non la sgancia.
- **Pulsante col mirino** sotto la bussola (solo in «Volo»): arancio quando la carta è libera; toccandolo la carta
  torna sull'aereo con la prua in alto, alla distanza scelta col dito. Entrando in «Volo» la carta segue l'aereo.

### Spazi aerei in 3D
- **Limiti sopra il terreno (AGL) che seguono il rilievo**: la superficie di un limite AGL (per esempio i parchi
  «SFC–3300 ft AGL») ora è calcolata punto per punto anche all'interno dello spazio, non solo sul bordo. Prima era
  piatta alla quota del bordo + 3300 ft e le cime interne la bucavano: la Riserva del Monte Velino stava sotto la
  vetta. Non era l'esagerazione verticale, che vale uguale per terreno e spazi (il profilo lo mostrava giusto perché
  usa il terreno sotto la rotta).
- Il tetto si taglia a «Spazi fino a» solo se è in quota assoluta (MSL o FL), mai se è AGL.
- Spazi un poco più visibili (pareti e cielo più marcati); verde dei parchi più acceso, distinto dal terreno.

### Meteo
- Colonne di pioggia prevista dal terreno vero del punto (il modello meteo ha un rilievo più liscio). Nubi, METAR e
  SIGMET erano già in quota sul livello del mare, con la stessa scala verticale del terreno.

### Altro
- Prova automatica tools/shot_0191.py.

## [0.19.0] - 2026-11-08
Terreno 3D a tessere, partenza e arrivo a terra, ordine dei punti, spazi aerei alti nascosti (indicazioni di Ale).

### Carta 3D
- **Terreno a livelli di dettaglio** (src/lod.js), come nei motori cartografici: tessere da 1° che si dividono in 4
  vicino a dove si guarda, fino a 1/16° (celle di 80–110 m). Si aggiornano anche mentre la carta si muove, poche per
  fotogramma, e restano in memoria. Prima il dettaglio fine copriva solo un riquadro attorno al centro, aggiornato a
  carta ferma: fuori restava la griglia da 1,2 km, con un **bordo netto** (segnalato da Ale fuori dalla Marsica).
- Bordi «a gonna» tra tessere di livello diverso (niente fessure), luce continua tra le tessere, colori da tabella.
- Ricerca della quota più veloce (indice per cella di 1°): serve a ogni tessera e ai controlli.
- **Spazi aerei in tre maglie condivise** (tranne quelli evidenziati o selezionati): disegni per fotogramma da circa 630
  a 100–230. Il tocco li distingue lo stesso.
- **Spazi fino a**: nella legenda sulla carta (e nelle impostazioni, ora anche in modalità base) si nascondono gli spazi
  che iniziano più in alto: «crociera + 2500 ft» (predefinito), 5000, 7500, 10000, 12000 ft, tutti. Con la crociera a
  3500 ft la CTA Roma Z4 Marsica (FL 125–FL 195) non copre più gli spazi sotto. Restano sempre nei controlli.
- **Spazi sovrapposti**: il tocco sceglie il più basso; un altro tocco nello stesso punto passa a quello sopra; il
  pannello dice «1 di N» e li elenca.

### Rotta
- **Partenza e arrivo sempre a terra**: alla quota del campo (openAIP) o del terreno del punto, anche se il punto non
  è un campo dell'elenco. Casella «a terra» per scrivere la quota vera (per esempio Celano 2260 ft: openAIP dice 2241).
  All'arrivo il profilo scende alla quota di circuito e poi atterra (prima finiva 1000 ft sopra il campo).
  Eccezione: casella «già in volo» sulla partenza (piano fatto in volo).
- **Ordine dei punti**: frecce su e giù in ogni riga della lista; «Partenza» nei risultati della ricerca e «Come
  partenza» nella colonna d'aria.
- **Un punto si sposta solo trascinandolo**: si muove di quanto si muove il dito (non salta sotto il dito) e solo dopo
  6 pixel; un secondo dito durante il trascinamento lo annulla e rimette il punto dov'era (prima il punto saltava sotto
  il secondo dito). Nel profilo il nodo selezionato va toccato proprio (30 pixel) per trascinarlo.

### Altro
- Prove: tests/lod.test.js, partenza/arrivo a terra in tests/vprofile.test.js, tools/shot_019.py.
- Misure in docs/motore-3d.md (confronto con i motori cartografici tipo MapLibre).

## [0.18.4] - 2026-11-08
Attendibilità dei dati: il programma dice sempre quanto sono vecchi e cosa non ha (domanda di Ale sui NOTAM).

### Avvisi
- **Ciclo AIRAC**: le modifiche all'AIP entrano in vigore ogni 28 giorni. Per il giorno del volo il programma
  calcola il ciclo in vigore e lo confronta con la data in cui sono stati scaricati gli spazi aerei: stesso ciclo →
  informazione (ciclo, prossimo cambio); un ciclo indietro → «Da controllare»; due o più → «Da risolvere».
  Esempio con i dati di oggi (scaricati il 6/11, ciclo 2611): un volo dal 26/11 avvisa che vale il ciclo 2612.
- **NOTAM e attivazioni delle zone (AUP/UUP) non caricati**: ora è un avviso «Da controllare» in ogni rotta, con
  il rimando al briefing ufficiale ENAV, non più una nota in fondo.
- **Spazi aerei attraversati senza modifiche alla fonte da oltre 2 anni**: informazione con la data dell'ultima
  modifica (in zona molti risultano fermi al 24/04/2023).
- Dati dimostrativi: avviso rosso «Dati dimostrativi, non reali».
- Scheda «Senza rete»: ciclo AIRAC dei dati installati e ciclo in vigore oggi.

### Aggiornamento dei dati
- Workflow «Dati aeronautici» (ogni venerdì e a richiesta): scarica gli export openAIP Italia, rigenera il
  pacchetto Italia centrale, elenca le differenze (spazi nuovi, tolti, limiti, confini, frequenze; campi, ostacoli,
  punti) con tools/confronta_dati.py e le propone in un ramo da approvare. Non cambia mai i dati da solo.

### Altro
- Nuovo modulo freshness.js con test sulle date AIRAC note (2001, 2413, 2501, 2601, 2611, 2613, 2701); prova
  automatica tools/shot_0184.py.
- docs/fonti-dati.md: fonti NOTAM valutate l'8/11/2026.

## [0.18.3] - 2026-11-08
### Piano di volo
- **Carburante a bordo** su una riga sua, ben etichettata, con autonomia e margine sul minimo (volo, alternato,
  riserva) o «mancano N l». Prima stava sulla stessa riga dell'autonomia del T.O.F. e non si capiva.
- **Riepilogo in alto a destra aggiornato subito**: il piano di volo ora si calcola sempre, non solo quando la sua
  scheda è aperta; il riepilogo mostra «Carburante» (volo e minimo con alternato e riserva) e «A bordo» (litri,
  autonomia, margine). L'avviso «Carburante insufficiente» compare anche in Pianifica.

### Carta
- **Niente più tratteggio sovrapposto alla rotta** (muovendo la carta i trattini sembravano scorrere): dietro le
  montagne resta una traccia tenue e continua.
- **Una sola freccia piccola per tratto** (prima una ogni 20 km circa).

### Altro
- Prova automatica tools/shot_0183.py; tools/shot_novita.py con data e ora di decollo fisse (non dipende più dal giorno).

## [0.18.2] - 2026-11-07
Rotta di nuovo dritta e sopra le montagne, nodi del profilo che si muovono con la loro casella (indicazioni di Ale).

### Pianificazione
- **Rotta dritta**: tra due punti la rotta è di nuovo una linea dritta alla quota pianificata (la 0.18.1 la faceva
  seguire il rilievo disegnato: tolto).
- **Mai dentro le montagne**: ogni tratto passa almeno 500 ft sopra il rilievo più alto entro 600 m dalla sua linea
  (SERA.5005 f) chiede 500 ft entro 150 m: il programma guarda 600 m per prudenza). Se non è così, il programma alza la
  quota del punto quanto basta e lo segnala (prima controllava solo il terreno sui punti, 300 ft).
- **Salita sul campo / discesa sul campo**: se dopo il decollo (o prima dell'arrivo) la salita (o la discesa) in linea
  passerebbe a meno di 500 ft dal rilievo, il programma propone di prendere quota sopra il campo prima di partire (o di
  scendere sopra il campo d'arrivo), la disegna come tratto verticale sul campo e la segnala.
- **La quota di un punto si raggiunge sul punto**, anche in salita (prima la salita cominciava sul punto): il nodo del
  profilo sta alla quota della sua casella. Se il rateo dell'aereo non basta, tratteggio rosso e avviso.
- **Profilo**: tolte le maniglie blu della 0.18.1. Si tocca il nodo di un punto (si evidenzia, con nome e quota), poi
  lo si trascina su o giù: si muovono il nodo e le linee verso i vicini, e la casella della lista cambia insieme,
  anche durante il trascinamento. Non scende sotto il minimo del rilievo. Il campo di partenza resta a terra
  (trascinandolo si cambia la quota dopo il decollo); il campo d'arrivo non si trascina.
- Corretto un blocco della pagina nel calcolo del profilo (arrotondamento nella fine della salita); il calcolo ora ha
  anche un limite di sicurezza che impedisce qualsiasi blocco.

## [0.18.1] - 2026-11-07
Correzioni dopo la prova di Ale: profilo, aereo e scia, rotta mai dentro il terreno, liste da ogni schermata, comandi
del volo in una riga, schermo sempre acceso.

### Pianificazione
- **Profilo altimetrico**: ogni tratto ha una maniglia blu a metà che segue il dito. Il primo tocco (maniglia, tratto o
  punto) seleziona il tratto; poi lo si trascina da qualunque punto sopra il tratto, senza dover centrare il pallino.
  Prima i pallini di partenza e d'arrivo (sul campo) e quelli all'inizio di una salita non si muovevano, perché la loro
  quota non è quella del tratto: sembrava che il trascinamento non funzionasse. Al minimo la scritta lo dice.
- **Rotta 3D mai dentro il terreno**: la linea segue i triangoli del terreno disegnato, con un punto ogni mezza maglia,
  e resta sempre almeno 60 ft sopra (solo disegno: i controlli usano il terreno vero e i tratti troppo bassi restano
  rossi). Prima i segmenti dritti tra punti lontani tagliavano le creste.

### Volo
- **Aereo**: prua girata dolcemente verso la direzione del volo e posizione che scorre tra una posizione GPS e l'altra.
- **Scia** dell'aereo sulla carta (tasto «Scia», acceso o spento, ricordato), sempre appena sopra il terreno.
- **Comandi in una riga** sotto la carta, sopra il profilo: la carta non è più coperta dai tasti.
- **Schermo sempre acceso** con l'app aperta (Android: FLAG_KEEP_SCREEN_ON), non solo in volo.

### Liste di controllo
- Tasto **«Liste»** in alto, in ogni schermata; le liste si aprono in una finestra propria con la **scelta dell'aereo**
  (è la stessa del piano di volo).

### Altro
- Prova automatica tools/shot_0181.py.

## [0.18.0] - 2026-11-07
Liste di controllo dell'Aeroclub dei Marsi, aggiornamento automatico, uso completo senza rete, 3D adattivo per i
dispositivi vecchi, verifica dei dati con correzione delle regole sbagliate.

### Correzioni di regole (verifica dei dati del 7/11/2026, dettagli in docs/verifica-dati.md)
- **Limite VDS 1000 ft ogni giorno**: RAIT Ed. 4 Rev. 4 (12/06/2025), RAIT.5005 d)2)i, fino a 1000 ft sul rilievo più
  alto entro 5 km, salvo autorizzazione ENAC. Il programma usava ancora il testo del 2010 del DPR 133/2010 (500 ft nei
  feriali) e dava avvisi «scendi» sbagliati. Nuova scelta «500 ft: zona VDS con limite di 500 ft» (RAIT.5005 d)2)ii).
- **Margine dal terreno**: conta il rilievo più alto entro 150 m dalla rotta (raggio di SERA.5005 f)), così una vetta
  accanto alla linea non sfugge (scarto trovato fino a 41 m sul Corno Grande nel punto esatto della cima). Il programma
  che prepara il pacchetto ora alza anche il blocco del terreno che contiene la vetta.
- **Spazi aerei** (SERA.6001, RAIT.6005 b)): classe A vietata al VFR; classe E senza autorizzazione; ATZ non
  controllate = zona radio obbligatoria, senza autorizzazione. Prima si chiedeva l'autorizzazione per tutti.
- **Meteo**: le categorie IFR/MVFR sono una convenzione della fonte, non i minimi di legge; ora gli avvisi citano i
  valori di SERA.5001 (1500 m in classe G) e SERA.5005 b) (CTR: 1500 ft e 5 km per decollo e atterraggio).
- **Notte per il PPL**: fine del crepuscolo civile (definizione di SERA), non più «tramonto + 30 min»; per il VDS
  resta il ± 30 minuti del DPR 133/2010, senza uscire dal crepuscolo civile.
- **Fraseologia**: alfabeto, numeri, chiamata e MAYDAY sono in SERA.14020, 14035/14040, 14055 e 14095 (prima citati
  come articoli RAIT inesistenti); ostacoli: citazione di SERA.5005 f) corretta; MSA del log indicata come criterio.
- **Ostacoli senza altezza**: torri, antenne e ciminiere 300 m (prima 200 m: esistono tralicci più alti); pale eoliche
  200 m.
- **Campi con dati dubbi** (LIRZ, LIRH, LIRE, LIRF, LIRM, LIRG, LIAF, LIBP, LIRU): openAIP differisce da un'altra fonte
  pubblica; avviso informativo «da verificare sull'AIP» quando la rotta passa vicino. Nessun dato cambiato.

### Volo
- **Liste di controllo dell'Aeroclub dei Marsi**: P96 Golf (Rev3 del 23/08/2026) e P2002 Sierra I-A952 (V 1.0 EN del
  22/10/2026), trascritte in automatico dai documenti originali (tools/make_checklists.py): stesse voci, stesso ordine,
  stessi colori, tabella del motore e delle velocità, «Chiudere il piano di volo». Non si modificano nell'app; restano
  le liste personali. Accanto a qualche valore una nota del programma «da verificare» (unità della pressione del
  carburante del Golf, Vne del Sierra, numeri ARO).

### App
- **Aggiornamento automatico**: con la rete e a terra l'app controlla all'avvio e ogni 6 ore le versioni pubblicate,
  scarica l'APK, ne verifica l'impronta SHA-256 e lo passa all'installatore di Android (conferma del pilota). In volo
  non controlla. Canale pubblico con le sole versioni: fringuello79/AerIA-aggiornamenti (vedi docs/rilasci.md).
- **Senza rete**: tutto il necessario è nel pacchetto installato; il meteo usa l'ultima copia salvata con l'età
  ricalcolata (i METAR scaduti non entrano nei controlli). Impostazioni → «Aggiornamenti e uso senza rete».
- **Guida all'uso** dentro l'app, leggibile senza rete.
- **Qualità grafica** (Impostazioni → Carta): «Automatica» misura la fluidità mentre si muove la carta e abbassa
  risoluzione e dettaglio del terreno quando il dispositivo non regge, poi li rialza; oppure Alta, Media, Bassa.

### Altro
- Prove automatiche: tools/shot_018.py (anche con tutta la rete bloccata), 145 test.

## [0.17.0] - 2026-11-07
Minimi personali, promemoria sui punti, traffico FLARM, liste di controllo, revisione del volo, punti da selezionare
prima di spostarli, «Annulla», tema «Cabina».

### Pianificazione
- **Un punto si sposta solo dopo averlo selezionato**: il primo tocco su un punto della carta (o sulla maniglia di
  quota) lo seleziona e lo evidenzia con un anello arancio, senza muoverlo; solo un punto selezionato si trascina. Un
  tocco altrove sulla carta lo deseleziona (anche il tasto Esc). Così un tocco successivo non sposta più un punto per
  sbaglio.
- **Profilo altimetrico con la stessa regola**: il tocco su un pallino del profilo lo seleziona ed evidenzia il tratto
  («trascina in su o in giù»); poi lo si trascina per cambiare la quota; un tocco altrove sul profilo lo deseleziona.
- **«Annulla l'ultima modifica»** (sulla carta, nella lista dei punti e con Ctrl+Z): torna indietro di una modifica alla
  rotta alla volta (spostamento, quota, punto aggiunto o tolto, rotta cancellata), fino a 50 passi.
- **LIAH** si trova anche nella ricerca come aviosuperficie di Celano, come indicato dall'Aeroclub dei Marsi. Il codice
  non compare nelle fonti pubbliche consultate: vale solo per la ricerca e non cambia regole, avvisi o fraseologia.
- **Minimi meteo personali** (pannello «Pilota e aereo»): base delle nubi, visibilità, vento, raffiche e vento al
  traverso, confrontati con il METAR attuale e con il TAF all'ora di decollo e di arrivo. Nuovo lettore dei TAF (gruppi
  FM, BECMG, TEMPO, PROB): le condizioni prevalenti fuori dai minimi sono «da risolvere», quelle temporanee o probabili
  «da controllare». I valori iniziali sono proposte da sostituire con i propri; il traverso parte da quello dell'aereo.

### Volo
- **Promemoria sui punti** (pannello Tempi): «minuti prima di», «sopra» o «al traverso di» un punto della rotta, con
  voce e vibrazione, una volta per volo.
- **Traffico FLARM** dalle frasi `$PFLAA` e `$PFLAU`: frecce sulla carta con la quota relativa in centinaia di piedi,
  filtro di quota (impostazioni, «Strumenti esterni»), finestra d'allarme con «Mostra», «Sospendi 5 min», «Chiudi» e
  voce; gli allarmi di `$PFLAU` (anche ostacoli e zone di allerta) hanno la precedenza. Decodificato anche il traffico GDL90 (messaggio 20), non ancora collegato: manca la ricezione del flusso binario.
- **Liste di controllo** per aereo (pulsante «Liste»): voci spuntabili, lista seguente, ricomincia; una lista con
  «emergenza» nel titolo si apre dal pannello Emergenza. Il programma non contiene liste: le voci si copiano dal
  manuale dell'aereo.
- **Rivedi il volo** dopo l'atterraggio: traccia sulla carta (verde, arancio o rossa dove ci sono superamenti), grafico
  quota-tempo con terreno, quota pianificata e limite VDS, cursore per ripercorrere il volo, elenco dei superamenti
  (margine dal terreno lontano dai campi, limite VDS, zone vietate o regolamentate, spazi controllati non pianificati,
  fuori rotta, scostamento dalla quota pianificata).

### Aspetto
- **Tema «Cabina»** (accanto a Giorno e Notte): fondo nero, finestre con cornice in rilievo, didascalie azzurre in
  maiuscolo, valori a cifre fisse, tasti scuri in rilievo come quelli dei navigatori di bordo, campi neri con bordo
  azzurro.

### Altro
- Rilascio: due invii con lo stesso numero di versione non danno più errore.
- Prove automatiche: tools/shot_novita.py.

## [0.16.1] - 2026-11-07
Icona rifinita.

### Aspetto
- La rotta magenta è un arco a curvatura costante che arriva orizzontale alla coda dell'aereo; aereo un po' più
  arretrato, alla stessa altezza.
- «AerIA» inciso piccolo nella parte bassa del massiccio, in corsivo inclinato e in salita, con una scia; «IA» magenta.

## [0.16.0] - 2026-11-07
Volo più sicuro: emergenza, rilievo colorato, giorno aeronautico, tempi e carburante. Idee nate dallo studio dei
manuali di altri navigatori e di un orologio per piloti, riscritte da zero per AerIA VFR (vedi docs/funzioni.md).

### Sicurezza in volo
- **Rilievo colorato rispetto alla quota dell'aereo**: rosso dove il terreno arriva a meno di 100 ft sotto la quota
  (o la supera), giallo tra 100 e 1000 ft sotto. Calcolato dalla scheda grafica, senza rallentare la carta.
- **Niente falsi allarmi al decollo e all'atterraggio**: a terra nessun avviso di terreno o ostacolo; entro 2 NM da un
  campo e sotto 1000 ft sul campo restano solo gli avvisi gravi e il rilievo non si colora.
- **Pulsante «Emergenza»**: campi raggiungibili in planata (arrivo sul campo con almeno 500 ft) in ordine di quota
  d'arrivo, «diretto» al migliore con un tocco, messaggio di soccorso già compilato nell'ordine del RAIT.14095
  (ente, nominativo, posizione in parole rispetto alla località più vicina, quota, prua dal sensore esterno o dalla rotta
  corretta col vento; ente e frequenza in uso o 121.5; squawk 7700).
- **Planata con vento e margine**: l'area raggiungibile e la quota d'arrivo sui campi tengono conto del vento previsto
  in quota (ICON-2I, o il vento medio del METAR più vicino, mai la raffica), della velocità vera alla quota e di un
  margine di prudenza scelto dal pilota (predefinito 20 %). Dove il terreno non è noto la planata si ferma.
- **La previsione davanti all'aereo segue la salita o la discesa** misurata dal variometro (salita al 75 %, al massimo
  1500 ft/min, per 2 minuti; discesa per intero, per 1 minuto, mai sotto la quota del campo vicino): niente allarmi di
  terreno durante una salita regolare né in finale, avvisi prima se si scende verso il rilievo.
- VDS non avanzato: l'attenzione per il terreno scatta sotto 150 ft (più l'incertezza della quota) invece di 300 ft,
  perché per norma vola a 500 ft sul rilievo e riceveva avvisi continui.
- **Vettore della traccia**: linea tratteggiata davanti all'aereo fino a dove sarà tra 2 minuti, con tacca a ogni minuto.
- **Carburante stimato in volo** dal tempo di volo e dal consumo: avvisi se si entra nella riserva o se non basta per
  l'arrivo (stima, non misura: lo dice anche l'app).
- **Promemoria periodico** (es. carburante e serbatoi ogni 30 min), a voce e con vibrazione dove possibile; può partire
  da solo al decollo.

### Giorno aeronautico
- Sorgere e tramonto del sole (calcolo astronomico, verificato entro 1 minuto con una libreria indipendente) e giorno
  aeronautico da 30 min prima del sorgere a 30 min dopo il tramonto (AIP Italia ENR 1.1), in ora italiana.
- Controllo del piano: decollo prima dell'alba aeronautica o arrivo dopo la fine del giorno (grave per il VDS, da
  verificare per il PPL senza abilitazione notturna); avviso se la riserva porterebbe oltre. Senza ora di decollo
  l'app dice entro che ora partire.

### Strumenti di volo
- **Caselle a scelta**: si tocca una casella della barra e si sceglie il dato tra 23 (tempo e ora al prossimo punto e
  all'arrivo, variometro, rateo per arrivare a 1000 ft sul campo, luce restante, tempo di volo, promemoria, carburante,
  precisione del GPS, QNH del METAR più vicino, vento previsto, ora UTC…). Le scelte restano nel dispositivo.
- **Tempi**: tempo di volo automatico, cronometro, promemoria, carburante al decollo (dal piano di volo o scritto qui).
- **Diario dei voli automatico**: decollo e atterraggio riconosciuti dal GPS (oltre 40 kt per 10 s; sotto 25 kt per
  20 s e a meno di 300 ft dal terreno, così un forte vento contrario in volo non sembra un atterraggio), con campi,
  orari UTC, durata, quota massima e distanza; esportazione CSV.
- Schermo acceso durante il volo, dove il sistema lo consente.

### Pianificazione
- **Rilievo vicino alla quota di crociera** (nuovo pulsante sulla carta): stessi colori del volo, per vedere dove non si
  passa prima di partire.
- Tempo della rotta nel nastro e nel riepilogo **col vento previsto** (stesso calcolo del piano di volo), non più solo
  ad aria calma.

### Correzioni
- In volo un avviso di terreno «attenzione» nascondeva quello grave che veniva dopo sulla stessa traiettoria (e lo
  stesso per gli ostacoli): ora compaiono entrambi.
- La rotta seguita in volo era mostrata in gradi veri: ora è magnetica (come la bussola e il piano di volo).
- La voce non ripeteva l'avviso di terreno grave se prima c'era stato quello di attenzione.
- Spazi aerei in volo: l'avviso «vicino al limite» nascondeva quello di ingresso che veniva dopo.

Tutti i calcoli nuovi sono stati controllati da una revisione indipendente (sole confrontato con un'altra libreria,
planata ricalcolata a mano); i problemi trovati sono corretti in questa versione.

## [0.15.2] - 2026-11-07
Icona ricomposta.

### Aspetto
- L'aereo è il disegno dell'ultraleggero I-6195 fornito dall'autore, senza sfondo e più piccolo.
- Rotta e aereo passano sopra il massiccio: salita dolce da sinistra, fine salita, crociera livellata.
- Montagne più basse (rilievo esagerato 2 volte invece di 2,8), con le stesse ombre, neve e luce del tramonto.

## [0.15.1] - 2026-11-07
Icona ridisegnata.

### Aspetto
- Icona, icona adattiva e immagini di avvio: il massiccio del Velino visto dal lato ovest di Magliano de' Marsi,
  con Monte Sevice, Monte Velino e Monte Cafornia. Il profilo delle creste è calcolato dal modello del terreno
  Copernicus e poi stilizzato (rilievo esagerato, neve con canaloni, luce del tramonto da ovest, luci del paese).
- Rotta VFR al posto della rampa: decollo dalla piana, salita dolce, punto di fine salita, crociera livellata.
- Aereo: ultraleggero biposto ad ala bassa visto di fianco (tettuccio a bolla, deriva a freccia, carrello
  triciclo carenato, elica in rotazione), con la fascia magenta della rotta.

## [0.15.0] - 2026-11-07
Fraseologia radio secondo le norme ENAC, nuova icona.

### Radio
- Schede riscritte sul Regolamento ENAC «Regole dell'aria Italia» Ed. 4 Rev. 4 e sul suo Allegato A, con la fonte
  sotto ogni scheda e l'indicazione «modello» dove la norma fissa solo l'ordine dei dati.
- **Chiamate all'aria** (RAIT.6005 d)) sui campi senza ente e in rotta, a tutte le stazioni, sul canale **130.005**
  (dal 1° gennaio 2026); il 130.000 dei dati openAIP è mostrato come canale 130.005.
- **Avaria radio**: «trasmissione all'aria», messaggio ripetuto due volte, variante «per avaria al ricevitore»,
  squawk 7600 e procedura VFR di SERA.14083 (in vigore dal 1° maggio 2025). Tolto «trasmetto alla cieca».
- VDS avanzato: «ULTRALEGGERO» prima del nominativo completo nelle chiamate in italiano (RAIT.14050 g)).
- Chiamate agli enti: risposta dell'ente con i due nominativi al posto di «avanti», «richiediamo», read-back con
  nominativo alla fine, «entrate nella zona di controllo…»; MAYDAY e PAN PAN nell'ordine del RAIT.14095.
- Nuova scheda **«Come si pronunciano i tuoi dati»**: nominativo con l'alfabeto ICAO, quota, QNH, frequenze.

### Aspetto
- Nuova icona (montagne al tramonto, rotta magenta, aereo) per Android, immagine di avvio e scheda del browser.
- «by fringuello79» sotto il nome nella barra e in «Informazioni e licenze».

## [0.14.0] - 2026-11-07
Aspetto professionale, comandi propri, licenze e firma.

### Interfaccia
- Barra dell'applicazione scura con schede sottolineate; caratteri di sistema (Roboto su Android, Segoe UI su Windows,
  San Francisco su iPad) al posto dei caratteri scaricati; angoli quasi squadrati, bordi sottili, icone disegnate
  apposta per AerIA VFR al posto dei simboli tipografici.
- **Campi modificabili bianchi** con bordo marcato e leggera ombra interna, anche nel tema notte (più chiari del
  pannello); i valori di sola lettura sono testo semplice. Pannelli grigio chiaro per far risaltare i campi.
- **Nastro della rotta** nella barra: distanza, tempo, carburante di volo (consumo dell'aereo, senza riserva) e avvisi.
- Riepilogo degli avvisi a tabella, avvisi a righe con barra di colore, elenco dei punti con intestazione di colonna.

### Comandi
- **Colonna d'aria** (pressione lunga sulla carta): sezione verticale del punto, dal terreno a FL 195, con gli spazi
  aerei sovrapposti come fasce, il limite VDS e la quota pianificata del tratto più vicino; accanto i dati del punto.
- **Cestino**: compare in basso mentre si trascina un punto; lasciandolo lì il punto si toglie.
- I punti nuovi prendono il primo nome «Pn» libero (prima potevano esserci due «P3»).

### Altro
- Icona dell'app e immagine di avvio originali (prima quelle predefinite del modello Android).
- Licenze delle librerie incluse nell'app (`LICENZE-TERZE-PARTI.txt`) e pagina «Informazioni e licenze» con le
  attribuzioni richieste dai dati.

## [0.13.0] - 2026-11-07
Modifica della rotta col dito.

### Nuovo
- **Quote dal profilo verticale**: si tiene premuto un punto (o un tratto) del profilo e lo si sposta in su o in giù;
  la quota del tratto cambia a passi di 100 ft, la si legge accanto al dito, e non scende sotto il minimo di 300 ft
  sul terreno. Carta 3D ed elenco dei punti si aggiornano.
- **Piega della rotta**: trascinando la linea della rotta si inserisce un punto in quel tratto; lasciando un punto
  sopra quello vicino lo si toglie (dalla 0.14.0: sul cestino).
- **Pannello del punto** (dalla 0.14.0 «Colonna d'aria»): pressione lunga sulla carta (tasto destro col mouse). Mostra coordinate, quota del terreno,
  limite VDS del giorno, distanza dalla rotta, spazi aerei sovrapposti dal basso con quote, regola e frequenza, campi
  vicini. Le azioni sono «in fondo», «inserisci nella rotta» (nel punto che allunga meno il percorso), «centra» e,
  in volo, «diretto qui».

### Correzioni
- **Tablet: la tastiera si chiudeva subito** toccando la quota di un punto. Quando la tastiera si apriva, lo schermo
  cambiava dimensione e l'app ridisegnava l'elenco dei punti, così il campo perdeva il fuoco. Ora l'elenco (e il piano
  di volo) non si ridisegna mentre si scrive. Toccando il campo il valore si seleziona e «Invio» conferma.
- Quota scritta limitata a 500–19 500 ft: prima si poteva inserire per errore un numero qualunque.

## [0.12.0] - 2026-11-07
Interfaccia più rapida, compatta e leggibile.

### Prestazioni
- La carta si ridisegna solo quando cambia qualcosa: a carta ferma 3 ridisegni in 5 secondi invece di circa 300.
- Corretta una perdita di memoria grafica: ogni spostamento della carta lasciava geometrie e immagini in memoria
  (da 300 a 2278 dopo sei spostamenti; ora restano 308). Era la causa principale dei blocchi dopo un po' d'uso.
- Terreno d'insieme più leggero (39 % di triangoli in meno; vicino alla vista resta il dettaglio a 90 m), densità
  dei pixel al massimo 1,5, ritaglio del terreno senza ricompilare gli shader, etichette in cache.
- Lavori pesanti (dettaglio del terreno, ridisegno dell'area) uno per fotogramma e solo a carta ferma.
- Digitare quota, QNH o data produce un solo ricalcolo (prima uno per tasto: da 28 blocchi a 2).

### Interfaccia
- Carta a tutto schermo; pannelli «Volo e rotta» e «Avvisi» sopra la carta, a larghezza fissa, richiudibili; il centro
  della carta resta nel mezzo dello spazio libero. Su schermi stretti i pannelli partono chiusi.
- Intestazione compatta: viste, «bolla» con distanza, tempo e numero di problemi (tocco = apre gli avvisi), impostazioni.
  Livello, tema, opzioni della carta, strumenti esterni, collegamenti e dati sono nel foglio «Impostazioni».
- Comandi della carta a destra: zoom, 3D/2D, inquadra la rotta (anche sul tablet in verticale), nord in alto.
- Campi del volo in griglia compatta; punti di rotta a righe fisse con rotta magnetica, distanza e tempo di ogni tratto.
- Avvisi raggruppati in «Da risolvere», «Da controllare», «Informazioni»: titolo e due righe, tocco per il testo intero,
  pulsante ◎ che mostra il punto sulla carta e nel profilo.
- Profilo verticale richiudibile.

### Carta
- Rotta magenta spessa con bordo (linee in pixel, leggibili a ogni distanza), tratteggio dove il rilievo la nasconde,
  tratti rossi nel terreno e arancio sotto 500 ft, frecce di direzione, etichette dei tratti (rotta magnetica, NM, minuti).
- Parete trasparente dalla rotta al terreno (3D): si vede subito quanto si è alti sul rilievo.
- Punti come cerchi a dimensione fissa (pieni per partenza e arrivo), maniglia blu della quota, nomi con la quota.
- Aereo come sagoma gialla a dimensione fissa, orientata come la traccia.
- Spazi aerei con pareti sfumate e cielo quasi trasparente; bordo superiore spesso per quelli che contano per la rotta.
- Luce da nord-ovest (convenzione delle carte in rilievo), cielo sfumato, tinte del terreno più tenui.

## [0.11.1] - 2026-11-06
Nuovo nome: **AerIA VFR** (prima AirPlanning).

- Nome nell'app (icona, barra in alto, stampa del piano di volo, file di piano e GPX), nella pagina web e nei documenti.
- APK di prova `AerIA-VFR-prova.apk` (ramo `apk`) e pagine di rilascio `AerIA-VFR-X.Y.Z.apk`.
- Repository rinominato in `fringuello79/AerIA`; i vecchi indirizzi GitHub vengono reindirizzati.
- Invariati gli identificativi interni (`it.airplanning.nav`, chiavi di memoria, formato `airplanning-piano`):
  l'app si aggiorna sopra la precedente senza perdere piani, profili degli aerei e traccia, e i file di piano
  salvati prima restano leggibili.

## [0.11.0] - 2026-11-06
### Sicurezza
- **Nessun punto di virata dentro il terreno**: ogni punto deve stare almeno 300 ft sopra il terreno. Se un punto
  aggiunto, spostato o una quota scritta o trascinata lo porterebbe più in basso, la quota del tratto viene alzata
  (mai abbassata) al minimo, arrotondato ai 100 ft, e la modifica compare negli avvisi. Fanno eccezione i campi di
  partenza e arrivo. Il cono blu non scende sotto il minimo; sotto ogni punto si vede «min».
- La quota minima si calcola sul terreno dettagliato (90 m): finché non è caricato si aspetta, per non alzare troppo
  con la griglia d'insieme.

## [0.10.2] - 2026-11-06
Gestione delle versioni.

- Versione visibile nell'app (barra in alto), nella stampa del piano di volo, nei file di piano e nei GPX.
- Registro delle versioni (questo file) dalla 0.1.0; etichette `vX.Y.Z` e pagine di rilascio create da GitHub Actions.
- APK con nome di versione preso da `package.json`; le compilazioni intermedie hanno il suffisso `+N`.
- Test di coerenza tra `package.json`, app e registro delle versioni.

## [0.10.1] - 2026-11-06
### Correzioni
- Vette accettate fino a 300 m sopra il modello del terreno (prima 80 m), alzando il blocco più alto entro
  circa 180 m: il modello Copernicus sottostima le torri di roccia di oltre 100 m (Corno Grande Vetta Orientale
  2798 contro 2903 m, Monte Procinto 957 contro 1173 m). Scelta prudente.

## [0.10.0] - 2026-11-06
### Nuovo
- Pacchetto **Italia centrale** (lat 40–45 N, lon 9,5–16 E): terreno Copernicus a 90 m a tessere caricate solo
  dove servono, cime corrette con le vette OpenStreetMap, località, strade, ferrovie, fiumi e laghi; 690 spazi aerei,
  276 campi. Ricostruito ogni mese da GitHub Actions dalle fonti ufficiali (workflow «Pacchetto dati»).
- **Rampe di salita e discesa** (TOC/TOD) al posto dei gradini, nel profilo, nella rotta 3D, nei controlli e nella
  simulazione; allarme quando la rampa incontra il rilievo.
- **Punti trascinabili** sulla carta (2D e 3D) e quota del tratto trascinabile (cono blu, 3D).
- **Ricerca** di campi, punti di riporto, radioassistenze, località e vette.
- **In volo**: campi vicini con planata, «diretto a», area raggiungibile in planata, distanza dalla rotta, traccia GPX.
- Vento sulle piste dal METAR e limite al traverso dell'aereo; capacità dei serbatoi nei controlli.
- Dati dei manuali di P2002 Sierra e P96 Golf nei profili di riferimento.
- APK firmato con una chiave di prova fissa: si aggiorna senza disinstallare.

### Correzioni
- Quota dei pacchetti «massimo per blocco» letta senza interpolazione (prima poteva scendere sotto la cima).

## [0.9.0] - 2026-11-06
- Quota per tratto (vista Pianifica e piano di volo).
- Profili di riferimento dell'Aeroclub dei Marsi dal piano compilato AQ01 → BO09; LEG = minuti del tratto;
  riserva in litri; orari UTC o locali. Trovate le differenze del piano compilato (T.O.W. 587,4 kg, due tempi).

## [0.8.0] - 2026-11-06
- Piano di volo sul modello cartaceo dell'Aeroclub dei Marsi: log con vento e prue magnetiche, ETO, alternato,
  carburante, peso e centraggio, quota minima di sicurezza, stampa A4, salvataggio JSON, GPX.

### Correzioni
- Distanze e rotte calcolate con il grado di latitudine all'equatore (errore dello 0,5 %): ora ellissoide WGS84.

## [0.7.0] - 2026-11-06
- Radar della Protezione Civile: pioggia osservata sul terreno, riflettività in quota (Esperto), avvisi sulla rotta.
- Legenda richiudibile.

## [0.6.0] - 2026-11-06
- Aeroporti, aviosuperfici, ostacoli, punti di riporto e radioassistenze (openAIP).
- Limite dei 5 km dagli aeroporti per il VDS non avanzato, traffico sulle aviosuperfici, ostacoli negli avvisi.
- Chiamate radio di partenza e arrivo sulle aviosuperfici.

## [0.5.0] - 2026-11-06
- Fascia di incertezza negli avvisi («vicino al limite», «potresti entrarci»).
- Quota vera dell'altimetro dalla temperatura del modello; controllo del QNH impostato.

## [0.4.0] - 2026-11-06
- Previsione 3D dal modello ICON-2I: nubi, pioggia, vento, zero termico; vento per tratto; avvisi.

## [0.3.0] - 2026-11-06
- Carta 2D; grafica meno confusa; METAR, TAF e SIGMET; quota GPS corretta per il geoide (circa 155 ft in Marsica);
  strumenti esterni NMEA e GDL90 via Bluetooth LE e USB; collegamenti alle fonti ufficiali.

## [0.2.0] - 2026-11-06
- Viste Pianifica, Vola e Radio; modalità Principiante ed Esperto; tema giorno e notte.
- Pacchetto dati «Marsica e Fucino» incluso; prima app Android (APK di prova da GitHub Actions).

## [0.1.0] - 2026-11-06
- Prototipo: vista 3D di terreno e spazi aerei, rotta con profilo verticale, controlli di spazi aerei, terreno e
  limiti VDS, festività; prova con dati reali Copernicus e openAIP.
