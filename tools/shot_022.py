# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
"""Prova automatica delle correzioni e novità della 0.22.0 (Chrome headless, Playwright, tablet 1280×800 con tocco).

Server locale: cd web-prototype && python3 -m http.server 8765   (pacchetto Italia centrale in data/centro)
Uso: python3 tools/shot_022.py

Ripete i casi del collaudo critico della 0.21.0 (claude/aeria-collaudo-0.21.0.md) e controlla che siano risolti:
  A1  un timeout del GPS non spegne la navigazione
  A2  posizione ferma oltre 10 s: «Posizione non aggiornata», avvisi sospesi, semaforo rosso
  A3  rotta a U e andata e ritorno: prossimo punto giusto e fuori rotta calcolato
  A6  crociera scritta cifra per cifra: i punti non restano bloccati alle quote intermedie
  B2  un tocco sulla carta non ricostruisce gli spazi aerei (meno di 150 ms di JavaScript)
  C3  barra in alto intera a 800 e 600 px, «Prototipo» visibile
  C10 colonna d'aria nello stesso verso del grafico (dall'alto in basso)
  liste di controllo a pagine, sfoglio di lato, avanzamento automatico; consigliere di quota
Firma: fringuello79 di Avezzano.
"""
import asyncio

from playwright.async_api import async_playwright

A = "window.__airplanning"
URL = "http://localhost:8765/index.html"
GEO = """
window.__geo = {};
Object.defineProperty(navigator, 'geolocation', { value: {
  watchPosition(ok, err) { window.__geo.ok = ok; window.__geo.err = err; return 7; },
  clearWatch() { window.__geo.cleared = (window.__geo.cleared || 0) + 1; }, getCurrentPosition() {} }, configurable: true });
window.__send = (lon, lat, alt, spd, hdg, t) => window.__geo.ok({ coords: { longitude: lon, latitude: lat, altitude: alt, accuracy: 5, altitudeAccuracy: 8, speed: spd, heading: hdg }, timestamp: t });
"""


async def open_app(p, w=1280, h=800, geo=False):
    b = await p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
    ctx = await b.new_context(viewport={"width": w, "height": h}, has_touch=True, locale="it-IT", timezone_id="Europe/Rome")
    if geo:
        await ctx.add_init_script(GEO)
    pg = await ctx.new_page()
    pg.errs = []
    pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    for host in ("aviationweather.gov", "api.open-meteo.com", "radar-api.protezionecivile.it", "api.github.com"):
        await pg.route(f"**/{host}/**", lambda r: r.abort())
    await pg.goto(URL)
    await pg.wait_for_function(f"{A} && {A}.state.airspaces.length > 10", timeout=180000)
    await pg.wait_for_timeout(2000)
    return b, pg


