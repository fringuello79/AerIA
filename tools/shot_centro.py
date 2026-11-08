# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
"""Prova automatica del pacchetto «Italia centrale» e delle funzioni del 6/11/2026 (Chrome headless, Playwright).

Server locale: cd web-prototype && python3 -m http.server 8765   (con i file del ramo «pacchetti» in data/centro)
Uso: python3 tools/shot_centro.py

Controlla e stampa:
  - caricamento del pacchetto, tessere fini caricate solo dove servono, quote di vette note
  - ricerca (campi, località) e aggiunta alla rotta
  - rampe di salita e discesa (TOC/TOD) con il profilo dell'aereo, nessun falso allarme al decollo
  - trascinamento di un punto (2D) e della quota di un tratto (3D)
  - volo simulato: campi vicini, planata, fuori rotta, traccia GPX
Schermate in tools/: centro3d.png, centro2d.png, rampe.png, trascina.png, vicini.png
"""
import asyncio
import json
import pathlib

from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).parent
A = "window.__airplanning"


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width": 1440, "height": 900}, accept_downloads=True)
        pg.set_default_timeout(120000)
        errors = []
        pg.on("pageerror", lambda e: errors.append(f"ERRORE PAGINA: {e}"))
        for host in ("aviationweather.gov", "api.open-meteo.com", "radar-api.protezionecivile.it"):
            await pg.route(f"**/{host}/**", lambda r: r.abort())

        async def snap(name):
            for attempt in (1, 2):
                try:
                    return await pg.screenshot(path=str(HERE / name), timeout=90000)
                except Exception:
                    if attempt == 2:
                        raise
                    await pg.wait_for_timeout(3000)

        def check(cond, msg):
            print(("OK   " if cond else "ERRORE ") + msg)
            if not cond:
                errors.append(msg)

        await pg.goto("http://localhost:8765/index.html")
        await pg.wait_for_function("document.querySelector('#chips').innerText.includes('Italia centrale')", timeout=120000)
        await pg.wait_for_timeout(2500)
        print("DATI:", await pg.inner_text("#chips"))
        lab = await pg.evaluate(f"{A}.terrainLabel()")
        check("Italia centrale" in lab, f"pacchetto caricato: {lab}")
        # quote: Corno Grande e Velino (vette corrette con OSM), Fucino (piana a circa 650 m)
        cg = await pg.evaluate(f"(() => {{ const p = {A}.state.basemap.peaks.find(x => x.n.includes('Corno Grande') && x.ele >= 2900); return p && [p.lon, p.lat, p.ele]; }})()")
        print("Corno Grande in OpenStreetMap:", cg)
        for name, lon, lat, lo, hi in [("Corno Grande", cg[0], cg[1], cg[2], cg[2] + 80), ("Fucino", 13.55, 41.98, 640, 700)]:
            await pg.evaluate(f"{A}.lookAt({lon}, {lat})")
            await pg.wait_for_timeout(2500)
            # massimo entro circa 200 m: la vetta OSM può essere spostata sul versante
            v = await pg.evaluate(f"(() => {{ let m = -1e9; for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) m = Math.max(m, {A}.elevM({lon} + i * 0.0006, {lat} + j * 0.00045)); return m; }})()")
            check(lo <= v <= hi, f"quota {name}: {v} m (atteso {lo}–{hi})")
        await pg.evaluate(f"{A}.lookAt(13.43, 42.03)")
        await pg.wait_for_timeout(3000)
        await snap("centro3d.png")

        # aviazione generale a 9500 ft: la rotta Celano → Rieti scavalca il Velino (2486 m)
        await pg.select_option("#pilot", "ag")
        await pg.fill("#cruise", "9500")
        await pg.dispatch_event("#cruise", "input")
        # ricerca e rotta Celano → Rieti → Perugia
        for q, pick in [("celano", "Celano"), ("LIQN", "Rieti"), ("LIRZ", "Perugia")]:
            await pg.fill("#findQ", q)
            await pg.wait_for_timeout(400)
            txt = await pg.inner_text("#findList")
            check(pick.lower() in txt.lower(), f"ricerca «{q}» trova {pick}")
            await pg.click("#findList [data-addf='0']")
            await pg.wait_for_timeout(1500)
        print("PUNTI:\n" + await pg.inner_text("#wpList"))
        await pg.wait_for_timeout(4000)   # tessere fini lungo la rotta
        prof = await pg.evaluate(f"{A}.profile()")
        print("PROFILO:", json.dumps({k: prof[k] for k in ("events", "climb", "depEnd", "arrStart")}, ensure_ascii=False)[:600])
        check(any(e["kind"] == "TOC" for e in prof["events"]) and any(e["kind"] == "TOD" for e in prof["events"]), "rampe: TOC e TOD presenti")
        st = await pg.evaluate(f"(() => {{ const s = {A}.state; return {{ first: s.analysis.samples[0].alt, last: s.analysis.samples.at(-1).alt, warn: s.analysis.warnings.map(w => w.title) }}; }})()")
        print("AVVISI:", st["warn"])
        # al decollo nessun allarme; se la salita a 500 ft/min verso il Velino incontra il rilievo, deve dirlo e dove
        dep = await pg.evaluate(f"(() => {{ const w = {A}.state.analysis.warnings.find(x => /salita dopo il decollo/.test(x.title)); if (!w) return null; const s = {A}.state.analysis.samples.filter(x => x.phase === 'dep' && x.dist > 1000 && x.alt < x.terr); return {{ text: w.text, first: s[0] && [s[0].dist, s[0].alt, s[0].terr] }}; }})()")
        print("SALITA:", dep)
        check(dep is None or (dep["first"][0] > 1000 and dep["first"][2] > dep["first"][1]), "allarme di salita solo dove il rilievo supera davvero la rampa, oltre 1 km dal campo")
        check(abs(st["first"] - 2241) < 30, f"il profilo parte dalla quota del campo ({st['first']} ft)")
        print("CHIPS:", await pg.inner_text("#chips"))
        await snap("rampe.png")

        # nessun punto dentro il terreno: un punto sulla vetta del Velino con crociera bassa alza il tratto
        saved = await pg.evaluate(f"JSON.stringify({A}.state.route)")
        await pg.fill("#cruise", "4500")
        await pg.dispatch_event("#cruise", "input")
        await pg.evaluate(f"{A}.setRoute([[13.5357, 42.0387], [13.3815, 42.1471], [13.43, 42.03]])")
        await pg.evaluate(f"{A}.lookAt(13.3815, 42.1471)")
        await pg.wait_for_timeout(6000)
        await pg.evaluate(f"{A}.refresh()")
        await pg.wait_for_timeout(1500)
        cl = await pg.evaluate(f"(() => {{ const s = {A}.state, R = s.route, t = {A}.elevM(R[1].lon, R[1].lat) * 3.28084; return {{ alts: R.map(p => p.altFt ?? null), terr: Math.round(t), warn: s.analysis.warnings.filter(w => /alzata/.test(w.title)).map(w => w.title + ' · ' + w.text) }}; }})()")
        print("PUNTO SUL VELINO:", cl)
        check(all(a is not None and a >= cl["terr"] + 300 and a % 100 == 0 for a in cl["alts"][:2]), "i tratti che toccano il punto sul Velino sono alzati ad almeno 300 ft sopra il terreno")
        check(len(cl["warn"]) == 2, "la modifica è segnalata negli avvisi")
        await pg.fill("#cruise", "9500")
        await pg.dispatch_event("#cruise", "input")
        await pg.evaluate(f"(() => {{ const r = JSON.parse({json.dumps(saved)}); {A}.state.route.splice(0, Infinity, ...r); {A}.refresh(); }})()")
        await pg.wait_for_timeout(1500)

        # trascinamento del punto 2 (Rieti) in 2D di circa 120 pixel verso destra
        await pg.evaluate(f"{A}.setDim('2d')")
        await pg.wait_for_timeout(2500)
        before = await pg.evaluate(f"(() => {{ const r = {A}.state.route[1]; return [r.lon, r.lat, r.name]; }})()")
        await pg.evaluate(f"{A}.lookAt({before[0]}, {before[1]})")
        await pg.wait_for_timeout(2000)
        xy = await pg.evaluate(f"{A}.screenOf(1)")
        # dalla 0.17.0 il primo tocco seleziona il punto, il secondo lo trascina
        await pg.mouse.click(*xy)
        await pg.wait_for_timeout(800)
        xy = await pg.evaluate(f"{A}.screenOf(1)")
        await pg.mouse.move(*xy)
        await pg.mouse.down()
        for k in range(1, 9):
            await pg.mouse.move(xy[0] + 15 * k, xy[1] + 5 * k)
            await pg.wait_for_timeout(150)
        await pg.mouse.up()
        await pg.wait_for_timeout(2500)
        after = await pg.evaluate(f"(() => {{ const r = {A}.state.route[1]; return [r.lon, r.lat, r.name]; }})()")
        print("TRASCINATO:", before, "→", after)
        check(after[0] > before[0] + 0.01 and after[1] < before[1], "il punto si sposta a est e a sud trascinandolo")
        await snap("trascina.png")

        # quota del tratto 1 → 2 trascinando il cono blu in 3D (verso l'alto = più alto)
        await pg.evaluate(f"{A}.setDim('3d')")
        await pg.wait_for_timeout(2500)
        r0 = await pg.evaluate(f"[{A}.state.route[0].lon, {A}.state.route[0].lat]")
        await pg.evaluate(f"{A}.lookAt({r0[0]}, {r0[1]})")
        await pg.wait_for_timeout(2500)
        a0 = await pg.evaluate(f"{A}.state.route[0].altFt ?? null")
        hxy = await pg.evaluate(f"{A}.screenOf(0, true)")
        check(hxy is not None, "maniglia della quota presente in 3D")
        if hxy:
            await pg.mouse.click(*hxy)
            await pg.wait_for_timeout(800)
            hxy = await pg.evaluate(f"{A}.screenOf(0, true)") or hxy
            await pg.mouse.move(*hxy)
            await pg.mouse.down()
            for k in range(1, 7):
                await pg.mouse.move(hxy[0], hxy[1] - 12 * k)
                await pg.wait_for_timeout(150)
            await pg.mouse.up()
            await pg.wait_for_timeout(2500)
            a1 = await pg.evaluate(f"{A}.state.route[0].altFt ?? null")
            print("QUOTA TRATTO 1:", a0, "→", a1)
            check(a1 is not None and 9500 < a1 <= 19500 and a1 % 100 == 0, "la quota del tratto sale trascinando il cono")

        # volo simulato: campi vicini, planata, fuori rotta, traccia
        await pg.evaluate(f"{A}.setView('fly')")
        await pg.wait_for_timeout(1500)
        await pg.evaluate(f"{A}.startSim()")
        await pg.wait_for_timeout(6000)
        await pg.click("#nearBtn")
        await pg.wait_for_timeout(3500)
        near = await pg.inner_text("#nearest")
        print("CAMPI VICINI:\n" + near)
        check("NM" in near and "Planata" in near, "elenco dei campi vicini con planata")
        inst = await pg.inner_text("#instruments")
        print("STRUMENTI:", inst.replace("\n", " | "))
        check("fuori rotta" in inst.lower(), "indicazione fuori rotta")
        await snap("vicini.png")
        await pg.click("#nearest [data-direct]")
        await pg.wait_for_timeout(2000)
        inst = await pg.inner_text("#instruments")
        check("diretto" in inst.lower() and "rotta diretta" in inst.lower(), "«Diretto» al campo più vicino")
        await pg.evaluate(f"{A}.stopFly()")
        async with pg.expect_download() as dl:
            await pg.click("#trackBtn")
        d = await dl.value
        gpx = pathlib.Path(await d.path()).read_text()
        n = gpx.count("<trkpt")
        check(n >= 2 and "<ele>" in gpx and "<time>" in gpx, f"traccia GPX esportata ({n} punti)")

        print("\nERRORI:" if errors else "\nNessun errore.", *errors, sep="\n")
        await b.close()


asyncio.run(main())
