# Génère public/og-image.png : l'image d'aperçu (1200×630) affichée quand on partage animood.me
# sur Discord, WhatsApp, X… Relancer après un changement de logo ou de moods :  python scripts/make_og_image.py
# Polices Windows (Segoe UI + Segoe UI Emoji) : à lancer sur Windows.
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
W, H = 1200, 630
FONTS = Path("C:/Windows/Fonts")
black = lambda s: ImageFont.truetype(str(FONTS / "seguibl.ttf"), s)
bold  = lambda s: ImageFont.truetype(str(FONTS / "segoeuib.ttf"), s)
reg   = lambda s: ImageFont.truetype(str(FONTS / "segoeui.ttf"), s)
EMOJI = ImageFont.truetype(str(FONTS / "seguiemj.ttf"), 109)  # taille native des emojis couleur

MOODS = [  # mêmes que src/constants/moods.js
    ("💔", "Emotional", "#A78BFA"), ("✨", "Happy", "#FFD93D"), ("⚡", "Hype", "#F97316"), ("🩸", "Dark", "#EF4444"),
    ("🌿", "Chill", "#34D399"), ("🌀", "Twisted", "#06B6D4"), ("🌸", "In Love", "#F9A8D4"), ("🎢", "Thrills", "#FB923C"),
]

def hex2rgb(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))

# Fond sombre + halos violet / fuchsia
img = Image.new("RGB", (W, H), (7, 11, 23))
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
g = ImageDraw.Draw(glow)
g.ellipse((-250, -350, 650, 350), fill=(124, 58, 237, 150))
g.ellipse((700, 330, 1500, 950), fill=(217, 70, 239, 95))
g.ellipse((900, -200, 1400, 200), fill=(79, 70, 229, 80))
glow = glow.filter(ImageFilter.GaussianBlur(140))
img.paste(glow, (0, 0), glow)
d = ImageDraw.Draw(img)

# Logo arrondi
logo = Image.open(ROOT / "public/logo-mark.png").convert("RGBA").resize((132, 132), Image.LANCZOS)
mask = Image.new("L", logo.size, 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, 131, 131), radius=32, fill=255)
img.paste(logo, (80, 78), mask)

# Titre en dégradé violet → fuchsia
title = "AniMood"
tf = black(118)
tw = d.textbbox((0, 0), title, font=tf)
tmask = Image.new("L", (W, H), 0)
ImageDraw.Draw(tmask).text((240, 52), title, font=tf, fill=255)
grad = Image.new("RGB", (W, H))
gd = ImageDraw.Draw(grad)
x0, x1 = 240, 240 + tw[2]
for x in range(W):
    t = min(1, max(0, (x - x0) / max(1, x1 - x0)))
    c = tuple(int(a + (b - a) * t) for a, b in zip((196, 181, 253), (240, 171, 252)))
    gd.line([(x, 0), (x, H)], fill=c)
img.paste(grad, (0, 0), tmask)

d.text((84, 248), "Trouve l'animé qui correspond", font=bold(52), fill=(241, 245, 249))
d.text((84, 310), "à ton humeur.", font=bold(52), fill=(241, 245, 249))

# Pastilles de moods (2 lignes de 4)
def chip(x, y, emoji, label, color):
    rgb = hex2rgb(color)
    lf = bold(26)
    lw = d.textlength(label, font=lf)
    w = int(56 + lw + 26)
    hgt = 54
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.rounded_rectangle((x, y, x + w, y + hgt), radius=27, fill=rgb + (38,), outline=rgb + (150,), width=2)
    img.paste(layer, (0, 0), layer)
    em = Image.new("RGBA", (140, 140), (0, 0, 0, 0))
    ImageDraw.Draw(em).text((0, 0), emoji, font=EMOJI, embedded_color=True)
    em = em.crop(em.getbbox() or (0, 0, 140, 140)).resize((30, 30), Image.LANCZOS)
    img.paste(em, (x + 16, y + 12), em)
    d.text((x + 56, y + 9), label, font=lf, fill=(241, 245, 249))
    return w

y = 410
for row in (MOODS[:4], MOODS[4:]):
    x = 84
    for e, l, c in row:
        x += chip(x, y, e, l, c) + 14
    y += 68

# Pied : adresse + promesse
foot = "animood.me"
d.text((W - 84 - d.textlength(foot, font=black(34)), 552), foot, font=black(34), fill=(196, 181, 253))
sub = "Gratuit · sans pub"
d.text((W - 84 - d.textlength(sub, font=reg(24)), 512), sub, font=reg(24), fill=(148, 163, 184))

out = ROOT / "public/og-image.png"
img.save(out, optimize=True)
print(out, out.stat().st_size // 1024, "Ko")
