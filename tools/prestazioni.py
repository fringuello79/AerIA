# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
"""Misura delle prestazioni dell'app web (Chrome headless, Playwright): memoria grafica, triangoli, ridisegni a carta ferma.

Server locale: cd web-prototype && python3 -m http.server 8765   (con il pacchetto Italia centrale in data/centro)
Uso: python3 tools/prestazioni.py
Con il disegno software (swiftshader) i tempi assoluti non valgono per il tablet: contano i confronti tra versioni,
il numero di geometrie dopo gli spostamenti (deve restare stabile) e i ridisegni a carta ferma (pochi).
"""
import asyncio, json, sys
from playwright.async_api import async_playwright
A = "window.__airplanning"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width": 1280, "height": 800})
        pg.set_default_timeout(180000)
        for host in ("aviationweather.gov", "api.open-meteo.com", "radar-api.protezionecivile.it"):
            await pg.route(f"**/{host}/**", lambda r: r.abort())
        await pg.add_init_script("""window.__lt=[];new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lt.push(Math.round(e.duration))}).observe({type:'longtask',buffered:true});""")
        await pg.goto("http://localhost:8765/index.html")
        await pg.wait_for_function("document.querySelector('#chips').innerText.includes('Italia centrale')", timeout=180000)
        await pg.wait_for_timeout(4000)
        print("info start", await pg.evaluate(f"{A}.info()"))
        await pg.evaluate("window.__lt=[]")
        t = await pg.evaluate(f"(()=>{{const t=performance.now();{A}.setRoute([[13.10,42.04],[13.45,42.06],[13.75,42.07],[14.1,42.3]]);return performance.now()-t}})()")
        print("setRoute ms", round(t))
        t = await pg.evaluate(f"(()=>{{const t=performance.now();{A}.refresh();return performance.now()-t}})()")
        print("refresh ms", round(t))
        # pan sequence
        await pg.evaluate("window.__lt=[]")
        for lon,lat in [(13.3,42.1),(13.6,42.2),(13.9,42.4),(14.2,42.0),(12.8,41.9),(13.43,42.03)]:
            await pg.evaluate(f"{A}.lookAt({lon},{lat})"); await pg.wait_for_timeout(1500)
        print("longtasks during pans", await pg.evaluate("window.__lt"))
        print("info after pans", await pg.evaluate(f"{A}.info()"))
        # typing cruise
        await pg.evaluate("window.__lt=[]")
        for v in ["3","35","350","3500"]:
            await pg.fill("#cruise", v); await pg.wait_for_timeout(50)
        await pg.wait_for_timeout(1500)
        print("longtasks typing cruise", await pg.evaluate("window.__lt"))
        # idle frame cost
        f0 = await pg.evaluate(f"{A}.frames ? {A}.frames() : -1"); await pg.wait_for_timeout(5000); f1 = await pg.evaluate(f"{A}.frames ? {A}.frames() : -1")
        print("frames disegnati in 5 s a carta ferma", f1 - f0)
        await b.close()
asyncio.run(main())
