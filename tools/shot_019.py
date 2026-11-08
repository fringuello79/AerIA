# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
"""Prova automatica della 0.19.0 (Chrome headless, Playwright, tablet 1280×800).

Server locale: cd web-prototype && python3 -m http.server 8765
Uso: python3 tools/shot_019.py

Controlla:
  - terreno a livelli: spostando la vista lontano (Firenze, camera a 30 km) il dettaglio fine arriva lì
  - partenza e arrivo a terra: punto qualsiasi a terra sul terreno; quota scritta (Celano 2260 ft) usata dal profilo;
    arrivo a terra; «già in volo» mette la partenza in aria
  - ordine dei punti: frecce su e giù, «Partenza» dalla ricerca
  - spazi aerei alti nascosti con «crociera + 2500 ft»; con «tutti» si vedono; tocco ripetuto passa allo spazio sopra
  - un secondo dito durante il trascinamento non sposta il punto; un tocco senza movimento non sposta il punto
Schermate: tools/v019-*.png
Firma: fringuello79 di Avezzano.
"""
import asyncio
import pathlib

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
        pg = await b.new_page(viewport={"width": 1280, "height": 800})
        pg.set_default_timeout(180000)
        pg.on("pageerror", lambda e: errors.append(f"ERRORE PAGINA: {e}"))
        await pg.add_init_script("localStorage.clear()")
        await pg.goto("http://localhost:8765/index.html")
        await pg.wait_for_function(f"{A} && {A}.state.proj && document.querySelector('#chips').innerText.includes('Terreno')", timeout=180000)
        await pg.wait_for_timeout(2500)

        # ---------------------------------------------------------------- terreno a livelli
        l0 = await pg.evaluate(f"{A}.lod()")
        check(l0["shown"] > 20 and max(l0["levels"]) >= 2, f"terreno a tessere: {l0['shown']} in vista, livello massimo {max(l0['levels'])}")
        await pg.evaluate(f"{A}.lookAt(11.25, 43.77)")
        await pg.evaluate(f"{A}.zoomTo(30)")
        for _ in range(30):
            await pg.wait_for_timeout(1000)
            if (await pg.evaluate(f"{A}.lodAt(11.25, 43.77)") or 0) >= 3:
                break
        far = await pg.evaluate(f"""(() => {{ const L = {A}.lod(); return {{ ...L, here: {A}.lodAt(11.25, 43.77) }}; }})()""")
        check(far["here"] is not None and far["here"] >= 3, f"dopo lo spostamento a Firenze il dettaglio arriva lì (livello {far['here']})")
        await pg.screenshot(path=str(HERE / "v019-firenze.png"))
        await pg.evaluate(f"{A}.lookAt(13.45, 42.15)")
        await pg.evaluate(f"{A}.zoomTo(90)")
        await pg.wait_for_timeout(4000)

        # ---------------------------------------------------------------- partenza e arrivo a terra
        await pg.evaluate("document.querySelector('#date').value = '2026-11-10'; document.querySelector('#date').dispatchEvent(new Event('input'))")
        await pg.evaluate(f"{A}.setRoute([[13.50, 42.06], [13.45, 42.2], [{LIAP[0]}, {LIAP[1]}]])")
        await pg.wait_for_timeout(3000)
        pr = await pg.evaluate(f"(() => {{ const p = {A}.state.profile; return {{ a0: p.altAt(0), aEnd: p.altAt(p.total), dg: p.depGround, ag: p.arrGround, t0: Math.round({A}.elevM(13.50, 42.06) * 3.28084) }}; }})()")
        check(pr["dg"] and abs(pr["a0"] - pr["t0"]) <= 1, f"partenza da un punto qualsiasi a terra: {pr['a0']} ft (terreno {pr['t0']} ft)")
        check(pr["ag"] and pr["aEnd"] < 2500, f"arrivo a terra: {pr['aEnd']} ft")
        await pg.fill("#wpList [data-ground='0']", "2260")
        await pg.press("#wpList [data-ground='0']", "Enter")
        await pg.wait_for_timeout(1500)
        a0 = await pg.evaluate(f"{A}.state.profile.altAt(0)")
        check(a0 == 2260, f"quota a terra scritta (Celano 2260 ft) usata dal profilo: {a0}")
        await pg.screenshot(path=str(HERE / "v019-partenza.png"))
        await pg.check("#wpList [data-air]")
        await pg.wait_for_timeout(1500)
        air = await pg.evaluate(f"(() => {{ const p = {A}.state.profile; return {{ a0: p.altAt(0), dg: p.depGround }}; }})()")
        check(not air["dg"] and air["a0"] > 3000, f"«già in volo»: partenza in aria a {air['a0']:.0f} ft")
        await pg.uncheck("#wpList [data-air]")
        await pg.wait_for_timeout(800)

        # ---------------------------------------------------------------- ordine dei punti
        names = lambda: pg.evaluate(f"{A}.state.route.map(p => p.name)")
        n0 = await names()
        await pg.click("#wpList [data-up='1']")
        await pg.wait_for_timeout(800)
        n1 = await names()
        check(n1 == [n0[1], n0[0], n0[2]], f"freccia su: {n0} → {n1}")
        await pg.click("#wpList [data-down='0']")
        await pg.wait_for_timeout(800)
        check(await names() == n0, "freccia giù: ordine di nuovo come prima")
        await pg.fill("#findQ", "Celano")
        await pg.wait_for_timeout(800)
        await pg.click("#findList [data-adds='0']")
        await pg.wait_for_timeout(1500)
        n2 = await names()
        check(len(n2) == 4 and "LIAH" in (n2[0] or "").upper() or "CELANO" in (n2[0] or "").upper(), f"«Partenza» dalla ricerca mette il campo all'inizio: {n2}")
        fe = await pg.evaluate(f"{A}.state.profile.altAt(0)")
        check(2100 < fe < 2400, f"partenza dal campo di Celano a terra: {fe:.0f} ft")
        await pg.screenshot(path=str(HERE / "v019-ordine.png"))

        # ---------------------------------------------------------------- spazi aerei alti
        vis = lambda: pg.evaluate(f"{A}.visibleNames()")
        v_auto = await vis()
        check(not any("Z4 MARSICA" in n for n in v_auto), "con «crociera + 2500 ft» la CTA Roma Z4 Marsica (FL 125) è nascosta")
        await pg.select_option("#ceilMap", "all")
        await pg.wait_for_timeout(1500)
        v_all = await vis()
        check(any("Z4 MARSICA" in n for n in v_all), "con «tutti» si vede")
        await pg.screenshot(path=str(HERE / "v019-spazi.png"))
        # tocco ripetuto nello stesso punto: dal più basso al successivo
        pick = await pg.evaluate(f"{A}.pickTest(13.43, 42.03)")
        check(pick["n"] >= 2 and pick["first"] != pick["second"] and pick["firstLow"] <= pick["secondLow"], f"tocchi ripetuti: {pick}")
        await pg.select_option("#ceilMap", "auto")
        await pg.wait_for_timeout(800)

        # ---------------------------------------------------------------- tocchi sui punti
        await pg.evaluate(f"{A}.setRoute([[{CELANO[0]}, {CELANO[1]}], [13.45, 42.2], [{LIAP[0]}, {LIAP[1]}]])")
        await pg.evaluate(f"{A}.setView('plan')")
        await pg.wait_for_timeout(2500)
        s1 = await pg.evaluate(f"{A}.screenOf(1)")
        before = await pg.evaluate(f"{A}.state.route[1]")
        # selezione, poi tocco (giù e su senza movimento) sul punto selezionato: non si sposta
        await pg.mouse.click(s1[0], s1[1]); await pg.wait_for_timeout(300)
        await pg.mouse.move(s1[0] + 3, s1[1] + 2); await pg.mouse.down(); await pg.mouse.up(); await pg.wait_for_timeout(500)
        after = await pg.evaluate(f"{A}.state.route[1]")
        check(abs(after["lon"] - before["lon"]) < 1e-9 and abs(after["lat"] - before["lat"]) < 1e-9, "tocco senza trascinare sul punto selezionato: non si sposta")
        # secondo dito: pointerdown 1 sul punto, pointerdown 2 lontano, movimento del 2: il punto resta dov'era
        moved = await pg.evaluate(f"""(() => {{
          const c = document.querySelector('#view canvas'), s = {A}.screenOf(1), r0 = {{ ...{A}.state.route[1] }};
          const ev = (t, id, x, y) => c.dispatchEvent(new PointerEvent(t, {{ pointerId: id, clientX: x, clientY: y, bubbles: true, isPrimary: id === 1, pointerType: 'touch' }}));
          ev('pointerdown', 1, s[0], s[1]);
          ev('pointerdown', 2, s[0] + 200, s[1] + 120);
          ev('pointermove', 2, s[0] + 230, s[1] + 140);
          ev('pointermove', 1, s[0] + 4, s[1] + 3);
          ev('pointerup', 2, s[0] + 230, s[1] + 140); ev('pointerup', 1, s[0] + 4, s[1] + 3);
          const r1 = {A}.state.route[1];
          return Math.hypot(r1.lon - r0.lon, r1.lat - r0.lat);
        }})()""")
        check(moved < 1e-9, f"secondo dito durante il trascinamento: il punto non salta (spostamento {moved:.6f}°)")
        # trascinamento normale: si sposta di quanto si muove il dito
        s1 = await pg.evaluate(f"{A}.screenOf(1)")
        await pg.mouse.click(s1[0], s1[1]); await pg.wait_for_timeout(300)
        s1 = await pg.evaluate(f"{A}.screenOf(1)")
        await pg.mouse.move(s1[0], s1[1]); await pg.mouse.down()
        for k in range(1, 9):
            await pg.mouse.move(s1[0] + 8 * k, s1[1]); await pg.wait_for_timeout(40)
        await pg.mouse.up(); await pg.wait_for_timeout(800)
        s2 = await pg.evaluate(f"{A}.screenOf(1)")
        check(abs((s2[0] - s1[0]) - 64) < 12 and abs(s2[1] - s1[1]) < 12, f"trascinamento: il punto segue il dito ({s2[0] - s1[0]:.0f}, {s2[1] - s1[1]:.0f} px)")
        await b.close()
    print("\n" + ("Tutte le prove superate, nessun errore JavaScript." if not errors else "ERRORI:\n" + "\n".join(errors)))
    raise SystemExit(1 if errors else 0)

asyncio.run(main())
