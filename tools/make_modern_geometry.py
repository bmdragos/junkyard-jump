"""Collision geometry for Modern mode's continuous jump, measured from the original bitmaps.
Writes assets/modern/jump-geometry.json:
  ramp:    tow truck 'trucklt' (member 62); the plank's upper edge runs from (0, 59) to (118, 0)
  carrier: car carrier 'bigtruck' (member 63); top edge per column (the landing deck)
  pile:    'trashpile' (member 54); top and bottom edge per column
All coordinates are bitmap pixels from the top-left; non-white pixels are solid (ink 36 drops white)."""
import json
from PIL import Image

def columns(member):
    im = Image.open(f'assets/classic/bitmaps/{member}.png').convert('RGB')
    w, h = im.size
    top, bottom = [], []
    for x in range(w):
        ys = [y for y in range(h) if im.getpixel((x, y)) != (255, 255, 255)]
        top.append(min(ys) if ys else None)
        bottom.append(max(ys) if ys else None)
    return w, h, top, bottom

geo = {}
w, h, top, _ = columns(62)
geo['ramp'] = {'member': 62, 'w': w, 'h': h, 'plank': [0, 59, 118, 0], 'top': top}
w, h, top, _ = columns(63)
geo['carrier'] = {'member': 63, 'w': w, 'h': h, 'top': top}
w, h, top, bottom = columns(54)
geo['pile'] = {'member': 54, 'w': w, 'h': h, 'top': top, 'bottom': bottom}
json.dump(geo, open('assets/modern/jump-geometry.json', 'w'), separators=(',', ':'))
print({k: (v['w'], v['h']) for k, v in geo.items()})
