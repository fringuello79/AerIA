# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
"""Pacchetto «Italia centrale»: terreno a tessere e base cartografica.

Gira in GitHub Actions (workflow «Pacchetto dati»): da questo ambiente di sviluppo i siti delle fonti non sono
raggiungibili. Il risultato va nel ramo «pacchetti» del repository, non in «main».

Fonti (scaricate dalla fonte ufficiale a ogni esecuzione):
  - Copernicus DEM GLO-30 (ESA/UE), copia ufficiale sul registro AWS Open Data: s3://copernicus-dem-30m
    Licenza: uso libero anche commerciale con attribuzione (Copernicus DEM licence).
    L'elenco delle tessere esistenti (tileList.txt) decide quali tessere sono solo mare: una tessera che
    dovrebbe esistere e non si scarica blocca tutto (mai riempire terra con quota zero).
  - OpenStreetMap tramite Overpass API: città e paesi, strade principali, ferrovie, fiumi, laghi.
    Licenza ODbL: attribuzione «© OpenStreetMap contributors», banca dati derivata con la stessa licenza.

Uscita in OUT (argomento, predefinito ./pacchetto-centro):
  terrain/NxxEyyy.json   tessere da 1°, griglia 3" (circa 90 m), quota = MASSIMO di ogni blocco 3x3 di campioni da 1"
  terrain/overview.json  griglia 30" (circa 900 m) su tutta l'area, MASSIMO di ogni blocco: usata per la vista
                         d'insieme e per i calcoli finché la tessera fine non è caricata (più prudente, mai più bassa)
  basemap.json           elementi OpenStreetMap semplificati
  region.json            indice delle tessere, fonti, date, controlli eseguiti

Codifica delle griglie: Int16 little-endian, ogni riga trasformata in differenze dal campione precedente,
compressa gzip e scritta in base64 dentro un JSON (formato servito da qualunque host statico).

Uso: python3 tools/make_region.py [OUT]
"""
import base64
import datetime
import gzip
import io
import json
import math
import pathlib
import sys
import time

import numpy as np
import rasterio
import requests
from shapely.geometry import LineString, Polygon, MultiLineString
from shapely.ops import linemerge, polygonize, unary_union

import os
LON0, LON1, LAT0, LAT1 = 9.5, 16.0, 40.0, 45.0   # area del pacchetto
# Solo per le prove locali: REGION_BOUNDS="13,14,41,43", DEM_CACHE con le tessere già scaricate, TILE_LIST, SKIP_OSM=1
if os.environ.get("REGION_BOUNDS"):
    LON0, LON1, LAT0, LAT1 = map(float, os.environ["REGION_BOUNDS"].split(","))
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "pacchetto-centro")
CACHE = pathlib.Path(os.environ.get("DEM_CACHE", "dem-cache"))
S3 = "https://copernicus-dem-30m.s3.amazonaws.com"
FINE, COARSE = 3, 30          # secondi d'arco per blocco
UA = {"User-Agent": "AerIA-VFR-pacchetti/1.0 (github.com/fringuello79/AerIA)"}

OUT.mkdir(parents=True, exist_ok=True)
(OUT / "terrain").mkdir(exist_ok=True)
CACHE.mkdir(exist_ok=True)


def encode(a):
    """Int16, differenze per riga, gzip, base64."""
    a = a.astype("<i2")
    d = a.copy()
    d[:, 1:] = (a[:, 1:].astype(np.int32) - a[:, :-1].astype(np.int32)).astype("<i2")  # le differenze del terreno stanno in Int16
    assert (np.cumsum(d.astype(np.int64), axis=1) == a).all(), "codifica non reversibile"
    return base64.b64encode(gzip.compress(d.tobytes(), compresslevel=9, mtime=0)).decode()


def tile_name(lat, lon):
    return f"Copernicus_DSM_COG_10_N{lat:02d}_00_E{lon:03d}_00_DEM"


def get(url, **kw):
    for k in range(5):
        try:
            r = requests.get(url, headers=UA, timeout=600, **kw)
            if r.status_code == 200:
                return r
            if r.status_code in (400, 404):
                r.raise_for_status()
        except requests.RequestException as e:
            if k == 4:
                raise
            print("  nuovo tentativo:", e)
        time.sleep(5 * (k + 1))
    raise RuntimeError(f"impossibile scaricare {url}")


# ---------------------------------------------------------------- OpenStreetMap (Overpass)
SKIP_OSM = bool(os.environ.get("SKIP_OSM"))
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
BB = f"{LAT0},{LON0},{LAT1},{LON1}"


