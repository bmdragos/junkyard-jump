"""Side-by-side sheets of Classic vs Modern build captures (tools/capture_build.js output).
python3 tools/compare_build.py classic.json modern.json out_dir"""
import json, sys, os, base64, io
from PIL import Image

def load(p):  # evaluate_script saves the returned JSON string as a JSON string literal
    d = json.load(open(p))
    return json.loads(d) if isinstance(d, str) else d

def img(u):
    return Image.open(io.BytesIO(base64.b64decode(u.split(',', 1)[1]))).convert('RGB').resize((425, 290), Image.LANCZOS)

c, m = load(sys.argv[1]), load(sys.argv[2])
out = sys.argv[3]; os.makedirs(out, exist_ok=True)
print('classic picks', c['picks'], 'modern picks', m['picks'])
for k in c['shots']:
    if k not in m['shots']: print('missing in modern:', k); continue
    s = Image.new('RGB', (860, 290)); s.paste(img(c['shots'][k]), (0, 0)); s.paste(img(m['shots'][k]), (435, 0))
    s.save(os.path.join(out, k + '.png'))
print(sorted(c['shots']))
