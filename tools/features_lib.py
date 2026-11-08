# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
"""Estrazione di aeroporti, ostacoli, punti di riporto e radioassistenze dall'export openAIP (comune ai pacchetti).

Fonte: export openAIP per l'Italia (it_apt, it_obs, it_rpp, it_nav .geojson), licenza CC BY-NC 4.0.
Gli ostacoli di openAIP sono importati da OpenStreetMap: per questi vale anche la licenza ODbL.
"""
import json


def build_features(DATA, LON0, LON1, LAT0, LAT1):
    M = 0.1  # margine: un aeroporto appena fuori dall'area conta per il limite dei 5 km

    def inside(c, m=0.0):
        return LON0 - m <= c[0] <= LON1 + m and LAT0 - m <= c[1] <= LAT1 + m

    def load(name):
        return json.loads((DATA / f"it_{name}.geojson").read_text())["features"]

    # tipi openAIP degli aeroporti, verificati sui nomi dell'export italiano (vedi docs/fonti-dati.md)
    APT_TYPE = {0: "aeroporto", 1: "campo di volo a vela", 2: "aviosuperficie o aeroporto civile", 3: "aeroporto internazionale",
                4: "eliporto militare", 5: "aeroporto militare", 6: "campo di volo ultraleggeri", 7: "eliporto o elisuperficie",
                8: "chiuso", 9: "aeroporto IFR", 10: "idroscalo", 11: "pista di atterraggio", 12: "pista agricola", 13: "altiporto"}
    NAV_TYPE = {0: "DME", 1: "TACAN", 2: "NDB", 3: "VOR", 4: "VOR-DME", 5: "VORTAC", 6: "DVOR", 7: "DVOR-DME", 8: "DVORTAC"}

    apts = []
    for f in load("apt"):
        p, c = f["properties"], f["geometry"]["coordinates"]
        if not inside(c, M):
            continue
        apts.append({
            "id": p["_id"], "name": p["name"].strip(), "icao": p.get("icaoCode", ""), "type": p["type"], "typeName": APT_TYPE.get(p["type"], ""),
            "lon": c[0], "lat": c[1], "elevM": p["elevation"]["value"],
            "freqs": [{"mhz": fr.get("value"), "name": fr.get("name", "")} for fr in p.get("frequencies", [])],
            "rwy": [r["designator"] for r in p.get("runways", [])],
            "rwyInfo": [{"des": r["designator"], "lenM": r.get("dimension", {}).get("length", {}).get("value"),
                         "widthM": r.get("dimension", {}).get("width", {}).get("value"), "trueHdg": r.get("trueHeading")} for r in p.get("runways", [])],
        })
    apt_by_id = {a["id"]: a for a in apts}

    def obs_kind(p):
        t = p.get("osmTags") or {}
        if t.get("generator:source") == "wind" or t.get("value") == "wind":
            return "pala eolica"
        if t.get("key") == "building" or p["type"] == 2:
            return "edificio"
        if t.get("man_made") == "chimney" or p["type"] == 1:
            return "ciminiera"
        if t.get("man_made") in ("tower", "mast", "communications_tower", "antenna") or p["type"] == 4:
            return "torre o antenna"
        return "ostacolo"

    obs = []
    for f in load("obs"):
        p, c = f["properties"], f["geometry"]["coordinates"]
        if not inside(c):
            continue
        h = p.get("height")
        obs.append({"lon": c[0], "lat": c[1], "elevM": p["elevation"]["value"], "heightM": h["value"] if h else None,
                    "kind": obs_kind(p), "name": "" if p["name"] == "Obstacle" else p["name"]})

    all_apt = {f["properties"]["_id"]: f["properties"] for f in load("apt")}
    rpp = []
    for f in load("rpp"):
        p, c = f["properties"], f["geometry"]["coordinates"]
        if not inside(c, M):
            continue
        ap = [all_apt[i] for i in p.get("airports", []) if i in all_apt]
        rpp.append({"name": p["name"], "lon": c[0], "lat": c[1], "compulsory": bool(p.get("compulsory")),
                    "airport": (ap[0].get("icaoCode") or ap[0]["name"]) if ap else ""})

    nav = []
    for f in load("nav"):
        p, c = f["properties"], f["geometry"]["coordinates"]
        if not inside(c, 0.5):
            continue
        nav.append({"ident": p.get("identifier", ""), "name": p["name"], "type": NAV_TYPE.get(p["type"], str(p["type"])),
                    "mhz": p.get("frequency", {}).get("value", ""), "lon": c[0], "lat": c[1]})

    return {"airports": apts, "obstacles": obs, "reportingPoints": rpp, "navaids": nav}
