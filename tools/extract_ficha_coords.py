"""Coordenadas de la Ficha de datos generales (19 preguntas) en la plantilla oficial.
Se anexa a server/assets/pdf-templates/coords.json bajo la clave «ficha». Unidades: puntos PDF, y medido desde arriba.
Tipos de marca: x (X en casilla), circle (círculo alrededor del texto), text (texto dentro de un recuadro), num (número centrado en celda).
"""
import json, re
import pdfplumber

OPTIONS = {
    2: ['Masculino', 'Femenino'],
    4: ['Soltero (a)', 'Casado (a)', 'Unión libre', 'Separado (a)', 'Divorciado (a)', 'Viudo (a)', 'Sacerdote / Monja'],
    5: ['Ninguno', 'Primaria incompleta', 'Primaria completa', 'Bachillerato incompleto', 'Bachillerato completo', 'Técnico / tecnológico incompleto', 'Técnico / tecnológico completo', 'Profesional incompleto', 'Profesional completo', 'Carrera militar / policía', 'Post-grado incompleto', 'Post-grado completo'],
    9: ['Propia', 'En arriendo', 'Familiar'],
    14: ['Jefatura - tiene personal a cargo', 'Profesional, analista, técnico, tecnólogo', 'Auxiliar, asistente administrativo, asistente técnico', 'Operario, operador, ayudante, servicios generales'],
    17: ['Temporal de menos de 1 año', 'Temporal de 1 año o más', 'Término indefinido', 'Cooperado (cooperativa)', 'Prestación de servicios', 'No sé'],
    19: ['Fijo (diario, semanal, quincenal o mensual)', 'Una parte fija y otra variable', 'Todo variable (a destajo, por producción, por comisión)'],
}
ESTRATO = ['1', '2', '3', '4', '5', '6', 'Finca', 'No sé']
r1 = lambda v: round(v, 1)

