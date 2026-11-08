<!-- AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati. -->
# Principi dell'interfaccia

Obiettivo: un navigatore che un pilota esperto ma poco pratico di informatica usa senza manuale,
e che non distrae nei momenti di carico di lavoro.

## Scelte e motivazioni

| Scelta | Perché | Fonte |
| --- | --- | --- |
| Due livelli: **Principiante** ed **Esperto** | Il principiante vede solo ciò che conta alla sua quota, testi semplici e tasti grandi; l'esperto ha tutti i controlli e i testi tecnici | Linee guida human factors per EFB (FAA/Volpe, *Human Factors Considerations in the Design and Evaluation of EFBs*) |
| Tasti grandi: circa 9 mm a terra, circa 15 mm in volo | Con vibrazioni e dispositivo portatile gli errori di tocco calano molto aumentando la dimensione | Avsar, Fischer, Rodden, *Target size guidelines for interactive displays on the flight deck*, Università di Nottingham |
| Carta a tutto schermo con pannelli a larghezza fissa sopra di essa, richiudibili | La carta è lo strumento principale; i pannelli non cambiano dimensione col contenuto, quindi niente si sposta | Progetto AerIA VFR |
| Barra dell'applicazione scura, caratteri di sistema (Roboto, Segoe UI, San Francisco), angoli quasi squadrati | Aspetto da strumento professionale, coerente con il sistema del tablet; nessun carattere da scaricare | Progetto AerIA VFR |
| Campi modificabili bianchi con bordo marcato; valori di sola lettura come testo semplice | Si capisce a colpo d'occhio che cosa si può cambiare | Linee guida di usabilità (affordance dei campi) |
| Nastro della rotta nella barra: distanza, tempo, carburante, avvisi | I numeri del volo sempre visibili; un tocco apre gli avvisi | Progetto AerIA VFR |
| Spazi aerei filtrati per quota ed evidenziati se toccati dalla rotta | Meno disordine senza nascondere nulla che conti | Progetto AerIA VFR |
| Rotta magenta con parete trasparente fino al terreno, rossa o arancio dove è troppo bassa | Il magenta è il colore convenzionale della rotta attiva; la parete mostra subito l'altezza sul rilievo | Convenzione della strumentazione aeronautica; parete: progetto AerIA VFR |
| Avvisi a tre livelli, brevi, ciascuno con «mostra sulla carta» | Prima ciò che va risolto, poi ciò che va controllato; un tocco porta al punto sulla carta e nel profilo | Progetto AerIA VFR |
| Avvisi a tempo («tra 1:40 entri in…») | Il tempo all'evento è più utile della distanza | Linee guida sugli avvisi di prossimità |
| Avvisi vocali in italiano | Gli occhi restano fuori dalla cabina | Pratica comune negli EFB |
| Tema **Giorno** ad alto contrasto come predefinito, tema **Notte** scuro | In cabina, con il sole, i temi scuri si leggono male | Linee guida di leggibilità per display in luce solare |
| Colori con significato fisso | Rosso = proibito/critico, arancio = regolamentato/attenzione, blu = controllato, verde = parco | Convenzioni delle carte aeronautiche |
| Ogni dato mostra la fonte; i dati dubbi sono segnalati | Fiducia calibrata: il pilota sa quanto credere a ciò che vede | Principio di progetto AerIA VFR |
| Disegno su richiesta, nessun lavoro pesante mentre si sposta la carta | Fluidità e batteria sul tablet | Pratica dei motori cartografici |
| Rilievo colorato rispetto a una quota: rosso entro 100 ft o sopra, giallo entro 1000 ft | Si vede a colpo d'occhio dove non si passa; spento a terra e vicino ai campi per non avere tutto rosso al decollo e all'atterraggio | Pratica degli avvisi di terreno nei navigatori; soglie del progetto AerIA VFR |
| Pulsante **Emergenza** rosso, sempre nella barra di volo | Nel momento peggiore un solo tocco: campi raggiungibili, «diretto», messaggio di soccorso già compilato | Progetto AerIA VFR |
| Caselle degli strumenti scelte dal pilota con un tocco | Ognuno vola guardando dati diversi; nessun menu di impostazioni da cercare | Progetto AerIA VFR |
| Nessun ridisegno dei campi mentre si scrive | Sul tablet l'apertura della tastiera ridimensiona lo schermo: un ridisegno farebbe chiudere la tastiera | Problema trovato provando l'app sul tablet |

## Gesti sulla carta e sul profilo

| Gesto | Effetto |
| --- | --- |
| Tocco su un punto e trascinamento | Sposta il punto; vicino a un campo o a un punto di riporto si aggancia |
| Trascinamento della linea della rotta | Piega il tratto con un nuovo punto |
| Punto trascinato sul cestino (compare in basso) | Toglie il punto |
| Maniglia blu sopra un punto (3D) | Cambia la quota del tratto |
| Punto o tratto del profilo, in su o in giù | Cambia la quota del tratto a passi di 100 ft, mai sotto 300 ft dal terreno |
| Pressione lunga sulla carta (tasto destro col mouse) | **Colonna d'aria**: sezione verticale del punto con terreno, spazi aerei sovrapposti, limite VDS e quota pianificata; azioni «in fondo», «inserisci», «centra», «diretto» |

## Le schede

1. **Pianifica**: data, apparecchio, quota, QNH, rotta sulla carta; profilo verticale; avvisi.
2. **Volo**: GPS del dispositivo o simulazione lungo la rotta; 8 caselle di strumenti a scelta; vettore della traccia; rilievo colorato; profilo «davanti a te» per 10 NM; avvisi a tempo e a voce; **Emergenza**, **Tempi** (tempo di volo, cronometro, promemoria, carburante stimato, diario), campi vicini.
3. **Radio**: le chiamate del volo già compilate con nominativo, tipo, rotta, quota e QNH (vedi [radio.md](radio.md)).
4. **Piano di volo**: log di navigazione, carburante, peso e centraggio, stampa (vedi [piano-di-volo.md](piano-di-volo.md)).

## Prossimi passi
- Prova sul tablet Lenovo con piloti dell'aeroclub, a terra e poi in volo con un secondo navigatore a bordo.
- ~~Strumenti di volo che cambiano al tocco; posizione in parole («5 miglia a nord di Celano»)~~ (0.16.0); avvisi basati
  sulla traiettoria con evidenziazione dello spazio sulla carta.
- ~~Schermo sempre acceso durante il volo~~ (0.16.0, dove il sistema lo consente); luminosità automatica nell'app Android.
- Avviso a finestra con tre scelte: chiudi, mostra, sospendi per qualche minuto.
