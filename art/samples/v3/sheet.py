"""Contact sheet: every unit and enemy sprite at 4x with id, name and grade, plus a 1x/2x strip."""
import json
from PIL import Image, ImageDraw, ImageFont

ROOT = 'C:/workspace/web-game/'
units = json.load(open(ROOT + 'packages/logic/data/units.json', encoding='utf8'))
enemies = json.load(open(ROOT + 'packages/logic/data/enemies.json', encoding='utf8'))
rows = [(f"{u['id']}", u['name'], f"{u['grade']}등급 {'물리' if u['damageType'] == 'physical' else '마법'}") for u in units]
rows += [(e['id'], e['name'], '보스' if e['boss'] else '적') for e in enemies]

SC, CELL_W, CELL_H, COLS = 4, 230, 264, 6
BG, CELLBG = (22, 18, 30), (34, 29, 48)
f1 = ImageFont.truetype('C:/Windows/Fonts/malgunbd.ttf', 16)
f2 = ImageFont.truetype('C:/Windows/Fonts/malgun.ttf', 12)
n = len(rows)
R = (n + COLS - 1) // COLS
W = Image.new('RGBA', (COLS * CELL_W + 20, R * CELL_H + 20 + 330), BG)
d = ImageDraw.Draw(W)
ims = []
for i, (id_, name, tag) in enumerate(rows):
    im = Image.open(f'{ROOT}packages/client/public/sprites/{id_}.png').convert('RGBA')
    ims.append(im)
    cx, cy = 10 + (i % COLS) * CELL_W, 10 + (i // COLS) * CELL_H
    d.rectangle([cx + 4, cy + 4, cx + CELL_W - 4, cy + CELL_H - 4], fill=CELLBG)
    big = im.resize((im.width * SC, im.height * SC), Image.NEAREST)
    W.alpha_composite(big, (cx + (CELL_W - big.width) // 2, cy + 10))
    d.text((cx + 12, cy + CELL_H - 50), f'{name}', fill=(240, 228, 200), font=f1)
    d.text((cx + 12, cy + CELL_H - 28), f'{id_} · {tag} · {im.width}px', fill=(170, 160, 190), font=f2)
# actual-size strip
y0 = 10 + R * CELL_H + 10
d.text((14, y0), '실제 크기 1배 / 2배', fill=(170, 160, 190), font=f2)
x = 14
for im in ims:
    W.alpha_composite(im, (x, y0 + 22 + (48 - im.height)))
    x += im.width + 6
x, yy = 14, y0 + 80
for im in ims:
    if x + im.width * 2 > W.width - 10:
        x, yy = 14, yy + 100
    W.alpha_composite(im.resize((im.width * 2, im.height * 2), Image.NEAREST), (x, yy + 96 - im.height * 2))
    x += im.width * 2 + 6
W.save(ROOT + 'art/samples/v3/sheet.png')
print(W.size)
