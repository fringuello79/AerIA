# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
"""Prova automatica delle funzioni della 0.17.0 (Chrome headless, Playwright, tablet 1280×800).

Server locale: cd web-prototype && python3 -m http.server 8765   (pacchetto Italia centrale in data/centro)
Uso: python3 tools/shot_novita.py

Controlla, con un volo Celano → L'Aquila Preturo simulato con posizioni «come dal GPS»:
  - minimi personali: METAR e TAF di prova (stazione inventata LIXX, solo per la prova) sotto i minimi
  - promemoria «5 minuti prima di LIAP» aggiunto dal pannello Tempi e scattato in avvicinamento
  - traffico FLARM ($PFLAA, $PFLAU): simbolo sulla carta, finestra d'allarme con «Sospendi»
  - liste di controllo: scritte nel pannello, spuntate, lista di emergenza dal pannello Emergenza
  - «Rivedi il volo» dopo l'atterraggio: superamenti e grafico della quota
Schermate in tools/: nov-minimi.png, nov-traffico.png, nov-liste.png, nov-revisione.png
Firma: fringuello79 di Avezzano.
"""
import asyncio
import json
import pathlib

from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).parent
A = "window.__airplanning"
T0 = 1794045600000  # 7/11/2026 10:00 UTC
CELANO = (13.55778, 42.05167)
LIAP = (13.309, 42.379)


def nmea(body):
    x = 0
    for ch in body:
        x ^= ord(ch)
    return f"${body}*{x:02X}"


