# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
"""Genera dati di prova SINTETICI per il prototipo web.

Nessun dato reale: terreno con una collina gaussiana e spazi aerei inventati.
Serve solo a verificare che lettura e conversione delle quote funzionino.

Uso: python3 tools/make_test_data.py  (richiede numpy e rasterio)
"""
import json, math, struct, pathlib
import numpy as np
import rasterio
from rasterio.transform import from_origin

out = pathlib.Path(__file__).parent / "test-data"
out.mkdir(exist_ok=True)

def hill(lon, lat):
    return 700 + 1500 * np.exp(-(((lon - 13.4) / 0.15) ** 2 + ((lat - 42.15) / 0.08) ** 2))

# 1) Tessera SRTM finta N42E013 (1201 x 1201, int16 big-endian)
n = 1201
with open(out / "N42E013.hgt", "wb") as f:
    for r in range(n):
        lat = 43 - r / (n - 1)
        lons = 13 + np.arange(n) / (n - 1)
        f.write(hill(lons, lat).astype(">i2").tobytes())

# 2) Tessera GeoTIFF con la stessa struttura di Copernicus GLO-30
n, res = 3600, 1 / 3600
lon = 13 + (np.arange(n) + 0.5) * res
lat = 43 - (np.arange(n) + 0.5) * res
LON, LAT = np.meshgrid(lon, lat)
prof = dict(driver="GTiff", width=n, height=n, count=1, dtype="float32", crs="EPSG:4326",
            transform=from_origin(13, 43, res, res), tiled=True, blockxsize=1024, blockysize=1024,
            compress="deflate", predictor=3)
with rasterio.open(out / "Copernicus_DSM_COG_10_N42_00_E013_00_DEM.tif", "w", **prof) as d:
    d.write(hill(LON, LAT).astype("float32"), 1)

# 3) Spazi aerei finti in formato openAIP (codici numerici)
gj = {"type": "FeatureCollection", "features": [
    {"type": "Feature", "properties": {"name": "TEST CTR OAIP", "type": 4, "icaoClass": 3,
        "upperLimit": {"value": 2500, "unit": 1, "referenceDatum": 1}, "lowerLimit": {"value": 0, "unit": 1, "referenceDatum": 0}},
     "geometry": {"type": "Polygon", "coordinates": [[[13.3, 42.0], [13.6, 42.0], [13.6, 42.1], [13.3, 42.1], [13.3, 42.0]]]}},
    {"type": "Feature", "properties": {"name": "TEST TMA OAIP", "type": 7, "icaoClass": 2,
        "upperLimit": {"value": 105, "unit": 6, "referenceDatum": 2}, "lowerLimit": {"value": 3000, "unit": 1, "referenceDatum": 1}},
     "geometry": {"type": "Polygon", "coordinates": [[[13.1, 42.0], [13.9, 42.0], [13.9, 42.5], [13.1, 42.5], [13.1, 42.0]]]}}]}
(out / "it_asp_test.geojson").write_text(json.dumps(gj))

# 4) Spazi aerei finti in formato OpenAir
(out / "sample_openair.txt").write_text("""* dati di prova inventati
AC D
AN TEST CTR
AL GND
AH 2500ft AMSL
V X=42:03:00 N 013:25:00 E
DC 4
AC R
AN TEST R
AL 1000 ft AGL
AH FL 85
DP 42:20:00 N 013:30:00 E
DP 42:20:00 N 013:45:00 E
DP 42:30:00 N 013:45:00 E
DP 42:30:00 N 013:30:00 E
""")

# Quote attese ai punti della rotta dimostrativa (ft), per confronto con il prototipo
for lo, la in [(13.10, 42.04), (13.45, 42.06), (13.75, 42.07)]:
    print(lo, la, round(float(hill(lo, la)) * 3.28084))