with pdfplumber.open('server/assets/pdf-templates/ficha.pdf') as pdf:
    pages = pdf.pages
    # Posición de cada pregunta: (página, top, bottom)
    qpos = {}
    for pi, p in enumerate(pages, 1):
        for w in p.extract_words():
            m = re.fullmatch(r'(\d{1,2})\.', w['text'])
            if m and 60 < w['x0'] < 100 and int(m.group(1)) not in qpos and 1 <= int(m.group(1)) <= 19:
                qpos[int(m.group(1))] = (pi, w['top'], w['bottom'])
    assert sorted(qpos) == list(range(1, 20)), sorted(set(range(1, 20)) - set(qpos))

    def region(n):
        pi, top, _ = qpos[n]
        nxt = qpos.get(n + 1)
        bottom = nxt[1] - 2 if nxt and nxt[0] == pi else pages[pi - 1].height
        return pi, top, bottom

    def vlines(p, y0, y1):
        return sorted({r1((r['x0'] + r['x1']) / 2) for r in p.rects if r['width'] < 1.3 and r['height'] > 6 and r['top'] <= y1 and r['bottom'] >= y0})

    def hlines(p, top, bottom, minw=40):
        """Une los segmentos horizontales contiguos (los bordes vienen partidos en trozos de ~17 pt)."""
        segs = sorted([r for r in p.rects if r['height'] < 1.3 and r['width'] >= 0.4], key=lambda r: (round(r['top'], 1), r['x0']))
        lines = []
        for r in segs:
            if lines and abs(lines[-1]['top'] - r['top']) < 0.4 and r['x0'] - lines[-1]['x1'] < 1.0:
                lines[-1]['x1'] = max(lines[-1]['x1'], r['x1'])
            else:
                lines.append({'top': r['top'], 'x0': r['x0'], 'x1': r['x1']})
        return sorted([l for l in lines if l['x1'] - l['x0'] > minw and top <= l['top'] <= bottom], key=lambda l: l['top'])

    def find(p, text, y0, y1, xmin=0):
        res = [m for m in p.search(re.escape(text).replace(r'\ ', r'\s*')) if y0 <= m['top'] <= y1 and m['x0'] >= xmin]
        return res[0] if res else None

    out = {}
    # ---- Opciones con casilla a la derecha de la fila
    for n, labels in OPTIONS.items():
        pi, y0, y1 = region(n)
        p = pages[pi - 1]
        items = []
        for lab in labels:
            two = lab.startswith('Todo variable')  # el texto ocupa dos renglones: la celda abarca ambos
            m = find(p, 'Todo variable (a destajo' if two else lab, y0 + 8, y1, 70)
            assert m, (n, lab)
            yc = (m['top'] + m['bottom']) / 2
            vs = [x for x in vlines(p, yc - 1, yc + 1) if x > m['x0'] + 5]
            # la casilla es la última columna: entre las dos últimas verticales de la fila
            cand = sorted(vs)[-2:]
            assert len(cand) == 2 and 12 < cand[1] - cand[0] < 70, (n, lab, cand)
            items.append({'kind': 'x', 'x': r1((cand[0] + cand[1]) / 2), 'y': r1(yc + (5 if two else 0))})
        out[str(n)] = {'page': pi, 'options': items}

    # ---- Estrato (celdas con el propio número o texto): círculo alrededor
    pi, y0, y1 = region(8)
    p = pages[pi - 1]
    est = []
    words = [w for w in p.extract_words() if y0 + 8 <= w['top'] <= y1]
    for lab in ESTRATO:
        if lab == 'No sé':
            a = next(w for w in words if w['text'] == 'No'); b = next(w for w in words if w['text'] == 'sé')
            est.append({'kind': 'circle', 'x': r1((a['x0'] + b['x1']) / 2), 'y': r1((a['top'] + a['bottom']) / 2), 'w': r1(b['x1'] - a['x0'] + 14), 'h': 13})
        else:
            w = next(w for w in words if w['text'] == lab and w['x0'] < 330)
            est.append({'kind': 'circle', 'x': r1((w['x0'] + w['x1']) / 2), 'y': r1((w['top'] + w['bottom']) / 2), 'w': 24, 'h': 13})
    out['8'] = {'page': pi, 'options': est}

    # ---- Recuadros de texto bajo la pregunta: 1, 3, 6, 13, 16
    for n in (1, 3, 6, 13, 16):
        pi, y0, y1 = region(n)
        p = pages[pi - 1]
        hs = hlines(p, y0 + 8, y1, 60)
        assert len(hs) >= 2, n
        top, bot = hs[0], hs[1]
        out[str(n)] = {'page': pi, 'box': {'x0': r1(top['x0']), 'x1': r1(top['x1']), 'top': r1(top['top']), 'bottom': r1(bot['top'])}}

    # ---- Lugares (7 y 11): fila Ciudad / municipio y fila Departamento, celda derecha
    for n in (7, 11):
        pi, y0, y1 = region(n)
        p = pages[pi - 1]
        rows = {}
        for key, lab in (('city', 'Ciudad / municipio'), ('department', 'Departamento')):
            m = find(p, lab, y0 + 8, y1, 70)
            if m is None and key == 'city':  # texto fragmentado en la plantilla: la fila de «Ciudad» está 15,4 pt sobre «Departamento»
                d = find(p, 'Departamento', y0 + 8, y1, 70)
                m = {'top': d['top'] - 15.4, 'bottom': d['bottom'] - 15.4, 'x0': d['x0'], 'x1': d['x1']}
            yc = (m['top'] + m['bottom']) / 2
            vs = [x for x in vlines(p, yc - 1, yc + 1) if x > m['x1']]
            rows[key] = {'x': r1(min(vs) + 4), 'y': r1(m['bottom'] - 2.5), 'maxW': r1((max(vs) - min(vs)) - 8) if len(vs) > 1 else 200}
        out[str(n)] = {'page': pi, 'cells': rows}

    # ---- Años (12 y 15): casilla para «menos de un año» y celda para el número
    for n in (12, 15):
        pi, y0, y1 = region(n)
        p = pages[pi - 1]
        res = {}
        for key, lab in (('less', 'Si lleva menos de un año marque esta opción'), ('more', 'Si lleva más de un año, anote cuántos años')):
            m = find(p, lab, y0 + 8, y1, 70)
            if m is None and key == 'less':  # texto fragmentado: la primera fila está 15,4 pt sobre la segunda
                d = find(p, 'Si lleva más de un año, anote cuántos años', y0 + 8, y1, 70)
                m = {'top': d['top'] - 15.4, 'bottom': d['bottom'] - 15.4, 'x0': d['x0'], 'x1': d['x1']}
            yc = (m['top'] + m['bottom']) / 2
            cand = sorted(x for x in vlines(p, yc - 1, yc + 1) if x > m['x0'] + 5)[-2:]
            res[key] = {'x': r1((cand[0] + cand[1]) / 2), 'y': r1(yc)}
        out[str(n)] = {'page': pi, **res}

    # ---- 10: número de personas (celda a la derecha del enunciado)
    pi, y0, y1 = region(10)
    p = pages[pi - 1]
    m1 = find(p, 'personas que dependen', y0, y1, 70)
    m2 = find(p, '(aunque vivan en otro lugar)', y0, y1, 70)
    top10 = m1['top'] if m1 else qpos[10][1]  # primer renglón fragmentado en la plantilla
    yc = (top10 + m2['bottom']) / 2
    cand = sorted(x for x in vlines(p, yc - 1, yc + 1) if x > 95)[-2:]
    out['10'] = {'page': pi, 'num': {'x': r1((cand[0] + cand[1]) / 2), 'y': r1(yc)}}

    # ---- 18: horas por día (sobre la línea)
    pi, y0, y1 = region(18)
    p = pages[pi - 1]
    m = find(p, 'horas de trabajo al día', y0, y1, 70)
    if m is None:  # texto fragmentado: se usa la palabra «horas» (o su inicio)
        w = next(w for w in p.extract_words() if y0 <= w['top'] <= y1 and w['x0'] > 300 and w['text'].startswith(('hor', 'ho')))
        m = {'x0': w['x0'], 'bottom': w['bottom']}
    out['18'] = {'page': pi, 'num': {'x': r1(m['x0'] - 44), 'y': r1(m['bottom'] - 3)}}

    # ---- Encabezado de la ficha (fecha dd/mm/aaaa e ID)
    # Los textos «dd», «mm», «aaaa» y «(ID)» salen fragmentados en esta plantilla; se usa la geometría de los recuadros
    # (medida sobre las líneas del PDF): fecha en tres celdas y un recuadro grande para el ID.
    header = {'page': 1, 'dateY': 169.0, 'ddX': 438.7, 'mmX': 474.0, 'aaaaX': 518.2, 'idX': 426.0, 'idY': 208.0}

coords = json.load(open('server/assets/pdf-templates/coords.json', encoding='utf-8'))
coords['ficha'] = out
coords['header']['ficha'] = header
json.dump(coords, open('server/assets/pdf-templates/coords.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print('ficha:', sorted(out, key=int), header)
