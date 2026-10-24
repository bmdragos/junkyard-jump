"""Rank Classic-vs-Modern build captures by differing pixels (after compare_build.py)."""
import json, base64, io, sys
from PIL import Image, ImageChops
load = lambda p: (lambda d: json.loads(d) if isinstance(d, str) else d)(json.load(open(p)))
c, m = load(sys.argv[1]), load(sys.argv[2])
im = lambda u: Image.open(io.BytesIO(base64.b64decode(u.split(',', 1)[1]))).convert('RGB').resize((425, 290), Image.LANCZOS)
rows = []
for k in c['shots']:
    if k in m['shots']:
        d = ImageChops.difference(im(c['shots'][k]), im(m['shots'][k])).convert('L').point(lambda v: 255 if v > 60 else 0)
        rows.append((sum(1 for v in d.getdata() if v), k))
for r in sorted(rows, reverse=True): print(*r)
