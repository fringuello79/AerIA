# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
# Disegna l'icona dell'app, l'icona adattiva Android e le immagini di avvio. Uso: python3 tools/make_icon.py android/app/src/main/res
# Icona AerIA VFR · © 2026 fringuello79 (Avezzano) — disegno originale.
# Soggetto: il massiccio del Velino visto dal lato ovest di Magliano de' Marsi (42,0905 N, 13,3560 E, guardando a nord),
# con Monte Sevice (2355 m), Monte Velino e Monte Cafornia (2424 m); sopra il massiccio passa una rotta VFR
# (salita dolce, fine salita, crociera livellata) con l'ultraleggero I-6195 (disegno fornito dall'autore, icona-aereo.png).
# Il profilo delle creste è calcolato dal modello del terreno Copernicus (pacchetto «centro», tessera N42E013):
# angolo di elevazione dell'orizzonte per azimut da -6° a 50°, semplificato; la scala verticale è esagerata
# circa 2 volte per dare carattere al disegno.
import numpy as np, math
from PIL import Image, ImageDraw, ImageFilter

# (azimut in gradi, elevazione dell'orizzonte in gradi) visti dall'osservatore
PROFILO = [(-10.0, 7.68), (-9.0, 8.19), (-7.0, 8.65), (-6.3, 8.75), (-5.3, 8.52), (-3.7, 9.28), (-0.7, 9.87), (-0.6, 10.07), (1.4, 10.06), (2.5, 9.84), (3.9, 9.99), (9.4, 12.77), (10.3, 12.84), (12.2, 12.35), (14.3, 13.61), (16.3, 14.14), (18.4, 15.1), (20.1, 14.94), (20.2, 14.55), (23.6, 13.74), (24.1, 13.28), (26.9, 13.79), (27.4, 14.08), (28.3, 14.12), (28.5, 14.36), (29.7, 14.45), (31.1, 14.26), (35.9, 11.16), (39.9, 9.79), (40.9, 9.69), (42.8, 8.82), (45.0, 8.56), (45.7, 8.12), (46.7, 7.76), (47.2, 7.82), (47.3, 7.59), (48.2, 7.53), (48.3, 7.33), (49.8, 7.69), (50.7, 8.24), (52.3, 8.51), (54.0, 8.44)]

AZ0, AZ1, E_BASE, Y_BASE, S = -6.0, 50.0, 7.0, 0.77, 0.036
BASE = 0.865
K = S / 0.05     # spessori della neve in proporzione all'altezza dei monti

def xa(az): return (az - AZ0) / (AZ1 - AZ0)

SK = [(xa(az), Y_BASE - (el - E_BASE) * S) for az, el in PROFILO]
SX = np.array([p[0] for p in SK]); SY = np.array([p[1] for p in SK])
def sky_y(x): return float(np.interp(x, SX, SY))
def peak_near(az):
    x = xa(az); m = (SX > x - 0.04) & (SX < x + 0.04); i = np.where(m)[0][np.argmin(SY[m])]; return int(i)

def grad_fill(N, mask, c_top, c_bot, y0, y1):
    yy = np.linspace(0, 1, N)[:, None] * np.ones((1, N)); t = np.clip((yy - y0) / (y1 - y0), 0, 1)[..., None]
    col = np.array(c_top) + (np.array(c_bot) - np.array(c_top)) * t
    return Image.fromarray(np.dstack([np.clip(col, 0, 255).astype(np.uint8), np.array(mask)]), 'RGBA')

