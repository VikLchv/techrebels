"""Swap a flat photo background for a brand color, locally (no external service).

The background is the region connected to the image border whose color is close to
the sampled border color. Edges get a soft alpha so hair stays natural, and the new
color keeps the original light falloff.

Usage: python scripts/recolor-bg.py in.png out.webp "#3DDB9A" [tolerance]
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

src, dst, hexcol = sys.argv[1], sys.argv[2], sys.argv[3]
tol = float(sys.argv[4]) if len(sys.argv) > 4 else 35.0  # minimum saturation, in %

im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
h, w, _ = im.shape

# sample the background along the top and side borders (the bottom is usually clothing)
border = np.concatenate([im[:6, :, :].reshape(-1, 3), im[:, :6, :].reshape(-1, 3), im[:, -6:, :].reshape(-1, 3)])
bg = np.median(border, axis=0)

# hue/saturation test: the backdrop is a saturated magenta-pink, skin, hair and fabric are not
rgb = im / 255.0
mx, mn = rgb.max(axis=2), rgb.min(axis=2)
sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
d = np.maximum(mx - mn, 1e-6)
hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
magenta = (hue >= 275) | (hue <= 5)
close = magenta & (sat > tol / 100) & (mx > 0.35)
dist = np.clip((sat - tol / 100) * 400, 0, None)  # used for the soft edge below

# keep only the part connected to the top/left/right border
labels, _ = ndimage.label(close)
edge_labels = set(np.unique(labels[:3, :])) | set(np.unique(labels[:, :3])) | set(np.unique(labels[:, -3:]))
edge_labels.discard(0)
mask = np.isin(labels, list(edge_labels))

# soft edge: alpha falls off with color distance near the boundary
soft = np.clip(dist / 60, 0, 1) * magenta
grown = ndimage.binary_dilation(mask, iterations=3)
alpha = np.where(mask, 1.0, np.where(grown, soft, 0.0))
alpha = ndimage.gaussian_filter(alpha, 1.0)

# new color, modulated by the original brightness so light gradients survive
target = np.array([int(hexcol[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32)
lum = im.mean(axis=2, keepdims=True)
shade = lum / max(float(bg.mean()), 1.0)
newbg = np.clip(target * (0.82 + 0.18 * shade), 0, 255)

out = im * (1 - alpha[..., None]) + newbg * alpha[..., None]
Image.fromarray(out.astype(np.uint8)).save(dst, 'WEBP', quality=86, method=6)
print(f'bg {bg.round()}  background {mask.mean():.0%} of the image')
