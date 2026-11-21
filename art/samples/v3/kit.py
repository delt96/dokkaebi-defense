"""Tiny pixel-art kit: shapes into material regions, light-from-top-left shading,
auto 1px outline, grade flames, previews."""
from PIL import Image, ImageDraw, ImageFont
import math

OUT = '#1e1416'

RAMPS = {
    'wood':   ['#2e1c12', '#4a2e1c', '#6a4428', '#8c5e38', '#b07e4e'],
    'pwood':  ['#3a1a12', '#5a2c1c', '#7e4228', '#a45e3a', '#c88458'],   # polished birch, reddish
    'straw':  ['#5e421c', '#8a6428', '#b48a40', '#d4ac5c', '#ecd08a'],
    'iron':   ['#2a2224', '#3e3230', '#5a4a46', '#74605a', '#94806e'],
    'onggi':  ['#2e1a12', '#4e2c1c', '#6e3e26', '#8e5634', '#b07a4c'],
    'glaze':  ['#1e1210', '#36201a', '#523024', '#704634', '#9a6a50'],
    'stone':  ['#3a3634', '#545050', '#706a66', '#8e8680', '#b0a89e'],
    'hanji':  ['#7a6e5a', '#a89a7e', '#c8b894', '#e4d8b8', '#f6eed8'],
    'porc':   ['#5e6266', '#8a8e8e', '#b4b4ac', '#d8d4c8', '#f2eee2'],
    'bamboo': ['#4a4422', '#6a622e', '#8e843e', '#b0a656', '#d0c878'],
    'blue':   ['#141e44', '#1e3266', '#2a4a8a', '#4068a8', '#6a8ec8'],
    'red':    ['#4a1414', '#7a2420', '#a8342a', '#c84e38', '#e47a58'],
    'char':   ['#141012', '#221c1e', '#322a2a', '#463c3a', '#5e5250'],
    'earth':  ['#2e2014', '#4a3420', '#6a4c2e', '#8a6840', '#aa8a58'],
    'leaf':   ['#16241a', '#223a26', '#2e5232', '#44704a', '#649060'],
    # enemies
    'shade':  ['#120c1c', '#1c1428', '#2a1e3c', '#3c2c54', '#5a4878'],
    'ogre':   ['#1e1214', '#2e1c1e', '#44282a', '#5e3a36', '#7e5448'],
    'centi':  ['#1e0c12', '#34121c', '#521c28', '#782a36', '#a04448'],
    'steel':  ['#121820', '#1e2832', '#2e3c48', '#46586a', '#6e8496'],
}
FLAMES = {
    1: ['#2347c9', '#4f9dff', '#a8d4ff', '#e6f4ff'],
    2: ['#1f8a4a', '#4fd27a', '#a8f0c0', '#e8fff0'],
    3: ['#6a3ac9', '#b07aff', '#d8bcff', '#f6eeff'],
    4: ['#c25a14', '#ffb347', '#ffd890', '#fff6dc'],
}
SINGLE = {
    'o': OUT, 'K': '#2a1418', 'W': '#efe6cc', 'R': '#b83a2e', 'r': '#7a2420', 'Y': '#d8a83a',
    'y': '#9a7424', 'B': '#2e4a8a', 'b': '#1e3266', 'G': '#3a8a6a', 'g': '#245a44', 'E': '#ff3b2f',
    'e': '#ffb08a', 'L': '#7a6a9a', 'l': '#9a8ac0', 'P': '#c8a8e8', 'S': '#2a1e3c',
}


def hx(c):
    c = c.lstrip('#')
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4)) + ((int(c[6:8], 16),) if len(c) == 8 else (255,))


