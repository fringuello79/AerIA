# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
"""Griglia della declinazione magnetica (WMM2025) per l'area del pacchetto.

Serve a passare dalla rotta vera alla rotta e prua magnetiche del log di navigazione.
Fonte: World Magnetic Model 2025 (NOAA/NGA, dominio pubblico, valido 2025-2030), calcolato con pygeomag.
Verifica indipendente in tests/navlog.test.js con la libreria JavaScript magvar 2.2.0 (WMM2025).

Uso: pip install pygeomag ; python3 tools/make_declination.py
"""
import json
from pathlib import Path
from pygeomag import GeoMag

g = GeoMag(coefficients_file="wmm/WMM_2025.COF")
LON0, LAT0, STEP, NX, NY, EPOCH = 13.0, 41.6, 0.25, 5, 5, 2026.0
d0, rate = [], []
for j in range(NY):
    for i in range(NX):
        lat, lon = LAT0 + j * STEP, LON0 + i * STEP
        a = g.calculate(glat=lat, glon=lon, alt=0, time=EPOCH).d
        b = g.calculate(glat=lat, glon=lon, alt=0, time=EPOCH + 1).d
        d0.append(round(a, 4)); rate.append(round(b - a, 4))
out = {"model": "WMM2025", "validUntil": 2030.0, "epoch": EPOCH, "lon0": LON0, "lat0": LAT0, "step": STEP, "nx": NX, "ny": NY,
       "d": d0, "rate": rate, "unit": "gradi, positivo verso est", "source": "World Magnetic Model 2025 (NOAA/NGA, dominio pubblico), calcolato con pygeomag"}
dest = Path(__file__).resolve().parent.parent / "web-prototype" / "data" / "marsica" / "declination.json"
dest.write_text(json.dumps(out, separators=(",", ":")))
print(dest, min(d0), max(d0), "variazione annua", min(rate), max(rate))
