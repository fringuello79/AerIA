# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
"""Prova automatica delle novità della 0.23.0 (Chrome headless, Playwright, tablet 1280×800 con tocco).

Server locale: cd web-prototype && python3 -m http.server 8765   (pacchetto Italia centrale in data/centro)
Uso: python3 tools/shot_023.py

Controlla, con posizioni di prova lungo Celano → L'Aquila Preturo (LIAP):
  discesa guidata  punto d'inizio discesa uguale a quello calcolato qui a parte (formule WGS84), annunci a voce
  cinquecento      annuncio scendendo a 500 ft sopra il campo d'arrivo, entro 5 NM
  spazi attorno    evidenziati entro 5 NM e 1000 ft, «vicino» entro 2 NM con la quota dentro i limiti
  terreno          margine scelto dal pilota (150 o 1000 ft) e «solo gravi»
  GPS perso        rilievo non colorato, avviso grande, tocco che lo nasconde per un minuto
  conferma         un tocco sull'avviso grave lo nasconde finché resta lo stesso
  campi vicini     filtro per pista minima
  impostazioni     salvate nel dispositivo
Le schermate vanno in tools/ (volo023.png, perso023.png).
"""
import asyncio
import math
import pathlib

from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).parent
A = "window.__airplanning"
URL = "http://localhost:8765/index.html"
CELANO, LIAP = (13.55778, 42.05167), (13.309, 42.379)
LIAP_ELEV_M = 670


def deg_len(lat):
    """Lunghezza in metri di un grado (WGS84): stesse formule della letteratura, scritte qui a parte."""
    p = math.radians(lat)
    return (111132.954 - 559.822 * math.cos(2 * p) + 1.175 * math.cos(4 * p),
            111412.84 * math.cos(p) - 93.5 * math.cos(3 * p) + 0.118 * math.cos(5 * p))


def dist_nm(a, b):
    la, lo = deg_len((a[1] + b[1]) / 2)
    return math.hypot((b[0] - a[0]) * lo, (b[1] - a[1]) * la) / 1852


def at(frac):
    return (CELANO[0] + (LIAP[0] - CELANO[0]) * frac, CELANO[1] + (LIAP[1] - CELANO[1]) * frac)


async def open_app(p, w=1280, h=800):
    b = await p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
    ctx = await b.new_context(viewport={"width": w, "height": h}, has_touch=True, locale="it-IT", timezone_id="Europe/Rome")
    pg = await ctx.new_page()
    pg.errs = []
    pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    for host in ("aviationweather.gov", "api.open-meteo.com", "radar-api.protezionecivile.it", "api.github.com"):
        await pg.route(f"**/{host}/**", lambda r: r.abort())
    await pg.goto(URL)
    await pg.wait_for_function(f"{A} && {A}.state.airspaces.length > 10", timeout=180000)
    await pg.wait_for_timeout(2000)
    return b, pg


async def fix(pg, lon, lat, alt, gs=95, trk=326):
    """Una posizione; l'orologio delle posizioni avanza di 1 s a ogni chiamata (sempre in avanti)."""
    await pg.evaluate(f"(() => {{ const f = {A}.state.fly; f.slowAt = 0; window.__t = Math.max(window.__t || 0, Date.now()) + 1000; {A}.fix({{ lon: {lon}, lat: {lat}, altFt: {alt}, gsKt: {gs}, trk: {trk}, t: window.__t }}); }})()")
    await pg.wait_for_timeout(150)


async def steady(pg, lon, lat, alt, trk, n=12, gs=95):
    """n posizioni a quota e rotta costanti (1 s l'una): variometro (10 s) e virata in corso (6 s) tornano a zero."""
    la, lo = deg_len(lat)
    for k in range(n):
        d = gs * 1852 / 3600 * k
        await fix(pg, lon + d * math.sin(math.radians(trk)) / lo, lat + d * math.cos(math.radians(trk)) / la, alt, gs, trk)


