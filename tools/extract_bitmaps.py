"""Decode every 16-bit BITD bitmap in junkyard.dir to assets/classic/bitmaps/<member>.png (opaque RGB).
Ink transparency is applied at runtime, as Director does."""
import sys, os, json, struct
sys.argv = ['x']; sys.path.insert(0, os.path.dirname(__file__))
from score_dump import cast, keys, raw_chunk
from PIL import Image

def unpack(b, need):
    out = bytearray(); i = 0
    while i < len(b) and len(out) < need:
        n = b[i]; i += 1
        if n < 0x80:
            out += b[i:i+n+1]; i += n+1
        else:
            out += bytes([b[i]]) * (257 - n); i += 1
    return bytes(out)

def decode(b, w, h, pitch):
    if len(b) == pitch * h:          # stored raw: big-endian RGB555 words
        rows = [b[y*pitch:(y+1)*pitch] for y in range(h)]
        px = [[(r[2*x] << 8) | r[2*x+1] for x in range(w)] for r in rows]
    else:                            # PackBits, each row split into hi-byte and lo-byte planes
        d = unpack(b, pitch * h)
        half = pitch // 2
        px = [[(d[y*pitch+x] << 8) | d[y*pitch+half+x] for x in range(w)] for y in range(h)]
    im = Image.new('RGB', (w, h))
    im.putdata([(((v >> 10) & 31) * 255 // 31, ((v >> 5) & 31) * 255 // 31, (v & 31) * 255 // 31) for row in px for v in row])
    return im

if __name__ == '__main__':
    cm = cast(); out = 'assets/classic/bitmaps'; os.makedirs(out, exist_ok=True)
    meta = {}
    for sid, mem, t in keys():
        if t != 'BITD' or mem not in cm: continue
        m = cm[mem]; l, tp, r, bt = m['rect']
        w, h = r - l, bt - tp
        pitch = int(m['spec'][:4], 16) & 0x7fff
        decode(raw_chunk(sid), w, h, pitch).save(f'{out}/{mem}.png')
        meta[mem] = dict(name=m['name'], w=w, h=h, regX=m['reg'][0], regY=m['reg'][1])
    json.dump(meta, open('assets/classic/bitmaps.json', 'w'), indent=1)
    print(len(meta), 'bitmaps')
