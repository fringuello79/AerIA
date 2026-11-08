# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
"""Griglia dell'ondulazione del geoide (EGM96) per l'area del pacchetto.

Serve a convertire la quota GPS (riferita all'ellissoide WGS84, come la danno
Android e i browser) in quota sul livello medio del mare: H = h - N.
In Marsica N vale circa 44-50 m, cioè 145-165 ft: senza correzione la quota GPS
risulta più alta del vero di questa quantità.

Fonte: modello EGM96 della National Geospatial-Intelligence Agency (USA, dominio
pubblico), letto con il pacchetto Python «egm96» 0.3.0 (licenza MIT, griglia 5').
Verifica indipendente: tests/geoid.test.js confronta il risultato con un'altra
implementazione (egm96-universal, griglia 15' dell'NGA).

Uso: pip install egm96==0.3.0 ; python3 tools/make_geoid.py
"""
import json, sys
from pathlib import Path
from egm96 import undulation

LON0, LAT0, LON1, LAT1, STEP = 13.0, 41.6, 14.0, 42.6, 0.05
nx, ny = round((LON1 - LON0) / STEP) + 1, round((LAT1 - LAT0) / STEP) + 1
vals = [round(float(undulation(LAT0 + j * STEP, LON0 + i * STEP)), 3) for j in range(ny) for i in range(nx)]
out = {
    "model": "EGM96", "unit": "m", "lon0": LON0, "lat0": LAT0, "step": STEP, "nx": nx, "ny": ny, "n": vals,
    "source": "EGM96, National Geospatial-Intelligence Agency (dominio pubblico); griglia calcolata con egm96 0.3.0 (MIT)",
}
dest = Path(__file__).resolve().parent.parent / "web-prototype" / "data" / "marsica" / "geoid.json"
dest.write_text(json.dumps(out, separators=(",", ":")))
print(f"{dest}: {nx}x{ny} punti, N da {min(vals):.2f} a {max(vals):.2f} m")