async def main():
    errors = []

    def check(cond, msg):
        print(("OK   " if cond else "ERRORE ") + msg)
        if not cond:
            errors.append(msg)

    async with async_playwright() as p:
        b, pg = await open_app(p)
        await pg.evaluate(f"{A}.setRoute([[{CELANO[0]},{CELANO[1]}],[{LIAP[0]},{LIAP[1]}]])"); await pg.wait_for_timeout(2500)
        await pg.evaluate(f"{A}.setView('fly')"); await pg.wait_for_timeout(500)
        await pg.evaluate(f"(() => {{ {A}.state.voice = true; {A}.state.alertSet = {{ margin: 'auto', aheadS: 120, sens: 'tutti', call500: true, near: true, tod: true }}; }})()")
        # 15 s a terra (decollo riconosciuto dopo 10 s oltre 40 kt), poi in volo
        await pg.evaluate(f"(() => {{ const t0 = Date.now(); for (let i = 0; i < 15; i++) {A}.fix({{ lon: {CELANO[0]}, lat: {CELANO[1]}, altFt: 2300, gsKt: 60, trk: 330, t: t0 + i * 1000 }}); window.__t = t0 + 15000; }})()")

        # ---------------------------------------------------------------- discesa guidata
        # obiettivo: 670 m = 2198 ft + 1000 ft di circuito = 3198 ft; a 95 kt e 500 ft/min si perdono 315,8 ft per miglio
        for frac in (0.2, 0.45):
            pt = at(frac)
            await fix(pg, pt[0], pt[1], 6500)
            dg = await pg.evaluate(f"(() => {{ const f = {A}.state.fly; return f.dg && f.arr ? [f.arr.name, f.arr.targetFt, f.dg.todNm, f.dg.state] : null; }})()")
            d = dist_nm(pt, LIAP)
            tgt = LIAP_ELEV_M * 3.28084 + 1000
            tod = d - (6500 - tgt) / (500 / 95 * 60)
            check(dg is not None and dg[0] == "LIAP" and abs(dg[1] - tgt) < 1 and abs(dg[2] - tod) < 0.05 and dg[3] == "crociera",
                  f"discesa: a {d:.2f} NM inizio discesa tra {tod:.2f} NM (app: {dg and round(dg[2], 2)})")
        # vicino al Parco del Velino (openAIP: area protetta SFC–3300 ft AGL) a 6500 ft: dentro la fascia di quota
        nr = await pg.evaluate(f"(() => {{ const f = {A}.state.fly; return {{ near: f.near.map(x => [x.a.name, x.distNm, x.gapFt, x.side]), unc: f.unc }}; }})()")
        check(len(nr["near"]) >= 1 and all(d <= 2 and g <= nr["unc"] for _, d, g, _ in nr["near"]), f"spazi vicini: avviso entro 2 NM con la quota nei limiti ({[(n, round(d, 1), sd) for n, d, _, sd in nr['near']]})")
        await fix(pg, *at(0.55), 6500)
        spoken = await pg.evaluate(f"[...{A}.state.fly.spoken.keys()]")
        check(any(k.startswith("tod-") and not k.startswith("tod-1") for k in spoken), "discesa: annuncio «Inizia la discesa» dato una volta")
        vn = await pg.evaluate(f"(() => {{ {A}.state.inst = ['gs','alt','agl','msa','esa','vnav','vsr','dest']; window.__t += 1000; {A}.fix({{ lon: {at(0.62)[0]}, lat: {at(0.62)[1]}, altFt: 6000, gsKt: 95, trk: 326, t: window.__t }}); return [...document.querySelectorAll('#instruments button')].map(b => b.innerText.replace(/\\n/g, ' | ')); }})()")
        check(any(v.startswith("Profilo LIAP") for v in vn), f"discesa: casella del profilo ({[v for v in vn if 'LIAP' in v][:1]})")
        check(any(v.startswith("Quota sicura qui |") and v.split("| ")[1].endswith("ft") for v in vn), "quota sicura qui mostrata")
        await pg.screenshot(path=str(HERE / "volo023.png"))

        # ---------------------------------------------------------------- spazi attorno (dati openAIP del pacchetto)
        r = await pg.evaluate(f"(() => {{ const f = {A}.state.fly; return {{ around: f.around.map(x => [x.distNm, x.gapFt]), emph: f.emph.size, near: f.near.map(x => [x.distNm, x.gapFt]), unc: f.unc }}; }})()")
        check(all(d <= 5 for d, _ in r["around"]), "spazi attorno: solo entro 5 NM")
        check(1 <= r["emph"] <= 8 and all(d <= 2 and g <= r["unc"] for d, g in r["near"]), f"spazi evidenziati sulla carta: {r['emph']}")

        # ---------------------------------------------------------------- cinquecento
        await fix(pg, *at(0.97), 2198 + 520)
        await fix(pg, *at(0.985), 2198 + 450)
        c5 = await pg.evaluate(f"{A}.state.fly.c5")
        check(c5 == {"armed": False}, f"cinquecento: annunciato a 450 ft sopra il campo ({c5})")

        # ---------------------------------------------------------------- terreno: margine scelto
        # piana del Fucino (13,58 E 41,96 N) a 2900 ft verso est: margine dal terreno di circa 700 ft
        async def terrain_events(margin, sens="tutti"):
            await pg.evaluate(f"(() => {{ {A}.state.alertSet.margin = {margin!r}; {A}.state.alertSet.sens = '{sens}'; }})()")
            await steady(pg, 13.58, 41.96, 2900, 90)
            return await pg.evaluate(f"{A}.state.fly.events.filter(e => e.kind === 'terrain').map(e => [e.lvl, e.clearance])")
        e150 = await terrain_events(150)
        e1000 = await terrain_events(1000)
        unc = 250   # incertezza della quota di prova (nessuna precisione dichiarata dal GPS)
        check(e150 == [], f"terreno: con 150 ft nessun avviso a circa 700 ft dal suolo ({e150})")
        check(any(lvl == "warn" and 150 + unc <= c < 1000 + unc for lvl, c in e1000), f"terreno: con 1000 ft avviso di attenzione ({e1000})")
        eg = await terrain_events(1000, "gravi")
        check(eg == [], f"terreno: «solo gravi» toglie l'avviso giallo ({eg})")
        await pg.evaluate(f"(() => {{ {A}.state.alertSet.margin = 'auto'; {A}.state.alertSet.sens = 'tutti'; }})()")

        # ---------------------------------------------------------------- conferma dell'avviso grave
        await steady(pg, 13.40, 42.10, 4300, 350)
        key = await pg.evaluate("document.getElementById('alertbig').style.display === 'block' ? document.getElementById('alertbig').dataset.key : ''")
        if key:
            await pg.click("#alertbig"); await pg.wait_for_timeout(150)
            await fix(pg, 13.40, 42.1012, 4300, 95, 350)
            now = await pg.evaluate("[document.getElementById('alertbig').style.display, document.getElementById('alertbig').dataset.key]")
            check(now[0] == "none" or now[1] != key, f"conferma: l'avviso «{key}» toccato non torna finché è lo stesso")
        else:
            check(False, "conferma: nessun avviso grave da confermare nel punto di prova")

        # ---------------------------------------------------------------- GPS perso
        await pg.evaluate(f"{A}.state.fly.fixWall = Date.now() - 20000"); await pg.wait_for_timeout(2300)
        r = await pg.evaluate(f"[{A}.state.fly.lost, {A}.hazard()[3], document.getElementById('alertbig').innerText]")
        check(r[0] and r[1] == 0 and "Posizione non aggiornata" in r[2], "GPS perso: rilievo non colorato e avviso grande")
        await pg.screenshot(path=str(HERE / "perso023.png"))
        await pg.click("#alertbig"); await pg.wait_for_timeout(1300)
        check(await pg.evaluate("document.getElementById('alertbig').style.display") == "none", "GPS perso: un tocco nasconde l'avviso per un minuto")

        # ---------------------------------------------------------------- campi vicini
        await fix(pg, *at(0.5), 6500)
        await pg.click("#nearBtn"); await pg.wait_for_timeout(500)
        await pg.select_option("#nearest select[data-minrwy]", "1000"); await pg.wait_for_timeout(500)
        rows = await pg.evaluate("[...document.querySelectorAll('#nearest .txt')].map(e => e.innerText)")
        ok = all(("pista non nota" in t) or int(t.split("pista ")[1].split(" m")[0]) >= 1000 for t in rows)
        check(rows and ok, f"campi vicini: solo piste da 1000 m o non note ({len(rows)} campi)")

        # ---------------------------------------------------------------- impostazioni salvate
        await pg.click("#settingsBtn"); await pg.wait_for_timeout(400)
        await pg.evaluate("[...document.querySelectorAll('details.dsec')].find(d => d.querySelector('summary').innerText.includes('Avvisi in volo')).open = true")
        await pg.select_option("#alMargin", "500"); await pg.select_option("#alAhead", "90"); await pg.click("#alNear")
        saved = await pg.evaluate("JSON.parse(localStorage.getItem('airplanning.prefs')).alertSet")
        check(saved["margin"] == 500 and saved["aheadS"] == 90 and saved["near"] is False, f"impostazioni salvate ({saved})")
        check(not pg.errs, f"nessun errore JavaScript ({pg.errs[:1]})")
        await b.close()

    print("\n" + ("Nessun errore." if not errors else f"{len(errors)} errori."))


asyncio.run(main())
