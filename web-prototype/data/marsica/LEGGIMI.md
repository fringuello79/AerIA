# Pacchetto dati «Marsica e Fucino»

Area: longitudine 13,0–14,0 E, latitudine 41,6–42,6 N. Creato con `tools/make_pack.py`.

- **Terreno**: Copernicus DEM GLO-30, ridotto a 3 secondi d'arco (circa 90 m) prendendo il massimo di ogni
  blocco 3×3: le quote non sono mai più basse del dato originale. Attribuzione obbligatoria:
  produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018
  provided under COPERNICUS by the European Union and ESA; all rights reserved.
- **Spazi aerei**: openAIP, export Italia scaricato il 6/11/2026, licenza CC BY-NC 4.0.
  Attribuzione: «Spazi aerei: openAIP (www.openaip.net)».
- **Geoide**: ondulazione EGM96 (National Geospatial-Intelligence Agency, dominio pubblico) su griglia di 0,05°,
  creata con `tools/make_geoid.py`. Serve a portare la quota GPS (sull'ellissoide) sul livello del mare.

Non sono dati ufficiali AIP: servono a sviluppare e provare l'app.

- **Aeroporti, punti di riporto, radioassistenze**: openAIP, export Italia del 6/11/2026, CC BY-NC 4.0.
- **Ostacoli**: openAIP, importati da OpenStreetMap. Dati © OpenStreetMap contributors, licenza ODbL 1.0
  (https://opendatacommons.org/licenses/odbl/); questo estratto è distribuito con la stessa licenza.