async def main():
    errors = []

    def check(cond, msg):
        print(("OK   " if cond else "ERRORE ") + msg)
        if not cond:
            errors.append(msg)

    async with async_playwright() as p:
        # ---------------------------------------------------------------- GPS (A1, A2)
        b, pg = await open_app(p, geo=True)
        await pg.evaluate(f"{A}.setRoute([[13.55778,42.05167],[13.309,42.379]])")
        await pg.evaluate(f"{A}.setView('fly')"); await pg.wait_for_timeout(600)
        await pg.click("#gpsBtn"); await pg.wait_for_timeout(300)
        now = await pg.evaluate("Date.now()")
        for i in range(15):
            await pg.evaluate(f"window.__send(13.50-{i}*0.0006, 42.10+{i}*0.0008, 2100, 49, 330, {now}+{i}*1000)")
        await pg.evaluate("window.__geo.err({ code: 3, message: 'timeout' })"); await pg.wait_for_timeout(300)
        check(await pg.evaluate(f"{A}.state.fly.active") and await pg.inner_text("#gpsBtn") == "Ferma GPS", "A1: dopo un timeout il GPS resta acceso")
        await pg.wait_for_timeout(12000)
        w = await pg.inner_text("#warnings")
        check("Posizione non aggiornata" in w, "A2: dopo 10 s senza posizione compare «Posizione non aggiornata»")
        check(await pg.evaluate("document.getElementById('integ').classList.contains('lost')"), "A2: semaforo rosso")
        check(await pg.evaluate("document.getElementById('instruments').classList.contains('stale')"), "A2: strumenti in grigio")
        await pg.evaluate(f"window.__send(13.49, 42.11, 2100, 49, 330, Date.now())"); await pg.wait_for_timeout(1500)
        check(not await pg.evaluate("document.getElementById('integ').classList.contains('lost')"), "A2: la posizione torna, il semaforo torna normale")
        check(not pg.errs, f"nessun errore JavaScript ({pg.errs[:1]})")
        await b.close()

        b, pg = await open_app(p)
        # ---------------------------------------------------------------- A3 tratto attivo
        T = 1794045600000
        await pg.evaluate(f"{A}.setRoute([[13.40,42.00],[13.40,42.20],[13.60,42.20],[13.60,42.00]])")
        await pg.evaluate(f"{A}.setView('fly')"); await pg.wait_for_timeout(600)
        await pg.evaluate(f"(() => {{ for (let i = 0; i < 12; i++) {A}.fix({{ lon: 13.60, lat: 42.15, altFt: 7000, gsKt: 95, trk: 180, t: {T} + i * 1000 }}); }})()")
        ins = await pg.inner_text("#instruments")
        check("Prossimo: P4" in ins and "in rotta" in ins, "A3: rotta a U, sul tratto P3→P4 il prossimo è P4 con il fuori rotta")
        await pg.evaluate(f"{A}.setRoute([[13.5578,42.0517],[13.55,42.25],[13.5578,42.0517]])")
        await pg.evaluate(f"(() => {{ for (let i = 0; i < 12; i++) {A}.fix({{ lon: 13.552, lat: 42.15, altFt: 7000, gsKt: 95, trk: 182, t: {T} + 60000 + i * 1000 }}); }})()")
        ins = await pg.inner_text("#instruments")
        check("Prossimo: P3" in ins and "Fuori rotta a" in ins, "A3: andata e ritorno, al ritorno il prossimo è l'arrivo con il fuori rotta")
        await pg.evaluate(f"{A}.stopFly()"); await pg.evaluate(f"{A}.setView('plan')")

        # ---------------------------------------------------------------- A6 crociera scritta cifra per cifra
        await pg.evaluate(f"{A}.setRoute([[13.48,41.97],[13.56,41.99],[13.62,41.95],[13.52,41.93]])"); await pg.wait_for_timeout(2500)
        await pg.fill("#cruise", "3500"); await pg.press("#cruise", "Enter"); await pg.wait_for_timeout(1500)
        await pg.click("#cruise", click_count=3); await pg.keyboard.type("5500", delay=250); await pg.wait_for_timeout(2500)
        alts = await pg.evaluate(f"{A}.state.route.map(p => p.altFt ?? null)")
        check(all(a is None or a >= 5500 for a in alts), f"A6: dopo «5500» nessun punto resta a una quota intermedia ({alts})")

        # ---------------------------------------------------------------- B2 tocco sulla carta
        await pg.evaluate(f"{A}.setRoute([[13.55778,42.05167],[13.309,42.379],[12.85,42.42]])"); await pg.wait_for_timeout(2500)
        await pg.evaluate("window.__lt = []; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push(e.duration); }).observe({ type: 'longtask' });")
        await pg.touchscreen.tap(420, 560); await pg.wait_for_timeout(300)
        ms = await pg.evaluate(f"(() => {{ const s = performance.now(); {A}.state.hitKey = 'x'; {A}.refresh(); return performance.now() - s; }})()")
        check(ms < 400, f"B2: ricalcolo completo con evidenziazione in {ms:.0f} ms (geometrie degli spazi riusate)")

        # ---------------------------------------------------------------- C10 colonna d'aria
        await pg.evaluate(f"{A}.setDim('2d')"); await pg.evaluate(f"{A}.lookAt(14.18, 42.43)"); await pg.wait_for_timeout(1200)
        await pg.mouse.click(628, 400, button="right"); await pg.wait_for_timeout(1200)
        tops = await pg.evaluate("[...document.querySelectorAll('#whats .wh-air')].map(e => e.innerText)")
        his = []
        for t in tops:
            seg = t.split("qui ")[-1].split(" ft")[0].split("–")[-1].replace(".", "")
            his.append(99999 if "illimitato" in t else int(seg) if seg.isdigit() else 0)
        check(len(tops) >= 2 and his == sorted(his, reverse=True), f"C10: colonna d'aria dall'alto in basso ({his})")
        txt = await pg.inner_text("#whats")
        check("dall'alto in basso" in txt.lower(), "C10: titolo dell'elenco nello stesso verso del grafico")
        await pg.evaluate(f"{A}.setDim('3d')")

        # ---------------------------------------------------------------- consigliere di quota
        await pg.select_option("#pilot", "ag"); await pg.wait_for_timeout(500)
        await pg.click("#advBtn"); await pg.wait_for_timeout(800)
        best = await pg.evaluate("document.querySelector('#advisor tr.best')?.dataset.alt")
        check(best is not None, f"consigliere: quota suggerita ({best} ft)")
        if best:
            await pg.click(f"#advisor tr[data-alt='{best}']"); await pg.wait_for_timeout(1500)
            check(await pg.input_value("#cruise") == best, "consigliere: un tocco applica la quota")

        # ---------------------------------------------------------------- liste a pagine
        await pg.evaluate(f"{A}.setView('fly')"); await pg.click("#checkBtn"); await pg.wait_for_timeout(800)
        n = await pg.evaluate("document.querySelectorAll('#checks .ckpage').length")
        labels = await pg.evaluate("[...document.querySelectorAll('#checks .ckpage')].map(s => s.getAttribute('aria-label'))")
        check(n >= 10 and len(set(labels)) == n, f"liste: una pagina per sezione ({n} pagine, nessuna doppia)")
        box = await (await pg.query_selector("#checks .ckpages")).bounding_box()
        y = box["y"] + box["height"] / 2
        await pg.mouse.move(box["x"] + box["width"] * 0.8, y); await pg.mouse.down()
        for k in range(8):
            await pg.mouse.move(box["x"] + box["width"] * (0.8 - 0.07 * k), y); await pg.wait_for_timeout(15)
        await pg.mouse.up(); await pg.wait_for_timeout(900)
        check(await pg.evaluate(f"{A}.state.checkPage") == 1, "liste: sfoglio di lato alla pagina seguente")
        for bx in await pg.query_selector_all("#checks .ckpage[data-p='1'] input[data-c='item']"):
            await bx.click(); await pg.wait_for_timeout(60)
        await pg.wait_for_timeout(1300)
        check(await pg.evaluate(f"{A}.state.checkPage") == 2, "liste: pagina completata, si passa da soli alla successiva")
        check(await pg.evaluate("document.querySelector('#checks .ckseg[data-p=\"1\"]').classList.contains('ok')"), "liste: la pagina completata è verde nella barra")
        check(not pg.errs, f"nessun errore JavaScript ({pg.errs[:1]})")
        await b.close()

        # ---------------------------------------------------------------- C3 barra in alto
        for w, h in ((800, 1280), (600, 960)):
            b, pg = await open_app(p, w, h)
            ov = await pg.evaluate("[...document.querySelectorAll('header > *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 1; }).length")
            vis = await pg.evaluate("(() => { const e = document.getElementById('banner'); return getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().right <= innerWidth; })()")
            check(ov == 0 and vis, f"C3: barra in alto intera a {w} px e «Prototipo» visibile")
            await b.close()

    print("\n" + ("Nessun errore." if not errors else f"{len(errors)} errori."))


asyncio.run(main())
