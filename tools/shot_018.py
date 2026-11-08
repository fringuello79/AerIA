# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
"""Prova automatica delle novità della 0.18.0 (Chrome headless, Playwright, tablet 1280×800).

Server locale: cd web-prototype && python3 -m http.server 8765   (pacchetto Italia centrale in data/centro)
Uso: python3 tools/shot_018.py

Controlla:
  - SENZA RETE (tutte le richieste fuori da localhost bloccate): l'app parte con il pacchetto, calcola gli avvisi,
    usa il meteo salvato (età ricalcolata), apre la guida e le liste; nessun errore JavaScript
  - liste dell'Aeroclub dei Marsi per P96 Golf e P2002 Sierra: righe colorate, spunte, tabella motore, note «da verificare»
  - limite VDS 1000 ft ogni giorno (RAIT.5005 d)2)), anche di venerdì
  - aggiornamento: rilascio di prova più nuovo → finestra «Nuova versione» (nella pagina web senza «Scarica e installa»)
  - qualità grafica: gradino fisso «Bassa» e ritorno ad «Automatica»
Schermate in tools/: v018-liste-golf.png, v018-liste-sierra.png, v018-motore.png, v018-cabina-liste.png,
v018-offline.png, v018-guida.png, v018-aggiornamento.png
Firma: fringuello79 di Avezzano.
"""
import asyncio
import json
import pathlib
import re
import time

from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).parent
A = "window.__airplanning"
CELANO = (13.55778, 42.05167)
LIAP = (13.309, 42.379)


