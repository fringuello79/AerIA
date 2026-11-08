<!-- AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati. -->
# Strumenti esterni (Bluetooth e USB)

## Perché

Il GPS del tablet ha un errore verticale di decine di metri e nessun sensore di pressione affidabile
in cabina. Un altimetro esterno o un GPS dedicato possono essere più precisi. Il programma li usa con
questa priorità:

1. **Quota**: barometrica dello strumento esterno (se ricevuta negli ultimi 5 secondi), corretta con il
   QNH; altrimenti GPS corretto per il geoide.
2. **Posizione, velocità, rotta**: GPS interno se avviato con «Avvia GPS», altrimenti GPS esterno.
3. **Controllo incrociato**: se quota barometrica e GPS differiscono di più di 300 ft, il programma
   avvisa di controllare il QNH (soglia scelta perché supera l'errore combinato tipico, vedi
   valutazione-critica.md §1).

## Protocolli

| Protocollo | Frasi o messaggi letti | Esempi di dispositivi |
| --- | --- | --- |
| NMEA 0183 | `$xxRMC` posizione, velocità, rotta · `$xxGGA` quota sul mare, satelliti · `$PGRMZ` altitudine di pressione · `$xxHDM/HDG/HDT` prua · `$PFLAA` traffico FLARM · `$PFLAU` stato e allarme FLARM | ricevitori GPS Bluetooth, FLARM e PowerFLARM, variometri, molti EFIS |
| GDL90 | heartbeat, ownship (posizione e altitudine di pressione), quota geometrica, traffico (messaggio 20) | ricevitori ADS-B (Stratux e simili) |

Ogni frase NMEA è accettata solo se il checksum è corretto; ogni messaggio GDL90 solo se il CRC è
corretto (algoritmo verificato con l'esempio della specifica FAA 560-1058-00).

## Collegamenti

| Collegamento | Dove funziona oggi | Note |
| --- | --- | --- |
| Bluetooth LE (servizio Nordic UART) | App Android (plugin @capacitor-community/bluetooth-le 8.3.0), Chrome su computer | Molti dispositivi NMEA usano questo servizio. |
| USB seriale | Chrome su computer (Web Serial) | Su Android serve un modulo nativo dedicato: **non ancora fatto**. |
| Bluetooth classico (SPP) | — | Molti FLARM e GPS più vecchi: serve un modulo nativo. **Non ancora fatto.** |
| Wi-Fi UDP (GDL90 porta 4000) | — | Il decodificatore c'è; serve il modulo nativo per ricevere UDP. **Non ancora fatto.** |

Il tasto «Prova con dati simulati» (modalità Esperto) genera frasi NMEA valide per provare tutta la
catena senza dispositivi; tutto ciò che ne deriva è indicato come «simulato».

## Permessi Android

Il plugin Bluetooth aggiunge `BLUETOOTH_SCAN` e `BLUETOOTH_CONNECT` (Android 12 e successivi) e i
permessi storici fino ad Android 11. La funzione Bluetooth LE è dichiarata non obbligatoria, quindi
l'app si installa anche su dispositivi senza Bluetooth.

## Da fare per primo, quando il tablet c'è

1. Elenco dei dispositivi che si vogliono usare (modello e collegamento): decide quale modulo nativo
   scrivere per primo (SPP, USB o UDP).
2. Registrazione di 10 minuti di frasi da ogni dispositivo: diventano dati di prova nei test.
