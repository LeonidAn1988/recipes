#!/usr/bin/env python3
"""Генератор иконок приложения «Книга рецептов».

Рисует раскрытую книгу рецептов с деревянной ложкой на терракотовом фоне
(цвет акцента приложения) и сохраняет все нужные размеры в icons/:
  icon-180.png          — apple-touch-icon (iPhone, «На экран Домой»)
  icon-192.png, -512    — manifest (Android)
  icon-maskable-512.png — Android с адаптивной маской: рисунок в безопасной зоне
  favicon-32.png        — вкладка браузера

Правки иконки — здесь, затем: python3 tools/make_icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"
S = 1024  # рисуем крупно, потом уменьшаем со сглаживанием

TERRACOTTA = (180, 84, 31)
TERRACOTTA_LIGHT = (204, 108, 52)
PAGE = (251, 243, 228)
PAGE_SHADE = (232, 214, 186)
PAGE_EDGE = (214, 190, 152)
LINE = (214, 190, 152)
SPINE = (120, 52, 18)
WOOD = (231, 178, 104)
WOOD_DARK = (96, 52, 18)


def background(size):
    img = Image.new("RGB", (size, size), TERRACOTTA)
    # Мягкое светлое пятно сверху — объём без градиентов-клише.
    glow = Image.new("L", (size, size), 0)
    ImageDraw.Draw(glow).ellipse((-size * 0.2, -size * 0.45, size * 1.2, size * 0.75), fill=90)
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.12))
    img.paste(Image.new("RGB", (size, size), TERRACOTTA_LIGHT), (0, 0), glow)
    return img


def draw_book(layer, cx, cy, w):
    """Раскрытая книга: две страницы, стопка страниц снизу, корешок."""
    d = ImageDraw.Draw(layer)
    h = w * 0.62
    half = w / 2
    top = cy - h / 2
    bottom = cy + h / 2
    sag = w * 0.05  # страницы чуть прогибаются к корешку

    # Стопка страниц (толщина книги) — несколько смещённых контуров.
    for i, col in enumerate((PAGE_EDGE, PAGE_SHADE)):
        off = w * (0.035 - i * 0.017)
        d.polygon([(cx - half, top + off), (cx, top + sag + off), (cx + half, top + off),
                   (cx + half, bottom + off), (cx, bottom + sag * 1.6 + off), (cx - half, bottom + off)], fill=col)

    # Левая и правая страницы.
    d.polygon([(cx - half, top), (cx - w * 0.01, top + sag), (cx - w * 0.01, bottom + sag * 1.6), (cx - half, bottom)], fill=PAGE)
    d.polygon([(cx + w * 0.01, top + sag), (cx + half, top), (cx + half, bottom), (cx + w * 0.01, bottom + sag * 1.6)], fill=PAGE)

    # Корешок.
    d.line([(cx, top + sag), (cx, bottom + sag * 1.6)], fill=SPINE, width=max(2, int(w * 0.012)))

    # На левой странице — только заголовок и одна строка: в 60 px мелкие строки
    # превращаются в шум.
    lw = max(3, int(w * 0.03))
    x0, x1 = cx - half + w * 0.08, cx - w * 0.08
    y = top + h * 0.24
    d.line([(x0, y), (x0 + (x1 - x0) * 0.75, y + sag * 0.15)], fill=SPINE, width=lw)
    y = top + h * 0.42
    d.line([(x0, y), (x1, y + sag * 0.35)], fill=LINE, width=int(lw * 0.8))


def draw_spoon(size, cx, cy, length):
    """Деревянная ложка — рисуем горизонтально и поворачиваем."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    bowl_w, bowl_h = length * 0.34, length * 0.22
    handle_h = length * 0.075
    x_start = cx - length / 2
    # Черенок.
    d.rounded_rectangle((x_start, cy - handle_h / 2, x_start + length * 0.72, cy + handle_h / 2),
                        radius=handle_h / 2, fill=WOOD, outline=WOOD_DARK, width=max(3, int(length * 0.03)))
    # Черпак.
    bx = x_start + length * 0.66
    d.ellipse((bx, cy - bowl_h / 2, bx + bowl_w, cy + bowl_h / 2), fill=WOOD, outline=WOOD_DARK, width=max(3, int(length * 0.03)))
    # Блик в черпаке.
    d.ellipse((bx + bowl_w * 0.22, cy - bowl_h * 0.28, bx + bowl_w * 0.62, cy + bowl_h * 0.02), fill=(244, 206, 150))
    shadow = layer.split()[3].filter(ImageFilter.GaussianBlur(length * 0.02))
    # Почти вертикально, черпаком вверх — целиком на правой странице.
    return layer.rotate(62, resample=Image.BICUBIC, center=(cx, cy)), shadow.rotate(62, resample=Image.BICUBIC, center=(cx, cy))


def render(scale_content=1.0):
    """scale_content < 1 — рисунок меньше (для maskable: безопасная зона)."""
    img = background(S).convert("RGBA")
    art = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    book_w = S * 0.76 * scale_content
    cx, cy = S / 2, S * 0.5
    # Тень книги.
    shadow = Image.new("L", (S, S), 0)
    ImageDraw.Draw(shadow).rounded_rectangle(
        (cx - book_w / 2, cy - book_w * 0.25, cx + book_w / 2, cy + book_w * 0.4), radius=book_w * 0.05, fill=110)
    shadow = shadow.filter(ImageFilter.GaussianBlur(S * 0.03))
    img.paste(Image.new("RGBA", (S, S), (90, 30, 5, 255)), (int(S * 0.012), int(S * 0.03)), shadow)

    draw_book(art, cx, cy - book_w * 0.02, book_w)
    img.alpha_composite(art)

    spoon, spoon_shadow = draw_spoon(S, cx + book_w * 0.25, cy + book_w * 0.02, book_w * 0.5)
    img.paste(Image.new("RGBA", (S, S), (90, 30, 5, 255)), (int(S * 0.01), int(S * 0.02)), spoon_shadow.point(lambda v: v * 0.55))
    img.alpha_composite(spoon)
    return img.convert("RGB")


def main():
    OUT.mkdir(exist_ok=True)
    full = render(1.0)
    for size, name in ((180, "icon-180.png"), (192, "icon-192.png"), (512, "icon-512.png"), (32, "favicon-32.png")):
        full.resize((size, size), Image.LANCZOS).save(OUT / name, optimize=True)
    # Maskable: Android обрезает до круга/капли — рисунок в центральных ~80 %.
    render(0.78).resize((512, 512), Image.LANCZOS).save(OUT / "icon-maskable-512.png", optimize=True)
    print("Готово:", ", ".join(sorted(p.name for p in OUT.glob("*.png"))))


if __name__ == "__main__":
    main()
