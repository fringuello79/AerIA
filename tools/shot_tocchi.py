# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
"""Prova automatica delle interazioni col dito (Chrome headless, Playwright, schermo da tablet 1280×800 con tocco).

Server locale: cd web-prototype && python3 -m http.server 8765   (pacchetto Italia centrale in data/centro, o Marsica)
Uso: python3 tools/shot_tocchi.py

Controlla:
  - la tastiera resta aperta: il campo della quota non perde il fuoco se l'app si aggiorna mentre si scrive
  - quota trascinando un punto del profilo verticale in su (e il minimo sopra il terreno in giù)
  - piega della rotta: trascinando la linea si inserisce un punto; lasciandolo sul cestino si toglie
  - pressione lunga sulla carta: colonna d'aria con terreno e spazi aerei, «Inserisci nella rotta»
Schermate in tools/: tocchi-profilo.png, tocchi-piega.png, tocchi-cestino.png, tocchi-colonna.png
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
        pg = await b.new_page(viewport={"width": 1280, "height": 800}, has_touch=True)
        pg.set_default_timeout(180000)
        pg.on("pageerror", lambda e: errors.append(f"ERRORE PAGINA: {e}"))
        for host in ("aviationweather.gov", "api.open-meteo.com", "radar-api.protezionecivile.it"):
            await pg.route(f"**/{host}/**", lambda r: r.abort())
        await pg.goto("http://localhost:8765/index.html")
        await pg.wait_for_function(f"{A} && {A}.state.proj && document.querySelector('#chips').innerText.includes('Terreno')", timeout=180000)
        await pg.wait_for_timeout(2500)
        # rotta di tre punti generici (non campi: niente rampe), nella piana del Fucino e dintorni
        await pg.evaluate(f"{A}.setRoute([[13.45, 41.95], [13.62, 42.02], [13.80, 41.98]])")
        await pg.evaluate(f"{A}.lookAt(13.62, 41.99)")
        await pg.click("#fitBtn")
        await pg.wait_for_timeout(2500)

        # 1. tastiera: fuoco sul campo della quota, poi un aggiornamento dell'app (come quando la tastiera ridimensiona lo schermo)
        await pg.click('#wpList [data-alt="1"]')
        await pg.keyboard.type("95")      # 9500 ft: sopra il minimo del rilievo (dalla 0.18.2 i punti troppo bassi si alzano)
        await pg.evaluate(f"{A}.refresh(); window.dispatchEvent(new Event('resize'))")
        await pg.wait_for_timeout(300)
        foc = await pg.evaluate("document.activeElement && document.activeElement.dataset.alt")
        check(foc == "1", f"il campo della quota resta attivo durante un aggiornamento (attivo: {foc})")
        await pg.keyboard.type("00")
        await pg.keyboard.press("Enter")
        await pg.wait_for_timeout(600)
        v = await pg.evaluate(f"{A}.state.route[1].altFt")
        check(v == 9500, f"quota scritta dal tablet applicata al punto 2: {v} ft (attesi 9500)")

        # 2. profilo: un tocco sul punto 1 lo seleziona (senza cambiare nulla), poi lo si porta in su di 60 pixel
        p0 = await pg.evaluate(f"{A}.profPt(0)")
        a0 = await pg.evaluate(f"{A}.state.route[0].altFt ?? null")
        c0 = await pg.evaluate("Number(document.querySelector('#cruise').value)")
        await pg.mouse.move(p0[0], p0[1]); await pg.mouse.down()
        await pg.mouse.move(p0[0], p0[1] - 60); await pg.mouse.up(); await pg.wait_for_timeout(300)
        check(await pg.evaluate(f"{A}.state.profSel") == 0 and (await pg.evaluate(f"{A}.state.route[0].altFt ?? null")) == a0,
              "profilo: il primo tocco seleziona il punto e non cambia la quota")
        await pg.mouse.move(p0[0], p0[1]); await pg.mouse.down()
        for k in range(1, 7):
            await pg.mouse.move(p0[0], p0[1] - 10 * k); await pg.wait_for_timeout(40)
        await pg.screenshot(path=str(HERE / "tocchi-profilo.png"))
        await pg.mouse.up(); await pg.wait_for_timeout(800)
        a1 = await pg.evaluate(f"{A}.state.route[0].altFt")
        base = a0 if a0 is not None else c0
        check(a1 is not None and a1 > base and a1 % 100 == 0, f"quota del tratto 1 alzata trascinando il profilo: da {base} a {a1} ft (passi di 100 ft)")
        lst = await pg.evaluate("document.querySelector('#wpList [data-alt=\"0\"]').value")
        check(str(a1) == lst, f"l'elenco dei punti mostra la nuova quota ({lst})")
        # in giù fino in fondo: si ferma al minimo sopra il terreno
        p0 = await pg.evaluate(f"{A}.profPt(0)")
        await pg.mouse.move(p0[0], p0[1]); await pg.mouse.down()
        for k in range(1, 12):
            await pg.mouse.move(p0[0], p0[1] + 25 * k); await pg.wait_for_timeout(30)
        await pg.mouse.up(); await pg.wait_for_timeout(800)
        a2 = await pg.evaluate(f"{A}.state.route[0].altFt")
        terr = await pg.evaluate(f"Math.max({A}.elevM(13.45, 41.95), {A}.elevM(13.62, 42.02)) * 3.28084")
        check(a2 >= 500 and a2 >= terr + 300 - 100, f"in giù la quota si ferma al minimo: {a2} ft (terreno ai punti fino a {round(terr)} ft)")

        # 3. piega della rotta: dal centro del tratto 2 si trascina la linea di 90 pixel in giù
        n0 = await pg.evaluate(f"{A}.state.route.length")
        s1 = await pg.evaluate(f"{A}.screenOf(1)"); s2 = await pg.evaluate(f"{A}.screenOf(2)")
        mx, my = (s1[0] + s2[0]) / 2, (s1[1] + s2[1]) / 2
        await pg.mouse.move(mx, my); await pg.mouse.down()
        for k in range(1, 10):
            await pg.mouse.move(mx, my + 10 * k); await pg.wait_for_timeout(40)
        await pg.mouse.up(); await pg.wait_for_timeout(1200)
        n1 = await pg.evaluate(f"{A}.state.route.length")
        check(n1 == n0 + 1, f"trascinando la linea si inserisce un punto: {n0} → {n1}")
        ins = await pg.evaluate(f"{A}.state.route[2]")
        check(13.62 < ins["lon"] < 13.80, f"il nuovo punto è il terzo, nel tratto 2 ({ins['lon']:.3f} E {ins['lat']:.3f} N)")
        await pg.screenshot(path=str(HERE / "tocchi-piega.png"))
        # 4. un tocco sul punto nuovo lo seleziona; un trascinamento senza selezione non lo sposta
        s = await pg.evaluate(f"{A}.screenOf(2)")
        before = await pg.evaluate(f"[{A}.state.route[2].lon, {A}.state.route[2].lat]")
        await pg.mouse.move(s[0], s[1]); await pg.mouse.down(); await pg.mouse.move(s[0] + 40, s[1] + 40); await pg.mouse.up(); await pg.wait_for_timeout(500)
        after = await pg.evaluate(f"[{A}.state.route[2].lon, {A}.state.route[2].lat]")
        check(before == after and await pg.evaluate(f"{A}.state.selWp") == 2, "carta: il primo tocco seleziona il punto senza spostarlo")
        # un tocco sulla carta lontano dalla rotta deseleziona; un nuovo tocco seleziona di nuovo
        await pg.mouse.click(s[0] - 200, s[1] - 150); await pg.wait_for_timeout(400)
        check(await pg.evaluate(f"{A}.state.selWp") is None, "un tocco altrove sulla carta deseleziona il punto")
        s = await pg.evaluate(f"{A}.screenOf(2)")
        await pg.mouse.click(s[0], s[1]); await pg.wait_for_timeout(400)
        # 5. ora il punto selezionato si trascina e lasciato sul cestino viene tolto
        s = await pg.evaluate(f"{A}.screenOf(2)")
        await pg.mouse.move(s[0], s[1]); await pg.mouse.down()
        await pg.mouse.move(s[0] + 20, s[1] + 20); await pg.wait_for_timeout(100)
        tb = await pg.evaluate("(() => { const r = document.querySelector('#trash').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width]; })()")
        check(tb[2] > 0, "mentre si trascina un punto compare il cestino")
        for k in range(1, 11):
            await pg.mouse.move(s[0] + 20 + (tb[0] - s[0] - 20) * k / 10, s[1] + 20 + (tb[1] - s[1] - 20) * k / 10); await pg.wait_for_timeout(40)
        await pg.screenshot(path=str(HERE / "tocchi-cestino.png"))
        await pg.mouse.up(); await pg.wait_for_timeout(1000)
        n2 = await pg.evaluate(f"{A}.state.route.length")
        check(n2 == n0, f"lasciato sul cestino, il punto si toglie: {n1} → {n2}")
        hid = await pg.evaluate("getComputedStyle(document.querySelector('#trash')).display")
        check(hid == "none", "il cestino sparisce a fine trascinamento")
        # 6. «Annulla» rimette il punto tolto, poi toglie quello inserito piegando la linea
        await pg.click("#mapUndo"); await pg.wait_for_timeout(600)
        check(await pg.evaluate(f"{A}.state.route.length") == n1, "Annulla: il punto tolto col cestino torna")
        await pg.click("#mapUndo"); await pg.wait_for_timeout(600)
        check(await pg.evaluate(f"{A}.state.route.length") == n0, "Annulla di nuovo: tolto anche il punto inserito piegando la linea")

        # 5. pressione lunga a metà tra i punti 1 e 2, un po' a lato: colonna d'aria
        s0 = await pg.evaluate(f"{A}.screenOf(0)"); s1 = await pg.evaluate(f"{A}.screenOf(1)")
        qx, qy = (s0[0] + s1[0]) / 2, (s0[1] + s1[1]) / 2 + 70
        await pg.mouse.move(qx, qy); await pg.mouse.down(); await pg.wait_for_timeout(900); await pg.mouse.up()
        await pg.wait_for_timeout(600)
        vis = await pg.evaluate("getComputedStyle(document.querySelector('#whats')).display")
        txt = await pg.inner_text("#whats") if vis != "none" else ""
        print("COLONNA D'ARIA:\n" + txt)
        check(vis != "none" and "Terreno" in txt and "spazi aerei, dal basso" in txt.lower(), "pressione lunga: colonna d'aria con terreno e spazi aerei")
        col = await pg.evaluate("(() => { const c = document.querySelector('#whats canvas'); return c ? [c.width, c.height] : null; })()")
        check(col and col[0] > 0 and col[1] > 0, f"sezione verticale disegnata ({col})")
        check("dalla rotta" in txt.lower(), "il riquadro dice quanto si è lontani dalla rotta")
        await pg.screenshot(path=str(HERE / "tocchi-colonna.png"))
        n3 = await pg.evaluate(f"{A}.state.route.length")
        await pg.click('#whats [data-wh="ins"]'); await pg.wait_for_timeout(1000)
        n4 = await pg.evaluate(f"{A}.state.route.length")
        r = await pg.evaluate(f"{A}.state.route.map(p => p.lon)")
        check(n4 == n3 + 1 and 13.45 < r[1] < 13.62, f"«Inserisci nella rotta» mette il punto tra 1 e 2: {[round(x, 3) for x in r]}")
        vis = await pg.evaluate("getComputedStyle(document.querySelector('#whats')).display")
        check(vis == "none", "il riquadro si chiude dopo l'azione")
        await b.close()
    print("\n" + ("\n".join(errors) if errors else "Nessun errore."))


asyncio.run(main())
