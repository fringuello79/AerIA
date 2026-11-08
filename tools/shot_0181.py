# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
"""Prova automatica delle correzioni della 0.18.1 e 0.18.2 (Chrome headless, Playwright, tablet 1280×800).

Server locale: cd web-prototype && python3 -m http.server 8765   (pacchetto Italia centrale in data/centro)
Uso: python3 tools/shot_0181.py

Controlla:
  - rotta 3D dritta tra i punti, alzata sopra il punto più alto del rilievo incontrato (500 ft entro 600 m)
  - profilo: il nodo di un punto sta alla quota della sua casella; primo tocco seleziona, poi si trascina su o giù e
    la casella segue; non scende sotto il minimo; il campo di partenza resta a terra; un tocco lontano deseleziona
  - volo simulato: la prua disegnata gira dolcemente verso la traccia; la scia c'è, si spegne e si riaccende; l'aereo
    e la scia stanno sopra il terreno disegnato
  - comandi del volo su una sola riga, sotto la carta, sopra il profilo
  - liste: tasto «Liste» in alto anche in «Pianifica», scelta dell'aereo dentro le liste
Schermate: tools/v0181-volo.png, tools/v0181-profilo.png, tools/v0181-liste-pianifica.png
Firma: fringuello79 di Avezzano.
"""
import asyncio
import pathlib

from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).parent
A = "window.__airplanning"
CELANO = (13.55778, 42.05167)
LIAP = (13.309, 42.379)

