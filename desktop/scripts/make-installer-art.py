#!/usr/bin/env python3
"""
Regenerate the branded installer art from build/icon.png.

Outputs (into build/, all consumed by electron-builder at package time):
  icon.ico                 Windows app + installer/uninstaller icon (multi-size)
  installerSidebar.bmp     164x314 welcome/finish panel (NSIS)
  uninstallerSidebar.bmp   164x314 (same art)
  installerHeader.bmp      150x57 inner-page header (NSIS)
  dmg-background.png        660x400 DMG window background (macOS)
  dmg-background@2x.png     retina variant

Run from the desktop/ directory:  python3 scripts/make-installer-art.py
Requires Pillow. Fonts are auto-detected with fallbacks.
"""
import os
from PIL import Image, ImageDraw, ImageFont

INK, INK2 = (11, 14, 19), (17, 21, 28)
GOLD, FG, DIM = (232, 168, 46), (233, 237, 243), (154, 166, 182)

def find_font(candidates, size):
    for c in candidates:
        try:
            return ImageFont.truetype(c, size)
        except OSError:
            continue
    return ImageFont.load_default()

def cond_bold(size):
    return find_font([
        # Prefer the app's brand face (Saira Condensed) when it is installed, so
        # the generated art matches the in-app wordmark; fall back otherwise.
        "build/fonts/SairaCondensed-ExtraBold.ttf",
        "/usr/share/fonts/truetype/saira/SairaCondensed-ExtraBold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf",
        "/Library/Fonts/Arial Narrow Bold.ttf",
        "C:/Windows/Fonts/ARIALNB.TTF",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ], size)

def sans(size):
    return find_font([
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/Library/Fonts/Arial.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ], size)

icon = Image.open("build/icon.png").convert("RGBA")

def vgrad(w, h, top, bot):
    img = Image.new("RGB", (w, h), top)
    for y in range(h):
        t = y / max(1, h - 1)
        img.paste(tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)), (0, y, w, y + 1))
    return img

def gold_bands(img, alpha=20):
    w, h = img.size
    band = Image.new("RGBA", (w * 2, h * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(band)
    x, i = -h, 0
    for _ in range(60):
        bw = [10, 26, 16, 34, 14, 22][i % 6]
        a = alpha if i % 2 == 0 else alpha // 2
        d.rectangle([x, 0, x + bw, h * 2], fill=(*GOLD, a))
        x += bw + 14
        i += 1
        if x > w * 2:
            break
    band = band.rotate(-30, resample=Image.BICUBIC, center=(0, 0))
    img.paste(band, (0, int(h * 0.35)), band)
    return img

def wordmark(d, x, y, size, center=False):
    f = cond_bold(size)
    w_cask = d.textlength("cask", font=f)
    if center:
        x -= (w_cask + d.textlength("t", font=f)) / 2
    d.text((x, y), "cask", font=f, fill=FG)
    d.text((x + w_cask, y), "t", font=f, fill=GOLD)

# icon.ico
icon.save("build/icon.ico", sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])

# sidebar
W, H = 164, 314
side = gold_bands(vgrad(W, H, (8,10,14), INK2).convert("RGBA"))
glow = Image.new("RGBA", (W, H), (0,0,0,0)); gd = ImageDraw.Draw(glow)
for r in range(140, 0, -4):
    gd.ellipse([W//2-r, H-30-r//2, W//2+r, H-30+r//2], fill=(*GOLD, int(26*(1-r/140))))
side = Image.alpha_composite(side, glow)
lg = icon.resize((92, 92), Image.LANCZOS); side.paste(lg, (W//2-46, 52), lg)
d = ImageDraw.Draw(side)
wordmark(d, W//2, 158, 40, center=True)
tf = sans(11); tag = "Manage. Track. Collect."
d.text((W//2 - d.textlength(tag, font=tf)/2, 210), tag, font=tf, fill=DIM)
side.convert("RGB").save("build/installerSidebar.bmp")
side.convert("RGB").save("build/uninstallerSidebar.bmp")

# header: centered "caskt" wordmark in the brand face, no icon. NSIS draws the
# page title on the left; this sits at the top-right of inner pages.
head = Image.new("RGBA", (150, 57), INK)
hd = ImageDraw.Draw(head)
hsize = 24
while hsize < 80 and hd.textlength("caskt", font=cond_bold(hsize + 1)) <= 118:
    hsize += 1
hf = cond_bold(hsize)
bb = hd.textbbox((0, 0), "caskt", font=hf)
hy = (57 - (bb[3] - bb[1])) // 2 - bb[1]
wordmark(hd, 75, hy, hsize, center=True)
head.convert("RGB").save("build/installerHeader.bmp")

# dmg background
dw, dh = 660, 400
dmg = gold_bands(vgrad(dw, dh, (8,10,14), INK2).convert("RGBA"), alpha=14)
dd = ImageDraw.Draw(dmg)
wordmark(dd, dw//2, 48, 64, center=True)
tf2 = sans(15); tag2 = "Manage. Track. Collect."
dd.text((dw//2 - dd.textlength(tag2, font=tf2)/2, 118), tag2, font=tf2, fill=DIM)
dd.line([262, 200, 398, 200], fill=GOLD, width=3)
dd.polygon([(398, 192), (398, 208), (414, 200)], fill=GOLD)
hint = sans(13); ht = "Drag Caskt into Applications"
dd.text((dw//2 - dd.textlength(ht, font=hint)/2, 250), ht, font=hint, fill=DIM)
dmg.convert("RGB").save("build/dmg-background.png")
dmg.resize((dw*2, dh*2), Image.LANCZOS).convert("RGB").save("build/dmg-background@2x.png")

print("Installer art written to build/.")
