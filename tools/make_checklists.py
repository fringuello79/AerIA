# AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
# Trascrive le liste di controllo dell'Aeroclub dei Marsi dai file Word originali (docs/checklist/) nel file
# web-prototype/src/checklists-acm.js, senza ricopiarle a mano: testo, ordine e colori delle righe come nell'originale.
# Uso: python3 tools/make_checklists.py            (rigenera il file)
#      python3 tools/make_checklists.py --controlla (verifica che il file dell'app corrisponda agli originali)
# Richiede python-docx (pip install python-docx).
import json, re, sys, hashlib, pathlib
import docx
from docx.oxml.ns import qn

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'docs' / 'checklist'
OUT = ROOT / 'web-prototype' / 'src' / 'checklists-acm.js'

# Colori delle righe nei due documenti → codice: r rosso, y giallo, g verde, b azzurro (sottotitolo). Il significato dei
# colori lo decide l'aeroclub: il programma li riproduce e basta.
COLORS = {'F8CBAD': 'r', 'FF9C85': 'r', 'FFFF00': 'y', 'C6E0B4': 'g', 'D0FCB2': 'g', 'BDD7EE': 'b', 'D9E2F3': 'b'}
SECTION = re.compile(r'^\s*\d\)\s')


def cells_of(tr):
    """Celle di una riga con colonna iniziale (tiene conto delle celle unite), testo e colore."""
    col, out = 0, []
    for tc in tr.tc_lst:
        pr = tc.tcPr
        span = pr.find(qn('w:gridSpan')) if pr is not None else None
        n = int(span.get(qn('w:val'))) if span is not None else 1
        shd = pr.find(qn('w:shd')) if pr is not None else None
        fill = (shd.get(qn('w:fill')) or '').upper() if shd is not None else ''
        paras = [''.join(t.text or '' for t in p.iter(qn('w:t'))).strip() for p in tc.iter(qn('w:p'))]
        out.append({'col': col, 'n': n, 'text': ' '.join(p for p in paras if p), 'paras': [p for p in paras if p],
                    'color': COLORS.get(fill), 'tc': tc})
        col += n
    return out


def norm(s):
    return re.sub(r'\s+', ' ', s.replace('’', "'")).strip()


class Builder:
    def __init__(self):
        self.lists, self.cur = [], None

    def row(self, label, value='', color=None, single_paras=None):
        label, value = norm(label), norm(value)
        if not label and not value:
            return
        if SECTION.match(label) and not value:
            self.cur = {'title': label, 'items': []}
            self.lists.append(self.cur)
            return
        if self.cur is None:
            return
        if label.upper().startswith("VIA DALL'ELICA"):
            rest = norm(' '.join(single_paras[1:])) if single_paras else ''
            self.cur['items'].append({'t': "VIA DALL'ELICA!", 'note': rest, 'alert': True})
            return
        if not value:
            self.cur['items'].append({'h': label, **({'c': color} if color else {})})
            return
        self.cur['items'].append({'t': label, 'v': value, **({'c': color} if color else {})})


