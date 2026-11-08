<!-- AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati. -->
# App Android

L'app Android usa lo stesso codice della versione web (Capacitor 8.5.3) e il GPS del dispositivo.
Contiene il pacchetto «Italia centrale» (e quello più piccolo «Marsica e Fucino» di riserva): carta, terreno,
spazi aerei e campi funzionano senza connessione. Meteo, radar e collegamenti ufficiali richiedono la rete.

## Come viene compilata
A ogni modifica su `main` e dopo ogni aggiornamento del pacchetto dati, GitHub Actions (`.github/workflows/android.yml`):
1. prende il pacchetto «Italia centrale» dal ramo `pacchetti` (terreno e base cartografica, workflow «Pacchetto dati»);
2. esegue i test automatici (`npm test`);
3. copia l'app web nel progetto Android (`npx cap sync android`);
4. compila l'APK (`./gradlew assembleDebug`) e controlla che contenga app, pacchetti e permesso GPS;
5. lo pubblica tra gli «Artifacts» del workflow e nel ramo `apk` (file `AerIA-VFR-prova.apk`).

Versione: 0.10.N, dove N è il numero dell'esecuzione di GitHub Actions. Ogni APK nuovo ha un numero più alto ed è
firmato con la chiave di AerIA, privata e fuori dal repository (vedi [rilasci.md](rilasci.md), «Chiave di firma»), quindi **si installa sopra il precedente
senza perdere piani, profili degli aerei e traccia salvati sul tablet**. Il passaggio dalla vecchia chiave di prova
(0.19.x e precedenti) richiede una sola reinstallazione.

Dalla 0.11.1 l'app si chiama **AerIA VFR** (prima AirPlanning), ma l'identificativo Android resta `it.airplanning.nav`:
la nuova versione si installa sopra la vecchia e sostituisce l'icona, senza disinstallare. L'identificativo si potrà
cambiare una sola volta, prima della pubblicazione su Google Play (richiederà una nuova installazione).

## Come installarla sul tablet
1. Copia sul tablet il file `AerIA-VFR-prova.apk` (da questa chat, da email o da GitHub: ramo `apk`).
2. Toccalo dall'app File (o dai Download).
3. Android chiede di consentire l'installazione da questa fonte: consenti, solo per l'app che stai usando.
4. Apri AerIA VFR. In «Vola» → «Avvia GPS» consenti l'accesso alla posizione, «mentre usi l'app».
5. La prima apertura richiede qualche secondo: il terreno dettagliato si carica a tessere solo dove serve.

Requisiti: Android 7 o successivo (WebView aggiornata, serve `DecompressionStream`: Chrome/WebView 80 o successivi).
Spazio occupato: circa 45 MB.
