# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
"""Prova automatica della 0.19.1 (Chrome headless, Playwright, tablet 1280×800).

Server locale: cd web-prototype && python3 -m http.server 8765
Uso: python3 tools/shot_0191.py

Controlla:
  - in «Volo» la carta segue l'aereo; trascinandola col dito resta libera anche quando arrivano nuove posizioni;
    il pulsante col mirino la riporta sull'aereo; un tocco senza movimento non la sgancia
  - Riserva del Monte Velino (SFC–3300 ft AGL): sulla vetta il cielo dello spazio è 3300 ft sopra il terreno
    (prima era piatto alla quota del bordo e la vetta lo bucava)
Schermate: tools/v0191-*.png
Firma: fringuello79 di Avezzano.
"""
import asyncio
import pathlib

from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).parent
A = "window.__airplanning"
VELINO = (13.3858, 42.1536)   # vetta del Monte Velino, 2487 m


async def main():
    errors = []

    def check(cond, msg):
        print(("OK   " if cond else "ERRORE ") + msg)
        if not cond:
            errors.append(msg)

    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width": 1280, "height": 800})
        pg.set_default_timeout(180000)
        pg.on("pageerror", lambda e: errors.append(f"ERRORE PAGINA: {e}"))
        await pg.add_init_script("localStorage.clear()")
        await pg.goto("http://localhost:8765/index.html")
        await pg.wait_for_function(f"{A} && {A}.state.proj && document.querySelector('#chips').innerText.includes('Terreno')", timeout=180000)
        await pg.wait_for_timeout(2000)

        # ---------------------------------------------------------------- spazio AGL sulla vetta del Velino
        await pg.evaluate(f"{A}.lookAt({VELINO[0]}, {VELINO[1]})")
        await pg.wait_for_timeout(6000)
        r = await pg.evaluate(f"{A}.airTopFtAt({VELINO[0]}, {VELINO[1]})")
        vel = [h for h in r["hits"] if h["a"] and "VELINO" in h["a"].upper()]
        top = max([h["ft"] for h in vel], default=None)
        check(top is not None and abs(top - (r["terrFt"] + 3300)) < 400, f"Monte Velino: cielo dello spazio sulla vetta {top} ft, terreno {r['terrFt']} ft (atteso terreno + 3300)")
        await pg.screenshot(path=str(HERE / "v0191-velino.png"))

        # ---------------------------------------------------------------- volo: carta libera e ricentraggio
        await pg.evaluate(f"{A}.setView('fly')")
        await pg.wait_for_timeout(800)
        fix = lambda lon, lat, t: pg.evaluate(f"{A}.fix({{ lon: {lon}, lat: {lat}, altFt: 6500, gsKt: 90, trk: 30, t: {t} }})")
        await fix(13.40, 42.00, 1000); await pg.wait_for_timeout(1500)
        f0 = await pg.evaluate(f"{A}.follow()")
        check(f0["follow"] and f0["btn"] == "true", f"all'inizio la carta segue l'aereo: {f0}")
        box = await pg.locator("#view canvas").bounding_box()
        cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        # tocco senza movimento: resta agganciata
        await pg.mouse.click(cx + 50, cy + 60); await pg.wait_for_timeout(500)
        check((await pg.evaluate(f"{A}.follow()"))["follow"], "un tocco senza movimento non sgancia la carta")
        # rotazione col dito
        await pg.mouse.move(cx, cy); await pg.mouse.down()
        for k in range(1, 12):
            await pg.mouse.move(cx + 15 * k, cy + 3 * k); await pg.wait_for_timeout(30)
        await pg.mouse.up(); await pg.wait_for_timeout(600)
        f1 = await pg.evaluate(f"{A}.follow()")
        t1 = await pg.evaluate(f"{A}.camTarget()")
        check(not f1["follow"] and f1["btn"] == "false", f"dopo la rotazione la carta è libera: {f1}")
        await fix(13.42, 42.02, 3000); await pg.wait_for_timeout(1500)
        await fix(13.44, 42.04, 5000); await pg.wait_for_timeout(1500)
        t2 = await pg.evaluate(f"{A}.camTarget()")
        check(max(abs(a - b) for a, b in zip(t1, t2)) < 1e-6, "con nuove posizioni GPS la carta resta dove l'ha portata il pilota")
        await pg.screenshot(path=str(HERE / "v0191-libera.png"))
        await pg.click("#recenterBtn"); await pg.wait_for_timeout(2000)
        f2 = await pg.evaluate(f"{A}.follow()")
        t3 = await pg.evaluate(f"{A}.camTarget()")
        check(f2["follow"] and f2["btn"] == "true" and max(abs(a - b) for a, b in zip(t2, t3)) > 0.5, f"il mirino riporta la carta sull'aereo: {f2}")
        await pg.screenshot(path=str(HERE / "v0191-ricentrata.png"))
        await b.close()
    print("\n" + ("Tutte le prove superate, nessun errore JavaScript." if not errors else "ERRORI:\n" + "\n".join(errors)))
    raise SystemExit(1 if errors else 0)

asyncio.run(main())