async def main():
    errors = []

    def check(cond, msg):
        print(("OK   " if cond else "ERRORE ") + msg)
        if not cond:
            errors.append(msg)

    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
        ctx = await b.new_context(viewport={"width": 1280, "height": 800}, has_touch=True)
        pg = await ctx.new_page()
        pg.set_default_timeout(180000)
        pg.on("pageerror", lambda e: errors.append(f"ERRORE PAGINA: {e}"))
        blocked = []

        async def block(route):
            blocked.append(route.request.url)
            await route.abort()
        # senza rete: tutto ciò che non è il server locale viene rifiutato
        await pg.route(re.compile(r"^https?://(?!localhost)"), block)
        # meteo salvato 3 ore fa (METAR di prova, stazione inventata LIXX vicino a Celano: solo per la prova)
        now = int(time.time())
        metar = [{"icaoId": "LIXX", "name": "PROVA, IT", "lat": 42.06, "lon": 13.56, "elev": 700, "obsTime": now - 3 * 3600,
                  "rawOb": "LIXX 070950Z 27008KT 9999 SCT040 12/05 Q1018", "temp": 12, "dewp": 5, "wdir": 270, "wspd": 8,
                  "visib": "6+", "altim": 1018, "clouds": [{"cover": "SCT", "base": 4000}], "fltCat": "VFR"}]
        await pg.add_init_script(f"localStorage.setItem('airplanning.meteo', JSON.stringify({{ at: {(now - 3 * 3600) * 1000}, raw: {json.dumps(metar)} }}))")
        await pg.goto("http://localhost:8765/index.html")
        await pg.wait_for_function(f"{A} && {A}.state.proj && document.querySelector('#chips').innerText.includes('Terreno')", timeout=180000)
        await pg.wait_for_timeout(3000)
        await pg.evaluate("document.querySelector('#date').value = '2026-11-06'; document.querySelector('#date').dispatchEvent(new Event('input'))")
        await pg.evaluate("document.querySelector('#pilot').value='basico'; document.querySelector('#pilot').dispatchEvent(new Event('input'))")
        await pg.evaluate(f"{A}.setRoute([[{CELANO[0]}, {CELANO[1]}], [13.45, 42.2], [{LIAP[0]}, {LIAP[1]}]])")
        await pg.wait_for_timeout(2500)

        # 1. senza rete
        check(len(blocked) > 0, f"richieste esterne bloccate durante la prova: {len(blocked)}")
        wx = await pg.evaluate(f"{A}.state.wx && {{ cached: {A}.state.wx.cached, n: {A}.state.wx.stations.length, age: {A}.state.wx.stations[0]?.ageMin }}")
        check(bool(wx) and wx["cached"] and wx["n"] == 1 and 170 < wx["age"] < 200, f"meteo salvato usato senza rete, età ricalcolata ({wx})")
        warns = await pg.evaluate(f"{A}.state.analysis.warnings.map(w => w.title + ' | ' + (w.text || ''))")
        check(any("METAR scaduto: LIXX" in w for w in warns), "METAR di 3 ore fa segnalato come scaduto, non usato")
        day = await pg.inner_text("#daytype")
        check("1000 ft" in day and "RAIT.5005" in day, f"limite VDS 1000 ft anche di venerdì: «{day[:90]}»")
        check(not any("Oltre il limite VDS di 500" in w for w in warns), "nessun avviso VDS a 500 ft")
        await pg.click("#settingsBtn")
        await pg.wait_for_timeout(400)
        await pg.evaluate("document.querySelector('#updSec').open = true")
        await pg.wait_for_timeout(300)
        off = await pg.inner_text("#offlineStatus")
        check("spazi aerei" in off and "liste di controllo" in off and "P96 GOLF" in off, "stato senza rete: contenuto del pacchetto elencato")
        await pg.locator("#updSec").screenshot(path=str(HERE / "v018-offline.png"))
        await pg.click("#guideBtn")
        await pg.wait_for_timeout(1200)
        g = await pg.frame_locator("#guideFrame").locator("h1").inner_text()
        check(g == "Guida all’uso", "guida aperta senza rete")
        await pg.screenshot(path=str(HERE / "v018-guida.png"))
        await pg.click("#closeGuide")
        await pg.click("#closeSettings")

        # 2. liste dell'aeroclub
        await pg.evaluate(f"{A}.state.nl.st.aircraftId = 'acm-golf'")
        await pg.evaluate(f"{A}.setView('fly')")
        await pg.wait_for_timeout(800)
        await pg.click("#checkBtn")
        await pg.wait_for_timeout(400)
        t = await pg.inner_text("#checks")
        check("Rev3 del 23/08/2026" in t and "RUBINETTI CARBURANTE" in t and "0/12" in t, "Golf: prima lista dell'aeroclub con revisione")
        n_red = await pg.locator("#checks .ckrow.c-r").count()
        n_yel = await pg.locator("#checks .ckrow.c-y").count()
        check(n_red == 10 and n_yel == 2, f"colori delle righe come nel documento (rosse {n_red}, gialle {n_yel})")
        await pg.click("#checks [data-c='item'][data-i='1']")
        await pg.click("#checks [data-c='item'][data-i='2']")
        check("2/12" in await pg.inner_text("#checks"), "spunte contate")
        await pg.screenshot(path=str(HERE / "v018-liste-golf.png"))
        await pg.select_option("#checks [data-c='sel']", "9")
        await pg.wait_for_timeout(300)
        t = await pg.inner_text("#checks")
        check("EL. MOTORE" in t and "0.2 - 0.4 psi" in t and "Da verificare" in t and "ARO-CBO" in t, "tabella motore: valore originale e nota «da verificare»")
        await pg.screenshot(path=str(HERE / "v018-motore.png"))
        await pg.click("#checks [data-c='close']")
        await pg.evaluate(f"{A}.state.nl.st.aircraftId = 'acm-sierra'")
        await pg.click("#checkBtn")
        await pg.wait_for_timeout(300)
        await pg.select_option("#checks [data-c='sel']", "3")
        await pg.wait_for_timeout(300)
        t = await pg.inner_text("#checks")
        check("I-A952" in t and "Engine at 4000 RPM" in t and "0/14" in t, "Sierra: «4) BEFORE T.O.» con sottotitolo")
        await pg.screenshot(path=str(HERE / "v018-liste-sierra.png"))
        await pg.evaluate(f"{A}.setTheme('cockpit')")
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=str(HERE / "v018-cabina-liste.png"))
        await pg.evaluate(f"{A}.setTheme('day')")
        await pg.click("#checks [data-c='close']")
        await pg.evaluate(f"{A}.setView('plan')")

        # 3. aggiornamento: un rilascio di prova più nuovo nel canale (rete simulata solo per questa richiesta)
        await pg.unroute(re.compile(r"^https?://(?!localhost)"))
        rel = [{"tag_name": "v9.9.9", "draft": False, "prerelease": False, "html_url": "https://github.com/prova", "published_at": "2026-11-08T10:00:00Z",
                "body": "### Prova\n- Voce di prova del rilascio\n", "assets": [{"name": "AerIA-VFR-9.9.9.apk", "size": 31000000,
                "digest": "sha256:" + "a" * 64, "browser_download_url": "https://github.com/prova/AerIA-VFR-9.9.9.apk"}]}]
        await pg.route("**/api.github.com/**", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(rel)))
        await pg.route(re.compile(r"^https?://(?!localhost|api\.github\.com)"), lambda r: r.abort())
        await pg.click("#settingsBtn")
        await pg.evaluate("document.querySelector('#updSec').open = true")
        await pg.click("#updCheck")
        await pg.wait_for_timeout(1500)
        ban = await pg.inner_text("#updBanner")
        check(await pg.is_visible("#updBanner") and "9.9.9" in ban and "Voce di prova" in ban, "finestra «Nuova versione» con le novità")
        check(await pg.locator("#updBanner [data-u='go']").count() == 0, "nella pagina web nessun «Scarica e installa» (solo nell'app)")
        await pg.screenshot(path=str(HERE / "v018-aggiornamento.png"))
        await pg.click("#updBanner [data-u='later']")
        check("Disponibile la versione 9.9.9" in await pg.inner_text("#updStatus"), "stato degli aggiornamenti scritto")

        # 4. qualità grafica
        await pg.select_option("#qualSel", "bassa")
        await pg.wait_for_timeout(1500)
        q = await pg.evaluate(f"{A}.quality()")
        check(q["mesh"] == "bassa" and q["pr"] <= 0.7 + 1e-9 and q["mode"] == "bassa", f"qualità bassa: {q['mesh']}, risoluzione {q['pr']}")
        await pg.select_option("#qualSel", "auto")
        q = await pg.evaluate(f"{A}.quality()")
        check(q["mode"] == "auto", "qualità di nuovo automatica")
        check("Automatica" in await pg.inner_text("#qualStatus"), "stato della qualità scritto")
        await b.close()

    print("\n" + ("Tutte le prove superate, nessun errore JavaScript." if not errors else "ERRORI:\n" + "\n".join(errors)))
    raise SystemExit(1 if errors else 0)

asyncio.run(main())