class Spr:
    def __init__(self, w=32, h=32, grade=1):
        self.w, self.h, self.grade = w, h, grade
        self.mat = [[None] * w for _ in range(h)]   # (ramp, region, mode, base)
        self.col = [[None] * w for _ in range(h)]   # explicit colour (after shading)
        self.nooutline = set()                      # pixels that never get a black outline next to them

    # ---------- shapes into material regions
    def m(self, x, y, mat):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.mat[y][x] = mat
            self.col[y][x] = None

    def rect(self, x0, y0, x1, y1, mat):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.m(x, y, mat)

    def ellipse(self, cx, cy, rx, ry, mat):
        for y in range(self.h):
            for x in range(self.w):
                if ((x - cx) / (rx + .5)) ** 2 + ((y - cy) / (ry + .5)) ** 2 <= 1:
                    self.m(x, y, mat)

    def poly(self, pts, mat):
        for y in range(self.h):
            for x in range(self.w):
                if inside(pts, x + .5, y + .5):
                    self.m(x, y, mat)

    def line(self, x0, y0, x1, y1, mat, t=1):
        n = max(abs(x1 - x0), abs(y1 - y0), 1) * 2
        for i in range(n + 1):
            x = x0 + (x1 - x0) * i / n
            y = y0 + (y1 - y0) * i / n
            for dy in range(t):
                for dx in range(t):
                    self.m(round(x) + dx, round(y) + dy, mat)

    # ---------- explicit colour
    def c(self, x, y, colour):
        if 0 <= x < self.w and 0 <= y < self.h:
            if colour is None:
                self.mat[y][x] = None
                self.col[y][x] = None
            else:
                self.col[y][x] = colour
                if self.mat[y][x] is None:
                    self.mat[y][x] = ('_', None, 'flat', 0)

    def stamp(self, x0, y0, lines, legend=None):
        """Colour stamp. '.'/' ' skip, '-' erase. Legend maps char -> colour or 'ramp:i' or ('mat', mat)."""
        legend = legend or {}
        for j, row in enumerate(lines):
            for i, ch in enumerate(row):
                if ch in '. ':
                    continue
                x, y = x0 + i, y0 + j
                if not (0 <= x < self.w and 0 <= y < self.h):
                    print('  clipped stamp pixel', x, y)
                if ch == '-':
                    self.c(x, y, None)
                    continue
                v = legend.get(ch, ch)
                if isinstance(v, tuple):
                    self.m(x, y, v)
                else:
                    self.c(x, y, self.colour(v))

    def colour(self, v):
        if v in SINGLE:
            return SINGLE[v]
        if v in 'ANZX' and len(v) == 1:
            return FLAMES[self.grade]['ANZX'.index(v)]
        if ':' in v:
            r, i = v.split(':')
            return RAMPS[r][int(i)] if r != 'f' else FLAMES[self.grade][int(i)]
        if v.startswith('#'):
            return v
        raise ValueError(v)

    # ---------- shading
    def shade(self):
        regions = {}
        for y in range(self.h):
            for x in range(self.w):
                m = self.mat[y][x]
                if m and m[0] != '_':
                    regions.setdefault(m[1], []).append((x, y))
        for key, pts in regions.items():
            ps = set(pts)
            ramp, _, mode, base = self.mat[pts[0][1]][pts[0][0]]
            R = RAMPS[ramp]
            xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
            rows = {}
            for x, y in pts:
                lo, hi = rows.get(y, (99, -99)); rows[y] = (min(lo, x), max(hi, x))
            cols = {}
            for x, y in pts:
                lo, hi = cols.get(x, (99, -99)); cols[x] = (min(lo, y), max(hi, y))
            cx = (min(xs) + max(xs)) / 2; cy = (min(ys) + max(ys)) / 2
            rx = max(1, (max(xs) - min(xs)) / 2); ry = max(1, (max(ys) - min(ys)) / 2)
            for x, y in pts:
                if self.col[y][x] is not None:
                    continue
                lv = base
                if mode in ('cyl', 'cylv'):
                    if mode == 'cyl':
                        lo, hi = rows[y]
                        t = (x - lo) / max(1, hi - lo)
                    else:
                        lo, hi = cols[x]
                        t = (y - lo) / max(1, hi - lo)
                    lv += 1 if t < .3 else (-1 if t > .66 else 0)
                    if t > .88 and hi - lo > 5:
                        lv -= 1
                elif mode == 'sphere':
                    d = ((x - cx) / rx + (y - cy) / ry) / 2
                    lv += 1 if d < -.35 else (-1 if d > .3 else 0)
                    if d > .7:
                        lv -= 1
                # bevel
                top = (x, y - 1) not in ps
                left = (x - 1, y) not in ps
                bot = (x, y + 1) not in ps
                right = (x + 1, y) not in ps
                if mode != 'none':
                    if (top or left) and not (bot or right):
                        lv += 1
                    elif (bot or right) and not (top or left):
                        lv -= 1
                lv = max(0, min(len(R) - 2 if mode != 'shine' else len(R) - 1, lv))
                self.col[y][x] = R[lv]
        return self

    # ---------- outline & flame
    def filled(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h and self.col[y][x] is not None

    def outline(self, colour=OUT, skip_cols=()):
        fl = set(FLAMES[self.grade]) | set(skip_cols)
        add = []
        for y in range(self.h):
            for x in range(self.w):
                if self.col[y][x] is not None:
                    continue
                nb = [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
                ns = [self.col[b][a] for a, b in nb if self.filled(a, b)]
                if ns and any(n not in fl for n in ns):
                    add.append((x, y))
        for x, y in add:
            self.col[y][x] = colour
            if self.mat[y][x] is None:
                self.mat[y][x] = ('_', None, 'flat', 0)
        return self

    def flame(self, cx, by, kind=None):
        """Stamp the grade flame with its bottom row at by, centred on cx."""
        g = kind or self.grade
        art = FLAME_ART[g]
        w = len(art[0])
        self.stamp(cx - w // 2, by - len(art) + 1, art)
        return self

    def image(self):
        im = Image.new('RGBA', (self.w, self.h), (0, 0, 0, 0))
        for y in range(self.h):
            for x in range(self.w):
                if self.col[y][x] is not None:
                    im.putpixel((x, y), hx(self.col[y][x]))
        return im


def inside(pts, x, y):
    n = len(pts); ins = False
    for i in range(n):
        x1, y1 = pts[i]; x2, y2 = pts[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            ins = not ins
    return ins


# flame stamps: A edge, N body, Z light, X core. Grade = number of tips.
FLAME_ART = {
    1: ['...A...',
        '..ANA..',
        '..ANA..',
        '.ANZNA.',
        '.ANZNA.',
        'ANZXZNA',
        '.ANZNA.',
        '..AAA..'],
    2: ['.A...A.',
        'ANA.ANA',
        'ANA.ANA',
        'ANNANZA',
        'ANZNZNA',
        'ANZXZNA',
        '.ANZNA.',
        '..AAA..'],
    3: ['....A....',
        '.A.ANA.A.',
        'ANAANAANA',
        'ANAANZANA',
        'ANNNZNNNA',
        '.ANZXZNA.',
        '..ANZNA..',
        '...AAA...'],
    4: ['....A....',
        '.A.ANA.A.',
        'ANAANAANA',
        'ANAANZANA',
        'ANNZNZNNA',
        'ANZZXZZNA',
        '.ANZXZNA.',
        '..ANZNA..',
        '...AAA...'],
}


BOARD = (34, 29, 48, 255)


def preview(items, path, scale=8):
    """items: list of (name, Image). Shows big view, 2x and 1x on board colour, plus silhouette."""
    font = ImageFont.truetype('C:/Windows/Fonts/malgun.ttf', 14)
    cw = max(im.width for _, im in items) * scale + 120
    ch = max(im.height for _, im in items) * scale + 30
    W = Image.new('RGBA', (cw * len(items), ch), BOARD)
    d = ImageDraw.Draw(W)
    for i, (name, im) in enumerate(items):
        x0 = i * cw + 4
        W.alpha_composite(im.resize((im.width * scale, im.height * scale), Image.NEAREST), (x0, 22))
        d.text((x0, 2), name, fill=(230, 220, 200), font=font)
        bx = x0 + im.width * scale + 8
        W.alpha_composite(im.resize((im.width * 2, im.height * 2), Image.NEAREST), (bx, 22))
        W.alpha_composite(im, (bx, 22 + im.height * 2 + 8))
        sil = Image.new('RGBA', im.size, (255, 255, 255, 255))
        a = im.split()[3]
        sil.paste((0, 0, 0, 255), mask=a)
        W.alpha_composite(sil.resize((im.width * 2, im.height * 2), Image.NEAREST), (bx, 22 + im.height * 3 + 16))
    W.save(path)
