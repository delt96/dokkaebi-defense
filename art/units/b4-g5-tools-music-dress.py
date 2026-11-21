"""b4-g5-tools-music-dress: unit sprites -> packages/client/public/sprites/<id>.png, sheet -> art/units/b4-g5-tools-music-dress-sheet.png"""
import sys, os, math
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))).replace(os.sep, '/') + '/'
sys.path.insert(0, ROOT + 'art/samples/v3')
import kit
from kit import Spr, RAMPS, SINGLE, OUT, FLAMES, FLAME_ART, BOARD
from make import club, tube, separate, rim, fit, L, ENEMY_OUT   # helpers only; make's own sprites are not built
from PIL import Image, ImageDraw, ImageFont

# ---- shared additions, identical in every batch (in-memory only; kit.py is not edited)
RAMPS.setdefault('brass', ['#3a2a10', '#6a4c18', '#9a7424', '#c89a3a', '#ecc868'])
RAMPS.setdefault('gourd', ['#4a2410', '#7a3e18', '#b0602a', '#d88a44', '#f0b070'])
FLAMES.setdefault(5, ['#a01828', '#ff4a3a', '#ffa08a', '#fff0e8'])
FLAMES.setdefault(6, ['#c8901a', '#ffe35a', '#fff8c8', '#ffffff'])
FLAME_ART.setdefault(5, [
    '.A...A...A.',
    'ANA.ANA.ANA',
    'ANAAANAAANA',
    'ANANANZNANA',
    'ANNZNZNZNNA',
    '.ANZZXZZNA.',
    '..ANZXZNA..',
    '...ANZNA...',
    '....AAA....'])
FLAME_ART.setdefault(6, [
    '.....A.....',
    '.A..ANA..A.',
    'ANA.ANA.ANA',
    'ANAAANZAANA',
    'ANANZNZNANA',
    'ANNZZXZZNNA',
    'ANZZXXXZZNA',
    '.ANZXXXZNA.',
    '..ANZXZNA..',
    '...AAAAA...'])

BATCH = os.path.splitext(os.path.basename(__file__))[0]
OUTDIR = os.environ.get('SPRITE_OUT', ROOT + 'packages/client/public/sprites/')
SHEET = os.environ.get('SHEET_OUT', ROOT + f'art/units/{BATCH}-sheet.png')
SPRITES, META = {}, {}


def sprite(id_, name, grade, size=32, hidden=False):
    def deco(fn):
        def build():
            s = Spr(size, size, grade)
            fn(s)
            return s.image()
        SPRITES[id_] = build
        META[id_] = (name, grade, hidden)
        return fn
    return deco


# ---------------------------------------------------------------- batch helpers
def region(s, name):
    return [(x, y) for y in range(s.h) for x in range(s.w) if s.mat[y][x] and s.mat[y][x][1] == name]


def recolour(s, name, fn):
    """fn(x, y, current colour) -> new colour or None to keep."""
    for x, y in region(s, name):
        c = fn(x, y, s.col[y][x])
        if c is not None:
            s.c(x, y, c)


def lv(ramp, c, d):
    R = RAMPS[ramp]
    i = R.index(c) if c in R else 2
    return R[max(0, min(4, i + d))]


def pline(s, pts, colour):
    """1px polyline in an explicit colour."""
    col = s.colour(colour)
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        n = max(abs(x1 - x0), abs(y1 - y0), 1)
        for i in range(n + 1):
            s.c(round(x0 + (x1 - x0) * i / n), round(y0 + (y1 - y0) * i / n), col)


def sparks(s, pts):
    for k, (x, y) in enumerate(pts):
        if s.col[y][x] is None:
            s.c(x, y, s.colour('N' if k % 2 else 'Z'))


# ======================================================================= tools

@sprite('top', '톱', 5)
def top(s):
    # H frame: two arms, a thick centre brace, blade across the bottom, twisted cord across the top
    s.rect(4, 11, 6, 29, ('wood', 'armL', 'cyl', 3))
    s.rect(25, 11, 27, 29, ('wood', 'armR', 'cyl', 2))
    s.poly([(7, 17), (10, 15), (22, 15), (25, 17), (25, 20), (22, 22), (10, 22), (7, 20)], ('wood', 'bar', 'flat', 3))
    s.rect(7, 25, 24, 26, ('iron', 'blade', 'cylv', 3))
    s.rect(7, 11, 24, 12, ('straw', 'cord', 'flat', 3))
    s.line(20, 12, 21, 14, ('wood', 'tog', 'flat', 2), 2)
    s.shade()
    # twist of the cord
    recolour(s, 'cord', lambda x, y, c: RAMPS['straw'][4 if (x + y) % 3 == 0 else (1 if (x + y) % 3 == 2 else 2)])
    # saw teeth under the blade
    for x in range(7, 25, 2):
        s.c(x, 27, RAMPS['iron'][3])
    for x in range(7, 25):
        s.c(x, 25, RAMPS['iron'][4] if x % 6 else '#ffffff')
    # brass pins where the brace meets the arms, red cloth on the grip
    s.stamp(5, 18, ['Y'])
    s.stamp(26, 18, ['y'])
    s.stamp(4, 27, ['RRR', 'rRr', 'RRr'])
    # face on the brace
    s.stamp(10, 15, [
        '.oo.....oo..',
        'oWWo...oWWo.',
        'oWoo...ooWo.',
        '.oo.....oo..',
        '...oooooo...',
        '...oKKKKo...',
    ])
    # wood chips under the blade
    s.stamp(10, 28, ['.p', 'pp'], {'p': ('straw', 'chip', 'flat', 3)})
    s.stamp(19, 29, ['pp'], {'p': ('straw', 'chip2', 'flat', 3)})
    s.shade()
    s.outline()
    sparks(s, [(8, 6), (24, 4), (23, 8)])
    s.flame(16, 10)


