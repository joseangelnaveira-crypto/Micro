import sys, pymupdf, numpy as np
from rapidocr_onnxruntime import RapidOCR
src, out = sys.argv[1], sys.argv[2]
ocr = RapidOCR()
d = pymupdf.open(src)
pages = []
for pi, p in enumerate(d):
    pm = p.get_pixmap(matrix=pymupdf.Matrix(2.2, 2.2), alpha=False)
    img = np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.width, pm.n)
    res, _ = ocr(img)
    items = []
    for box, txt, conf in (res or []):
        ys = [pt[1] for pt in box]; xs = [pt[0] for pt in box]
        items.append((sum(ys)/4, min(xs), max(ys)-min(ys), txt))
    items.sort()
    lines, cur, cy = [], [], None
    for y, x, h, t in items:
        if cy is None or abs(y - cy) > max(h, 12) * 0.6:
            if cur: lines.append(cur)
            cur, cy = [(x, t)], y
        else:
            cur.append((x, t))
    if cur: lines.append(cur)
    # sangría -> espacios para distinguir opciones
    txt = []
    for l in lines:
        l.sort()
        x0 = l[0][0]
        txt.append(' ' * int(x0 // 40) + ' '.join(t for _, t in l))
    pages.append('\n'.join(txt))
    print('page', pi + 1, len(items), file=sys.stderr)
open(out, 'w', encoding='utf-8').write('\f'.join(pages))
