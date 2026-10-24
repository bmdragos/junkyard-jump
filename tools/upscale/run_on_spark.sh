#!/bin/sh
# Regenerate assets/modern/hd/ (Modern mode's 4x art) on the DGX Spark.
# Real-ESRGAN x4plus_anime_6B (cartoon-tuned) run by upscale.py in an NGC PyTorch container;
# nothing is pip-installed into it (NGC's torch must not be replaced).
set -e
REPO=$(cd "$(dirname "$0")/../.." && pwd)
W=/tmp/jj-upscale
mkdir -p "$W/in"
cp "$REPO"/assets/classic/bitmaps/*.png "$W/in/"
cp "$REPO/tools/upscale/upscale.py" "$W/"
[ -f "$W/RealESRGAN_x4plus_anime_6B.pth" ] || curl -sL -o "$W/RealESRGAN_x4plus_anime_6B.pth" \
  https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth
ssh spark 'mkdir -p ~/jj-upscale'
rsync -a "$W/" spark:jj-upscale/
ssh spark 'docker start jj-upscale >/dev/null 2>&1 || docker run -d --name jj-upscale --runtime=nvidia --gpus=all \
  -v ~/jj-upscale:/workspace -w /workspace --ipc=host --ulimit memlock=-1 --ulimit stack=67108864 \
  nvcr.io/nvidia/pytorch:25.12-py3 tail -f /dev/null >/dev/null'
ssh spark 'docker exec -w /workspace jj-upscale python upscale.py in out_anime RealESRGAN_x4plus_anime_6B.pth 6 | tail -1'
rsync -a spark:jj-upscale/out_anime/ "$W/out_anime/"
ssh spark 'docker stop jj-upscale >/dev/null'
python3 - "$W/out_anime" "$REPO/assets/modern/hd" <<'PY'
import os, sys
from PIL import Image
src, dst = sys.argv[1:3]
os.makedirs(dst, exist_ok=True)
for f in sorted(os.listdir(src)):
    if f.endswith('.png'):
        Image.open(os.path.join(src, f)).save(os.path.join(dst, f[:-4] + '.webp'), 'WEBP', quality=90, method=6)
print('wrote', dst)
PY