def overpass(q):
    last = None
    for url in OVERPASS:
        for k in range(3):
            try:
                r = requests.post(url, data={"data": q}, headers=UA, timeout=900)
                if r.status_code == 200:
                    return r.json()["elements"]
                last = f"{url}: {r.status_code} {r.text[:200]}"
            except requests.RequestException as e:
                last = f"{url}: {e}"
            print("  Overpass, nuovo tentativo:", last)
            time.sleep(30 * (k + 1))
    raise RuntimeError(last)



# Vette con quota (OSM natural=peak, ele): il modello Copernicus a 30 m smussa le cime aguzze e le sottostima
# (Corno Grande: 2878 m contro 2912 m). La quota di ogni blocco che contiene una vetta viene alzata alla quota
# della vetta, se questa è più alta e plausibile (entro 300 m dal modello); le altre si scartano e si elencano.
# Si sceglie la prudenza: una cima vera sottostimata è un pericolo, una cima falsa dà al più un avviso in più.
# Esempi reali: Corno Grande Vetta Orientale 2903 m, modello 2798 m; Monte Procinto (torre di roccia) 1173 m, modello 957 m.
# Si alza il blocco più alto entro ±2 blocchi dalla posizione OSM: le coordinate delle cime sono spesso spostate.
peaks = []
if not SKIP_OSM:
    print("Overpass: vette")
    for e in overpass(f'[out:json][timeout:600];node["natural"="peak"]["ele"]({BB});out;'):
        try:
            ele = float(str(e["tags"]["ele"]).replace(",", ".").split()[0].rstrip("m"))
        except ValueError:
            continue
        if 0 < ele < 5000:
            peaks.append({"n": e["tags"].get("name", ""), "ele": ele, "lon": e["lon"], "lat": e["lat"]})
    print(len(peaks), "vette con quota")
if os.environ.get("FAKE_PEAKS"):   # solo prove locali senza rete
    peaks = json.loads(pathlib.Path(os.environ["FAKE_PEAKS"]).read_text())
peak_log = {"raised": 0, "maxRaiseM": 0, "rejected": []}


def raise_peaks(arr, lon0, lat_top, step):
    """Alza il blocco più alto entro ±2 blocchi dalla vetta (la posizione OSM di una cima può essere spostata di
    qualche decina di metri sul versante) se la vetta è più alta del modello di non più di 300 m (oltre: errore probabile)."""
    h, w = arr.shape
    k = 2 if step == FINE else 0
    for p in peaks:
        # stesso blocco che l'app usa per quel punto: il più vicino al centro del blocco (centro = bordo + (step-1)/2")
        c = round(((p["lon"] - lon0) * 3600 - (step - 1) / 2) / step); r = round(((lat_top - p["lat"]) * 3600 - (step - 1) / 2) / step)
        if not (0 <= r < h and 0 <= c < w):
            continue
        r0, c0 = max(0, r - k), max(0, c - k)
        win = arr[r0:r + k + 1, c0:c + k + 1]
        rr, cc = np.unravel_index(int(win.argmax()), win.shape)
        rr += r0; cc += c0
        diff = p["ele"] - arr[rr, cc]
        if diff <= 0 and arr[r, c] >= p["ele"]:
            continue
        if diff > 300:
            if step == FINE:
                peak_log["rejected"].append({**p, "demM": int(arr[rr, cc])})
            continue
        # alza sia il blocco più alto vicino (dove il modello mette la cima) sia il blocco che contiene il punto della
        # vetta: chi interroga il terreno proprio sulla vetta deve trovare almeno la sua quota (verifica del 7/11/2026)
        top = math.ceil(p["ele"])
        if diff > 0:
            arr[rr, cc] = top
        arr[r, c] = max(arr[r, c], top)
        if step == FINE:
            peak_log["raised"] += 1; peak_log["maxRaiseM"] = max(peak_log["maxRaiseM"], round(diff))

