# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
"""Prova del GPS nativo e della diagnosi (0.23.1) con un modulo «Posizione» finto, in Chrome headless.

Server locale: cd web-prototype && python3 -m http.server 8765
Uso: python3 tools/shot_gps.py
Controlla: permesso solo approssimativo (testo, pulsante delle impostazioni, avviso grande), attesa dei satelliti,
posizioni GPS dal modulo, rapporto di diagnosi senza errori JavaScript.
"""
import asyncio
from playwright.async_api import async_playwright

A = "window.__airplanning"
MOCK = """
(() => {
  const L = {}; const st = { gpsPresente: true, gpsAcceso: true, reteAccesa: true, precisa: true, approssimativa: true, attivo: false, visti: 0, usati: 0, fixGps: 0, fixRete: 0, etaGpsS: -1, etaReteS: -1, attesaS: 0, primoFixS: -1, errore: '', android: 33, modello: 'TABLET DI PROVA' };
  window.__mock = { set: o => Object.assign(st, o), emit: (e, o) => (L[e] || []).forEach(f => f(o)), calls: [] };
  window.Capacitor = { isNativePlatform: () => true, Plugins: { Posizione: {
    addListener: (e, f) => { (L[e] ||= []).push(f); return Promise.resolve({ remove: () => { L[e] = (L[e] || []).filter(x => x !== f); } }); },
    avvia: () => { window.__mock.calls.push('avvia'); st.attivo = true; return Promise.resolve({ ...st }); },
    ferma: () => { window.__mock.calls.push('ferma'); st.attivo = false; return Promise.resolve({ ...st }); },
    stato: () => Promise.resolve({ ...st }),
    impostazioni: o => { window.__mock.calls.push('imp:' + o.cosa); return Promise.resolve(); },
  } } };
})();
"""


async def main():
    errors = []

    def check(cond, msg):
        print(("OK   " if cond else "ERRORE ") + msg)
        if not cond:
            errors.append(msg)

    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
        ctx = await b.new_context(viewport={"width": 1280, "height": 800}, has_touch=True, locale="it-IT")
        await ctx.add_init_script(MOCK)
        pg = await ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        for host in ("aviationweather.gov", "api.open-meteo.com", "radar-api.protezionecivile.it", "api.github.com"):
            await pg.route(f"**/{host}/**", lambda r: r.abort())
        await pg.goto("http://localhost:8765/index.html")
        await pg.wait_for_function(f"{A} && {A}.state.airspaces.length > 10", timeout=180000); await pg.wait_for_timeout(2000)
        await pg.evaluate(f"{A}.setView('fly')"); await pg.wait_for_timeout(500)
        integ = "document.getElementById('integ').innerText"
        big = "document.getElementById('alertbig').style.display === 'block' ? document.getElementById('alertbig').innerText : ''"
        # permesso solo approssimativo
        await pg.evaluate("__mock.set({ precisa: false })"); await pg.click("#gpsBtn"); await pg.wait_for_timeout(1300)
        check("solo approssimativa" in await pg.evaluate(integ), "semaforo: «solo approssimativa»")
        await pg.click("#integ"); await pg.wait_for_timeout(300)
        check("Usa posizione precisa" in await pg.evaluate("document.getElementById('integD').innerText"), "dettaglio: come attivare la posizione precisa")
        await pg.click("[data-setact]"); await pg.wait_for_timeout(200)
        check("imp:app" in await pg.evaluate("__mock.calls"), "pulsante: apre le impostazioni dell'app")
        await pg.evaluate("document.getElementById('integD').style.display = 'none'")
        await pg.wait_for_timeout(10500)
        check("solo approssimativa" in await pg.evaluate(big), "avviso grande dopo 10 s con il motivo")
        await pg.click("#gpsBtn"); await pg.wait_for_timeout(400)
        check(await pg.evaluate(big) == "", "fermando il GPS l'avviso sparisce")
        # attesa dei satelliti, poi posizioni
        await pg.evaluate("__mock.set({ precisa: true })"); await pg.click("#gpsBtn")
        await pg.evaluate("__mock.emit('satelliti', { visti: 5, usati: 0 })"); await pg.wait_for_timeout(1300)
        check("attesa GPS 0/5 sat" in await pg.evaluate(integ), "in attesa: satelliti usati/visti")
        for k in range(4):
            await pg.evaluate(f"__mock.emit('fix', {{ lat: 42.05 + {k} * 0.0001, lon: 13.55, alt: 745, prec: 4, precAlt: 6, vel: 0, fonte: 'gps', tempo: Date.now(), etaS: 0.1, visti: 14, usati: 9 }})")
            await pg.wait_for_timeout(250)
        await pg.wait_for_timeout(1100)
        check("ok ±4 m" in await pg.evaluate(integ), "posizione dal modulo nativo: «ok ±4 m»")
        pos = await pg.evaluate(f"{A}.state.fly.pos")
        check(abs(pos["lat"] - 42.0503) < 1e-6 and abs(pos["lon"] - 13.55) < 1e-9, f"posizione usata dal programma ({pos})")
        # rapporto
        await pg.click("#settingsBtn"); await pg.wait_for_timeout(300)
        await pg.evaluate("document.getElementById('diagSec').open = true")
        await pg.click("#diagBtn"); await pg.wait_for_timeout(800)
        rep = await pg.evaluate("document.getElementById('diagOut').value")
        check("TABLET DI PROVA" in rep and "GPS nativo:" in rep and "42.05" not in rep, "rapporto: modello e GPS, nessuna posizione")
        check(not errs, f"nessun errore JavaScript ({errs[:1]})")
        await b.close()
    print("\n" + ("Nessun errore." if not errors else f"{len(errors)} errori."))


asyncio.run(main())