async def main():
    errors = []

    def check(cond, msg):
        print(("OK   " if cond else "ERRORE ") + msg)
        if not cond:
            errors.append(msg)

    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width": 1280, "height": 800}, has_touch=True)
        pg.set_default_timeout(180000)
        pg.on("pageerror", lambda e: errors.append(f"ERRORE PAGINA: {e}"))
        for host in ("aviationweather.gov", "api.open-meteo.com", "radar-api.protezionecivile.it"):
            await pg.route(f"**/{host}/**", lambda r: r.abort())
        await pg.goto("http://localhost:8765/index.html")
        await pg.wait_for_function(f"{A} && {A}.state.proj && document.querySelector('#chips').innerText.includes('Terreno')", timeout=180000)
        await pg.wait_for_timeout(2000)
        await pg.evaluate("document.querySelector('#date').value = '2026-11-07'; document.querySelector('#date').dispatchEvent(new Event('input'))")
        await pg.evaluate("document.querySelector('#pilot').value='avanzato'; document.querySelector('#pilot').dispatchEvent(new Event('input'))")
        await pg.evaluate(f"{A}.setRoute([[{CELANO[0]}, {CELANO[1]}], [13.45, 42.2], [{LIAP[0]}, {LIAP[1]}]])")
        await pg.evaluate(f"{A}.state.route[0].name = 'CELANO'; {A}.state.route[2].name = 'LIAP'; {A}.refresh()")

        # 1. minimi personali: stazione di prova vicina a Celano con base a 1200 ft e TAF con raffiche
        now_s = T0 // 1000
        metar = [{"icaoId": "LIXX", "name": "Prova", "lat": 42.06, "lon": 13.53, "obsTime": now_s - 600, "elev": 680, "altim": 1018,
                  "visib": "6+", "wdir": 270, "wspd": 8, "clouds": [{"cover": "BKN", "base": 1200}], "rawOb": "LIXX 070950Z 27008KT 9999 BKN012 12/05 Q1018",
                  "rawTaf": "TAF LIXX 070500Z 0706/0806 27012G30KT 9999 BKN015"}]
        # decollo fissato al 7/11/2026 alle 10:30 UTC (dentro la validità del TAF di prova), non «adesso»
        await pg.evaluate(f"document.querySelector('#date').value = '2026-11-07'; {A}.state.nl.st.toTime = '10:30'; {A}.state.nl.st.timeRef = 'utc'")
        await pg.evaluate(f"{A}.setWeather({{ metar: {json.dumps(metar)} }}, {T0})")
        await pg.wait_for_timeout(500)
        w = await pg.inner_text("#warnings")
        check("Sotto i tuoi minimi in partenza (LIXX)" in w, "minimi: base delle nubi sotto il minimo in partenza")
        mw = await pg.evaluate(f"{A}.state.analysis.warnings.filter(x => /minimi/i.test(x.title)).map(x => x.title + ' | ' + x.text)")
        check("raffiche 30 kt" in w, f"minimi: raffiche del TAF oltre il massimo ({mw})")
        await pg.screenshot(path=str(HERE / "nov-minimi.png"))
        await pg.uncheck("#minOn") if await pg.is_visible("#minOn") else await pg.evaluate("document.querySelector('#minOn').checked=false; document.querySelector('#minOn').dispatchEvent(new Event('change'))")
        await pg.wait_for_timeout(300)
        check("Sotto i tuoi minimi" not in await pg.inner_text("#warnings"), "minimi: spenti dall'interruttore")

        await pg.evaluate(f"{A}.setView('fly')")
        await pg.wait_for_timeout(1500)

        async def fixes(lon, lat, alt, gs, trk, t0, secs):
            for k in range(secs):
                await pg.evaluate(f"{A}.fix({{ lon: {lon}, lat: {lat}, altFt: {alt}, gsKt: {gs}, trk: {trk}, t: {t0 + k * 1000} }})")

        # 2. promemoria sul punto dal pannello Tempi: 5 minuti prima di LIAP
        await pg.click("#timerBtn")
        await pg.select_option("#timers [data-t='ptmode']", "prima")
        await pg.select_option("#timers [data-t='ptmin']", "5")
        await pg.select_option("#timers [data-t='ptwp']", "2")
        await pg.fill("#timers [data-t='pttext']", "ATIS e chiamata a Preturo")
        await pg.click("#timers [data-t='ptadd']")
        check(len(await pg.evaluate(f"{A}.ptRem()")) == 1, "promemoria sul punto aggiunto")

        # decollo da Celano e volo verso nord-ovest
        await fixes(*CELANO, 2250, 12, 300, T0, 5)
        await fixes(*CELANO, 2400, 65, 320, T0 + 6000, 15)
        await fixes(13.45, 42.20, 6500, 95, 315, T0 + 12 * 60000, 2)
        check("Tra 5 minuti" not in await pg.inner_text("#alertbig"), "promemoria non ancora scattato a 11 NM")
        await fixes(13.37, 42.30, 6000, 95, 315, T0 + 16 * 60000, 2)   # circa 5,3 NM da LIAP: 3,4 min
        big = await pg.inner_text("#alertbig")
        print("     " + big)
        check("Tra 5 minuti LIAP: ATIS e chiamata a Preturo" in big, "promemoria scattato prima di LIAP")

        # 3. traffico FLARM: un aereo 900 m a nord-est, 100 m sopra, in allarme
        await pg.evaluate(f"{A}.state.voice = false")
        for k in range(3):
            await pg.evaluate(f"{A}.onExtLine({json.dumps(nmea('PFLAA,2,600,650,100,1,DD1234,180,,45,0.5,1'))})")
            await pg.evaluate(f"{A}.onExtLine({json.dumps(nmea('PFLAU,1,1,2,1,2,90,2,100,885,DD1234'))})")
            await fixes(13.37, 42.30, 6000, 95, 315, T0 + 16 * 60000 + 5000 + k * 1000, 1)
        tr = await pg.evaluate(f"[...{A}.traffic().values()].map(t => [t.id, Math.round(t.relAltFt), t.alarm])")
        print("     traffico:", tr)
        check(tr and tr[0][0] == "DD1234" and tr[0][1] == 328, "traffico FLARM ricevuto con quota relativa")
        ta = await pg.inner_text("#trafficAlert")
        print("     " + ta.replace("\n", " | "))
        check("Traffico a ore" in ta and "300 piedi sopra" in ta, "finestra d'allarme del traffico")
        await pg.click("#fitBtn")
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path=str(HERE / "nov-traffico.png"))
        await pg.click("#trafficAlert [data-ta='mute']")
        await fixes(13.37, 42.30, 6000, 95, 315, T0 + 16 * 60000 + 9000, 1)
        check(not await pg.is_visible("#trafficAlert"), "allarme sospeso per 5 minuti")

        # 4. liste di controllo (testo di prova, NON preso da un manuale)
        await pg.click("#checkBtn")
        if await pg.locator("#checks [data-c='edit']").count():   # dalla 0.18.0 ci sono già le liste dell'aeroclub
            await pg.click("#checks [data-c='edit']")
        await pg.fill("#checks textarea", "# Prova: crociera\nVoce di prova A ..... FATTO\nVoce di prova B ..... FATTO\n\n# Prova: emergenza\nVoce di prova C ..... FATTO")
        await pg.click("#checks [data-c='save']")
        await pg.wait_for_timeout(300)
        idx = await pg.evaluate("[...document.querySelectorAll('#checks [data-c=sel] option')].findIndex(o => o.textContent.startsWith('Prova: crociera'))")
        await pg.select_option("#checks [data-c='sel']", str(idx))
        await pg.wait_for_timeout(300)
        await pg.click("#checks [data-c='item'][data-i='0']")
        ch = await pg.inner_text("#checks")
        check("1/2" in ch and "Voce di prova B" in ch, "lista spuntata (1 di 2)")
        await pg.screenshot(path=str(HERE / "nov-liste.png"))
        await pg.click("#checks [data-c='close']")
        await pg.click("#emergBtn")
        await pg.wait_for_timeout(800)
        await pg.click("#emerg [data-elist]")
        await pg.wait_for_timeout(300)
        check("Voce di prova C" in await pg.inner_text("#checks"), "lista di emergenza aperta dal pannello Emergenza")
        await pg.click("#checks [data-c='close']")
        await pg.click("#emerg [data-close]")

        # 5. atterraggio a Preturo e revisione del volo
        await fixes(*LIAP, 2300, 60, 300, T0 + 30 * 60000, 3)
        await fixes(*LIAP, 2215, 15, 300, T0 + 32 * 60000, 25)
        await pg.click("#reviewBtn")
        await pg.wait_for_timeout(2500)
        rv = await pg.inner_text("#review")
        print("     " + rv.replace("\n", " | ")[:700])
        check("Rivedi il volo" in rv and "Durata" in rv, "revisione del volo aperta")
        n = await pg.evaluate(f"{A}.review() && {A}.review().samples.length")
        check(n and n >= 6, f"traccia del volo nella revisione ({n} punti)")
        print("     oggetti della revisione sulla carta:", await pg.evaluate(f"{A}.reviewObjs()"))
        await pg.evaluate(f"{A}.setDim('2d')")
        await pg.wait_for_timeout(1000)
        await pg.click("#fitBtn")
        await pg.wait_for_timeout(2500)
        await pg.screenshot(path=str(HERE / "nov-revisione.png"))

        print("\n" + ("\n".join(errors) or "Tutte le prove superate, nessun errore JavaScript."))
        await b.close()
        if errors:
            raise SystemExit(1)


asyncio.run(main())
