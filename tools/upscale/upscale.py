"""4x upscale of the original bitmaps for Modern mode, with alpha.

Runs in an NGC PyTorch container (no extra packages: the RRDBNet below is Real-ESRGAN's network,
written out here so nothing has to be pip-installed next to NGC's torch).
  python upscale.py <in_dir> <out_dir> <weights.pth> [num_block]
in_dir holds assets/classic/bitmaps/<member>.png (opaque RGB, white = transparent under ink 36).

Per bitmap:
  1. mask: every non-white pixel is solid (ink 36 drops white), except the copy-ink members,
     which stay opaque;
  2. bleed edge colours into the transparent area so the upscaler doesn't pull white into outlines;
  3. Real-ESRGAN x4 on the colours, and on the mask for anti-aliased alpha edges;
  4. write <member>.png as RGBA at 4x.
"""
import sys, os
import numpy as np
import torch, torch.nn as nn, torch.nn.functional as F
from PIL import Image

OPAQUE = {1, 5, 28, 30, 43, 49, 52}   # drawn with copy ink in the Score

class RDB(nn.Module):
    def __init__(self, nf=64, gc=32):
        super().__init__()
        self.conv1 = nn.Conv2d(nf, gc, 3, 1, 1); self.conv2 = nn.Conv2d(nf + gc, gc, 3, 1, 1)
        self.conv3 = nn.Conv2d(nf + 2 * gc, gc, 3, 1, 1); self.conv4 = nn.Conv2d(nf + 3 * gc, gc, 3, 1, 1)
        self.conv5 = nn.Conv2d(nf + 4 * gc, nf, 3, 1, 1); self.lrelu = nn.LeakyReLU(0.2, True)
    def forward(self, x):
        x1 = self.lrelu(self.conv1(x)); x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1))); x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        return self.conv5(torch.cat((x, x1, x2, x3, x4), 1)) * 0.2 + x

class RRDB(nn.Module):
    def __init__(self, nf, gc=32):
        super().__init__()
        self.rdb1, self.rdb2, self.rdb3 = RDB(nf, gc), RDB(nf, gc), RDB(nf, gc)
    def forward(self, x):
        return self.rdb3(self.rdb2(self.rdb1(x))) * 0.2 + x

class RRDBNet(nn.Module):
    def __init__(self, num_block, nf=64):
        super().__init__()
        self.conv_first = nn.Conv2d(3, nf, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(nf) for _ in range(num_block)])
        self.conv_body = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(nf, nf, 3, 1, 1); self.conv_up2 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_hr = nn.Conv2d(nf, nf, 3, 1, 1); self.conv_last = nn.Conv2d(nf, 3, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, True)
    def forward(self, x):
        feat = self.conv_first(x)
        feat = feat + self.conv_body(self.body(feat))
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode='nearest')))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode='nearest')))
        return self.conv_last(self.lrelu(self.conv_hr(feat)))

def bleed(rgb, mask, iters=12):
    """Fill transparent pixels with the average of solid neighbours, growing outward."""
    rgb = rgb.astype(np.float32).copy(); known = mask.copy()
    for _ in range(iters):
        acc = np.zeros_like(rgb); cnt = np.zeros(mask.shape, np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0: continue
                k = np.roll(np.roll(known, dy, 0), dx, 1)
                c = np.roll(np.roll(rgb, dy, 0), dx, 1)
                acc += c * k[..., None]; cnt += k
        grow = (~known) & (cnt > 0)
        rgb[grow] = acc[grow] / cnt[grow][:, None]
        known = known | grow
    return rgb

@torch.no_grad()
def run(model, img):  # img float32 HxWx3 in 0..255 -> 4x
    t = torch.from_numpy(img / 255.0).permute(2, 0, 1)[None].float().cuda()
    pad = 8   # reflect-pad so borders upscale cleanly
    t = F.pad(t, (pad, pad, pad, pad), mode='replicate')
    out = model(t).clamp(0, 1)[0, :, pad * 4:-pad * 4, pad * 4:-pad * 4]
    return (out.permute(1, 2, 0).cpu().numpy() * 255.0)

def main():
    src, dst, weights = sys.argv[1:4]
    nb = int(sys.argv[4]) if len(sys.argv) > 4 else 6
    os.makedirs(dst, exist_ok=True)
    model = RRDBNet(nb)
    sd = torch.load(weights, map_location='cpu')
    model.load_state_dict(sd.get('params_ema', sd.get('params', sd)), strict=True)
    model = model.cuda().eval()
    files = sorted(f for f in os.listdir(src) if f.endswith('.png'))
    for f in files:
        n = int(f[:-4])
        rgb = np.asarray(Image.open(os.path.join(src, f)).convert('RGB'))
        if n in OPAQUE:
            out = run(model, rgb.astype(np.float32))
            Image.fromarray(np.round(out).astype(np.uint8), 'RGB').save(os.path.join(dst, f))
        else:
            mask = ~np.all(rgb == 255, axis=2)
            col = run(model, bleed(rgb, mask))
            m = run(model, np.repeat(mask[..., None].astype(np.float32) * 255.0, 3, axis=2)).mean(axis=2)
            a = np.clip((m - 40.0) * (255.0 / 175.0), 0, 255)   # firm up the upscaled mask's ramp
            rgba = np.dstack([col, a])
            Image.fromarray(np.round(rgba).astype(np.uint8), 'RGBA').save(os.path.join(dst, f))
        print(f, rgb.shape[1], 'x', rgb.shape[0], flush=True)
    print('ALL_DONE', flush=True)

if __name__ == '__main__':
    main()
