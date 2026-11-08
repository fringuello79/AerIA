<!-- AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati. -->
# Componenti e dati di terze parti

Tutto il codice non elencato qui (app web, regole, strumenti in Python, test, flussi di GitHub Actions, icone e simboli
disegnati) è originale di AerIA VFR, © 2026 fringuello79 (Avezzano). Le librerie elencate sono usate senza modifiche
e secondo le loro licenze; i testi completi delle licenze sono in `web-prototype/LICENZE-TERZE-PARTI.txt`, incluso
anche nell'APK e raggiungibile dall'app («Impostazioni → Informazioni e licenze»). Caratteri: quelli del sistema del
dispositivo (nessun carattere incluso). Icona dell'app e immagine di avvio: originali (2026); il profilo delle creste è calcolato dal modello del terreno Copernicus già incluso (stessa attribuzione), con tools/make_icon.py; l'aereo è un disegno fornito dall'autore (tools/icona-aereo.png).

| Componente | Versione | Licenza | Dove |
| --- | --- | --- | --- |
| three.js | 0.160.0 | MIT | web-prototype/three.module.min.js, OrbitControls.js, lines/ (linee spesse: Line2, LineMaterial, LineGeometry, LineSegments2, LineSegmentsGeometry) |
| geotiff.js | 2.1.3 | MIT; include pako (MIT e Zlib), LERC di Esri (Apache 2.0), float16, parse-headers, quick-lru, zstddec (MIT), web-worker (Apache 2.0), xml-utils (CC0) | web-prototype/geotiff.js |
| @capacitor-community/bluetooth-le | 8.3.0 | MIT | app Android, Bluetooth LE |
| egm96 (Python, solo per creare il pacchetto) | 0.3.0 | MIT | tools/make_geoid.py |
| egm96-universal (solo per la verifica, non incluso) | 1.1.1 | MIT | valori di riferimento in tests/geoid.test.js |

Dati inclusi nel repository:

| Dato | Licenza | Dove |
| --- | --- | --- |
| Geoide EGM96 (NGA) | Dominio pubblico (governo USA) | web-prototype/data/marsica/geoid.json |
| Declinazione WMM2025 (NOAA/NGA) | Dominio pubblico | web-prototype/data/marsica/declination.json (creata con pygeomag, MIT; verificata con magvar, MIT, non inclusa) |
| Aeroporti, punti di riporto, radioassistenze (openAIP) | CC BY-NC 4.0 | web-prototype/data/marsica/features.json |
| Ostacoli (openAIP da OpenStreetMap) | ODbL 1.0, «© OpenStreetMap contributors»; la banca dati derivata resta ODbL | web-prototype/data/marsica/features.json |
| Liste di controllo P96 Golf (Rev3) e P2002 Sierra I-A952 (V 1.0) | Documenti dell'Aeroclub dei Marsi, forniti dal vicepresidente il 7/11/2026 per l'uso nell'app | docs/checklist/ (originali), web-prototype/src/checklists-acm.js (trascrizione) |
| Campione METAR/TAF/SIGMET del 6/11/2026 (NOAA AWC) | Dominio pubblico (governo USA) | tests/fixtures/, solo per i test |
| Campione ICON-2I del 6/11/2026 (ItaliaMeteo-ARPAE via Open-Meteo) | CC BY 4.0 | tests/fixtures/, solo per i test |
| Ritaglio radar SRI e CAPPI_2 del 6/11/2026 (Radar-DPC) | CC BY-SA 4.0 | tests/fixtures/, solo per i test |

Dati (originali non inclusi nel repository):

| Dato | Licenza | Attribuzione richiesta |
| --- | --- | --- |
| openAIP (spazi aerei) | CC BY-NC 4.0; ammesso l'uso in app anche a pagamento, vietato vendere i soli dati | "Dati spazi aerei: openAIP (openaip.net), CC BY-NC 4.0" |
| Copernicus DEM GLO-30 | Licenza gratuita Copernicus WorldDEM-30 | "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved" |
| SRTM (NASA) | Pubblico dominio | Consigliata: "SRTM, NASA/USGS" |

Servizi usati dall'app in volo o in pianificazione (con connessione):

| Servizio | Licenza dei dati | Condizioni |
| --- | --- | --- |
| Aviation Weather Center (NOAA) | Dominio pubblico | massimo 100 richieste al minuto |
| Open-Meteo, modello ICON-2I | CC BY 4.0, collegamento a open-meteo.com accanto ai dati | gratuito solo per uso non commerciale, meno di 10 000 chiamate al giorno |
| Radar-DPC (Protezione Civile) | CC BY-SA 4.0, citare «Radar-DPC» | condividere allo stesso modo le opere derivate |
