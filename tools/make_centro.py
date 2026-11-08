# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
"""Parte aeronautica del pacchetto «Italia centrale»: spazi aerei, aeroporti, ostacoli, punti, geoide, declinazione.

Ingressi (cartella data/, esclusa da git): export openAIP Italia it_asp, it_apt, it_obs, it_rpp, it_nav (.geojson).
Il terreno e la base cartografica arrivano dal ramo «pacchetti» (tools/make_region.py, workflow «Pacchetto dati»):
questo script scrive pack.json con i riferimenti a quei file.

Uscita: web-prototype/data/centro/
Uso: pip install egm96==0.3.0 pygeomag ; python3 tools/make_centro.py
"""
import datetime
import json
import os
import runpy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA, OUT = ROOT / "data", ROOT / "web-prototype" / "data" / "centro"
LON0, LON1, LAT0, LAT1 = 9.5, 16.0, 40.0, 45.0
DOWNLOADED = os.environ.get("OPENAIP_DATE", "2026-11-06")   # data dell'export openAIP (il workflow la passa)
OUT.mkdir(parents=True, exist_ok=True)


def bbox(ring):
    xs = [c[0] for c in ring]; ys = [c[1] for c in ring]
    return min(xs), max(xs), min(ys), max(ys)


# ---------------------------------------------------------------- spazi aerei che toccano l'area
gj = json.loads((DATA / "it_asp.geojson").read_text())
keep = ("_id", "name", "type", "icaoClass", "upperLimit", "lowerLimit", "frequencies", "remarks", "transponderSettings", "updatedAt", "byNotam")
feats = []
for f in gj["features"]:
    x0, x1, y0, y1 = bbox(f["geometry"]["coordinates"][0])
    if x1 < LON0 or x0 > LON1 or y1 < LAT0 or y0 > LAT1:
        continue
    feats.append({"type": "Feature", "geometry": f["geometry"], "properties": {k: f["properties"][k] for k in keep if k in f["properties"]}})
(OUT / "airspaces.json").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False, separators=(",", ":")))
newest = max(f["properties"].get("updatedAt", "") for f in feats)

# ---------------------------------------------------------------- aeroporti, ostacoli, punti: stesso codice del pacchetto Marsica
ns = runpy.run_path(str(ROOT / "tools" / "features_lib.py"))
features = ns["build_features"](DATA, LON0, LON1, LAT0, LAT1)
(OUT / "features.json").write_text(json.dumps(features, ensure_ascii=False, separators=(",", ":")))

# ---------------------------------------------------------------- geoide EGM96, griglia 0,1°
from egm96 import undulation
STEP = 0.1
nx, ny = round((LON1 - LON0) / STEP) + 1, round((LAT1 - LAT0) / STEP) + 1
vals = [round(float(undulation(LAT0 + j * STEP, LON0 + i * STEP)), 3) for j in range(ny) for i in range(nx)]
(OUT / "geoid.json").write_text(json.dumps({
    "model": "EGM96", "unit": "m", "lon0": LON0, "lat0": LAT0, "step": STEP, "nx": nx, "ny": ny, "n": vals,
    "source": "EGM96, National Geospatial-Intelligence Agency (dominio pubblico); griglia calcolata con egm96 0.3.0 (MIT)"}, separators=(",", ":")))

# ---------------------------------------------------------------- declinazione WMM2025, griglia 0,5°
from pygeomag import GeoMag
g = GeoMag(coefficients_file="wmm/WMM_2025.COF")   # file incluso nel pacchetto pygeomag
DSTEP, EPOCH = 0.5, 2026.0
dnx, dny = round((LON1 - LON0) / DSTEP) + 1, round((LAT1 - LAT0) / DSTEP) + 1
d0, rate = [], []
for j in range(dny):
    for i in range(dnx):
        lat, lon = LAT0 + j * DSTEP, LON0 + i * DSTEP
        a = g.calculate(glat=lat, glon=lon, alt=0, time=EPOCH).d
        b = g.calculate(glat=lat, glon=lon, alt=0, time=EPOCH + 1).d
        d0.append(round(a, 4)); rate.append(round(b - a, 4))
(OUT / "declination.json").write_text(json.dumps({
    "model": "WMM2025", "validUntil": 2030.0, "epoch": EPOCH, "lon0": LON0, "lat0": LAT0, "step": DSTEP, "nx": dnx, "ny": dny,
    "d": d0, "rate": rate, "unit": "gradi, positivo verso est", "source": "World Magnetic Model 2025 (NOAA/NGA, dominio pubblico), calcolato con pygeomag"}, separators=(",", ":")))

pack = {
    "name": "Italia centrale", "created": datetime.date.today().isoformat(),
    "bounds": {"lonMin": LON0, "lonMax": LON1, "latMin": LAT0, "latMax": LAT1},
    "note": "Spazi aerei, aeroporti e punti: solo Italia (export openAIP Italia). Corsica e mare oltre il confine della FIR non coperti.",
    "region": {"file": "region.json", "note": "terreno e base cartografica dal ramo «pacchetti» (tools/make_region.py)"},
    "airspaces": {"file": "airspaces.json", "source": "openAIP", "count": len(feats), "downloaded": DOWNLOADED, "newestEdit": newest,
                  "license": "CC BY-NC 4.0", "attribution": "Spazi aerei: openAIP (www.openaip.net), CC BY-NC 4.0"},
    "features": {"file": "features.json", "source": "openAIP", "downloaded": DOWNLOADED, "counts": {k: len(v) for k, v in features.items()},
                 "license": "CC BY-NC 4.0; ostacoli da OpenStreetMap, ODbL",
                 "attribution": "Aeroporti, punti e radioassistenze: openAIP (www.openaip.net), CC BY-NC 4.0 · Ostacoli: openAIP, dati © OpenStreetMap contributors (ODbL)"},
    "geoid": {"file": "geoid.json", "model": "EGM96", "source": "NGA (dominio pubblico)"},
    "declination": {"file": "declination.json", "model": "WMM2025", "source": "NOAA/NGA (dominio pubblico)"},
}
(OUT / "pack.json").write_text(json.dumps(pack, ensure_ascii=False, indent=2))
print(f"spazi aerei {len(feats)}, {(OUT / 'airspaces.json').stat().st_size / 1e6:.2f} MB; più recente {newest}")
print({k: len(v) for k, v in features.items()}, f"{(OUT / 'features.json').stat().st_size / 1e6:.2f} MB")
print(f"geoide {nx}x{ny} da {min(vals):.1f} a {max(vals):.1f} m; declinazione {min(d0):.2f}° – {max(d0):.2f}°")
