# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
"""Prova automatica della 0.18.3 (Chrome headless, Playwright, tablet 1280×800).

Server locale: cd web-prototype && python3 -m http.server 8765
Uso: python3 tools/shot_0183.py

Controlla:
  - Piano di volo: riga «Carburante a bordo» separata, con autonomia e margine
  - il riepilogo in alto a destra (Pianifica) si aggiorna appena si inserisce il carburante a bordo; avviso
    «Carburante insufficiente» anche fuori dalla scheda del piano
  - rotta: niente tratteggio sovrapposto, una sola freccia per tratto
Schermate: tools/v0183-piano.png, tools/v0183-pianifica.png
Firma: fringuello79 di Avezzano.
"""
import asyncio
import pathlib

from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).parent
A = "window.__airplanning"


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
        await pg.evaluate(f"{A}.setRoute([[13.55778, 42.05167], [13.45, 42.2], [13.55, 42.30], [13.309, 42.379]])")
        await pg.wait_for_timeout(4000)
        s0 = await pg.inner_text("#summary")
        check("non indicato" in s0, "riepilogo: carburante a bordo non indicato")
        # rotta: una freccia per tratto, nessuna linea tratteggiata
        arrows = await pg.evaluate(f"{A}.groups.route.children.filter(o => o.isSprite && o.renderOrder === 11).length")
        dashed = await pg.evaluate(f"{A}.groups.route.children.filter(o => o.material && o.material.dashed).length")
        check(arrows == 3 and dashed == 0, f"rotta: {arrows} frecce per 3 tratti, {dashed} linee tratteggiate")
        # Piano di volo: carburante a bordo
        await pg.evaluate(f"{A}.setView('navlog')")
        await pg.wait_for_timeout(1500)
        box = pg.locator("#navlog [data-p='load.fuelL']")
        check(await pg.locator("#navlog .nl-onboard").count() == 1, "piano: riga «Carburante a bordo» separata")
        await box.fill("5")
        await box.press("Enter")
        await pg.wait_for_timeout(800)
        await pg.evaluate(f"{A}.setView('plan')")
        await pg.wait_for_timeout(800)
        s1 = await pg.inner_text("#summary")
        w1 = await pg.evaluate(f"{A}.state.analysis.warnings.map(w => w.title)")
        check("A bordo" in s1 and "5 l" in s1 and "mancano" in s1, f"riepilogo aggiornato subito: «{[l for l in s1.splitlines() if 'bordo' in l.lower() or 'mancano' in l][:2]}»")
        check("Carburante insufficiente" in w1, "avviso «Carburante insufficiente» anche in Pianifica")
        await pg.evaluate(f"{A}.setView('navlog')")
        await pg.wait_for_timeout(800)
        box = pg.locator("#navlog [data-p='load.fuelL']")
        await box.fill("90")
        await box.press("Enter")
        await pg.wait_for_timeout(800)
        t = await pg.inner_text("#navlog .nl-onboard")
        check("autonomia" in t and "oltre volo" in t, f"piano: autonomia e margine accanto al carburante a bordo («{t.strip()[:90]}»)")
        await pg.locator("#navlog .nl-onboard").scroll_into_view_if_needed()
        await pg.screenshot(path=str(HERE / "v0183-piano.png"))
        await pg.evaluate(f"{A}.setView('plan')")
        await pg.wait_for_timeout(1500)
        s2 = await pg.inner_text("#summary")
        w2 = await pg.evaluate(f"{A}.state.analysis.warnings.map(w => w.title)")
        check("90 l" in s2 and "autonomia" in s2 and "sul minimo" in s2 and "Carburante insufficiente" not in w2, "riepilogo con 90 l: autonomia e margine, avviso sparito")
        await pg.screenshot(path=str(HERE / "v0183-pianifica.png"))
        await b.close()
    print("\n" + ("Tutte le prove superate, nessun errore JavaScript." if not errors else "ERRORI:\n" + "\n".join(errors)))
    raise SystemExit(1 if errors else 0)

asyncio.run(main())