def scene(N, k=1.0, plane=True):
    P = lambda x, y: (N * (0.5 + (x - 0.5) * k), N * (0.5 + (y - 0.5) * k))
    Y = lambda y: (0.5 + (y - 0.5) * k)
    yy = np.linspace(0, 1, N)[:, None] * np.ones((1, N))
    t = ((yy - 0.5) / k + 0.5)[..., None]
    top = np.array([10, 20, 46]); mid = np.array([34, 82, 146]); hor = np.array([252, 178, 120])
    t = np.clip(t, 0, None)
    sky = np.where(t < 0.34, top + (mid - top) * (t / 0.34), mid + (hor - mid) * np.clip((t - 0.34) / 0.34, 0, 1) ** 1.2)
    img = Image.fromarray(np.clip(sky, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')
    # tramonto a ovest: guardando a nord da Magliano il sole cala a sinistra
    glow = Image.new('RGBA', (N, N), (0, 0, 0, 0)); g = ImageDraw.Draw(glow)
    sx, sy = P(0.06, 0.70); r = N * k * 0.30
    g.ellipse([sx - r, sy - r, sx + r, sy + r], fill=(255, 190, 110, 200))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(N * k * 0.09)))

    sk = [(-3, BASE - 0.03)] + SK + [(4, BASE - 0.03)]   # oltre il disegno le colline scendono piano
    # massiccio: versanti in luce (ovest) con sfumatura verticale
    m = Image.new('L', (N, N), 0); ImageDraw.Draw(m).polygon([P(*p) for p in sk + [(4, BASE + 0.02), (-3, BASE + 0.02)]], fill=255)
    img.alpha_composite(grad_fill(N, m, (70, 108, 152), (30, 52, 86), Y(0.47), Y(BASE)))
    # facce in ombra (est): una cresta scende in diagonale da Sevice, Velino e Cafornia
    sh = Image.new('L', (N, N), 0); sd = ImageDraw.Draw(sh)
    idx = [peak_near(10), peak_near(18.6), peak_near(29.6)]
    for n, i in enumerate(idx):
        if n + 1 < len(idx): j = i + int(np.argmax(SY[i:idx[n + 1] + 1]))   # fino alla sella
        else: j = len(SK) - 1
        px, py = SK[i]; vx, vy = SK[j]
        w = (0.10, 0.13, 0.22)[n]
        poly = SK[i:j + 1] + ([(4, BASE - 0.03), (4, BASE + 0.02)] if n == 2 else [(vx, BASE + 0.02)]) + [(px + w, BASE + 0.02)]
        sd.polygon([P(*p) for p in poly], fill=255)
    img.alpha_composite(grad_fill(N, sh, (30, 52, 92), (16, 30, 54), Y(0.47), Y(BASE)))
    # neve sopra 11,6° con canaloni verso il basso
    snow_y = Y_BASE - (11.6 - E_BASE) * S
    xs = np.linspace(SX[0], SX[-1], 1400)
    rnd = np.random.default_rng(79)
    teeth = np.zeros_like(xs); cx = xs[0]
    while cx < xs[-1]:
        wdt = rnd.uniform(0.025, 0.07); dep = rnd.choice([0.012, 0.03, 0.05, 0.09]) * rnd.uniform(0.7, 1.2) * K
        sk_ = rnd.uniform(0.3, 0.7)
        msk = (xs >= cx) & (xs < cx + wdt); u = (xs[msk] - cx) / wdt
        v = np.where(u < sk_, u / sk_, (1 - u) / (1 - sk_))
        teeth[msk] = dep * v + rnd.uniform(-0.008, 0.008) * K; cx += wdt
    top_y = np.interp(xs, SX, SY)
    low_y = np.maximum(top_y + 0.012 * K, snow_y + teeth)
    on = top_y < snow_y
    snow = Image.new('L', (N, N), 0); sn = ImageDraw.Draw(snow)
    runs = []; cur = []
    for x, a, b, o in zip(xs, top_y, low_y, on):
        if o: cur.append((x, a, b))
        elif cur: runs.append(cur); cur = []
    if cur: runs.append(cur)
    for r_ in runs:
        poly = [(x, a) for x, a, b in r_] + [(x, b) for x, a, b in reversed(r_)]
        sn.polygon([P(*p) for p in poly], fill=255)
    lit = Image.fromarray(np.minimum(np.array(snow), 255 - np.array(sh)))
    dark = Image.fromarray(np.minimum(np.array(snow), np.array(sh)))
    img.alpha_composite(grad_fill(N, lit, (255, 240, 228), (228, 234, 246), Y(0.46), Y(0.64)))
    img.alpha_composite(grad_fill(N, dark, (168, 190, 224), (140, 164, 204), Y(0.46), Y(0.64)))
    # filo di luce calda sulle creste rivolte a ovest (tramonto)
    rim = Image.new('RGBA', (N, N), (0, 0, 0, 0)); rd = ImageDraw.Draw(rim)
    for a_, b_ in zip(SK, SK[1:]):
        if b_[1] < a_[1] - 0.002:
            rd.line([P(*a_), P(*b_)], fill=(255, 196, 140, 230), width=max(1, int(N * k * 0.005)))
    img.alpha_composite(rim.filter(ImageFilter.GaussianBlur(N * k * 0.0015)))
    # piana in primo piano
    pl = Image.new('L', (N, N), 0); ImageDraw.Draw(pl).polygon([P(-3, BASE), P(4, BASE), P(4, 6), P(-3, 6)], fill=255)
    img.alpha_composite(grad_fill(N, pl, (30, 50, 64), (10, 20, 30), Y(BASE), Y(1.0)))
    lights = Image.new('RGBA', (N, N), (0, 0, 0, 0)); d = ImageDraw.Draw(lights)
    # luci del paese ai piedi del monte
    rnd = np.random.default_rng(7)
    for _ in range(26):
        x = rnd.uniform(0.18, 0.46); y = BASE + rnd.uniform(-0.004, 0.012); rr = N * k * rnd.uniform(0.0022, 0.0038)
        cxp, cyp = P(x, y); d.ellipse([cxp - rr, cyp - rr, cxp + rr, cyp + rr], fill=(255, 214, 140, 230))
    img.alpha_composite(lights)
    engrave(img, N, k, P)
    if plane: route_and_plane(img, N, k, P)
    return img