def axis(H, deg):
    """Point maker along a tilted tool: u runs from the head toward the tip, v across (positive = lower side)."""
    a = math.radians(deg)
    d = (-math.cos(a), math.sin(a)); n = (math.sin(a), math.cos(a))
    return lambda u, v: (H[0] + u * d[0] + v * n[0], H[1] + u * d[1] + v * n[1])


@sprite('kkeul', '끌', 5)
def kkeul(s):
    # chisel lying on a slant, battered handle head up right, broad iron blade down left
    P = axis((23.5, 14), 30)
    s.poly([P(9.5, -3.6), P(9.5, 3.6), P(21, 4.6), P(23.2, 4.6), P(21.8, -4.6), P(20.5, -4.6)], ('iron', 'blade', 'flat', 3))
    s.shade()
    tube(s, [P(1, 0), P(8, 0)], [2.8, 3.0], 'wood')
    tube(s, [P(8, 0), P(10, 0)], [3.4, 3.4], 'brass')
    s.poly([P(-1.5, -3.8), P(-1.5, 3.8), P(1.3, 4.3), P(1.3, -4.3)], ('wood', 'head', 'flat', 3))
    s.shade()
    for u, v in [(0.3, -4.7), (0.8, 4.7), (-1.6, 1.5)]:
        x, y = P(u, v); s.c(round(x), round(y), RAMPS['wood'][2])
    x, y = P(-0.5, -1); s.c(round(x), round(y), RAMPS['wood'][1])
    # bright bevel along the cutting edge
    for t in range(0, 25):
        x, y = P(21.8 + 1.4 * t / 24, -4.6 + 9.2 * t / 24)
        for dx in (0, 1):
            xx, yy = round(x) + dx, round(y)
            if s.mat[yy][xx] and s.mat[yy][xx][1] == 'blade':
                s.c(xx, yy, RAMPS['iron'][4])
    s.c(4, 24, '#efe6cc')
    for x, y in region(s, 'blade'):
        if (x - 23.5) * 0.5 + (y - 14) * 0.866 < -3.4:
            s.c(x, y, RAMPS['iron'][4])
    # face on the blade
    s.stamp(6, 20, [
        'oo....oo.',
        'oWWo.oWWo',
        'oWoo.ooWo',
        '.oo...oo.',
        '..oooo...',
        '..oKKo...',
        '...oo....',
    ])
    # curled shavings and a chip under the edge
    s.stamp(1, 27, ['.pp.', 'p..p', '.pp.'], {'p': ('straw', 'chip', 'flat', 3)})
    s.stamp(12, 28, ['pp.', '.pp'], {'p': ('straw', 'chip2', 'flat', 3)})
    s.shade()
    s.outline()
    sparks(s, [(17, 4), (29, 3), (29, 7)])
    s.flame(23, 9)


@sprite('dokki', '도끼', 5)
def dokki(s):
    # log lying on its side, axe bitten into the top, handle out to the upper right
    s.rect(9, 23, 28, 29, ('wood', 'log', 'cylv', 2))
    s.ellipse(8, 26, 2.5, 3.5, ('straw', 'end', 'flat', 3))
    club(s, 17, 14, 28, 8, [1.4, 1.3, 1.3], ('wood', 'handle', 'cyl', 3))
    s.poly([(9.5, 12), (18.5, 12), (19, 15), (18.5, 17), (22.5, 23.5), (4.5, 23.5), (9, 17), (9, 15)], ('iron', 'head', 'flat', 3))
    s.shade()
    # end-grain rings and bark streaks
    s.stamp(7, 23, ['.s.', 's.s', 's.s', 's.s', '.s.'], {'s': 'straw:1'})
    recolour(s, 'log', lambda x, y, c: lv('wood', c, -1) if (y == 25 and x % 5 in (0, 1, 2)) or (y == 28 and x % 6 in (3, 4)) else None)
    # shining bevel just above the log
    recolour(s, 'head', lambda x, y, c: ('#efe6cc' if x % 5 == 2 else RAMPS['iron'][4]) if y == 21 else (RAMPS['iron'][3] if y == 22 else None))
    # handle end and wedge poking out of the eye on the left
    s.stamp(7, 13, ['pq', 'qq'], {'p': 'wood:4', 'q': 'wood:2'})
    # face on the cheek: brows, eyes, teeth
    s.stamp(9, 12, [
        '.oo...oo..',
        'oWWo.oWWo.',
        'oWoo.ooWo.',
        '.oo...oo..',
        '..........',
        '.oWoWoWo..',
        '..oooooo..',
    ])
    # straw rope wrap near the handle end (worn grip)
    s.stamp(24, 9, ['v.', 'tv', '.t'], L)
    s.outline()
    sparks(s, [(7, 5), (20, 3), (21, 7)])
    s.flame(14, 11)


