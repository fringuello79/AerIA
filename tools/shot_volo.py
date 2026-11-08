# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
"""Prova automatica delle funzioni di volo della 0.16.0 (Chrome headless, Playwright, tablet 1280×800).

Server locale: cd web-prototype && python3 -m http.server 8765   (pacchetto Italia centrale in data/centro)
Uso: python3 tools/shot_volo.py

Simula un volo Celano → L'Aquila Preturo con posizioni «come dal GPS» e controlla:
  - a terra: nessun avviso di terreno, rilievo non colorato; decollo riconosciuto dopo 10 s oltre 40 kt
  - in volo sopra le montagne: rilievo colorato rispetto alla quota (rosso e giallo presenti nella schermata)
  - pulsante Emergenza: campi raggiungibili, «diretto» al migliore, messaggio di soccorso compilato
  - caselle degli strumenti scelte al tocco; tempi, promemoria e carburante stimato
  - atterraggio: voce nel diario dei voli
  - pianificazione: rilievo vicino alla quota di crociera; giorno aeronautico col decollo tardi
Schermate in tools/: volo-terra.png, volo-rilievo.png, volo-emergenza.png, volo-tempi.png, volo-piano-rilievo.png
Firma: fringuello79 di Avezzano.
"""
import asyncio
import pathlib

from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).parent
A = "window.__airplanning"
T0 = 1794045600000  # 7/11/2026 10:00 UTC
CELANO = (13.55778, 42.05167)
LIAP = (13.309, 42.379)


