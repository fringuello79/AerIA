# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
"""Prova delle fonti NOTAM raggiungibili senza account (gira nel workflow «Prova NOTAM»).

Stampa per ogni fonte: risposta, quanti NOTAM per le località italiane, esempi e serie presenti.
Firma: fringuello79 di Avezzano.
"""
import collections
import json
import re
import urllib.parse
import urllib.request

UA = {"User-Agent": "AerIA-VFR/0.18 (prova fonti NOTAM)"}


def get(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers={**UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, r.headers.get("content-type"), r.read()


print("== robots.txt FAA")
try:
    print(get("https://notams.aim.faa.gov/robots.txt")[2].decode()[:800])
except Exception as e:
    print("errore", e)

for loc in ["LIRR", "LIBB", "LIMM", "LIRF", "LIAP", "LIBP", "LIRZ"]:
    print(f"\n== FAA notamSearch {loc}")
    body = urllib.parse.urlencode({"searchType": 0, "designatorsForLocation": loc, "offset": 0, "notamsOnly": "false"}).encode()
    try:
        st, ct, raw = get("https://notams.aim.faa.gov/notamSearch/search", body, {"Content-Type": "application/x-www-form-urlencoded"})
        d = json.loads(raw)
        lst = d.get("notamList", [])
        print(st, ct, "totale", d.get("totalNotamCount"), "in pagina", len(lst), "chiavi", sorted(lst[0].keys())[:30] if lst else None)
        series = collections.Counter(re.match(r"[A-Z]", n.get("notamNumber", "?") or "?").group(0) if re.match(r"[A-Z]", n.get("notamNumber", "") or "") else "?" for n in lst)
        print("serie", dict(series))
        for n in lst[:3]:
            print("---", n.get("notamNumber"), n.get("issueDate"), n.get("startDate"), n.get("endDate"), n.get("source"), n.get("sourceType"))
            print((n.get("icaoMessage") or n.get("traditionalMessage") or "")[:400])
    except Exception as e:
        print("errore", e)

print("\n== NOTAMbriefing public search")
for u in ["https://notambriefing.com/api/public/v1/search?q=LIRR", "https://api.notambriefing.com/public/v1/search?q=LIRR", "https://notambriefing.com/public/v1/search?q=LIRR"]:
    try:
        st, ct, raw = get(u)
        print(u, st, ct, raw[:600])
    except Exception as e:
        print(u, "errore", e)
for u in ["https://notambriefing.com/robots.txt", "https://notambriefing.com/developers/terms", "https://notambriefing.com/docs/api"]:
    try:
        st, ct, raw = get(u)
        txt = re.sub(r"<[^>]+>", " ", raw.decode("utf-8", "replace"))
        txt = re.sub(r"\s+", " ", txt)
        print("\n==", u, st, ct)
        print(txt[:3000])
    except Exception as e:
        print(u, "errore", e)
