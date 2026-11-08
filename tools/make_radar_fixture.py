# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
"""Ritaglio sulla Marsica di due prodotti Radar-DPC (SRI e CAPPI_2), per i test.

Fonte: Radar-DPC, Dipartimento della Protezione Civile, licenza CC BY-SA 4.0 (il ritaglio resta CC BY-SA).
File scaricati il 6/11/2026 alle 13:40 UTC con l'API ufficiale (https://radar-api.protezionecivile.it).
Stampa anche i valori di riferimento della proiezione calcolati con pyproj, usati in tests/radar.test.js.

Uso: python3 tools/make_radar_fixture.py data/radar/SRI.tif data/radar/CAPPI_2.tif
"""
import json, sys
from pathlib import Path
import numpy as np, rasterio
from pyproj import Transformer

OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
out = {"_fonte": "Radar-DPC (Dipartimento della Protezione Civile), CC BY-SA 4.0. Ritaglio sulla Marsica dei prodotti del 06/11/2026 13:40 UTC. Solo per i test.", "products": {}}
for f in sys.argv[1:]:
    r = rasterio.open(f)
    a = r.read(1)
    tr = Transformer.from_crs("EPSG:4326", r.crs, always_xy=True)
    xs, ys = zip(*[tr.transform(lon, lat) for lon in (13, 14) for lat in (41.6, 42.6)])
    c0, r0 = ~r.transform * (min(xs), max(ys))
    c1, r1 = ~r.transform * (max(xs), min(ys))
    c0, r0, c1, r1 = int(c0) - 2, int(r0) - 2, int(c1) + 3, int(r1) + 3
    sub = a[r0:r1, c0:c1]
    x0, y0 = r.transform * (c0, r0)
    name = Path(f).stem
    out["products"][name] = {"x0": x0, "y0": y0, "dx": r.transform.a, "dy": r.transform.e, "w": int(sub.shape[1]), "h": int(sub.shape[0]),
                             "data": [round(float(v), 3) for v in sub.ravel()]}
    print(name, sub.shape, "angolo", x0, y0)
crs = rasterio.open(sys.argv[1]).crs
tr = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
ref = [[lon, lat, *[round(v, 3) for v in tr.transform(lon, lat)]] for lon, lat in [(12.5, 42), (13.43, 42.03), (6.63, 45.0), (18.52, 40.1), (12.4, 35.5), (14.2, 42.46), (9.0, 39.2)]]
out["projectionRef"] = ref
(OUT / "radar-2026-11-06T1340.json").write_text(json.dumps(out, separators=(",", ":")))
print(json.dumps(ref))
