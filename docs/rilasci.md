<!-- AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati. -->
# Versioni e rilasci

## Numerazione

`MAJOR.MINOR.PATCH`, come in [Semantic Versioning](https://semver.org/lang/it/):

- **MINOR** (0.11.0, 0.12.0…): funzioni nuove o cambiamenti del comportamento (per esempio nuovi controlli).
- **PATCH** (0.10.1, 0.10.2…): correzioni, dati aggiornati, aggiustamenti senza funzioni nuove.
- **MAJOR 0**: prototipo, non per la navigazione. La 1.0.0 arriverà solo con dati ufficiali (AIP, NOTAM) e le prove
  in volo sul tablet completate (vedi roadmap.md).

Le versioni da 0.1.0 a 0.10.1 sono state assegnate a posteriori ai commit del 6 novembre 2026 (CHANGELOG.md).

## Come si fa un rilascio

1. Scrivere le novità in testa a `CHANGELOG.md` con il nuovo numero e la data (`## [0.11.0] - AAAA-MM-GG`).
2. Aggiornare lo stesso numero in `package.json` e in `web-prototype/src/version.js`.
3. Indicare nella voce precedente il commit da cui era stata creata (` · commit <sha completo>`).
4. Eseguire `npm test` (controlla che i tre numeri coincidano) e le prove in Chrome (`tools/shot.py`,
   `tools/shot_centro.py`, `tools/shot_tocchi.py` per i gesti col dito), poi commit e push su `main`.

Il workflow «App Android» poi, da solo:
- compila e controlla l'APK (`versionName` = versione + `+N`, `versionCode` = N, numero dell'esecuzione);
- crea le etichette `vX.Y.Z` mancanti sui commit indicati nel registro e sul commit attuale per la versione nuova;
- pubblica la pagina di rilascio su GitHub (Releases) con `AerIA-VFR-X.Y.Z.apk` e le note del registro,
  segnata come «pre-release» finché la versione inizia con 0;
- aggiorna il ramo `apk` con l'ultima compilazione.

Dove si vede la versione: barra in alto nell'app, stampa del piano di volo, file di piano (`app`), GPX (`creator`),
informazioni dell'app su Android.

## Etichette delle versioni precedenti

GitHub non permette al token dei workflow di creare etichette su commit che hanno una versione diversa dei file
dei workflow (`.github/workflows`). Il 6/11/2026 le etichette v0.2.0 … v0.10.1 sono state quindi create dalla pagina
web di GitHub (Releases → nuova pagina di rilascio con il commit del registro come destinazione), con il permesso di
Ale; tutte e 12 le etichette sono state poi controllate contro i commit di CHANGELOG.md.

Le versioni nuove non hanno questo problema: l'etichetta va sul commit attuale e la crea il workflow. Se un giorno
servisse di nuovo un'etichetta su un commit vecchio, si può rifare dalla pagina web oppure salvare tra i segreti di
Actions un token personale `RILASCI_TOKEN` (permessi «Contents» e «Workflows» in scrittura, solo questo repository):
il workflow lo usa se c'è.

## Aggiornamento automatico dell'app (dalla 0.18.0)

L'app installata sul tablet controlla, con la rete e a terra, all'avvio e ogni 6 ore, le versioni pubblicate su GitHub
(`web-prototype/src/update.js`). Se ne trova una più nuova la propone: «Scarica e installa» scarica l'APK, ne confronta
l'impronta SHA-256 con quella pubblicata e lo passa all'installatore di Android, che chiede sempre la conferma. Android
accetta l'aggiornamento solo se è firmato con la stessa chiave (quella di AerIA, vedi «Chiave di firma»): piani, profili e liste
salvati restano. La prima volta Android chiede il permesso «Installa app sconosciute» per AerIA VFR.

Le versioni si leggono dalla pagina dei rilasci del repository pubblico `fringuello79/AerIA`: nessuna chiave
nell'app. (Fino alla 0.19.x il codice stava nel repository privato `AirPlanning`, che resta come archivio.)

## Chiave di firma (dalla 0.20.0)

Gli APK sono firmati con la chiave privata di AerIA, che **non** sta nel repository. Fino alla 0.19.x si usava una
chiave di prova pubblica (`android/app/prova.keystore`, password «android»): con il repository pubblico chiunque
avrebbe potuto firmare un'APK che il tablet installava come aggiornamento di AerIA. Quella chiave è ritirata.

- Impronta SHA-256 del certificato: `android/firma-sha256.txt`. Il workflow controlla ogni APK: se la firma è diversa
  non lo pubblica.
- Segreti del repository (GitHub → Settings → Secrets and variables → Actions → New repository secret):
  - `AERIA_KEYSTORE_B64`: il file della chiave in base64 (una sola riga);
  - `AERIA_KEYSTORE_PASSWORD`: la password (alias della chiave: `aeria`).
- **Copia di sicurezza**: file della chiave e password vanno conservati da Ale fuori da GitHub (per esempio due
  copie offline). Se la chiave si perde, nessun tablet potrà più aggiornare l'app senza disinstallarla.
- Passaggio dalla vecchia chiave: sui tablet con la 0.19.x o precedenti bisogna **disinstallare AerIA e installare la
  0.20.0** una volta (Android rifiuta un aggiornamento firmato da un'altra chiave). Piani, profili, liste spuntate e
  diario salvati sul tablet si perdono: prima esporta i piani che servono (Piano di volo → file del piano).
