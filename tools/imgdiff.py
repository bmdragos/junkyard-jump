"""Pixel diff of two 425x290 captures: python3 tools/imgdiff.py a.png b.png [out.png]"""
import sys
from PIL import Image, ImageChops
a = Image.open(sys.argv[1]).convert('RGB'); b = Image.open(sys.argv[2]).convert('RGB')
d = ImageChops.difference(a, b).convert('L').point(lambda v: 255 if v > 40 else 0)
n = sum(1 for v in d.getdata() if v)
print('differing pixels:', n, 'bbox:', d.getbbox())
if len(sys.argv) > 3: d.save(sys.argv[3])
