# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
"""Prova automatica dell'app web con Chrome headless (Playwright).

1. Server locale:      cd web-prototype && python3 -m http.server 8765
2. Esegui:             python3 tools/shot.py            (pacchetto Marsica caricato da solo)
                       python3 tools/shot.py file ...   (carica anche i file indicati)

Salva le schermate in tools/ (plan.png, expert.png, meteo.png, plan2d.png, radio.png, fly.png,
fly2d.png, night.png) e stampa riepilogo, avvisi, meteo, punti, chiamate radio, strumenti di volo
e strumenti esterni simulati. Le richieste al servizio meteo vengono bloccate: il meteo usato è il
campione reale salvato in tests/fixtures (6/11/2026), così la prova è ripetibile; lo stesso vale
per la previsione ICON-2I (meteo3d.png).
"""
import asyncio
import json
import pathlib
import sys

from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).parent
ROUTE = "[[13.10, 42.04], [13.45, 42.06], [13.75, 42.07]]"


async def main():
    files = sys.argv[1:]
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width": 1440, "height": 900})
        pg.set_default_timeout(120000)  # il disegno software (swiftshader) è lento: margine per le schermate

        async def snap(name, **kw):
            # con il disegno software una schermata ogni tanto non arriva in tempo: si riprova una volta
            for attempt in (1, 2):
                try:
                    return await pg.screenshot(path=str(HERE / name), timeout=60000, **kw)
                except Exception:
                    if attempt == 2:
                        raise
                    await pg.wait_for_timeout(3000)
        errors = []
        pg.on("pageerror", lambda e: errors.append(f"ERRORE PAGINA: {e}"))
        await pg.route("**/aviationweather.gov/**", lambda r: r.abort())
        await pg.route("**/api.open-meteo.com/**", lambda r: r.abort())
        await pg.route("**/radar-api.protezionecivile.it/**", lambda r: r.abort())
        await pg.goto("http://localhost:8765/index.html")
        await pg.wait_for_function("document.querySelector('#chips').innerText.includes('Terreno')", timeout=60000)
        if files:
            await pg.set_input_files("#file", files)
            await pg.wait_for_timeout(8000)
        await pg.wait_for_timeout(1500)
        print("DATI:", await pg.inner_text("#chips"))
        await pg.evaluate(f"window.__airplanning.setRoute({ROUTE})")
        await pg.wait_for_timeout(1500)
        await snap("plan.png")
        print("\nRIEPILOGO:\n" + await pg.inner_text("#summary"))
        print("\nAVVISI:\n" + await pg.inner_text("#warnings"))
        print("\nPUNTI:\n" + await pg.inner_text("#wpList"))
        await pg.evaluate("window.__airplanning.setMode('expert')")
        await pg.wait_for_timeout(1200)
        await snap("expert.png")
        await pg.evaluate("window.__airplanning.setMode('beginner')")
        await pg.wait_for_timeout(500)
        print("\nMETEO SENZA CONNESSIONE:\n" + await pg.inner_text("#wx"))
        fx = json.loads((HERE.parent / "tests" / "fixtures" / "awc-2026-11-06.json").read_text())
        await pg.evaluate("([j, t]) => window.__airplanning.setWeather(j, t)", [fx, 1793955000 * 1000])
        fc = json.loads((HERE.parent / "tests" / "fixtures" / "icon2i-2026-11-06T09.json").read_text())
        await pg.evaluate("f => window.__airplanning.setForecast(f)", fc)
        await pg.wait_for_timeout(1200)
        await snap("meteo.png")
        radar_dir = HERE.parent / "data" / "radar"
        if (radar_dir / "SRI.tif").exists():
            import base64, random
            b64 = [base64.b64encode((radar_dir / f).read_bytes()).decode() for f in ("SRI.tif", "CAPPI_2.tif")]
            await pg.evaluate("([b, t]) => window.__airplanning.setRadar(b, t)", [b64, 1793972400000])
            # confronto indipendente: lettura del browser (geotiff.js + proiezione dell'app) contro rasterio + pyproj
            import rasterio
            from pyproj import Transformer
            rs = [rasterio.open(radar_dir / f) for f in ("SRI.tif", "CAPPI_2.tif")]
            tr = Transformer.from_crs("EPSG:4326", rs[0].crs, always_xy=True)
            random.seed(1)
            pts = [(13.43, 42.03)] + [(13 + random.random(), 41.6 + random.random()) for _ in range(300)]
            bad = 0
            for lo, la in pts:
                web = await pg.evaluate("([lo, la]) => window.__airplanning.sampleRadar(lo, la)", [lo, la])
                x, y = tr.transform(lo, la)
                for k, r in enumerate(rs):
                    v = float(list(r.sample([(x, y)]))[0][0])
                    w = web[k]["v"] if web[k]["code"] == "ok" else (-9999.0 if web[k]["code"] == "non osservato" else -9998.0)
                    if abs(v - w) > 1e-3:
                        bad += 1
            print(f"\nRADAR: {len(pts)} punti confrontati con rasterio, {bad} differenze")
            await pg.wait_for_timeout(800)
            await snap("radar.png")
        await pg.evaluate("document.querySelector('#cruise').value = 6000; document.querySelector('#cruise').dispatchEvent(new Event('input'))")
        await pg.evaluate("window.__airplanning.setRoute([[13.2, 41.65], [13.4, 41.8], [13.6, 42.05]])")
        await pg.wait_for_timeout(1500)
        await snap("meteo3d.png")
        print("\nAVVISI CON PREVISIONE (6000 ft, rotta a sud):\n" + await pg.inner_text("#warnings"))
        await pg.evaluate("document.querySelector('#cruise').value = 3500; document.querySelector('#cruise').dispatchEvent(new Event('input'))")
        await pg.evaluate(f"window.__airplanning.setRoute({ROUTE})")
        await pg.wait_for_timeout(800)
        print("\nMETEO (campione 6/11/2026):\n" + await pg.inner_text("#wx"))
        print("\nAVVISI CON METEO:\n" + await pg.inner_text("#warnings"))
        await pg.evaluate("window.__airplanning.setDim('2d')")
        await pg.wait_for_timeout(1200)
        await snap("plan2d.png")
        await pg.evaluate("window.__airplanning.setDim('3d')")
        await pg.evaluate("document.querySelector('#pilot').value='avanzato'; document.querySelector('#pilot').dispatchEvent(new Event('input'))")
        await pg.evaluate("document.querySelector('#callsign').value='I-A123'; document.querySelector('#callsign').dispatchEvent(new Event('input'))")
        await pg.evaluate("window.__airplanning.setView('radio')")
        await pg.wait_for_timeout(1200)
        await snap("radio.png")
        print("\nRADIO (inizio):\n" + (await pg.inner_text("#cards"))[:1500])

        # Piano di volo: Celano → L'Aquila Preturo con alternato, profilo di riferimento P2002 Sierra dell'aeroclub.
        await pg.evaluate("window.__airplanning.setRoute([[13.55778, 42.05167], [13.45, 42.2], [13.309, 42.379]])")
        await pg.evaluate("window.__airplanning.state.route[0].name = 'CELANO'; window.__airplanning.state.route[2].name = 'LIAP'")
        await pg.evaluate("document.querySelector('#cruise').value = 6500; document.querySelector('#cruise').dispatchEvent(new Event('input'))")
        # quota diversa per il secondo tratto, dall'elenco dei punti della vista Pianifica
        await pg.evaluate("window.__airplanning.setView('plan')")
        await pg.wait_for_timeout(500)
        await pg.evaluate("(() => { const el = document.querySelector('#wpList [data-alt=\"1\"]'); el.value = '8500'; el.dispatchEvent(new Event('change', { bubbles: true })); })()")
        await pg.wait_for_timeout(1200)
        await snap("quote.png")
        print("\nAVVISI CON QUOTA PER TRATTO:\n" + (await pg.inner_text("#warnings"))[:600])
        await pg.evaluate("window.__airplanning.setView('navlog')")
        await pg.wait_for_timeout(800)
        async def setp(path, val):
            await pg.evaluate("([p, v]) => { const el = document.querySelector(`#navlog [data-p=\"${p}\"]`); el.value = v; el.dispatchEvent(new Event('change')); }", [path, val])
            await pg.wait_for_timeout(150)
        # profilo P2002 Sierra di riferimento dell'aeroclub (valori del modulo compilato del 2024)
        for path, val in [("toTime", "07:39"), ("startTime", "07:30"), ("alternate", "AVIOSUPERFICIE L AQUILA"),
                          ("load.pilotKg", "75"), ("load.copilotKg", "70"), ("load.luggageKg", "10"), ("extraL", "15")]:
            await setp(path, val)
        await pg.wait_for_timeout(500)
        await snap("navlog.png")
        print("\nPIANO DI VOLO:\n" + (await pg.inner_text("#navlog"))[:2500])
        print("\nAVVISI PIANO:\n" + (await pg.inner_text("#warnings"))[:800])
        await pg.evaluate("window.print = () => {}")
        await pg.click('#navlog [data-act="print"]')
        await pg.emulate_media(media="print")
        await pg.pdf(path=str(HERE / "piano.pdf"), format="A4", print_background=True)
        await pg.emulate_media(media="screen")
        await pg.evaluate("window.__airplanning.setView('fly')")
        await pg.evaluate("window.__airplanning.startSim()")
        await pg.wait_for_timeout(6000)
        await snap("fly.png")
        print("\nSTRUMENTI:\n" + await pg.inner_text("#instruments"))
        print("\nAVVISI IN VOLO:\n" + await pg.inner_text("#warnings"))
        await pg.evaluate("window.__airplanning.setDim('2d')")
        await pg.wait_for_timeout(2500)
        await snap("fly2d.png")
        await pg.evaluate("window.__airplanning.setDim('3d')")
        await pg.evaluate("window.__airplanning.stopFly()")
        await pg.evaluate("window.__airplanning.setMode('expert'); window.__airplanning.startDeviceDemo()")
        await pg.wait_for_timeout(3500)
        await pg.evaluate("document.querySelectorAll('details.sec').forEach(d => d.open = d.querySelector('#devStatus') !== null)")
        print("\nSTRUMENTI ESTERNI (simulati):\n" + await pg.inner_text("#devStatus"))
        print("STRUMENTI CON QUOTA ESTERNA:\n" + await pg.inner_text("#instruments"))
        await snap("devices.png")
        await pg.evaluate("window.__airplanning.disconnectDevice(); window.__airplanning.setMode('beginner')")
        await pg.evaluate("window.__airplanning.setView('plan'); window.__airplanning.setTheme('night')")
        await pg.wait_for_timeout(1200)
        await snap("night.png")
        await pg.evaluate("window.__airplanning.setTheme('day')")
        print("\n" + ("\n".join(errors) or "Nessun errore JavaScript."))
        await b.close()


asyncio.run(main())
