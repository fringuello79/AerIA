# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
"""Confronta due versioni del pacchetto aeronautico (airspaces.json, features.json) e scrive l'elenco delle
differenze in Markdown, da leggere prima di accettare un aggiornamento.

Uso: python3 tools/confronta_dati.py CARTELLA_VECCHIA CARTELLA_NUOVA [--esito FILE]
Con --esito scrive «cambiati» oppure «uguali» nel file indicato (per il workflow).
Firma: fringuello79 di Avezzano.
"""
import hashlib
import json
import sys
from pathlib import Path

UNIT = {0: "m", 1: "ft", 6: "FL"}
DATUM = {0: "GND", 1: "MSL", 2: "STD"}
TYPE = {0: "altro", 1: "R", 2: "Q", 3: "P", 4: "CTR", 7: "TMA", 10: "FIR", 13: "ATZ", 14: "MATZ", 26: "CTA", 28: "attività", 29: "parco", 36: "CTR mil."}
CLS = {0: "A", 1: "B", 2: "C", 3: "D", 4: "E", 5: "F", 6: "G", 8: "-"}


def lim(l):
    if not l:
        return "?"
    u = UNIT.get(l.get("unit"), "?")
    v = l.get("value")
    if u == "FL":
        return f"FL{v}"
    return f"{v} {u} {DATUM.get(l.get('referenceDatum'), '?')}"


def geo_hash(g):
    # coordinate arrotondate a 1e-5° (circa 1 m): differenze più piccole non contano
    def r(x):
        return [r(y) for y in x] if isinstance(x, list) else round(x, 5)
    return hashlib.sha1(json.dumps(r(g["coordinates"])).encode()).hexdigest()[:12]


def desc(p):
    return f"{p.get('name')} ({TYPE.get(p.get('type'), p.get('type'))}, classe {CLS.get(p.get('icaoClass'), p.get('icaoClass'))}, {lim(p.get('lowerLimit'))} – {lim(p.get('upperLimit'))})"


def freqs(p):
    return sorted(f"{f.get('value')} {f.get('name', '')}".strip() for f in p.get("frequencies") or [])


def airspaces(path):
    out = {}
    for f in json.loads((path / "airspaces.json").read_text())["features"]:
        p = f["properties"]
        out[p.get("_id") or p.get("name")] = (p, geo_hash(f["geometry"]))
    return out


def main():
    old, new = Path(sys.argv[1]), Path(sys.argv[2])
    esito = sys.argv[sys.argv.index("--esito") + 1] if "--esito" in sys.argv else None
    A, B = airspaces(old), airspaces(new)
    lines = ["## Spazi aerei", ""]
    added = [B[k][0] for k in B.keys() - A.keys()]
    removed = [A[k][0] for k in A.keys() - B.keys()]
    changed = []
    for k in A.keys() & B.keys():
        (pa, ga), (pb, gb) = A[k], B[k]
        what = []
        if pa.get("name") != pb.get("name"):
            what.append(f"nome «{pa.get('name')}» → «{pb.get('name')}»")
        if pa.get("type") != pb.get("type") or pa.get("icaoClass") != pb.get("icaoClass"):
            what.append(f"tipo/classe {TYPE.get(pa.get('type'))}/{CLS.get(pa.get('icaoClass'))} → {TYPE.get(pb.get('type'))}/{CLS.get(pb.get('icaoClass'))}")
        if lim(pa.get("lowerLimit")) != lim(pb.get("lowerLimit")) or lim(pa.get("upperLimit")) != lim(pb.get("upperLimit")):
            what.append(f"limiti {lim(pa.get('lowerLimit'))} – {lim(pa.get('upperLimit'))} → {lim(pb.get('lowerLimit'))} – {lim(pb.get('upperLimit'))}")
        if ga != gb:
            what.append("confine modificato")
        if freqs(pa) != freqs(pb):
            what.append(f"frequenze {', '.join(freqs(pa)) or 'nessuna'} → {', '.join(freqs(pb)) or 'nessuna'}")
        if what:
            changed.append((pb, what))
    lines.append(f"Prima {len(A)}, dopo {len(B)}: {len(added)} nuovi, {len(removed)} tolti, {len(changed)} modificati.")
    lines.append("")
    for t, items in (("Nuovi", added), ("Tolti", removed)):
        if items:
            lines += [f"### {t}", ""] + [f"- {desc(p)}" for p in sorted(items, key=lambda p: p.get("name") or "")] + [""]
    if changed:
        lines += ["### Modificati", ""] + [f"- {desc(p)}: {'; '.join(w)}" for p, w in sorted(changed, key=lambda c: c[0].get("name") or "")] + [""]

    fa, fb = json.loads((old / "features.json").read_text()), json.loads((new / "features.json").read_text())
    lines += ["## Campi, ostacoli, punti di riporto, radioassistenze", ""]
    feat_changed = False
    key = {"airports": lambda a: a.get("id") or a.get("icao") or a.get("name"),
           "navaids": lambda n: f"{n.get('ident')} {n.get('type')}",
           "reportingPoints": lambda r: f"{r.get('airport')} {r.get('name')}",
           "obstacles": lambda o: f"{round(o['lon'], 5)} {round(o['lat'], 5)}"}
    for k, kf in key.items():
        da = {kf(x): x for x in fa.get(k, [])}
        db = {kf(x): x for x in fb.get(k, [])}
        add, rem = db.keys() - da.keys(), da.keys() - db.keys()
        mod = [x for x in da.keys() & db.keys() if json.dumps(da[x], sort_keys=True) != json.dumps(db[x], sort_keys=True)]
        if add or rem or mod:
            feat_changed = True
        lines.append(f"- **{k}**: prima {len(da)}, dopo {len(db)} · {len(add)} nuovi, {len(rem)} tolti, {len(mod)} modificati")
        if k != "obstacles":
            name = (lambda x: f"{x.get('icao') or ''} {x.get('name')}".strip()) if k == "airports" else (lambda x: f"{x.get('ident') or x.get('name')}")
            for x in sorted(add)[:30]:
                lines.append(f"  - nuovo: {name(db[x])}")
            for x in sorted(rem)[:30]:
                lines.append(f"  - tolto: {name(da[x])}")
            for x in sorted(mod)[:40]:
                diff = [f for f in sorted(set(da[x]) | set(db[x])) if da[x].get(f) != db[x].get(f)]
                lines.append(f"  - modificato: {name(db[x])} ({', '.join(diff)})")
    lines += ["", "Ogni modifica va confrontata con l'AIP in vigore prima di accettarla: openAIP è una fonte comunitaria."]
    print("\n".join(lines))
    if esito:
        Path(esito).write_text("cambiati" if (added or removed or changed or feat_changed) else "uguali")


if __name__ == "__main__":
    main()