# ---------------------------------------------------------------- terreno
tile_list = set((pathlib.Path(os.environ["TILE_LIST"]).read_text() if os.environ.get("TILE_LIST") else get(f"{S3}/tileList.txt").text).split())
assert len(tile_list) > 20000 or os.environ.get("TILE_LIST"), f"elenco delle tessere sospetto ({len(tile_list)} voci)"
lat_tiles = range(math.floor(LAT0), math.ceil(LAT1))
lon_tiles = range(math.floor(LON0), math.ceil(LON1))
index, sea = [], []
coarse_rows = []
for lat in reversed(list(lat_tiles)):            # da nord a sud
    row = []
    for lon in lon_tiles:
        name = tile_name(lat, lon)
        key = f"N{lat:02d}E{lon:03d}"
        if name not in tile_list:
            sea.append(key)
            row.append(np.zeros((3600 // COARSE, 3600 // COARSE), dtype=np.int16))
            continue
        path = CACHE / f"{name}.tif"
        if not path.exists():
            print("scarico", name)
            path.write_bytes(get(f"{S3}/{name}/{name}.tif").content)
        with rasterio.open(path) as d:
            assert d.width == 3600 and d.height == 3600, f"{name}: dimensioni inattese {d.width}x{d.height}"
            assert d.tags().get("AREA_OR_POINT") == "Point", f"{name}: atteso PixelIsPoint"
            assert abs(d.transform.c - lon) < 1e-3 and abs(d.transform.f - (lat + 1)) < 1e-3, f"{name}: origine inattesa {d.transform}"
            a = d.read(1).astype(np.float32)
        assert np.isfinite(a).all() and a.min() > -500 and a.max() < 5000, f"{name}: quote fuori intervallo"
        fine = np.ceil(a.reshape(1200, FINE, 1200, FINE).max(axis=(1, 3))).astype(np.int16)
        coarse = np.ceil(a.reshape(3600 // COARSE, COARSE, 3600 // COARSE, COARSE).max(axis=(1, 3))).astype(np.int16)
        raise_peaks(fine, lon, lat + 1, FINE); raise_peaks(coarse, lon, lat + 1, COARSE)
        row.append(coarse)
        rec = {"key": key, "file": f"terrain/{key}.json", "w": 1200, "h": 1200,
               "cx0": lon + (FINE // 2) / 3600, "cy0": lat + 1 - (FINE // 2) / 3600, "dx": FINE / 3600, "dy": -FINE / 3600,
               "bounds": {"lonMin": lon, "lonMax": lon + 1, "latMin": lat, "latMax": lat + 1},
               "minM": int(fine.min()), "maxM": int(fine.max())}
        (OUT / rec["file"]).write_text(json.dumps({"encoding": "int16le-rowdelta-gzip-base64", "data": encode(fine)}))
        index.append(rec)
        print(f"{key}: {fine.min()}–{fine.max()} m, {(OUT / rec['file']).stat().st_size / 1e6:.2f} MB")
    coarse_rows.append(np.hstack(row))
coarse = np.vstack(coarse_rows)
# ritaglio dell'insieme sull'area del pacchetto
c0 = round((LON0 - lon_tiles[0]) * 3600 / COARSE); c1 = round((LON1 - lon_tiles[0]) * 3600 / COARSE)
r0 = round((lat_tiles[-1] + 1 - LAT1) * 3600 / COARSE); r1 = round((lat_tiles[-1] + 1 - LAT0) * 3600 / COARSE)
coarse = coarse[r0:r1, c0:c1]
# centro di un blocco da 30 campioni (PixelIsPoint: il primo campione è sul bordo della tessera) = bordo + 14,5"
ov = {"key": "overview", "file": "terrain/overview.json", "w": int(coarse.shape[1]), "h": int(coarse.shape[0]),
      "cx0": LON0 + (COARSE - 1) / 2 / 3600, "cy0": LAT1 - (COARSE - 1) / 2 / 3600,
      "dx": COARSE / 3600, "dy": -COARSE / 3600, "bounds": {"lonMin": LON0, "lonMax": LON1, "latMin": LAT0, "latMax": LAT1}}
(OUT / ov["file"]).write_text(json.dumps({"encoding": "int16le-rowdelta-gzip-base64", "data": encode(coarse)}))

# controlli: vette e località note (quota del pacchetto >= quota vera, scarto contenuto)
def at(grid, rec, lon, lat, r=0):
    """Massimo dei blocchi entro r blocchi dal punto (le coordinate delle vette hanno qualche decina di metri di incertezza)."""
    fx = min(grid.shape[1] - 1, max(0, round((lon - rec["cx0"]) / rec["dx"]))); fy = min(grid.shape[0] - 1, max(0, round((lat - rec["cy0"]) / rec["dy"])))
    return int(grid[max(0, fy - r):fy + r + 1, max(0, fx - r):fx + r + 1].max())
checks = []
PEAKS = [("Corno Grande", 13.5650, 42.4693, 2912), ("Monte Velino", 13.3815, 42.1471, 2486),
         ("Monte Amaro", 14.0857, 42.0866, 2793), ("Monte Vettore", 13.2752, 42.8244, 2476),
         ("Monte Terminillo", 12.9906, 42.4724, 2217), ("Monte Cimone", 10.7003, 44.1936, 2165)]
for name, lon, lat, ref in PEAKS:
    # posizione precisa della vetta: il nodo OSM con lo stesso nome e la stessa quota, se c'è
    osm = [p for p in peaks if p["n"] == name and abs(p["ele"] - ref) <= 3]
    if osm:
        lon, lat = osm[0]["lon"], osm[0]["lat"]
    if not (LON0 <= lon < LON1 and LAT0 <= lat < LAT1):
        continue
    rec = next(r for r in index if r["bounds"]["lonMin"] <= lon < r["bounds"]["lonMax"] and r["bounds"]["latMin"] <= lat < r["bounds"]["latMax"])
    f = json.loads((OUT / rec["file"]).read_text())
    g = np.cumsum(np.frombuffer(gzip.decompress(base64.b64decode(f["data"])), dtype="<i2").reshape(rec["h"], rec["w"]).astype(np.int64), axis=1)
    v, vo = at(g, rec, lon, lat, 5), at(coarse, ov, lon, lat, 1)
    checks.append({"name": name, "refM": ref, "fineM": v, "overviewM": vo})
    print(f"{name}: tessera {v} m, insieme {vo} m, riferimento {ref} m")
    # senza correzione delle vette il modello può stare fino a qualche decina di metri sotto la cima
    assert (ref - 40 if SKIP_OSM else ref - 5) <= v <= ref + 60, f"{name}: quota {v} m lontana dal riferimento {ref} m"
    assert vo >= at(g, rec, lon, lat), f"{name}: la griglia d'insieme non può essere più bassa della tessera"

def rnd(coords):
    return [[round(x, 4), round(y, 4)] for x, y in coords]


def simplify_lines(ways, tol):
    """Unisce i tratti e li semplifica (tolleranza in gradi)."""
    merged = linemerge(MultiLineString([LineString([(p["lon"], p["lat"]) for p in w["geometry"]]) for w in ways if len(w.get("geometry", [])) > 1]))
    parts = merged.geoms if hasattr(merged, "geoms") else [merged]
    return [rnd(g.simplify(tol, preserve_topology=False).coords) for g in parts if g.length > tol * 3]


# controllo indipendente: nel punto esatto di ogni vetta accettata (il blocco che l'app legge lì) la quota del pacchetto
# è >= quota della vetta (fino al 7/11/2026 il controllo guardava entro ±2 blocchi e non vedeva i blocchi bassi sulla cima)
_cache = {}
bad = 0; checked = 0
for p in peaks:
    # la tessera che l'app usa per quel punto (come gridElev: fino a mezzo blocco oltre il bordo)
    rec = next((r for r in index if -0.5 <= (p["lon"] - r["cx0"]) / r["dx"] <= r["w"] - 0.5 and -0.5 <= (p["lat"] - r["cy0"]) / r["dy"] <= r["h"] - 0.5), None)
    if not rec or not (LON0 <= p["lon"] < LON1 and LAT0 <= p["lat"] < LAT1):
        continue
    if rec["key"] not in _cache:
        f = json.loads((OUT / rec["file"]).read_text())
        _cache[rec["key"]] = np.cumsum(np.frombuffer(gzip.decompress(base64.b64decode(f["data"])), dtype="<i2").reshape(rec["h"], rec["w"]).astype(np.int64), axis=1)
    v = at(_cache[rec["key"]], rec, p["lon"], p["lat"], 0)
    if any(abs(q["lon"] - p["lon"]) < 1e-9 and abs(q["lat"] - p["lat"]) < 1e-9 for q in peak_log["rejected"]):
        continue
    checked += 1
    if v < p["ele"] - 0.5:
        bad += 1
        print("  vetta sotto la quota del pacchetto:", p, v)
print(f"controllo vette: {checked} verificate, {bad} sotto la quota OSM")
assert bad == 0, "quota del pacchetto più bassa di una vetta accettata"
print("vette: blocchi alzati", peak_log["raised"], "fino a", peak_log["maxRaiseM"], "m; scartate", len(peak_log["rejected"]))
TERRAIN_META = {
    "name": "Copernicus GLO-30 a tessere, 3\" (massimo per blocco)", "source": "Copernicus DEM GLO-30 (registro AWS Open Data)",
    "blockMax": True, "peaks": peak_log, "tiles": index, "sea": sorted(sea), "overview": ov, "checks": checks,
    "attribution": "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved",
}
NOW = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
if SKIP_OSM:
    (OUT / "region.json").write_text(json.dumps({"name": "prova locale", "created": NOW, "bounds": {"lonMin": LON0, "lonMax": LON1, "latMin": LAT0, "latMax": LAT1}, "terrain": TERRAIN_META}, ensure_ascii=False, indent=1))
    print("base cartografica saltata (SKIP_OSM)"); sys.exit(0)
# ---------------------------------------------------------------- base cartografica
base = {"places": [], "peaks": [], "roads": {}, "rail": [], "rivers": [], "lakes": []}
# vette con nome e quota, per le quote sulla carta
base["peaks"] = [{"n": p["n"], "ele": round(p["ele"]), "lon": round(p["lon"], 5), "lat": round(p["lat"], 5)} for p in peaks if p["n"]]
print("Overpass: località")
for e in overpass(f'[out:json][timeout:600];node["place"~"^(city|town|village)$"]["name"]({BB});out;'):
    t = e["tags"]
    pop = int(t["population"]) if str(t.get("population", "")).isdigit() else None
    base["places"].append({"n": t["name"], "k": {"city": 3, "town": 2, "village": 1}[t["place"]], "p": pop,
                           "lon": round(e["lon"], 5), "lat": round(e["lat"], 5)})
print("Overpass: strade")
roads = overpass(f'[out:json][timeout:900];way["highway"~"^(motorway|trunk|primary)$"]({BB});out geom;')
for cls in ("motorway", "trunk", "primary"):
    base["roads"][cls] = simplify_lines([w for w in roads if w["tags"]["highway"] == cls], 0.0005)
print("Overpass: ferrovie")
base["rail"] = simplify_lines(overpass(f'[out:json][timeout:900];way["railway"="rail"]["usage"~"^(main|branch)$"]({BB});out geom;'), 0.0005)
print("Overpass: fiumi")
base["rivers"] = simplify_lines(overpass(f'[out:json][timeout:900];way["waterway"="river"]({BB});out geom;'), 0.0005)
print("Overpass: laghi")
lakes = overpass(f'[out:json][timeout:900];(way["natural"="water"]["water"~"^(lake|reservoir)$"]({BB});relation["natural"="water"]["water"~"^(lake|reservoir)$"]({BB}););out geom;')
for e in lakes:
    if e["type"] == "way":
        g = e.get("geometry", [])
        if len(g) < 4:
            continue
        polys = [Polygon([(p["lon"], p["lat"]) for p in g])]
    else:
        outer = [LineString([(p["lon"], p["lat"]) for p in m["geometry"]]) for m in e.get("members", []) if m.get("role") == "outer" and len(m.get("geometry", [])) > 1]
        polys = list(polygonize(unary_union(outer))) if outer else []
    for p in polys:
        if not p.is_valid:
            p = p.buffer(0)
        # area approssimata in km² alla latitudine del lago
        km2 = p.area * 111.32 * 111.32 * math.cos(math.radians(p.centroid.y))
        if km2 < 0.3:
            continue
        s = p.simplify(0.0003)
        if s.geom_type != "Polygon":
            continue
        base["lakes"].append({"n": e.get("tags", {}).get("name", ""), "km2": round(km2, 2), "ring": rnd(s.exterior.coords)})
counts = {"places": len(base["places"]), "peaks": len(base["peaks"]), "roads": {k: len(v) for k, v in base["roads"].items()}, "rail": len(base["rail"]),
          "rivers": len(base["rivers"]), "lakes": len(base["lakes"])}
print("base cartografica:", counts)
# controlli minimi: elementi noti presenti
names = {p["n"] for p in base["places"]}
for must in ("Roma", "Firenze", "Avezzano", "Celano", "Perugia", "L'Aquila", "Pescara", "Ancona", "Bologna"):
    assert must in names, f"manca la località {must}"
lake_names = {l["n"] for l in base["lakes"]}
for must in ("Lago Trasimeno", "Lago di Bolsena", "Lago di Campotosto"):
    assert must in lake_names, f"manca il lago {must}"
assert counts["roads"]["motorway"] > 50 and counts["rivers"] > 50
(OUT / "basemap.json").write_text(json.dumps(base, ensure_ascii=False, separators=(",", ":")))

region = {
    "name": "Italia centrale", "created": NOW,
    "bounds": {"lonMin": LON0, "lonMax": LON1, "latMin": LAT0, "latMax": LAT1},
    "terrain": TERRAIN_META,
    "basemap": {"file": "basemap.json", "source": "OpenStreetMap (Overpass API)", "downloaded": NOW, "counts": counts,
                "license": "ODbL 1.0", "attribution": "Base cartografica: © OpenStreetMap contributors (ODbL)"},
}
(OUT / "region.json").write_text(json.dumps(region, ensure_ascii=False, indent=1))
total = sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file())
print(f"pacchetto: {len(index)} tessere di terra, {len(sea)} di solo mare, {total / 1e6:.1f} MB")
