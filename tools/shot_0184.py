# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
"""Prova automatica della 0.18.4 (Chrome headless, Playwright, tablet 1280×800).

Server locale: cd web-prototype && python3 -m http.server 8765
Uso: python3 tools/shot_0184.py

Controlla, con il pacchetto Italia centrale (spazi aerei scaricati il 6/11/2026, ciclo AIRAC 2611):
  - volo l'8/11/2026: «Dati del ciclo AIRAC 2611» (informazione) e «NOTAM e attivazioni delle zone non caricati»
    (da controllare)
  - volo il 28/11/2026 (ciclo 2612): «Spazi aerei del ciclo AIRAC precedente» (da controllare)
  - volo il 2/1/2027 (ciclo 2701, due cicli dopo): «Spazi aerei vecchi di 2 cicli AIRAC» (da risolvere)
  - spazi attraversati senza modifiche da oltre 2 anni: informazione
  - scheda «Senza rete»: ciclo AIRAC dei dati
Schermata: tools/v0184-avvisi.png
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
        # Avezzano → Fucino → L'Aquila: attraversa spazi aerei della zona
        await pg.evaluate(f"{A}.setRoute([[13.4283, 42.0275], [13.55, 42.05], [13.309, 42.379]])")
        await pg.wait_for_timeout(3000)

        async def at(date):
            await pg.evaluate(f"(() => {{ const d = document.getElementById('date'); d.value = '{date}'; d.dispatchEvent(new Event('input', {{ bubbles: true }})); }})()")
            await pg.wait_for_timeout(1500)
            return await pg.evaluate(f"{A}.state.analysis.warnings.map(w => [w.lvl, w.title])")

        w = await at("2026-11-08")
        get = lambda w, t: next((l for l, x in w if x.startswith(t)), None)
        check(get(w, "Dati del ciclo AIRAC 2611") == "info", "8/11/2026: dati del ciclo AIRAC 2611 (informazione)")
        check(get(w, "NOTAM e attivazioni delle zone non caricati") == "warn", "NOTAM non caricati: da controllare")
        st = [x for l, x in w if "senza modifiche da oltre 2 anni" in x]
        check(len(st) == 1, f"spazi attraversati non modificati da anni: {st[:1]}")
        await pg.screenshot(path=str(HERE / "v0184-avvisi.png"))
        w = await at("2026-11-28")
        check(get(w, "Spazi aerei del ciclo AIRAC precedente") == "warn", "28/11/2026: ciclo AIRAC precedente (da controllare)")
        w = await at("2027-01-02")
        check(get(w, "Spazi aerei vecchi di 2 cicli AIRAC") == "crit", "2/1/2027: due cicli indietro (da risolvere)")
        txt = await pg.inner_text("#warnings")
        check("Da risolvere" in txt and "vecchi di 2 cicli" in txt, "l'avviso compare nell'elenco «Da risolvere»")
        off = await pg.evaluate("document.getElementById('offlineStatus').innerText")
        check("ciclo AIRAC 2611" in off, "scheda «Senza rete»: ciclo AIRAC dei dati")
        await b.close()
    print("\n" + ("Tutte le prove superate, nessun errore JavaScript." if not errors else "ERRORI:\n" + "\n".join(errors)))
    raise SystemExit(1 if errors else 0)

asyncio.run(main())
