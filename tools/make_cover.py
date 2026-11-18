"""生成 itch.io 封面：在游戏截图上叠加标题。
用法：python tools/make_cover.py   （读取 release/itch/cover-bg.png，输出 cover.png 630x500 和 cover@2x.png 1260x1000）
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent / 'release' / 'itch'
FONTS = Path('C:/Windows/Fonts')
bg = Image.open(ROOT / 'cover-bg.png').convert('RGB').resize((1260, 1000))
W, H = bg.size

# 上下压暗，给文字留出对比度
shade = Image.new('L', (W, H), 0)
d = ImageDraw.Draw(shade)
for y in range(H):
    top = max(0, 1 - y / 330) * 210
    bottom = max(0, (y - 760) / 240) * 200
    d.line([(0, y), (W, y)], fill=int(max(top, bottom)))
bg = Image.composite(Image.new('RGB', (W, H), (5, 8, 15)), bg, shade)

title_font = ImageFont.truetype(str(FONTS / 'segoeuib.ttf'), 118)
sub_font = ImageFont.truetype(str(FONTS / 'segoeui.ttf'), 40)
zh_font = ImageFont.truetype(str(FONTS / 'msyhbd.ttc'), 44)
tag_font = ImageFont.truetype(str(FONTS / 'segoeuib.ttf'), 30)


def centered(draw, y, text, font, fill):
    w = draw.textlength(text, font=font)
    draw.text(((W - w) / 2, y), text, font=font, fill=fill)


# 标题发光层
glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
centered(gd, 70, 'GRAVITY COURIER', title_font, (255, 170, 70, 255))
glow = glow.filter(ImageFilter.GaussianBlur(18))
img = Image.alpha_composite(bg.convert('RGBA'), glow)

draw = ImageDraw.Draw(img)
centered(draw, 70, 'GRAVITY COURIER', title_font, (255, 214, 130))
centered(draw, 214, '引力信使', zh_font, (190, 240, 255))
centered(draw, 860, 'Bend your shots with gravity. Hunt space pirates.', sub_font, (233, 238, 248))
centered(draw, 918, '48 LEVELS  ·  12 REAL PHYSICS IDEAS  ·  PLAY IN BROWSER', tag_font, (255, 207, 107))

img = img.convert('RGB')
img.save(ROOT / 'cover@2x.png')
img.resize((630, 500), Image.LANCZOS).save(ROOT / 'cover.png')
print('ok', ROOT / 'cover.png')