def count_colors(png_path):
    """Pixel rossi e gialli di avviso nella schermata (colori del rilievo colorato)."""
    from PIL import Image
    im = Image.open(png_path).convert("RGB")
    w, h = im.size
    red = yel = 0
    px = im.load()
    for y in range(110, h - 200, 3):
        for x in range(0, w - 260, 3):
            r, g, b = px[x, y]
            if r > 170 and g < 90 and b < 90:
                red += 1
            elif r > 150 and g > 120 and b < 80 and abs(r - g) < 70:
                yel += 1
    return red, yel


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
        await pg.evaluate(f"{A}.setView('fly')")
        await pg.wait_for_timeout(1500)

        async def fixes(lon, lat, alt, gs, trk, t0, secs):
            for k in range(secs):
                await pg.evaluate(f"{A}.fix({{ lon: {lon}, lat: {lat}, altFt: {alt}, gsKt: {gs}, trk: {trk}, t: {t0 + k * 1000} }})")

        # 1. a terra a Celano (campo a 2241 ft): rullaggio
        await fixes(*CELANO, 2250, 12, 300, T0, 25)
        await pg.wait_for_timeout(800)
        warn = await pg.inner_text("#warnings")
        check("A terra" in warn and "Terreno" not in warn, "a terra: nessun avviso di terreno")
        check((await pg.evaluate(f"{A}.hazard()"))[3] == 0, "a terra: rilievo non colorato")
        await pg.screenshot(path=str(HERE / "volo-terra.png"))

        # 2. decollo: 15 s oltre 40 kt
        await fixes(*CELANO, 2400, 65, 320, T0 + 30000, 15)
        ph = await pg.evaluate(f"{A}.state.fly.ph")
        check(ph["phase"] == "volo" and ph["takeoffAt"] == T0 + 30000, f"decollo riconosciuto alle {ph['takeoffAt']}")

        # 3. in volo tra le montagne a nord-ovest di Celano, 6500 ft (Velino 2487 m ≈ 8160 ft)
        await fixes(13.42, 42.12, 6500, 95, 315, T0 + 20 * 60000, 3)
        await pg.evaluate(f"{A}.setDim('3d')")
        await pg.wait_for_timeout(3000)
        hz = await pg.evaluate(f"{A}.hazard()")
        check(hz[3] == 1, "in volo fuori dalla zona del campo: rilievo colorato")
        await pg.screenshot(path=str(HERE / "volo-rilievo.png"))
        red, yel = count_colors(HERE / "volo-rilievo.png")
        print(f"     pixel rossi {red}, gialli {yel}")
        check(red > 50 and yel > 50, "rilievo rosso (sopra o entro 100 ft) e giallo (entro 1000 ft) visibili")
        pw = await pg.evaluate(f"{A}.positionWords({{ lon: 13.42, lat: 42.12 }})")
        print("     posizione in parole:", pw)
        check("miglia a" in pw or "sopra" in pw, "posizione in parole")

        # 4. emergenza
        await pg.click("#emergBtn")
        await pg.wait_for_timeout(1500)
        em = await pg.inner_text("#emerg")
        print("     " + em.replace("\n", " | ")[:600])
        check("MAYDAY MAYDAY MAYDAY" in em and "6500 piedi" in em and "7700" in em, "messaggio di soccorso con quota e transponder")
        check("raggiungibil" in em, "elenco dei campi in planata")
        direct = await pg.evaluate(f"{A}.state.direct && ({A}.state.direct.icao || {A}.state.direct.name)")
        print("     diretto a:", direct)
        await pg.screenshot(path=str(HERE / "volo-emergenza.png"))
        await pg.click("#emerg [data-close]")

        # 5. casella degli strumenti: la quinta diventa «Luce del giorno»
        await pg.click("#instruments [data-slot='4']")
        await pg.wait_for_timeout(300)
        await pg.click("#instMenu [data-k='light']")
        await pg.wait_for_timeout(300)
        inst = await pg.inner_text("#instruments")
        check("Luce" in inst, "casella scelta al tocco")

        # 6. tempi e carburante
        await pg.click("#timerBtn")
        await pg.fill("#timers [data-t='fuel']", "60")
        await pg.dispatch_event("#timers [data-t='fuel']", "change")
        await pg.click("#timers [data-t='remind']")
        await fixes(13.40, 42.16, 6500, 95, 315, T0 + 31 * 60000, 2)
        tm = await pg.inner_text("#timers")
        print("     " + tm.replace("\n", " | ")[:400])
        check("0:30" in tm and "Spegni" in tm, "tempo di volo 0:30 e promemoria acceso")
        await pg.screenshot(path=str(HERE / "volo-tempi.png"))

        # 7. atterraggio a Preturo (campo a 2211 ft)
        await fixes(*LIAP, 2300, 60, 300, T0 + 50 * 60000, 3)
        await fixes(*LIAP, 2215, 15, 300, T0 + 52 * 60000, 25)
        log = await pg.evaluate(f"{A}.logLoad()")
        print("     diario:", log[-1] if log else None)
        check(len(log) >= 1 and log[-1]["min"] == 52 and log[-1]["off"] == "10:00", "volo nel diario (52 min, decollo 10:00 UTC)")

        # 8. pianificazione: rilievo vicino alla quota di crociera
        await pg.evaluate(f"{A}.stopFly(); {A}.setView('plan')")
        await pg.evaluate("document.querySelector('#cruise').value = 6500; document.querySelector('#cruise').dispatchEvent(new Event('input'))")
        await pg.wait_for_timeout(800)
        await pg.click("#ridgeBtn")
        await pg.click("#fitBtn")
        await pg.wait_for_timeout(2500)
        check((await pg.evaluate(f"{A}.hazard()"))[3] == 1, "pianificazione: rilievo vicino alla quota acceso")
        await pg.screenshot(path=str(HERE / "volo-piano-rilievo.png"))
        sun = await pg.inner_text("#daytype")
        print("     " + sun.replace("\n", " "))
        check("tramonta 16:5" in sun and "giorno aeronautico" in sun, "sorgere e tramonto in pianificazione")

        # 9. giorno aeronautico: decollo alle 15:50 UTC (16:50 locali), il giorno finisce alle 16:23 UTC
        await pg.evaluate(f"{A}.state.nl.st.toTime = '15:50'; {A}.state.nl.st.timeRef = 'UTC'; {A}.refresh()")
        await pg.wait_for_timeout(500)
        w = await pg.inner_text("#warnings")
        check("fine del giorno" in w, "decollo tardi: arrivo dopo la fine del giorno aeronautico")
        await pg.evaluate(f"{A}.state.nl.st.toTime = ''; {A}.refresh()")

        print("\n" + ("\n".join(errors) or "Tutte le prove superate, nessun errore JavaScript."))
        await b.close()
        if errors:
            raise SystemExit(1)


asyncio.run(main())
