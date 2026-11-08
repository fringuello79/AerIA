<!-- AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati. -->
# AerIA VFR

*Il nome unisce «aria» e IA (assistente intelligente, e le iniziali di Ivan e Alessandro). Fino alla 0.11.0 il
progetto si chiamava AirPlanning: gli identificativi interni (`it.airplanning.nav`, chiavi di memoria del
tablet, formato dei file di piano) restano invariati, così l'app si aggiorna senza perdere i dati salvati.*

Navigatore aereo per VDS, VDS avanzato e PPL/LAPL in VFR, pensato prima di tutto per l'Italia.
Obiettivi: spazi aerei in vero 3D, regole VDS (DPR 133/2010) calcolate in automatico, pianificazione e
piano di volo, assistente che controlla di continuo il volo pianificato e quello reale.

> **Ausilio supplementare, non mezzo primario di navigazione.** Il software è in sviluppo: non usarlo
> per volare. Ogni dato deve mostrare fonte, ciclo AIRAC e data di aggiornamento.

## Stato

Versione attuale: **0.20.0** (prototipo). Registro delle versioni: [CHANGELOG.md](CHANGELOG.md); come si rilascia: [docs/rilasci.md](docs/rilasci.md).

| Parte | Stato |
| --- | --- |
| App web 3D (fase 1) | Pianifica, Vola (GPS o simulazione), Radio; carta 3D o 2D; principiante ed esperto: [web-prototype/](web-prototype/) |
| Meteo | METAR, TAF e SIGMET; previsione ICON-2I in 3D (nubi, pioggia, vento) e nel profilo; radar della Protezione Civile: [docs/meteo.md](docs/meteo.md) |
| Strumenti esterni | NMEA (anche FLARM) via Bluetooth LE e USB; GDL90 decodificato ma non ancora collegato: [docs/dispositivi.md](docs/dispositivi.md) |
| Piano di volo | Modulo dell'Aeroclub dei Marsi compilato, stampa, JSON, GPX: [docs/piano-di-volo.md](docs/piano-di-volo.md) |
| Registro e piano di lavoro | [docs/roadmap.md](docs/roadmap.md) |
| Valutazione critica | Errori, verifiche e rischi aperti: [docs/valutazione-critica.md](docs/valutazione-critica.md) |
| Pacchetto dati Marsica e Fucino | Terreno Copernicus 90 m, spazi aerei, aeroporti, ostacoli e punti di riporto openAIP, geoide EGM96, incluso nell'app |
| Test automatici | 94 test su quote, terreno, rampe, geoide, regole VDS, spazi aerei, radio, meteo, strumenti e piano di volo: `npm test`; prove in Chrome: `tools/shot.py`, `tools/shot_centro.py` |
| App Android | Compilata da GitHub Actions a ogni modifica: [docs/android.md](docs/android.md) |
| Fonti dati e licenze | [docs/fonti-dati.md](docs/fonti-dati.md) |
| Richiesta dati ufficiali a ENAV (AIFS, NOTAM) | Email preparate, in attesa di invio e risposta |

## Struttura

```
docs/                 interfaccia, radio, Android, fonti dati, licenze
web-prototype/        app web (index.html + src/: geo, terrain, geoid, airspace, rules, radio, weather, forecast, altimetry, features, radar, navlog, navlogui, devices, app)
web-prototype/data/   pacchetti dati regionali pronti all'uso
android/              progetto Android (Capacitor) generato dall'app web
tests/                test automatici (node --test)
tools/                creazione dei pacchetti dati e prove con Chrome headless
data/                 file di dati originali in locale (esclusi da git)
```

## Provare il prototipo in locale

```
cd web-prototype
python3 -m http.server 8765
```
Apri http://localhost:8765: si carica da solo il pacchetto Marsica. Nel riquadro «Dati» si possono aggiungere
altri file di terreno (`.tif` Copernicus o `.hgt` SRTM) e spazi aerei (GeoJSON openAIP o OpenAir).

## Regole del progetto

- Solo fonti ufficiali o con licenza che ne permette l'uso; attribuzioni sempre visibili.
- I file di dati non entrano nel repository: hanno licenze proprie e sono pesanti.
- Nessun dato inventato presentato come reale: i dati dimostrativi sono sempre segnalati.
- Ogni funzione che calcola quote, limiti o avvisi va verificata contro valori attesi prima di essere usata.