# ======================================================================= sewing and chests

@sprite('banjitgori', '반짇고리', 5)
def banjitgori(s):
    # lid flung open behind, lined with hanji and edged in indigo
    s.poly([(7, 18), (24, 18), (22, 12), (9, 12)], ('hanji', 'lid', 'flat', 3))
    s.poly([(5, 21), (26, 21), (24, 18), (7, 18)], ('wood', 'inside', 'none', 0))
    s.rect(5, 21, 26, 29, ('red', 'front', 'flat', 3))
    s.shade()
    lid = set(region(s, 'lid'))
    for x, y in lid:
        if any((x + a, y + b) not in lid for a, b in ((1, 0), (-1, 0), (0, -1))):
            s.c(x, y, RAMPS['blue'][3] if (y < 14 or x < 12) else RAMPS['blue'][2])
    # scissors standing up on the left, a brass thimble, a spool of indigo thread
    s.stamp(7, 9, [
        '..oo..............',
        '.ojio.............',
        '.ojio.............',
        '.ojio.......oooo..',
        '.ojio.......owwo..',
        '.ojio.......oBbo..',
        '.oyYo...oo..oBbo..',
        'oioojo.oYyo.oBbo..',
        'iKiiKi.oYyo.owwo..',
        'oiooio.oooo.oooo..',
    ], {'j': 'iron:4', 'i': 'iron:3', 'w': 'wood:3'})
    # patchwork band of 오방색 along the top of the front, wood frame
    cols = ['B', 'Y', 'G', 'W', 'Y', 'B', 'G']
    for x in range(5, 27):
        c = cols[((x - 5) // 3) % len(cols)]
        s.c(x, 21, s.colour(c)); s.c(x, 22, s.colour(c.lower() if c != 'W' else 'hanji:2'))
    for y in range(21, 30):
        s.c(5, y, RAMPS['wood'][3]); s.c(26, y, RAMPS['wood'][1])
    for x in range(5, 27):
        s.c(x, 29, RAMPS['wood'][2])
    # thread spilling from the spool over the front edge
    pline(s, [(21, 18), (23, 21), (23, 25), (25, 27)], 'hanji:4')
    # face
    s.stamp(8, 23, [
        '.oo......oo.',
        'oWWo....oWWo',
        'oWoo....ooWo',
        '.oo......oo.',
        '...oKWWKo...',
        '....oooo....',
    ])
    # indigo patch sewn on a worn corner
    s.stamp(6, 26, ['bB', 'Bb'])
    s.outline()
    pline(s, [(26, 27), (27, 28), (28, 28)], 'hanji:4')
    sparks(s, [(9, 5), (24, 4), (25, 8)])
    s.flame(16, 11)


@sprite('dongwe', '돈궤', 5)
def dongwe(s):
    # money chest: low, wide and heavy, sitting flat on the floor, studded with brass
    s.poly([(4, 15), (27, 15), (25, 12), (6, 12)], ('pwood', 'lidtop', 'flat', 3))
    s.rect(3, 15, 28, 17, ('pwood', 'lidfront', 'cylv', 3))
    s.rect(3, 19, 28, 29, ('pwood', 'front', 'flat', 2))
    s.ellipse(15.5, 24.5, 3.5, 3, ('brass', 'plate', 'sphere', 3))
    s.shade()
    # plank seams
    recolour(s, 'front', lambda x, y, c: lv('pwood', c, -1) if y in (23, 27) and (x < 11 or x > 20) else None)
    # gap under the half-open lid with a coin string spilling out
    for x in range(3, 29):
        s.c(x, 18, OUT)
    s.stamp(6, 17, ['YyY', 'yYy', '.Y.', '.y.'])
    s.stamp(23, 18, ['Y', 'y'])
    # brass corner brackets with studs
    for x0, flip in ((3, 0), (25, 1)):
        top = ['bbbb', 'bn..', 'b...'] if not flip else ['bbbb', '..nb', '...b']
        bot = ['b...', 'bn..', 'bbbb'] if not flip else ['...b', '..nb', 'bbbb']
        s.stamp(x0, 19, top, {'b': 'brass:3', 'n': 'brass:4'})
        s.stamp(x0, 27, bot, {'b': 'brass:2', 'n': 'brass:4'})
        s.stamp(x0, 15, ['bbbb', 'b..n' if not flip else 'n..b'], {'b': 'brass:3', 'n': 'brass:4'})
    # brass studs along the lid edge
    for x in range(8, 24, 3):
        s.c(x, 16, RAMPS['brass'][4])
    # lock as the nose, eyes above, grin below
    s.stamp(14, 23, ['.oo.', 'oiio', 'oiio', '.oo.'], {'i': 'iron:4'})
    s.stamp(7, 19, [
        'oo..........oo..',
        '.oWWo....oWWo...',
        '.oWoo....ooWo...',
        '..oo......oo....',
    ])
    s.stamp(12, 27, ['.oooooo.', '.oWKKWo.', '..oooo..'])
    s.outline()
    sparks(s, [(6, 7), (25, 5), (26, 9)])
    s.flame(16, 12)


@sprite('sil', '실', 5)
def sil(s):
    # flat wooden thread winder, indigo and red thread wound round its waist, end running to a needle
    s.rect(7, 9, 24, 14, ('wood', 'head', 'flat', 3))
    s.rect(10, 15, 21, 19, ('blue', 'tb', 'cylv', 3))
    s.rect(10, 20, 21, 24, ('red', 'tr', 'cylv', 3))
    s.rect(7, 25, 24, 28, ('wood', 'foot', 'flat', 2))
    for x, y in [(7, 9), (24, 9), (7, 28), (24, 28)]:
        s.m(x, y, None)
    s.line(22, 29, 28, 23, ('porc', 'needle', 'flat', 3), 1)
    s.shade()
    # wound thread lines
    recolour(s, 'tb', lambda x, y, c: lv('blue', c, -1) if y % 2 else None)
    recolour(s, 'tr', lambda x, y, c: lv('red', c, -1) if y % 2 else None)
    # notch worn in the foot
    s.c(15, 28, None); s.c(16, 28, None)
    # face on the head
    s.stamp(8, 9, [
        '.oo......oo.',
        'oWWo....oWWo',
        'oWoo....ooWo',
        '.oo......oo.',
        '....oKKo....',
    ], )
    # loose red thread with a knot, threaded through the needle eye
    pline(s, [(22, 22), (24, 21), (26, 21), (28, 23)], 'R')
    s.stamp(24, 20, ['Rr', 'rR'])
    s.c(28, 23, '#efe6cc')
    s.outline()
    sparks(s, [(8, 5), (24, 3), (23, 7)])
    s.flame(16, 9)


# ======================================================================= dress

@sprite('gat', '갓', 5)
def gat(s):
    # tall flat-topped horsehair crown: the gat's tell, kept clear of the flame
    s.poly([(12, 6), (19, 6), (20, 18), (11, 18)], ('char', 'crown', 'cyl', 3))
    s.ellipse(15.5, 6.5, 3.5, 0.8, ('char', 'ctop', 'flat', 3))
    s.ellipse(15.5, 19, 12.5, 2.6, ('char', 'brim', 'flat', 3))
    s.ellipse(15.5, 23, 6, 3, ('shade', 'under', 'flat', 1))
    for y in range(0, 21):
        for x in range(32):
            if s.mat[y][x] and s.mat[y][x][1] == 'under':
                s.mat[y][x] = None
    s.line(3, 17, 2, 15, ('char', 'fray', 'flat', 3), 1)
    s.shade()
    # see-through horsehair: cool sheen on the upper-left of crown and brim
    recolour(s, 'crown', lambda x, y, c: SINGLE['L'] if x in (12, 13) and y < 16 else (SINGLE['R'] if y in (15, 16) else None))
    recolour(s, 'brim', lambda x, y, c: SINGLE['L'] if y == 17 and x < 14 else (RAMPS['char'][4] if y == 18 and x % 3 == 0 else None))
    # bead strings hanging in a U under the brim
    pts = []
    for i in range(0, 21):
        t = i / 20
        x = 6 + 19 * t
        y = 21 + 8 * (1 - (2 * t - 1) ** 2)
        pts.append((round(x), round(y)))
    for k, (x, y) in enumerate(dict.fromkeys(pts)):
        if s.col[y][x] is None or s.mat[y][x][1] != 'brim':
            s.c(x, y, s.colour('Y' if k % 2 else 'y'))
    # eyes glowing in the shade under the brim
    s.stamp(11, 22, ['XZ...ZX', 'ZN...NZ'])
    s.stamp(13, 25, ['ooo'])
    s.outline()
    sparks(s, [(4, 9), (22, 3), (29, 5)])
    s.flame(25, 14)


@sprite('manggeon', '망건', 5)
def manggeon(s):
    # horsehair headband seen from above the front, tie strings (당줄) knotted on top
    s.line(7, 17, 15, 11, ('shade', 'strL', 'flat', 3), 1)
    s.line(25, 17, 17, 11, ('shade', 'strR', 'flat', 3), 1)
    s.ellipse(16, 10.5, 1.5, 1, ('char', 'knot', 'flat', 3))
    s.ellipse(16, 23.5, 12, 4.5, ('char', 'band', 'flat', 3))
    s.poly([(4.5, 18), (27.5, 18), (28, 23.5), (4, 23.5)], ('char', 'band', 'flat', 3))
    s.ellipse(16, 18, 11.5, 4.5, ('char', 'band', 'flat', 3))
    s.ellipse(16, 18, 10, 3.3, ('char', 'back', 'none', 2))
    s.shade()
    lat = lambda x, y: (x + y) % 4 == 0 or (x - y) % 4 == 0
    # mesh lattice with a cool horsehair sheen; the inside of the back band is in shadow
    recolour(s, 'band', lambda x, y, c: RAMPS['shade'][4] if lat(x, y) else None)
    recolour(s, 'back', lambda x, y, c: (RAMPS['shade'][3] if lat(x, y) else RAMPS['char'][2]) if y <= 17 else RAMPS['char'][1])
    # rims: back rim and the top edge of the front band
    band = set(region(s, 'band')); back = set(region(s, 'back'))
    for x, y in band:
        if (x, y - 1) not in band:
            s.c(x, y, SINGLE['l'] if x < 16 else SINGLE['L'])
    # fire band along the brow line
    for x in range(5, 28):
        ys = [y for (bx, y) in band if bx == x]
        if ys:
            s.c(x, max(ys) - 1, s.colour('Z' if x % 3 == 0 else 'N'))
    # brass toggles (관자) as eyes, mouth between
    s.stamp(7, 22, [
        '.oYYo.......oYYo.',
        'oYWWYo.....oYWWYo',
        'oYWoYo.....oYoWYo',
        '.oyyo.......oyyo.',
    ])
    s.stamp(13, 25, ['oKKKo', '.ooo.'])
    # one broken strand of the mesh
    s.c(26, 20, RAMPS['char'][1])
    s.outline()
    sparks(s, [(9, 5), (23, 3), (22, 7)])
    s.flame(16, 9)


@sprite('beoseon', '버선', 5)
def beoseon(s):
    s.poly([(16, 11), (24, 11), (25, 12), (25, 25), (23, 28), (19, 29), (8, 29), (4, 27), (2, 24), (2, 20), (3, 18), (4, 17),
            (5, 18), (6, 20), (9, 22), (12, 22), (15, 21), (15, 12)], ('hanji', 'sock', 'flat', 3))
    s.shade()
    # opening at the ankle, seam round the ankle and along the instep
    s.stamp(16, 11, ['oooooooo', '.KKKKKK.'])
    for x in range(15, 26):
        if x % 2:
            s.c(x, 15, RAMPS['hanji'][1])
    pline(s, [(5, 19), (8, 22), (11, 23), (15, 23)], 'hanji:2')
    # indigo patch on the heel with white stitches
    s.stamp(20, 23, ['WBBBBW', 'BBbBBB', 'WBBbBW', '.BBBB.', '..WW..'])
    # face under the curled toe
    s.stamp(3, 23, [
        '.oo....oo...',
        'oWWo..oWWo..',
        'oWoo..ooWo..',
        '.oo....oo...',
        '...oKKo.....',
    ])
    s.outline()
    sparks(s, [(14, 5), (27, 4), (26, 8)])
    s.flame(20, 10)


@sprite('ssatba', '샅바', 5)
def ssatba(s):
    # upright loop of red cloth; the knot on top is the head, both tails drape off to the right
    s.ellipse(14.5, 21, 9, 7.5, ('red', 'ring', 'flat', 2))
    s.ellipse(14.5, 21.5, 4.5, 3.5, None)
    s.poly([(18, 13), (21, 12), (27, 25), (24, 26)], ('red', 'tailA', 'flat', 3))
    s.poly([(18, 16), (20, 15), (23, 28), (20, 28)], ('red', 'tailB', 'flat', 2))
    s.ellipse(14.5, 13.5, 5.5, 3, ('red', 'knot', 'sphere', 3))
    s.shade()
    # white edge stripes on the loop and along the outer side of each tail
    ring = set(region(s, 'ring'))
    for x, y in ring:
        d = math.hypot((x - 14.5) / 9, (y - 21) / 7.5)
        if 0.76 < d < 0.9:
            s.c(x, y, SINGLE['W'] if (x + y) % 2 else RAMPS['hanji'][2])
    for name in ('tailA', 'tailB'):
        t = set(region(s, name))
        for x, y in t:
            if (x + 1, y) not in t and y > 15:
                s.c(x, y, SINGLE['W'] if y % 2 else RAMPS['hanji'][2])
    # wrap folds at the sides of the knot
    s.stamp(9, 15, ['r..........r'])
    # frayed threads at the tail ends
    for x, y in [(25, 27), (27, 26), (20, 29), (22, 29)]:
        s.c(x, y, RAMPS['hanji'][3])
    # face on the knot
    s.stamp(10, 11, [
        'oo.....oo',
        'oWWo.oWWo',
        'oWoo.ooWo',
        '.oo...oo.',
        '...oKo...',
    ])
    s.outline()
    sparks(s, [(8, 5), (22, 3), (21, 7)])
    s.flame(15, 9)


# ======================================================================= music and masks

@sprite('janggu', '장구', 5)
def janggu(s):
    s.poly([(5, 12), (9, 13), (12, 16), (19, 16), (22, 13), (26, 12), (26, 26), (22, 25), (19, 22), (12, 22), (9, 25), (5, 26)], ('red', 'body', 'cylv', 3))
    s.ellipse(4, 19, 2, 7.5, ('hanji', 'headL', 'flat', 3))
    s.ellipse(27, 19, 1.6, 7, ('hanji', 'headR', 'flat', 2))
    club(s, 20, 14, 28, 6, [1.0, 0.9], ('bamboo', 'stick', 'cyl', 3))
    s.shade()
    # indigo lacing zigzag on both bowls
    pline(s, [(6, 12), (11, 16), (6, 19), (11, 22), (6, 26)], 'B')
    pline(s, [(25, 12), (20, 16), (25, 19), (20, 22), (25, 25)], 'B')
    # one run of lacing patched with straw rope
    s.c(8, 14, s.colour('straw:3')); s.c(9, 15, s.colour('straw:2'))
    # hoops
    recolour(s, 'headL', lambda x, y, c: RAMPS['wood'][3] if x == 6 or y in (11, 27) else None)
    recolour(s, 'headR', lambda x, y, c: RAMPS['wood'][2] if x == 25 or y in (12, 26) else None)
    # face on the waist
    s.stamp(11, 16, [
        '.oo....oo.',
        'oWWo..oWWo',
        'oWoo..ooWo',
        '.oo....oo.',
        '...oooo...',
        '...oKKo...',
    ])
    s.outline()
    sparks(s, [(9, 6), (21, 5), (22, 9)])
    s.flame(15, 15)


@sprite('kkwaenggwari', '꽹과리', 5)
def kkwaenggwari(s):
    s.ellipse(16.5, 20, 10, 10, ('brass', 'rim', 'flat', 1))
    s.ellipse(15.5, 19, 10, 10, ('brass', 'disc', 'sphere', 3))
    s.line(18, 10, 21, 6, ('red', 'cord', 'flat', 3), 1)
    s.line(21, 6, 24, 7, ('red', 'cord', 'flat', 3), 1)
    s.line(24, 7, 22, 10, ('red', 'cord', 'flat', 3), 1)
    club(s, 21, 29, 27, 23, [1.0, 1.0], ('wood', 'stick', 'cyl', 3))
    s.ellipse(27.5, 22, 1.5, 1.5, ('red', 'shead', 'sphere', 3))
    s.shade()
    # hammer marks
    for x, y in [(9, 13), (21, 12), (8, 21), (23, 19), (12, 27), (20, 26)]:
        s.c(x, y, RAMPS['brass'][4]); s.c(x + 1, y + 1, RAMPS['brass'][2])
    # big face across the whole disc: bulging eyes, wide open mouth
    s.stamp(8, 13, [
        'ooo......ooo',
        '.oWWo..oWWo.',
        '.oWoo..ooWo.',
        '..oo....oo..',
    ])
    s.stamp(10, 20, [
        '.oooooooo.',
        'oKWWKKWWKo',
        'oKKKKKKKKo',
        '.oKKKKKKo.',
        '..oooooo..',
    ])
    s.outline()
    # ringing ripples off the left side
    for y in range(14, 25):
        s.c(3 if 16 <= y <= 22 else 4, y, RAMPS['brass'][4] if y % 3 else None)
    for y in range(17, 22):
        s.c(1, y, RAMPS['brass'][3])
    sparks(s, [(4, 6), (15, 3), (16, 7)])
    s.flame(10, 10)


@sprite('buk', '북', 5)
def buk(s):
    s.rect(12, 11, 22, 28, ('red', 'barrel', 'cylv', 3))
    s.ellipse(22, 19.5, 4, 8.5, ('red', 'barrel', 'cylv', 3))
    s.ellipse(12, 19.5, 7.5, 9, ('hanji', 'skin', 'sphere', 3))
    club(s, 24, 11, 28, 27, [1.0, 1.0], ('wood', 'stick', 'cyl', 3))
    s.ellipse(24, 10, 1.6, 1.6, ('wood', 'knob', 'sphere', 3))
    s.shade()
    skin = set(region(s, 'skin'))
    # nail ring round the skin edge
    for k, (x, y) in enumerate(sorted(p for p in skin if any((p[0] + a, p[1] + b) not in skin for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))))):
        s.c(x, y, RAMPS['hanji'][1])
    for a in range(0, 360, 30):
        x = round(12 + 7.2 * math.cos(math.radians(a))); y = round(19 + 9.2 * math.sin(math.radians(a)))
        if (x, y) in skin:
            s.c(x, y, RAMPS['iron'][4] if a < 180 else RAMPS['iron'][3])
    # 단청 band round the barrel
    for x, y in region(s, 'barrel'):
        if (x, y) in skin:
            continue
        if y in (16, 22):
            s.c(x, y, SINGLE['G'])
        elif 17 <= y <= 21:
            s.c(x, y, SINGLE['B'] if (x // 2 + (y > 19)) % 2 else SINGLE['Y'])
    # face on the skin
    s.stamp(6, 14, [
        '.oo....oo.',
        'oWWo..oWWo',
        'oWoo..ooWo',
        '.oo....oo.',
        '..........',
        '..oooooo..',
        '..oKWWKo..',
        '...oooo...',
    ])
    # cracked skin mended with a hanji patch
    s.stamp(14, 24, ['hh', 'hh'], {'h': 'hanji:4'})
    s.outline()
    sparks(s, [(5, 6), (17, 3), (18, 7)])
    s.flame(12, 9)


@sprite('hahoetal', '하회탈', 5)
def hahoetal(s):
    # black cloth hanging behind the mask
    s.poly([(6, 12), (25, 12), (27, 20), (28, 28), (24, 29), (21, 27), (10, 27), (7, 29), (3, 28), (4, 20)], ('char', 'cloth', 'flat', 3))
    s.ellipse(15.5, 16.5, 8.5, 7.5, ('pwood', 'face', 'sphere', 3))
    for y in range(24, 32):
        for x in range(32):
            if s.mat[y][x] and s.mat[y][x][1] == 'face':
                s.mat[y][x] = ('char', 'cloth', 'flat', 3)
    s.ellipse(15.5, 25, 5.5, 2.5, ('pwood', 'jaw', 'sphere', 2))
    for y in range(0, 25):
        for x in range(32):
            if s.mat[y][x] and s.mat[y][x][1] == 'jaw':
                s.mat[y][x] = None
    s.shade()
    # cloth folds
    recolour(s, 'cloth', lambda x, y, c: RAMPS['char'][1] if x in (5, 26) and y > 20 else None)
    # dark gap between face and jaw: laughing open mouth, cords at the sides
    for x in range(10, 22):
        s.c(x, 24, SINGLE['K'])
    s.c(9, 24, RAMPS['straw'][2]); s.c(22, 24, RAMPS['straw'][2])
    # high arched brows, crescent laughing eyes, nose, smile lines
    s.stamp(8, 11, [
        '.oooo..oooo.',
        'o....oo....o',
    ])
    s.stamp(8, 14, [
        '.ooo....ooo.',
        'o...o..o...o',
    ])
    s.stamp(14, 17, ['.p.', 'pqp', 'oqo'], {'p': 'pwood:4', 'q': 'pwood:2'})
    s.stamp(9, 21, ['o..........', '.oo......oo', '...oooooo..'])
    # forehead wrinkle and a chipped cheek
    s.stamp(13, 9, ['pppp'], {'p': 'pwood:2'})
    s.c(23, 19, RAMPS['pwood'][1]); s.c(23, 20, RAMPS['pwood'][1])
    s.outline()
    sparks(s, [(7, 5), (24, 3), (23, 7)])
    s.flame(16, 8)


@sprite('yeopjeonkkureomi', '엽전꾸러미', 5)
def yeopjeonkkureomi(s):
    s.ellipse(16, 10.5, 1.5, 1.2, ('straw', 'knot', 'flat', 3))
    s.line(14, 11, 11, 12, ('straw', 'cord', 'flat', 3), 1)
    s.line(18, 11, 21, 12, ('straw', 'cord', 'flat', 3), 1)
    s.ellipse(10, 16.5, 4.5, 4.5, ('brass', 'c1', 'sphere', 3))
    s.ellipse(21.5, 16.5, 4.5, 4.5, ('brass', 'c2', 'sphere', 3))
    s.poly([(11, 21), (21, 21), (23, 25), (23, 29), (13, 29), (11, 25)], ('brass', 'strand', 'cyl', 3))
    s.shade()
    # stacked coin edges
    recolour(s, 'strand', lambda x, y, c: (lv('brass', c, -2) if y % 2 == 0 else None))
    recolour(s, 'strand', lambda x, y, c: (SINGLE['G'] if (y % 2 and (x * 3 + y) % 7 == 0) else None))
    # verdigris on the big coins
    for x, y in [(6, 19), (7, 20), (24, 19), (25, 18), (13, 13)]:
        s.c(x, y, SINGLE['G'] if (x + y) % 2 else SINGLE['g'])
    # square holes are the eyes
    s.stamp(8, 15, ['oooo', 'oWWo', 'oWoo', 'oooo'])
    s.stamp(20, 15, ['oooo', 'oWWo', 'ooWo', 'oooo'])
    # grin across the top of the string
    s.stamp(13, 21, ['ooooooo', 'oWKKKWo', '.ooooo.'])
    # frayed cord end
    s.stamp(17, 11, ['..', '.u'], L)
    s.outline()
    sparks(s, [(9, 6), (23, 3), (23, 7)])
    s.flame(16, 8)


@sprite('jojokdeung', '조족등', 5)
def jojokdeung(s):
    s.ellipse(15.5, 15.5, 8.5, 7, ('hanji', 'body', 'sphere', 3))
    s.ellipse(15.5, 22.5, 4.5, 1, ('bamboo', 'rim', 'flat', 3))
    # hooked handle
    s.line(15, 8, 15, 6, ('bamboo', 'hdl', 'flat', 2), 2)
    s.line(15, 5, 11, 5, ('bamboo', 'hdl', 'flat', 2), 2)
    s.line(10, 6, 10, 7, ('bamboo', 'hdl', 'flat', 2), 1)
    s.shade()
    body = set(region(s, 'body'))
    # bamboo ribs between the paper gores
    for x, y in body:
        hw = 9 * math.sqrt(max(0.0, 1 - ((y - 15.5) / 7.5) ** 2))
        if hw < 1:
            continue
        u = (x - 15.5) / hw
        for r in (-0.62, 0.62):
            if abs(u - r) < 0.5 / hw:
                s.c(x, y, RAMPS['bamboo'][2])
    # top cap darkened with soot
    recolour(s, 'body', lambda x, y, c: lv('hanji', c, -1) if y <= 10 else None)
    # face in the middle gore
    s.stamp(10, 13, [
        '.oo...oo.',
        'oWWo.oWWo',
        'oWoo.ooWo',
        '.oo...oo.',
        '...ooo...',
        '...oKo...',
    ])
    s.outline()
    # light only goes down
    for y in range(23, 30):
        hw = 2 + (y - 23) * 0.85
        for x in range(32):
            d = abs(x + 0.5 - 16)
            if d <= hw:
                f = d / hw
                s.c(x, y, s.colour('X' if f < 0.3 else ('Z' if f < 0.7 else 'N')))
    s.stamp(12, 23, ['.XXXXXXX.'])
    sparks(s, [(18, 5), (28, 4), (29, 9)])
    s.flame(23, 11)


def contact_sheet(ids, refs=('jipsin', 'gamasot', 'jangdok', 'moru')):
    f1 = ImageFont.truetype('C:/Windows/Fonts/malgunbd.ttf', 16)
    f2 = ImageFont.truetype('C:/Windows/Fonts/malgun.ttf', 12)
    SC, CW, CH, COLS = 6, 230, 260, 6
    rows = [(i, *META[i][:2], OUTDIR + f'{i}.png') for i in ids]
    rows += [(r, '(기존 참고)', '?', ROOT + f'packages/client/public/sprites/{r}.png') for r in refs]
    R = (len(rows) + COLS - 1) // COLS
    W = Image.new('RGBA', (COLS * CW + 20, R * CH + 140), (22, 18, 30, 255))
    d = ImageDraw.Draw(W)
    ims = []
    for k, (id_, name, grade, path) in enumerate(rows):
        im = Image.open(path).convert('RGBA'); ims.append(im)
        cx, cy = 10 + (k % COLS) * CW, 10 + (k // COLS) * CH
        d.rectangle([cx + 4, cy + 4, cx + CW - 4, cy + CH - 4], fill=BOARD)
        big = im.resize((im.width * SC, im.height * SC), Image.NEAREST)
        W.alpha_composite(big, (cx + (CW - big.width) // 2, cy + 10))
        d.text((cx + 12, cy + CH - 48), name, fill=(240, 228, 200), font=f1)
        d.text((cx + 12, cy + CH - 26), f'{id_} · {grade}등급 · {im.width}px', fill=(170, 160, 190), font=f2)
    y0 = 10 + R * CH
    d.text((14, y0), '실제 크기 1배 / 2배 (판 색 위)', fill=(170, 160, 190), font=f2)
    x = 14
    for im in ims:
        W.alpha_composite(im, (x, y0 + 20 + 48 - im.height)); x += im.width + 6
    x = 14
    for im in ims:
        if x + im.width * 2 > W.width - 10:
            break
        W.alpha_composite(im.resize((im.width * 2, im.height * 2), Image.NEAREST), (x, y0 + 72 + 96 - im.height * 2 - 30)); x += im.width * 2 + 6
    os.makedirs(os.path.dirname(SHEET), exist_ok=True)
    W.save(SHEET)
    print('sheet', SHEET, W.size)


if __name__ == '__main__':
    args = sys.argv[1:]
    ids = [a for a in args if a in SPRITES] or list(SPRITES)
    for i in ids:
        im = fit(SPRITES[i](), ENEMY_OUT if META[i][2] else OUT)
        a = im.split()[3]
        Wd, H = im.size
        edge = [(x, y) for x in range(Wd) for y in range(H) if a.getpixel((x, y)) and (x in (0, Wd - 1) or y in (0, H - 1))]
        print(i, im.size, 'touches edge' if edge else 'ok')
        im.save(OUTDIR + f'{i}.png')
    contact_sheet([i for i in SPRITES if os.path.exists(OUTDIR + f'{i}.png')])
