# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
"""Aeroporti, aviosuperfici, ostacoli, punti di riporto e radioassistenze per il pacchetto Marsica.

Fonte: export openAIP per l'Italia (data/it_apt, it_obs, it_rpp, it_nav .geojson), licenza CC BY-NC 4.0.
Gli ostacoli di openAIP sono importati da OpenStreetMap: per questi vale anche la licenza ODbL
(attribuzione «© OpenStreetMap contributors», banca dati derivata condivisa con la stessa licenza).

Uso: python3 tools/make_features.py   →  web-prototype/data/marsica/features.json e aggiorna pack.json
"""
import json
import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA, OUT = ROOT / "data", ROOT / "web-prototype" / "data" / "marsica"
LON0, LON1, LAT0, LAT1 = 13.0, 14.0, 41.6, 42.6
out = runpy.run_path(str(ROOT / "tools" / "features_lib.py"))["build_features"](DATA, LON0, LON1, LAT0, LAT1)
obs = out["obstacles"]
(OUT / "features.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
pack = json.loads((OUT / "pack.json").read_text())
pack["features"] = {
    "file": "features.json", "source": "openAIP", "downloaded": "2026-11-06",
    "counts": {k: len(v) for k, v in out.items()},
    "license": "CC BY-NC 4.0; ostacoli da OpenStreetMap, ODbL",
    "attribution": "Aeroporti, punti e radioassistenze: openAIP (www.openaip.net), CC BY-NC 4.0 · Ostacoli: openAIP, dati © OpenStreetMap contributors (ODbL)",
}
(OUT / "pack.json").write_text(json.dumps(pack, ensure_ascii=False, indent=2))
print({k: len(v) for k, v in out.items()})
print("ostacoli senza altezza:", sum(1 for o in obs if o["heightM"] is None), "di", len(obs))