def engrave(img, N, k, P):
    """«AerIA» inciso nella parte bassa del massiccio: corsivo nero inclinato e in salita come la rotta,
    con bordo in ombra in alto a sinistra e in luce in basso a destra (luce da ovest); «IA» appena magenta."""
    from PIL import ImageFont, ImageChops
    import pathlib
    fp = next((f for f in ('/usr/share/fonts/opentype/inter/InterDisplay-BlackItalic.otf',
                           '/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf') if pathlib.Path(f).exists()), None)
    sz = int(N * k * 0.062)
    font = ImageFont.truetype(fp, sz) if fp else ImageFont.load_default()
    lay = Image.new('L', (N, N), 0); lay2 = Image.new('L', (N, N), 0)
    cx, cy = P(0.465, 0.785)
    w1 = ImageDraw.Draw(lay).textlength('Aer', font=font); w2 = ImageDraw.Draw(lay).textlength('IA', font=font)
    x0 = cx - (w1 + w2) / 2; y0 = cy - sz * 0.62
    ImageDraw.Draw(lay).text((x0, y0), 'Aer', font=font, fill=255)
    ImageDraw.Draw(lay2).text((x0 + w1, y0), 'IA', font=font, fill=255)
    # scia: una lama sottile che parte sotto la «A» e si assottiglia verso destra
    sw = Image.new('L', (N, N), 0); sd = ImageDraw.Draw(sw)
    xa_, xb_ = x0 + sz * 0.05, x0 + w1 + w2 * 0.92; yb = y0 + sz * 1.06; t = sz * 0.06
    sd.polygon([(xa_, yb), (xb_, yb - t * 0.2), (xb_ - sz * 0.1, yb + t * 0.55), (xa_ + sz * 0.15, yb + t)], fill=255)
    def dyn(m):   # inclinazione in avanti e leggera salita verso destra, attorno al centro della scritta
        m = m.transform(m.size, Image.AFFINE, (1, 0.16, -0.16 * cy, 0, 1, 0), Image.BICUBIC)
        return m.rotate(5, Image.BICUBIC, center=(cx, cy))
    mA, mI, mS = dyn(lay), dyn(lay2), dyn(sw)
    mask = ImageChops.lighter(mA, mI)
    d_ = max(1, int(N * k * 0.0016))
    shifted = lambda m, ox, oy: ImageChops.offset(m, ox, oy)
    inner = ImageChops.subtract(mask, shifted(mask, d_, d_))        # bordo in alto a sinistra: ombra
    lit = ImageChops.subtract(mask, shifted(mask, -d_, -d_))        # bordo in basso a destra: luce
    def paint(m, col, a):
        layer = Image.new('RGBA', (N, N), col + (0,)); layer.putalpha(m.point(lambda v: v * a // 255)); img.alpha_composite(layer)
    paint(mask, (6, 14, 32), 110)                                   # fondo dell'incisione
    paint(mS, (6, 14, 32), 90)                                      # scia, solo incisa
    paint(mI, (232, 40, 160), 95)                                   # «IA» appena magenta
    paint(inner, (2, 6, 16), 170)
    paint(lit, (190, 214, 245), 110)

AEREO = Image.open(__import__('pathlib').Path(__file__).with_name('icona-aereo.png')).convert('RGBA')
# punto dell'immagine dell'aereo dove arriva la rotta (cono di coda, sulla linea della fusoliera), in frazioni
AEREO_CODA = (300 / 1763, 335 / 662)

def route_and_plane(img, N, k, P):
    # rotta VFR sopra il massiccio: un arco di cerchio a curvatura costante che arriva orizzontale alla coda
    W = 0.40; L = 0.90 - W                                      # aereo: larghezza e bordo sinistro (elica a 0,90)
    h = W * AEREO.size[1] / AEREO.size[0]; cruise = 0.335
    top = cruise - AEREO_CODA[1] * h
    A = (-0.06, 0.475); E = (L + AEREO_CODA[0] * W, cruise)
    dx, dy = E[0] - A[0], A[1] - E[1]
    R = (dx * dx + dy * dy) / (2 * dy)                          # centro sotto la coda: tangente orizzontale in E
    arc_y = lambda x: E[1] + R - math.sqrt(max(R * R - (x - E[0]) ** 2, 0))
    x_lo = E[0] - R * 0.62                                      # oltre il disegno (formati larghi) l'arco continua
    pts = [(x_lo + (E[0] - x_lo) * i / 240, arc_y(x_lo + (E[0] - x_lo) * i / 240)) for i in range(241)]
    T = (0.30, arc_y(0.30))                                     # punto di rotta sull'arco
    (ax_, ay_), (bx_, by_) = pts[0], pts[1]; sl = (by_ - ay_) / (bx_ - ax_)
    pts = [(ax_ - d_, ay_ - sl * d_) for d_ in (3.0, 1.0)] + pts   # e poi prosegue dritta lungo la tangente
    Q = [P(*p) for p in pts]
    lw = N * k * 0.018
    dense = []                                                   # punti fitti: tratto morbido fatto di cerchi
    for (ax, ay), (bx, by) in zip(Q, Q[1:]):
        n = max(1, int(math.hypot(bx - ax, by - ay) / 2))
        dense += [(ax + (bx - ax) * i / n, ay + (by - ay) * i / n) for i in range(n)]
    dense.append(Q[-1])
    def stroke(dr, w, col):
        for q in dense: dr.ellipse([q[0] - w / 2, q[1] - w / 2, q[0] + w / 2, q[1] + w / 2], fill=col)
    halo = Image.new('RGBA', (N, N), (0, 0, 0, 0)); stroke(ImageDraw.Draw(halo), lw * 2.6, (255, 60, 200, 130))
    img.alpha_composite(halo.filter(ImageFilter.GaussianBlur(N * k * 0.013)))
    d = ImageDraw.Draw(img)
    stroke(d, lw * 1.5, (255, 255, 255, 255)); stroke(d, lw, (222, 22, 150, 255))
    q = P(*T)
    r = lw * 1.3; d.ellipse([q[0] - r, q[1] - r, q[0] + r, q[1] + r], fill=(255, 255, 255, 255))
    r = lw * 0.68; d.ellipse([q[0] - r, q[1] - r, q[0] + r, q[1] + r], fill=(222, 22, 150, 255))
    # aereo (disegno fornito dall'autore, sfondo tolto), con ombra morbida per staccarlo dal cielo
    x0, y0 = P(L, top); x1, y1 = P(L + W, top + h)
    pw, ph = int(round(x1 - x0)), int(round(y1 - y0))
    pl = AEREO.resize((pw, ph), Image.LANCZOS)
    sh = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    blk = Image.new('RGBA', pl.size, (6, 12, 30, 0)); blk.putalpha(pl.getchannel('A').point(lambda v: v * 0.45))
    sh.paste(blk, (int(x0 + N * k * 0.006), int(y0 + N * k * 0.014)), blk)
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(N * k * 0.008)))
    img.alpha_composite(pl, (int(round(x0)), int(round(y0))))

