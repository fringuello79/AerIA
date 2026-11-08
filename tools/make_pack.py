# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
"""Crea il pacchetto dati regionale «Marsica e Fucino» per l'app.

Ingressi (cartella data/, esclusa da git):
  - Copernicus_DSM_COG_10_N42_00_E013_00_DEM.tif e ..._N41_... (Copernicus DEM GLO-30)
  - it_asp.geojson (export openAIP Italia)

Uscita: web-prototype/data/marsica/
  - terrain.json      quote in metri, Int16 little-endian in base64, griglia 3" (circa 90 m)
  - airspaces.json spazi aerei che toccano l'area, con i soli campi usati dall'app
  - pack.json         descrizione, fonti, date e attribuzioni

Il terreno è ridotto prendendo il MASSIMO di ogni blocco 3x3: la quota del pacchetto non è mai
più bassa del terreno vero, quindi i margini calcolati restano prudenti.

Uso: python3 tools/make_pack.py
"""
import base64
import datetime
import json
import math
import pathlib

import numpy as np
import rasterio

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "web-prototype" / "data" / "marsica"
LON0, LON1, LAT0, LAT1 = 13.0, 14.0, 41.6, 42.6
STEP = 3  # campioni da 1" per blocco

OUT.mkdir(parents=True, exist_ok=True)

# --- terreno: mosaico delle due tessere (campioni centrati sui secondi d'arco: PixelIsPoint)
def rows(tif, lat_top_tile, lat_from, lat_to):
    with rasterio.open(DATA / tif) as d:
        assert d.width == 3600 and d.height == 3600 and d.tags().get("AREA_OR_POINT") == "Point", "formato Copernicus inatteso"
        a = d.read(1)
    r0 = round((lat_top_tile - lat_from) * 3600)
    r1 = round((lat_top_tile - lat_to) * 3600)
    return a[r0:r1, :]

north = rows("Copernicus_DSM_COG_10_N42_00_E013_00_DEM.tif", 43.0, LAT1, 42.0)  # da 42.6 a 42.0 (escluso)
south = rows("Copernicus_DSM_COG_10_N41_00_E013_00_DEM.tif", 42.0, 42.0, LAT0)  # da 42.0 a 41.6 (escluso)
mosaic = np.vstack([north, south])
h, w = mosaic.shape
assert (h, w) == (3600, 3600), mosaic.shape
blocks = mosaic.reshape(h // STEP, STEP, w // STEP, STEP).max(axis=(1, 3))
terrain = np.ceil(blocks).astype("<i2")
(OUT / "terrain.json").write_text(json.dumps({"encoding": "int16le-base64", "data": base64.b64encode(terrain.tobytes()).decode()}))

# --- spazi aerei che toccano l'area
gj = json.loads((DATA / "it_asp.geojson").read_text())
keep = ("_id", "name", "type", "icaoClass", "upperLimit", "lowerLimit", "frequencies", "remarks", "transponderSettings", "updatedAt", "byNotam")
feats = []
for f in gj["features"]:
    ring = f["geometry"]["coordinates"][0]
    xs = [c[0] for c in ring]; ys = [c[1] for c in ring]
    if max(xs) < LON0 or min(xs) > LON1 or max(ys) < LAT0 or min(ys) > LAT1:
        continue
    feats.append({"type": "Feature", "geometry": f["geometry"], "properties": {k: f["properties"][k] for k in keep if k in f["properties"]}})
(OUT / "airspaces.json").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False, separators=(",", ":")))
newest = max(f["properties"].get("updatedAt", "") for f in feats)

today = datetime.date.today().isoformat()
pack = {
    "name": "Marsica e Fucino",
    "created": today,
    "bounds": {"lonMin": LON0, "lonMax": LON1, "latMin": LAT0, "latMax": LAT1},
    "terrain": {
        "file": "terrain.json", "name": "Copernicus GLO-30 ridotto a 3\" (massimo per blocco)",
        "source": "Copernicus DEM GLO-30", "w": int(terrain.shape[1]), "h": int(terrain.shape[0]),
        "cx0": LON0 + (STEP // 2) / 3600, "cy0": LAT1 - (STEP // 2) / 3600, "dx": STEP / 3600, "dy": -STEP / 3600,
        "nodata": -32768, "bounds": {"lonMin": LON0, "lonMax": LON1, "latMin": LAT0, "latMax": LAT1},
        "attribution": "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved",
    },
    "airspaces": {
        "file": "airspaces.json", "source": "openAIP", "count": len(feats), "downloaded": today, "newestEdit": newest,
        "license": "CC BY-NC 4.0", "attribution": "Spazi aerei: openAIP (www.openaip.net), CC BY-NC 4.0",
    },
    # creato a parte da tools/make_geoid.py
    "geoid": {"file": "geoid.json", "model": "EGM96", "source": "NGA (dominio pubblico)"},
}
(OUT / "pack.json").write_text(json.dumps(pack, ensure_ascii=False, indent=2))

# --- controlli: vette note (quota del pacchetto >= quota vera, scarto contenuto)
def at(lon, lat):
    t = pack["terrain"]
    fx = (lon - t["cx0"]) / t["dx"]; fy = (lat - t["cy0"]) / t["dy"]
    return int(terrain[round(fy), round(fx)])
for name, lon, lat, ref in [("Monte Velino", 13.3815, 42.1471, 2486), ("Monte Sirente", 13.6100, 42.1453, 2348), ("Avezzano", 13.4264, 42.0310, 695)]:
    print(f"{name}: pacchetto {at(lon, lat)} m, riferimento {ref} m")
print(f"terreno {terrain.shape}, {(OUT / 'terrain.json').stat().st_size / 1e6:.1f} MB; spazi aerei {len(feats)}, "
      f"{(OUT / 'airspaces.json').stat().st_size / 1e6:.2f} MB; modifica openAIP più recente {newest}")
