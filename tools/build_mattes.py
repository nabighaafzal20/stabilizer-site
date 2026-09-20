#!/usr/bin/env python3
"""
Builds one grayscale+alpha PNG matte per frame (background = transparent).

The original JPG frames are NEVER modified. At runtime the site draws the
original JPG and then applies the matte with `destination-in`, so the
converter floats over the dark page while every pixel of colour still comes
straight from the supplied frames. Delete the /assets/mattes folder (or set
`useMatte:false` in landing/config.js) to display the raw frames instead.
"""
import sys, glob, os, re
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from concurrent.futures import ProcessPoolExecutor

def natural_key(p):
    return [int(t) if t.isdigit() else t for t in re.split(r'(\d+)', os.path.basename(p))]

def matte(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    lum = a.mean(2)
    sat = a.max(2) - a.min(2)
    grad = ndi.gaussian_gradient_magnitude(lum, 1.2)
    # light neutral pixels (background, bright metal) + smooth mid-grey areas (soft drop-shadow)
    cand = (sat < 18) & ((lum > 168) | ((lum > 95) & (grad < 2.2)))
    lab, n = ndi.label(cand)
    H, W = cand.shape
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, border[border > 0])
    # enclosed but clearly-background pockets (toroid hole, tab holes, gaps between parts)
    idx = np.arange(1, n + 1)
    area = ndi.sum(cand, lab, idx)
    mean = ndi.mean(lum, lab, idx)
    std = ndi.standard_deviation(lum, lab, idx)
    keep = (area > 40) & (mean > 205) & (std < 7)
    enclosed = np.isin(lab, idx[keep])
    bg |= enclosed
    fg = ~bg
    # drop specks of foreground that are tiny + light (JPEG noise inside the background)
    fg = ndi.binary_opening(fg, structure=np.ones((2, 2)))
    # remove light, neutral, tiny leftovers (shadow crumbs / JPEG noise)
    l2, n2 = ndi.label(fg)
    if n2:
        i2 = np.arange(1, n2 + 1)
        a2 = ndi.sum(fg, l2, i2)
        m2 = ndi.mean(lum, l2, i2)
        s2 = ndi.mean(sat, l2, i2)
        fg &= ~np.isin(l2, i2[(a2 < 220) & (m2 > 135) & (s2 < 26)])
    # trim the bright anti-aliasing fringe, then feather
    fg = ndi.binary_erosion(fg, structure=np.ones((3, 3)), iterations=1)
    al = ndi.gaussian_filter(fg.astype(np.float32), 0.8)
    al = np.clip((al - 0.15) / 0.7, 0, 1)
    return (al * 255 + 0.5).astype(np.uint8)

def work(args):
    src, dst = args
    m = matte(src)
    im = Image.merge('LA', (Image.fromarray(np.full_like(m, 255)), Image.fromarray(m)))
    im.save(dst, optimize=True)
    return dst

if __name__ == '__main__':
    src_dir, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    files = sorted(glob.glob(os.path.join(src_dir, '*.jpg')), key=natural_key)
    jobs = [(f, os.path.join(out_dir, os.path.splitext(os.path.basename(f))[0] + '.png')) for f in files]
    with ProcessPoolExecutor() as ex:
        for i, d in enumerate(ex.map(work, jobs, chunksize=4)):
            if i % 40 == 0: print(i, d, flush=True)
    print('done', len(jobs))