def golf(path):
    d = docx.Document(path)
    b, extra, ref = Builder(), [], []

    def nested(tbl):
        for tr in tbl.tr_lst:
            cs = [c for c in cells_of(tr)]
            inner = [t for c in cs for t in c['tc'].iter(qn('w:tbl')) if t is not tbl]
            if inner and len(cs) <= 2 and any(c['tc'].find(qn('w:tbl')) is not None for c in cs):
                for c in cs:
                    for t in c['tc'].findall(qn('w:tbl')):
                        nested(t)
                continue
            if len(cs) == 1:
                b.row(cs[0]['text'], '', cs[0]['color'], cs[0]['paras'])
            else:
                b.row(cs[0]['text'], ' '.join(c['text'] for c in cs[1:]), cs[0]['color'])

    tables = d.tables
    for t in tables[:2]:
        nested(t._tbl)
    # riquadro finale e tabella del motore e delle velocità
    for t in tables[2:]:
        rows = [cells_of(tr) for tr in t._tbl.tr_lst]
        if len(rows) == 1:
            extra.append([norm(p) for p in rows[0][0]['paras']])
        else:
            cols = [[], []]
            for cs in rows[1:]:
                txt = [norm(c['text']) for c in cs]
                for k in range(0, len(txt) - 1, 2):
                    if txt[k] and txt[k + 1]:
                        cols[min(k // 2, 1)].append([txt[k], txt[k + 1]])
            ref = cols[0] + cols[1]
            ref_title = norm(' '.join(c['text'] for c in rows[0]))
    head = [norm(p.text) for p in d.paragraphs if p.text.strip()]
    return {'title': head[0], 'rev': head[1], 'lists': b.lists, 'footer': extra, 'refTitle': ref_title, 'ref': ref}


def sierra(path):
    d = docx.Document(path)
    head = [norm(p.text) for p in d.paragraphs if p.text.strip()]
    textboxes = [norm(''.join(t.text or '' for t in tb.iter(qn('w:t')))) for tb in d.element.body.iter(qn('w:txbxContent'))]
    assert any("VIA DALL'ELICA" in t for t in textboxes), 'riquadro «VIA DALL’ELICA!» non trovato'
    b, footer, ref = Builder(), [], []
    for t in d.tables[:2]:
        left, right = [], []
        for tr in t._tbl.tr_lst:
            for c in cells_of(tr):
                (left if c['col'] < 2 else right if c['col'] >= 3 else []).append((tr, c))
        for side in (left, right):
            rows = {}
            for tr, c in side:
                rows.setdefault(id(tr), []).append(c)
            for cs in rows.values():
                label = norm(cs[0]['text'])
                value = norm(' '.join(c['text'] for c in cs[1:]))
                if label.startswith('Starter'):            # riquadro «VIA DALL'ELICA!» sopra la riga dello starter
                    b.row("VIA DALL'ELICA!", '', None, ["VIA DALL'ELICA!", label]); continue
                if label.upper().startswith('CLOSE THE FLIGHT PLAN') or label.upper().startswith('A.R.O.'):
                    footer.append(label); continue
                b.row(label, value, cs[0]['color'])
    t = d.tables[2]
    rows = [cells_of(tr) for tr in t._tbl.tr_lst]
    cols = [[], []]
    for cs in rows[1:]:
        txt = [norm(c['text']) for c in cs if c['col'] != 2]
        for k in range(0, len(txt) - 1, 2):
            if txt[k] and txt[k + 1]:
                cols[min(k // 2, 1)].append([txt[k], txt[k + 1]])
    ref = cols[0] + cols[1]
    rev = re.sub(r'^PAGE \d+\s*-\s*', '', head[1])
    return {'title': head[0], 'rev': rev, 'lists': b.lists, 'footer': [footer], 'refTitle': norm(rows[0][0]['text']), 'ref': ref}


def build():
    docs = []
    for ac, fn, fun, lang in (('acm-golf', 'Checklist_Tecnam_P96_Golf_Rev3_23_08_2026.docx', golf, 'it'),
                              ('acm-sierra', 'Checklist_Tecnam_P2002_Sierra_IA952_EN_Rev1.docx', sierra, 'en')):
        p = SRC / fn
        doc = fun(p)
        doc.update({'aircraft': ac, 'file': fn, 'lang': lang, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()})
        docs.append(doc)
    return docs


HEADER = """// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Liste di controllo dell'Aeroclub dei Marsi, trascritte in automatico dai file Word originali (docs/checklist/) da
// tools/make_checklists.py: NON modificare a mano. Testo, ordine e colori delle righe sono quelli dell'originale;
// i valori sono dell'aeroclub, non del programma. Per una nuova revisione: sostituire il file Word e rigenerare.
// c: colore della riga nell'originale (r rosso, y giallo, g verde, b azzurro); h: sottotitolo; alert: riquadro.
"""


def render(docs):
    return HEADER + 'export const ACM_CHECKLISTS = ' + json.dumps(docs, ensure_ascii=False, indent=1) + ';\n'


if __name__ == '__main__':
    text = render(build())
    if '--controlla' in sys.argv:
        ok = OUT.exists() and OUT.read_text(encoding='utf-8') == text
        print('liste di controllo: corrispondono agli originali' if ok else 'liste di controllo: DIVERSE dagli originali, rigenerare')
        sys.exit(0 if ok else 1)
    OUT.write_text(text, encoding='utf-8')
    for d in build():
        print(d['aircraft'], d['rev'], [f"{l['title']}: {len(l['items'])}" for l in d['lists']], 'rif.', len(d['ref']))