def rounded(img, rad):
    m = Image.new('L', img.size, 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radius=rad, fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0)); out.paste(img, (0, 0), m); return out

def circle(img):
    m = Image.new('L', img.size, 0); ImageDraw.Draw(m).ellipse([0, 0, img.size[0] - 1, img.size[1] - 1], fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0)); out.paste(img, (0, 0), m); return out

N = 2048
full = scene(N, k=1.0)
full.save('scene.png')
rounded(full, int(N * 0.2)).resize((512, 512), Image.LANCZOS).save('icona-512.png')

import os, sys
R = sys.argv[1] if len(sys.argv) > 1 else None
if R:
    sizes = {'mdpi': (48, 108), 'hdpi': (72, 162), 'xhdpi': (96, 216), 'xxhdpi': (144, 324), 'xxxhdpi': (192, 432)}
    bg = scene(1296, k=0.66)            # icona adattiva: soggetto nel 66 % centrale (zona sicura)
    for dpi, (s1, s2) in sizes.items():
        rounded(full, int(N * 0.2)).resize((s1, s1), Image.LANCZOS).save(f'{R}/mipmap-{dpi}/ic_launcher.png')
        circle(full).resize((s1, s1), Image.LANCZOS).save(f'{R}/mipmap-{dpi}/ic_launcher_round.png')
        bg.resize((s2, s2), Image.LANCZOS).save(f'{R}/mipmap-{dpi}/ic_launcher_background.png')
        Image.new('RGBA', (s2, s2), (0, 0, 0, 0)).save(f'{R}/mipmap-{dpi}/ic_launcher_foreground.png')
    bg.resize((432, 432), Image.LANCZOS).save('adattiva.png')
    # immagini di avvio: scena, nome e firma piccola
    from PIL import ImageFont
    def font(sz, bold=True):
        for f in (['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'] if bold else ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']):
            if os.path.exists(f): return ImageFont.truetype(f, sz)
        return ImageFont.load_default()
    import glob
    for f in glob.glob(f'{R}/drawable*/splash.png'):
        w, h = Image.open(f).size; m = max(w, h)
        sc = scene(m, k=min(w, h) / m * 0.9).crop(((m - w) // 2, (m - h) // 2, (m - w) // 2 + w, (m - h) // 2 + h))
        dd = ImageDraw.Draw(sc); t1 = font(max(12, int(min(w, h) * 0.075))); t2 = font(max(8, int(min(w, h) * 0.032)), bold=False)
        title = 'AerIA VFR'; tw = dd.textlength(title, font=t1)
        dd.text(((w - tw) / 2, h * 0.08), title, font=t1, fill=(255, 255, 255, 255))
        by = 'by fringuello79'; bw = dd.textlength(by, font=t2)
        dd.text(((w - bw) / 2, h - h * 0.06 - t2.size), by, font=t2, fill=(200, 214, 230, 255))
        sc.convert('RGB').save(f)
