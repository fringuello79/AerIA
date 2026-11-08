<!-- AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati. -->
# Istruzioni per Claude su questo repository

- Lingua: italiano per documenti, interfaccia e messaggi di commit.
- Il software è un ausilio di navigazione: l'attendibilità dei dati viene prima di ogni funzione.
- Non inventare mai dati aeronautici. I dati dimostrativi devono essere segnalati come inventati, in rosso, ovunque compaiano.
- Usa solo fonti ufficiali o con licenza compatibile (vedi docs/fonti-dati.md). Non estrarre dati da siti che non lo consentono.
- I file di dati reali non vanno nel repository (vedi .gitignore).
- Ogni calcolo di quote, limiti VDS o avvisi va verificato contro valori attesi (tools/make_test_data.py, tools/shot.py) prima del commit.
- Le decisioni di sicurezza (avvisi, limiti, conflitti) le prende codice a regole verificabile; un modello linguistico può solo spiegare e riassumere.
- Versioni: ogni rilascio aggiorna CHANGELOG.md, package.json e web-prototype/src/version.js con lo stesso numero (procedura in docs/rilasci.md).