ROUTE_CHECK = """(() => {
  const A = window.__airplanning, P = A.state.proj, out = { n: 0, below: 0, worst: 0 };
  const lines = A.groups.route.children.filter(o => o.renderOrder === 7);
  for (const l of lines) {
    const st = l.geometry.attributes.instanceStart, en = l.geometry.attributes.instanceEnd;
    for (let i = 0; i < st.count; i++) for (const t of [0, 0.25, 0.5, 0.75]) {
      const x = st.getX(i) + (en.getX(i) - st.getX(i)) * t, y = st.getY(i) + (en.getY(i) - st.getY(i)) * t, z = st.getZ(i) + (en.getZ(i) - st.getZ(i)) * t;
      const g = P.fromLocal(x, z), top = A.meshTopY(g.lon, g.lat);
      if (!Number.isFinite(top)) continue;
      out.n++; const d = y - top; if (d < -1e-4) { out.below++; out.worst = Math.min(out.worst, d); const R = A.state.route, km = (a, b) => Math.hypot((a.lon - b.lon) * 82.7, (a.lat - b.lat) * 111.2); (out.where ||= []).push([km(g, R[0]).toFixed(1), km(g, R.at(-1)).toFixed(1), d.toFixed(3)]); }
    }
  }
  return out;
})()"""


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
        await pg.goto("http://localhost:8765/index.html")
        await pg.wait_for_function(f"{A} && {A}.state.proj && document.querySelector('#chips').innerText.includes('Terreno')", timeout=180000)
        await pg.wait_for_timeout(3000)

        # 1. rotta bassa che attraversa il massiccio del Velino: quota alzata sopra il punto più alto, linea dritta
        await pg.evaluate(f"{A}.setRoute([[{CELANO[0]}, {CELANO[1]}], [13.40, 42.15], [{LIAP[0]}, {LIAP[1]}]])")
        await pg.evaluate(f"{A}.state.route[0].altFt = 3000; {A}.state.route[1].altFt = 3000")
        await pg.evaluate("document.querySelector('#cruise').value = 3000; document.querySelector('#cruise').dispatchEvent(new Event('input'))")
        await pg.wait_for_timeout(8000)
        alts = await pg.evaluate(f"{A}.state.route.map(p => p.altFt)")
        check(alts[0] > 3000 and alts[1] > 3000, f"quote dei punti alzate sopra il rilievo: {alts[:2]} ft")
        clr = await pg.evaluate(f"""(() => {{ const A = {A}, pr = A.state.profile; return Math.min(...A.state.analysis.samples.filter(s => s.dist > pr.depEnd + 200 && s.dist < pr.arrStart - 200).map(s => s.alt - s.terr)); }})()""")
        check(clr >= 500, f"fuori da salita e discesa la rotta passa almeno 500 ft sopra il rilievo (minimo {clr:.0f} ft)")
        raised = await pg.evaluate(f"{A}.state.analysis.warnings.filter(w => /alzata/.test(w.title)).map(w => w.title)")
        check(len(raised) >= 1, f"modifica segnalata: {raised}")
        nv = await pg.evaluate(f"""(() => {{ const l = {A}.groups.route.children.find(o => o.renderOrder === 7); return l.geometry.attributes.instanceStart.count + 1; }})()""")
        npr = await pg.evaluate(f"{A}.state.profile.pts.length + {A}.state.route.length")
        check(nv <= npr, f"linea dritta tra i vertici del profilo ({nv} vertici, non segue il rilievo)")
        r = await pg.evaluate(ROUTE_CHECK)
        near_field = all(min(float(a), float(b)) < 1.6 for a, b, _ in r.get("where", []))
        check(near_field, f"linea mai sotto il terreno disegnato oltre 1,5 km dai campi ({r['below']} punti sotto su {r['n']}: {r.get('where', [])})")

        # 2. profilo: i nodi si muovono e la casella segue
        await pg.evaluate(f"{A}.setRoute([[{CELANO[0]}, {CELANO[1]}], [13.45, 42.2], [13.55, 42.30], [{LIAP[0]}, {LIAP[1]}]])")
        await pg.evaluate("document.querySelector('#cruise').value = 7500; document.querySelector('#cruise').dispatchEvent(new Event('input'))")
        await pg.wait_for_timeout(4000)
        box = await pg.locator("#profile").bounding_box()
        NODE = """(i) => {{ const A = window.__airplanning, g = A.state.profGeom, R = A.state.route, pr = A.state.profile;
          const toRad = x => x * Math.PI / 180, dist = (a, b) => 6371000 * 2 * Math.asin(Math.sqrt(Math.sin(toRad(b.lat - a.lat) / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lon - a.lon) / 2) ** 2));
          let d = 0; for (let k = 1; k <= i; k++) d += dist(R[k - 1], R[k]);
          const X = d => g.L + (g.W - g.L - g.R) * d / g.total, Y = f => g.T + (g.H - g.T - g.B) * (1 - Math.max(0, Math.min(g.yMax, f)) / g.yMax);
          const box = R[Math.min(i, R.length - 2)].altFt ?? Number(document.querySelector('#cruise').value);
          const alt = i === 0 && pr.depField ? pr.altAt(0) : box;
          return {{ x: X(d), y: Y(alt), alt, line: pr.altAt(d), box }}; }}"""
        n1 = await pg.evaluate(NODE.replace("{{", "{").replace("}}", "}"), 1)
        check(abs(n1["alt"] - n1["box"]) < 60, f"il nodo P2 sta alla quota della sua casella ({n1['alt']:.0f} contro {n1['box']} ft)")
        hx, hy = box["x"] + n1["x"], box["y"] + n1["y"]
        await pg.mouse.click(hx, hy)
        await pg.wait_for_timeout(300)
        check(await pg.evaluate(f"{A}.state.profSel") == 1, "profilo: primo tocco seleziona il nodo P2")
        await pg.mouse.move(hx, hy); await pg.mouse.down()
        for k in range(1, 9):
            await pg.mouse.move(hx, hy - 6 * k); await pg.wait_for_timeout(30)
        boxval_live = await pg.input_value("#wpList [data-alt='1']")
        await pg.mouse.up(); await pg.wait_for_timeout(600)
        n1b = await pg.evaluate(NODE.replace("{{", "{").replace("}}", "}"), 1)
        boxval = await pg.input_value("#wpList [data-alt='1']")
        check(n1b["alt"] > n1["alt"] + 300 and abs(n1b["alt"] - n1b["box"]) < 60, f"trascinato in su, il nodo P2 si muove ({n1['alt']:.0f} → {n1b['alt']:.0f} ft)")
        check(boxval == str(n1b["box"]) and boxval_live == str(n1b["box"]), f"la casella di P2 segue il nodo anche durante il trascinamento ({boxval} ft)")
        await pg.screenshot(path=str(HERE / "v0181-profilo.png"))
        # trascinamento verso il basso sotto il minimo: si ferma al minimo
        await pg.mouse.move(hx, box["y"] + n1b["y"]); await pg.mouse.down()
        for k in range(1, 30):
            await pg.mouse.move(hx, box["y"] + n1b["y"] + 8 * k); await pg.wait_for_timeout(20)
        await pg.mouse.up(); await pg.wait_for_timeout(600)
        lowv = await pg.evaluate(f"{A}.state.route[1].altFt")
        mins = await pg.evaluate(f"""(() => {{ const A = {A}; return Math.min(...A.state.analysis.samples.filter(s => s.dist > A.state.profile.depEnd + 200 && s.dist < A.state.profile.arrStart - 200).map(s => s.alt - s.terr)); }})()""")
        check(mins >= 500, f"trascinando in giù il nodo si ferma al minimo ({lowv} ft): la rotta resta 500 ft sopra il rilievo (minimo {mins:.0f} ft)")
        # campo di partenza: resta a terra, cambia la quota dopo il decollo
        n0 = await pg.evaluate(NODE.replace("{{", "{").replace("}}", "}"), 0)
        await pg.mouse.click(box["x"] + n0["x"], box["y"] + n0["y"]); await pg.wait_for_timeout(300)
        a0 = await pg.evaluate(f"{A}.state.route[0].altFt")
        await pg.mouse.move(box["x"] + n0["x"], box["y"] + n0["y"]); await pg.mouse.down()
        for k in range(1, 9):
            await pg.mouse.move(box["x"] + n0["x"], box["y"] + n0["y"] - 6 * k); await pg.wait_for_timeout(30)
        await pg.mouse.up(); await pg.wait_for_timeout(500)
        a0b = await pg.evaluate(f"{A}.state.route[0].altFt")
        n0b = await pg.evaluate(NODE.replace("{{", "{").replace("}}", "}"), 0)
        check(a0b > a0 and abs(n0b["alt"] - n0["alt"]) < 1, f"campo di partenza: resta a terra, la quota dopo il decollo sale ({a0} → {a0b} ft)")
        await pg.mouse.click(box["x"] + 12, box["y"] + box["height"] - 8)   # bordo in basso a sinistra, lontano dai nodi
        await pg.wait_for_timeout(200)
        check(await pg.evaluate(f"{A}.state.profSel") is None, "profilo: un tocco lontano deseleziona")

        # 3. liste dalla schermata Pianifica
        await pg.click("#checkTop")
        await pg.wait_for_timeout(400)
        check(await pg.is_visible("#checks"), "liste: aperte dal tasto in alto in «Pianifica»")
        await pg.select_option("#checks [data-c='ac']", "acm-golf")
        await pg.wait_for_timeout(800)
        t = await pg.inner_text("#checks")
        check("P96 GOLF" in t and "RUBINETTI CARBURANTE" in t, "liste: scelta del Golf dentro le liste")
        await pg.click("#checks [data-c='item'][data-i='1']")
        check("1/12" in await pg.inner_text("#checks"), "liste: voce spuntata")
        check(await pg.evaluate(f"{A}.state.nl.st.aircraftId") == "acm-golf", "liste: l'aereo scelto è anche quello del piano di volo")
        await pg.screenshot(path=str(HERE / "v0181-liste-pianifica.png"))
        await pg.click("#checks [data-c='close']")

        # 4. volo simulato: prua morbida, scia, comandi su una riga
        await pg.evaluate(f"{A}.setRoute([[{CELANO[0]}, {CELANO[1]}], [13.45, 42.2], [13.60, 42.30], [{LIAP[0]}, {LIAP[1]}]])")
        await pg.wait_for_timeout(1500)
        await pg.evaluate(f"{A}.setView('fly')")
        await pg.select_option("#simSpeed", "16") if await pg.is_visible("#simSpeed") else None
        await pg.click("#simBtn")
        await pg.wait_for_timeout(12000)
        st = await pg.evaluate(f"(() => {{ const f = {A}.state.fly; return {{ trk: f.trk, disp: f.disp && f.disp.trk, pos: !!f.pos }}; }})()")
        diff = abs(((st["trk"] - (st["disp"] or 0) + 540) % 360) - 180)
        check(st["pos"] and diff < 25, f"prua disegnata vicina alla traccia ({st['disp']:.0f}° contro {st['trk']:.0f}°)")
        # giro: si misura la prua disegnata a intervalli brevi dopo il passaggio su un punto (nessun salto > 25° per fotogramma)
        jumps = await pg.evaluate(f"""new Promise(res => {{ const f = {A}.state.fly; let prev = f.disp.trk, worst = 0, n = 0;
          const step = () => {{ const d = Math.abs(((f.disp.trk - prev + 540) % 360) - 180); worst = Math.max(worst, d); prev = f.disp.trk; if (++n < 240) requestAnimationFrame(step); else res(worst); }}; requestAnimationFrame(step); }})""")
        check(jumps < 25, f"prua girata senza scatti (al massimo {jumps:.1f}° tra due fotogrammi)")
        n_trail = await pg.evaluate(f"{A}.groups.trail.children.length")
        check(n_trail == 1, "scia dell'aereo disegnata")
        above = await pg.evaluate(f"""(() => {{ const A = {A}, f = A.state.fly, d = f.disp; return A.yAbove(d.lon, d.lat, d.alt) >= A.meshTopY(d.lon, d.lat); }})()""")
        check(above, "aereo sopra il terreno disegnato")
        bar = await pg.evaluate("""(() => { const bs = [...document.querySelectorAll('.flybar > .btn')].filter(b => b.offsetParent); const tops = new Set(bs.map(b => Math.round(b.getBoundingClientRect().top)));
          const fb = document.querySelector('.flybar').getBoundingClientRect(), pw = document.querySelector('#profileWrap').getBoundingClientRect();
          const fbEl = document.querySelector('.flybar'); return { rows: tops.size, n: bs.length, gap: Math.round(pw.top - fb.bottom), h: Math.round(fb.height), over: fbEl.scrollWidth - fbEl.clientWidth }; })()""")
        check(bar["rows"] == 1 and abs(bar["gap"]) <= 1, f"comandi del volo su una riga ({bar['n']} tasti) appoggiati sopra il profilo")
        check(bar["over"] <= 1, f"tutti i tasti del volo stanno nella riga col pannello destro aperto (eccedenza {bar['over']} px)")
        await pg.screenshot(path=str(HERE / "v0181-volo.png"))
        await pg.click("#trailBtn")
        await pg.wait_for_timeout(300)
        check(await pg.evaluate(f"{A}.groups.trail.children.length") == 0 and await pg.get_attribute("#trailBtn", "aria-pressed") == "false", "scia spenta dal tasto")
        await pg.click("#trailBtn")
        await pg.wait_for_timeout(300)
        check(await pg.evaluate(f"{A}.groups.trail.children.length") == 1, "scia riaccesa")
        await pg.click("#simBtn")
        await b.close()

    print("\n" + ("Tutte le prove superate, nessun errore JavaScript." if not errors else "ERRORI:\n" + "\n".join(errors)))
    raise SystemExit(1 if errors else 0)

asyncio.run(main())
