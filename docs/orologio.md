<!-- AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati. -->
# AerIA VFR al polso: progetto dell'app per l'orologio

Stato: progetto (7/11/2026). Nasce dallo studio del manuale di un orologio per piloti e dei navigatori che lo collegano
al tablet. Le funzioni qui sotto sono riscritte per AerIA VFR; nomi, schermate e comandi sono nostri.

## A che cosa serve

L'orologio non sostituisce il tablet: è un **secondo schermo** sempre in vista e un **ricevitore di riserva** se il tablet
si spegne, si surriscalda o perde il GPS. Le decisioni di sicurezza restano nel codice a regole del tablet; l'orologio
mostra e fa vibrare.

## Funzioni, in ordine di utilità

| # | Funzione | Da dove arrivano i dati | Senza tablet |
| --- | --- | --- | --- |
| 1 | **Prossimo punto**: nome, rotta magnetica, distanza, tempo; freccia di correzione rispetto alla rotta | tablet | dal piano caricato prima del volo |
| 2 | **Avvisi a vibrazione**: terreno, spazio aereo, limite VDS, promemoria (carburante e serbatoi), fine del giorno aeronautico | tablet | solo promemoria e quota |
| 3 | **Campo più vicino e «diretto»** con un tasto lungo, anche in emergenza; campi raggiungibili in planata | tablet | elenco dei campi copiato nell'orologio, planata ad aria calma |
| 4 | **Messaggio di soccorso** a scorrimento (posizione in parole, quota, prua, 7700) | tablet | coordinate e quota dell'orologio |
| 5 | **Quota e variometro** barometrici dell'orologio, con QNH impostato dal tablet; avviso di quota (vibrazione a una quota scelta, utile per il limite VDS) | orologio | sì |
| 6 | **Tempi**: tempo di volo, cronometro, promemoria; luce restante (tramonto + 30 min) | tablet o orologio | sì |
| 7 | **Traccia di riserva** registrata dall'orologio e unita al diario dei voli del tablet dopo l'atterraggio | orologio | sì |
| 8 | Ora UTC e ora locale, sorgere e tramonto | orologio | sì |

## Come si collegano tablet e orologio

Molti orologi si abbinano ufficialmente solo a uno **smartphone**, non a un tablet (vale per vari modelli Wear OS): non
possiamo contare sull'abbinamento del sistema. La strada più sicura è un **collegamento Bluetooth a basso consumo diretto
tra le due app**:

- AerIA VFR sul tablet pubblica un piccolo servizio Bluetooth LE (modulo nativo Android, da scrivere: oggi l'app usa il
  Bluetooth solo per leggere strumenti esterni);
- l'app dell'orologio si collega, legge lo **stato compatto** una volta al secondo e riceve gli avvisi come notifiche;
- prima del volo il tablet copia nell'orologio piano, campi vicini alla rotta e QNH, così l'orologio funziona da solo.

Funziona con orologi Wear OS (app in Kotlin) e con orologi Garmin che accettano applicazioni Connect IQ (linguaggio
Monkey C, che ha accesso al Bluetooth LE sui modelli recenti). Prima di scrivere codice bisogna leggere e accettare le
condizioni del kit di sviluppo della piattaforma scelta e controllare che il modello di Ale abbia Bluetooth LE
programmabile, barometro e GPS.

### Stato compatto (proposta, versione 1)

Testo JSON breve, sotto i 512 byte, in unità del pannello (ft, kt, NM, gradi magnetici):

```json
{ "v": 1, "t": 1794045600, "lat": 42.12, "lon": 13.42, "alt": 6500, "agl": 2934, "gs": 95, "trk": 311,
  "nxt": { "n": "P2", "brg": 318, "nm": 5.0, "ete": 189 }, "xtk": -0.4,
  "warn": [{ "lvl": "crit", "k": "terrain", "s": 60, "txt": "Terreno tra 1 minuto. Sali." }],
  "near": { "n": "Celano", "brg": 119, "nm": 7.4, "glide": false }, "light": 362, "fuel": { "l": 41, "min": 126 } }
```

`warn` contiene al massimo 2 avvisi (i più gravi e vicini); `light` e `fuel.min` sono minuti; `glide` dice se il campo
è raggiungibile in planata con il margine scelto.

## Che cosa serve da Ale

- Marca e modello dell'orologio (o di quello che si vuole usare), per scegliere la piattaforma.
- Se in volo c'è anche uno smartphone, o solo il tablet.

Firma: fringuello79 di Avezzano.
