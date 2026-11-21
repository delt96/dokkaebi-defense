"""b3-g4g5-grain-pottery-sea: unit sprites -> packages/client/public/sprites/<id>.png, sheet -> art/units/b3-g4g5-grain-pottery-sea-sheet.png"""
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


def sparks(s, pts):
    for k, (x, y) in enumerate(pts):
        if s.col[y][x] is None:
            s.c(x, y, s.colour('N' if k % 2 else 'Z'))


def lv(ramp, c, d):
    """Step colour c along its ramp by d."""
    R = RAMPS[ramp]
    i = R.index(c) if c in R else 2
    return R[max(0, min(4, i + d))]


# ======================================================================= grade 4

@sprite('dwiju', '뒤주', 4)
def dwiju(s):
    # rice chest standing high on four legs: the open space under the body is its tell
    s.rect(5, 10, 7, 23, ('pwood', 'post1', 'cyl', 3))
    s.rect(24, 10, 26, 23, ('pwood', 'post2', 'cyl', 2))
    s.rect(5, 24, 6, 29, ('pwood', 'leg1', 'flat', 2))
    s.rect(25, 24, 26, 29, ('pwood', 'leg2', 'flat', 1))
    s.rect(8, 10, 23, 12, ('pwood', 'rail', 'flat', 3))
    s.rect(8, 13, 23, 20, ('pwood', 'panel', 'flat', 2))
    s.rect(8, 21, 23, 22, ('pwood', 'rail2', 'flat', 2))
    # lid propped half open, hinged at the back right
    s.poly([(4, 7), (20, 2), (22, 4), (6, 9)], ('pwood', 'lid', 'flat', 3))
    # rice heaped under the lid
    s.ellipse(15, 9, 8, 2, ('hanji', 'rice', 'sphere', 3))
    s.shade()
    recolour(s, 'panel', lambda x, y, c: lv('pwood', c, -1) if (y in (15, 18) and x % 5) else None)
    # glow from inside the chest
    s.stamp(8, 8, ['Z.N.Z'])
    # iron fittings: corner brackets and the central lock plate
    for x0 in (5, 24):
        s.stamp(x0, 10, ['iii', 'i..', 'i..'], {'i': 'iron:3'})
        s.stamp(x0, 21, ['i..', 'iii'], {'i': 'iron:2'})
    s.rect(13, 14, 18, 20, ('iron', 'plate', 'flat', 3)); s.shade()
    s.stamp(13, 14, ['h....h', '......', '......', '......', '......', '......', 'h....h'], {'h': 'iron:1'})
    # face: brows and bulging eyes over the plate, the lock is the nose, clenched teeth on the rail
    s.stamp(8, 12, [
        '.oo........oo..',
        'oWWo......oWWo.',
        'oWoo......ooWo.',
        '.oo........oo..',
    ])
    s.stamp(14, 16, ['oYYo', 'oyyo', '.oo.'])
    s.stamp(10, 21, ['oWoWoWoWoWo', '.ooooooooo.'])
    # grains overflowing the front rail
    s.stamp(9, 10, ['wwww', '.v.w', '....'], {'w': 'hanji:4', 'v': 'hanji:3'})
    s.outline()
    sparks(s, [(26, 3), (16, 1), (28, 6)])
    s.flame(22, 9)


@sprite('tteongme', '떡메', 4)
def tteongme(s):
    # long handle down to the left
    club(s, 15, 18, 8, 28, [1.5, 1.6, 1.7], ('wood', 'handle', 'cyl', 3))
    # thick log head lying across, end grain toward the viewer on the left
    s.rect(7, 9, 26, 18, ('wood', 'head', 'cylv', 2))
    s.ellipse(6.5, 13.5, 2.5, 5, ('wood', 'end', 'flat', 3))
    s.shade()
    s.stamp(5, 10, ['.ss.', 's..s', 's.s.', 's..s', 's.s.', 's..s', '.ss.'], {'s': 'wood:2'})
    recolour(s, 'head', lambda x, y, c: lv('wood', c, -1) if (y == 12 and x % 6 not in (0, 1)) or (y == 16 and x % 7 in (2, 3, 4)) else None)
    # iron band on the handle near the head, cloth wrap at the grip
    s.stamp(12, 20, ['.ii', 'iij', 'jj.'], {'i': 'iron:4', 'j': 'iron:2'})
    s.stamp(8, 25, ['.BB', 'BBb', 'Bb.'])
    # face on the head front: bulging eyes, heavy brows, big teeth
    s.stamp(11, 9, [
        'oo.....oo.',
        '.oWWo.oWWo',
        '.oWoo.ooWo',
        '..oo...oo.',
        '..........',
        '.ooooooo..',
        '.WoWoWoW..',
    ])
    # glowing split in the end grain
    s.stamp(7, 11, ['A', 'N', 'Z'])
    # white dough stuck on the striking face, sagging down
    s.stamp(20, 15, [
        'WWWWWWW',
        'WWWhWWW',
        '.WW.WWh',
        '.Wh..W.',
        '..h..h.',
    ], {'h': 'hanji:3'})
    s.outline()
    sparks(s, [(27, 6), (12, 4), (29, 10)])
    s.flame(19, 9)


@sprite('chaeban', '채반', 4)
def chaeban(s):
    # wide shallow woven tray seen from above, bamboo rim band in front
    s.ellipse(15.5, 16, 13, 5, ('straw', 'top', 'flat', 3))
    s.poly([(2, 16), (29, 16), (28, 20), (24, 23), (7, 23), (3, 20)], ('straw', 'band', 'cyl', 2))
    s.shade()
    # two clean weave rings on the top, cane stripes on the band
    def ring(x, y, c):
        d = math.hypot((x - 15.5) / 13, (y - 16) / 5)
        return RAMPS['straw'][2] if .5 < d < .62 or .82 < d < .9 else None
    recolour(s, 'top', ring)
    recolour(s, 'band', lambda x, y, c: lv('straw', c, -1) if x % 3 == 0 else None)
    for x in range(3, 29):
        y = 16 + round(5 * math.sqrt(max(0, 1 - ((x - 15.5) / 13.5) ** 2)))
        if s.mat[y][x]:
            s.c(x, y, RAMPS['bamboo'][4 if x < 16 else 3])
    # dried greens heaped in the middle, three stems hanging over the front
    s.stamp(8, 10, [
        '....gG.Gg.d....',
        '..gGGdGGgGdGg..',
        '.dGgGGdGgGGgGd.',
        'gGGdgGGGdgGGdgG',
        '.gG.dG.gG..Gd..',
    ], {'G': 'leaf:4', 'g': 'leaf:3', 'd': 'earth:3'})
    s.stamp(10, 15, ['G', 'g', 'G', 'g', 'g', 'G', 'g'], {'G': 'leaf:4', 'g': 'leaf:3'})
    s.stamp(20, 15, ['d', 'd', 'g', 'G', 'g'], {'G': 'leaf:4', 'g': 'leaf:3', 'd': 'earth:3'})
    s.stamp(15, 15, ['g', 'G'], {'G': 'leaf:4', 'g': 'leaf:3'})
    # face on the band: brows and eyes at the sides, mouth between the stems
    s.stamp(4, 17, [
        'oo................oo',
        '.oWWo...........oWWo',
        '.oWoo...........ooWo',
        '..oo.............oo.',
    ])
    s.stamp(13, 19, ['ooooo', 'oKWKo', '.ooo.'])
    # burst weave: a broken gap on the right of the band, one cane sprung loose
    s.stamp(25, 20, ['-', '-'])
    s.c(26, 21, None); s.c(25, 22, RAMPS['straw'][1])
    s.outline()
    sparks(s, [(4, 9), (27, 8), (24, 4)])
    s.stamp(13, 14, ['N...Z'])
    s.flame(16, 10)


@sprite('sokuri', '소쿠리', 4)
def sokuri(s):
    # deep round bamboo basket
    s.ellipse(15.5, 14, 11, 3.5, ('bamboo', 'mouth', 'flat', 1))
    s.poly([(4, 14), (27, 14), (26, 19), (23, 24), (19, 26), (12, 26), (8, 24), (5, 19)], ('bamboo', 'body', 'cyl', 3))
    s.shade()
    # woven rows: a dark weft every third row, upright ribs every fourth column
    def weave(x, y, c):
        if y % 3 == 1:
            return lv('bamboo', c, -1)
        if x % 4 == 0 and y > 17:
            return lv('bamboo', c, -1)
        return None
    recolour(s, 'body', weave)
    # wet grain heaped in the mouth
    s.ellipse(15.5, 12.5, 8, 3, ('hanji', 'grain', 'sphere', 2))
    s.shade()
    for x, y in [(11, 11), (17, 10), (20, 12), (14, 13)]:
        s.c(x, y, RAMPS['blue'][4])
    # thick rim cane; the right half is a darker patched hoop tied in red
    for x in range(4, 28):
        y = 14 + round(3.5 * math.sqrt(max(0, 1 - ((x - 15.5) / 11.5) ** 2)))
        patch = 18 <= x <= 25
        top = RAMPS['wood'][3] if patch else RAMPS['bamboo'][4 if x < 12 else 3]
        bot = RAMPS['wood'][2] if patch else RAMPS['bamboo'][2]
        if s.mat[y][x]:
            s.c(x, y, top)
        if s.mat[y + 1][x]:
            s.c(x, y + 1, bot)
    s.stamp(18, 16, ['R', 'r'])
    s.stamp(25, 15, ['R', 'r'])
    # face on the front: brows and eyes under the rim, small mouth
    s.stamp(8, 18, [
        'oo.......oo.',
        '.oWWo..oWWo.',
        '.oWoo..ooWo.',
        '..oo....oo..',
        '............',
        '....oKKo....',
        '.....oo.....',
    ])
    s.outline()
    # water dripping from the bottom
    s.c(20, 26, SINGLE['B'])
    s.stamp(10, 27, ['B', 'b'])
    sparks(s, [(26, 8), (7, 8), (24, 4)])
    s.flame(15, 11)


@sprite('maetdol', '맷돌', 4)
def maetdol(s):
    # lower stone: wide short drum
    s.rect(3, 22, 28, 26, ('stone', 'low', 'cyl', 2))
    s.ellipse(15.5, 26, 12.5, 2.5, ('stone', 'low', 'cyl', 2))
    s.ellipse(15.5, 22, 12.5, 3, ('stone', 'low_top', 'flat', 3))
    # upper stone: narrower drum
    s.rect(7, 13, 24, 20, ('stone', 'up', 'cyl', 3))
    s.ellipse(15.5, 20, 8.5, 1.6, ('stone', 'up', 'cyl', 3))
    s.ellipse(15.5, 13, 8.5, 2.5, ('stone', 'up_top', 'flat', 3))
    # wooden handle (어처구니) out of the side, bent upward
    s.rect(25, 16, 26, 17, ('wood', 'peg', 'flat', 3))
    s.rect(26, 8, 28, 15, ('wood', 'grip', 'cyl', 3))
    s.shade()
    for name in ('up', 'low'):
        recolour(s, name, lambda x, y, c: lv('stone', c, -1) if (x * 7 + y * 13) % 17 == 0 else None)
    # feed hole with beans
    s.stamp(13, 12, ['.oooo.', 'oyANyo', '.oooo.'])
    s.c(17, 11, RAMPS['earth'][4]); s.c(14, 11, RAMPS['earth'][3])
    # face: eyes on the upper drum; the seam between the stones is the grinning mouth
    s.stamp(8, 14, [
        'oo........oo',
        '.oWWo..oWWo.',
        '.oWoo..ooWo.',
        '..oo....oo..',
    ])
    s.stamp(8, 20, ['oooooooooooooooo', 'oKWKKWKKWKKWKKKo', '.oooooooooooooo.'])
    # flour spilling out of the seam onto the lower stone
    for x, y in [(5, 22), (6, 23), (4, 23), (25, 22), (26, 23), (24, 24)]:
        s.c(x, y, RAMPS['hanji'][4 if y == 22 else 3])
    # a crack bound with an iron cramp
    s.stamp(20, 24, ['.ii', 'iio'], {'i': 'iron:3'})
    # straw rope wound on the grip
    s.stamp(26, 12, ['uvu', 'tut'], L)
    s.outline()
    sparks(s, [(10, 6), (23, 4), (6, 9)])
    s.flame(16, 12)


@sprite('jige', '지게', 4)
def jige(s):
    # A-frame: two long poles leaning in toward the top, tips standing above the bars
    s.line(10, 4, 6, 28, ('wood', 'pole1', 'flat', 3), 2)
    s.line(20, 4, 23, 28, ('wood', 'pole2', 'flat', 2), 2)
    # forked branches (가지) sticking out and up
    s.line(7, 22, 2, 16, ('wood', 'fork1', 'flat', 3), 2)
    s.line(23, 22, 27, 16, ('wood', 'fork2', 'flat', 2), 2)
    # cross bars (세장) with open gaps between them
    s.rect(10, 8, 21, 9, ('wood', 'bar1', 'flat', 3))
    s.rect(9, 12, 22, 13, ('wood', 'bar2', 'flat', 3))
    # folded mat strapped on as the backrest
    s.rect(8, 16, 22, 25, ('straw', 'mat', 'cylv', 3))
    s.shade()
    recolour(s, 'mat', lambda x, y, c: lv('straw', c, -1) if (x + (y // 2) * 2) % 4 == 0 and y < 20 else None)
    for x in range(8, 23):
        s.c(x, 21, RAMPS['straw'][1]); s.c(x, 25, RAMPS['straw'][1])
    for y in range(16, 26):
        s.c(8, y, RAMPS['straw'][2])
    # face on the mat just above the forks, grin along the fold
    s.stamp(9, 16, [
        'oo..........',
        '.oWWo...oWWo',
        '.oWoo...ooWo',
        '..oo.....oo.',
    ])
    s.c(21, 16, SINGLE['o']); s.c(20, 16, SINGLE['o'])
    s.stamp(11, 21, ['ooooooooo', 'oWKWKWKWo', '.ooooooo.'])
    # straw shoulder strap hanging loose off the left pole
    s.stamp(9, 14, ['v', 'u', 't'], L)
    # prop stick leaning on the right fork, frayed indigo rag on it
    s.line(28, 28, 27, 13, ('wood', 'stick', 'flat', 3), 2)
    s.shade()
    s.stamp(27, 23, ['BB', 'Bb'])
    # ember glowing in the gap between the bars
    s.stamp(14, 10, ['.NZ.', 'ZNNZ'])
    s.outline()
    sparks(s, [(4, 9), (26, 6), (25, 3)])
    s.flame(15, 9)


# ======================================================================= grade 5

@sprite('maksabal', '막사발', 5)
def maksabal(s):
    # rough grey-white bowl on a low foot
    s.ellipse(15.5, 15, 13, 3.5, ('porc', 'inside', 'flat', 2))
    s.poly([(2, 15), (29, 15), (27, 21), (23, 25), (19, 26), (12, 26), (8, 25), (4, 21)], ('porc', 'body', 'cyl', 3))
    s.poly([(11, 26), (20, 26), (21, 29), (10, 29)], ('stone', 'foot', 'cyl', 2))
    s.shade()
    # glaze pooled in the well
    s.ellipse(15.5, 15.5, 6, 1.2, ('glaze', 'well', 'none', 3)); s.shade()
    s.c(12, 15, RAMPS['glaze'][4])
    # bare clay near the foot, thick white glaze runs coming down over it at the sides
    recolour(s, 'body', lambda x, y, c: RAMPS['stone'][3 if x < 16 else 2] if y >= 23 else None)
    for x0, n in [(6, 3), (8, 4), (22, 4), (24, 3)]:
        for k in range(n):
            y = 21 + k
            if s.mat[y][x0] and s.mat[y][x0][1] == 'body':
                s.c(x0, y, RAMPS['porc'][4 if x0 < 16 else 3])
    # rim band and a brass gleam along the lip
    for x in range(3, 29):
        y = 15 + round(3.5 * math.sqrt(max(0, 1 - ((x - 15.5) / 13.5) ** 2)))
        if s.mat[y][x]:
            s.c(x, y, RAMPS['porc'][4] if x < 16 else RAMPS['porc'][3])
    for x, y in [(5, 17), (6, 17), (7, 18), (24, 18)]:
        s.c(x, y, RAMPS['brass'][4] if x < 16 else RAMPS['brass'][3])
    # chipped lip on the right
    s.c(26, 15, None); s.c(27, 15, None); s.c(26, 16, None); s.c(25, 15, RAMPS['stone'][2]); s.c(27, 16, RAMPS['stone'][2])
    # thumb print of the potter
    s.stamp(20, 22, ['pp', '.p'], {'p': 'porc:1'})
    # hahoe-mask smile: crescent eyes and a wide grin
    s.stamp(8, 18, [
        '.ooo.....ooo.',
        'o...o...o...o',
        '.............',
        '...oKKKKKo...',
        '....oWWWo....',
    ])
    s.outline()
    sparks(s, [(5, 9), (26, 8), (28, 12), (3, 12)])
    s.flame(15, 14)


@sprite('yaktanggi', '약탕기', 5)
def yaktanggi(s):
    # round pot with a straight side handle and a short spout opposite
    s.line(6, 19, 3, 15, ('onggi', 'spout', 'flat', 3), 2)
    s.ellipse(14, 21, 9, 7, ('onggi', 'body', 'sphere', 3))
    s.rect(9, 12, 18, 14, ('onggi', 'neck', 'cyl', 3))
    club(s, 22, 19, 29, 15, [1.6, 1.4, 1.5], ('wood', 'handle', 'cyl', 3))
    # hanji cap over the mouth, folds hanging down
    s.ellipse(13.5, 11, 6, 2, ('hanji', 'cap', 'flat', 3))
    s.poly([(7, 11), (20, 11), (20, 14), (18, 13), (16, 14), (13, 13), (11, 14), (9, 13), (7, 14)], ('hanji', 'skirt', 'flat', 2))
    s.shade()
    # string tied around the neck, red ends
    for x in range(7, 21):
        s.c(x, 14, SINGLE['R'] if x % 2 else SINGLE['r'])
    s.stamp(19, 15, ['R', '.R'])
    # glaze shine and a brass ring on the handle
    for x, y in [(8, 17), (7, 18), (7, 19)]:
        s.c(x, y, RAMPS['onggi'][4])
    s.stamp(23, 17, ['YY', 'yy'])
    s.c(3, 15, RAMPS['onggi'][4]); s.c(4, 15, RAMPS['onggi'][3])
    # soot on the bottom
    recolour(s, 'body', lambda x, y, c: RAMPS['char'][3 if (x + y) % 3 else 2] if y >= 25 else None)
    # face on the belly
    s.stamp(8, 18, [
        'oo....oo..',
        '.WWo.oWW..',
        '.Woo.ooW..',
        '..........',
        '..oKKKo...',
        '...oWo....',
    ])
    s.outline()
    # medicine steam drifting up to the right
    s.stamp(20, 7, ['.w', 'wv'], {'w': 'hanji:4', 'v': 'hanji:3'})
    s.stamp(23, 3, ['.ww', 'wwv', '.v.'], {'w': 'hanji:4', 'v': 'hanji:3'})
    sparks(s, [(4, 9), (3, 13), (18, 2)])
    s.flame(12, 10)


@sprite('tteoksiru', '떡시루', 5)
def tteoksiru(s):
    # big wide steamer, tapering to the foot
    s.ellipse(15.5, 12, 10.5, 2.5, ('glaze', 'mouth', 'flat', 1))
    s.poly([(5, 12), (26, 12), (24, 20), (22, 26), (9, 26), (7, 20)], ('onggi', 'body', 'cyl', 3))
    s.rect(9, 26, 22, 28, ('onggi', 'foot', 'cyl', 2))
    # flat lug tabs on both sides
    s.rect(3, 16, 5, 17, ('onggi', 'lug1', 'flat', 3))
    s.rect(26, 16, 28, 17, ('onggi', 'lug2', 'flat', 2))
    s.shade()
    # one incised band low on the body with a row of stamped holes
    recolour(s, 'body', lambda x, y, c: lv('onggi', c, -1) if y == 24 else None)
    for x in range(10, 22, 3):
        s.c(x, 25, SINGLE['o']); s.c(x + 1, 25, SINGLE['o']); s.c(x, 24, RAMPS['onggi'][4])
    # white dough seal (시루번) pressed along the rim
    for x in range(5, 27):
        y = 12 + round(2.5 * math.sqrt(max(0, 1 - ((x - 15.5) / 11) ** 2)))
        s.c(x, y, SINGLE['W']); s.c(x, y + 1, RAMPS['hanji'][3] if x % 3 else SINGLE['W'])
    # brass clamp on the right lug
    s.c(27, 16, RAMPS['brass'][4]); s.c(27, 17, RAMPS['brass'][3])
    # pierced holes: the two big ones are the eyes
    s.stamp(8, 17, [
        'ooo.......ooo',
        'oWWo.....oWWo',
        'oWoo.....ooWo',
        '.oo.......oo.',
        '.............',
        '...oKKKKKo...',
        '....oWoWo....',
    ])
    # a mended crack
    s.stamp(21, 20, ['.i', 'i.', '.i'], {'i': 'iron:4'})
    s.outline()
    # one soft cloud of steam billowing off the right of the rim, sitting on it
    s.stamp(21, 5, ['..www..', '.wwwww.', 'wwwvwww', 'wwvvvww', '.wvvvw.', '..vvv..', '...v...'], {'w': 'hanji:4', 'v': 'hanji:3'})
    sparks(s, [(9, 4), (5, 7), (29, 12)])
    s.flame(15, 11)


@sprite('yeotpan', '엿판', 5)
def yeotpan(s):
    # flat wooden tray in 3/4: top face then the deep front edge
    s.rect(3, 19, 28, 21, ('wood', 'top', 'flat', 3))
    s.rect(3, 22, 28, 28, ('wood', 'front', 'cylv', 2))
    s.shade()
    # stacked amber taffy sticks, each a bar with a dark gap from its neighbours
    s.stamp(4, 12, [
        '......oooooooo......',
        '.....oaaaaoaaaao....',
        '.....obbbboybbbo....',
        '...oooooooooooooo...',
        '...oaaaaoaaaaoaaao..',
        '...obbbbobbbbobbbo..',
        '.oooooooooooooooooo.',
        '.oaaaaaoaaaaaoaaaaao',
        '.obbbbboybbbbobbbbbo',
    ], {'a': 'gourd:4', 'b': 'gourd:2', 'y': 'gourd:3'})
    for x, y in [(11, 13), (8, 16), (13, 19), (20, 16)]:
        s.c(x, y, RAMPS['hanji'][4])
    # taffy sagging over the front edge
    s.stamp(6, 21, ['b', 'a', 'b', 'b'], {'a': 'gourd:3', 'b': 'gourd:2'})
    # big taffy-seller scissors standing crossed at the right
    s.line(21, 18, 27, 6, ('iron', 'blade1', 'flat', 3), 1)
    s.line(27, 18, 21, 6, ('iron', 'blade2', 'flat', 3), 1)
    s.shade()
    recolour(s, 'blade1', lambda x, y, c: RAMPS['iron'][4] if y < 12 else RAMPS['iron'][2])
    recolour(s, 'blade2', lambda x, y, c: RAMPS['iron'][4] if y < 12 else RAMPS['iron'][2])
    s.c(24, 12, SINGLE['Y'])
    # brass corner fittings on the tray
    s.stamp(3, 22, ['YY', 'Y.'])
    s.stamp(27, 22, ['YY', '.y'])
    # face on the tray front
    s.stamp(9, 22, [
        'oo..........oo',
        '.oWWo....oWWo.',
        '.oWoo....ooWo.',
        '..oo......oo..',
        '....oKKKKo....',
        '.....oWWo.....',
    ])
    # a split plank bound with a strip of cloth
    s.stamp(24, 25, ['RR', 'rr'])
    s.outline()
    sparks(s, [(3, 8), (19, 4), (5, 11)])
    s.flame(12, 11)


@sprite('gireumteul', '기름틀', 5)
def gireumteul(s):
    # two posts under a cap block that carries the face
    s.rect(4, 12, 6, 29, ('wood', 'post1', 'cyl', 3))
    s.rect(11, 12, 13, 29, ('wood', 'post2', 'cyl', 2))
    s.rect(3, 6, 14, 11, ('pwood', 'cap', 'flat', 3))
    # long press beam out to the right
    s.poly([(4, 14), (29, 16), (29, 19), (4, 17)], ('wood', 'beam', 'cylv', 3))
    # stone weight on the far end
    s.ellipse(25, 12.5, 4, 3, ('stone', 'weight', 'sphere', 3))
    # press box under the beam and the oil bowl
    s.rect(16, 19, 22, 23, ('pwood', 'block', 'flat', 2))
    s.ellipse(19, 27, 4.5, 2.5, ('onggi', 'bowl', 'sphere', 3))
    s.shade()
    s.stamp(16, 21, ['iiiiiii'], {'i': 'iron:3'})
    s.stamp(15, 25, ['.oooooo.', 'oYYYYYyo'])
    for y in range(24, 26):
        s.c(19, y, SINGLE['Y'] if y % 2 else RAMPS['brass'][4])
    # straw rope lashing the beam to the posts and slinging the stone
    s.stamp(4, 14, ['vut', 'tuv', 'vut'], L)
    s.stamp(11, 15, ['vut', 'tuv', 'vut'], L)
    s.stamp(23, 15, ['vu', 'ut'], L)
    # face on the cap
    s.stamp(3, 6, [
        'oo......oo..',
        '.oWWo.oWWo..',
        '.oWoo.ooWo..',
        '..oo...oo...',
        '....oKKKo...',
        '.....oWo....',
    ])
    s.outline()
    sparks(s, [(20, 6), (29, 4), (18, 10)])
    s.flame(25, 10)


@sprite('jejuheobeok', '제주 허벅', 5)
def jejuheobeok(s):
    # round-bellied water jar with a narrow neck
    s.ellipse(15, 21, 10, 8, ('onggi', 'belly', 'sphere', 3))
    s.rect(12, 9, 17, 13, ('onggi', 'neck', 'cyl', 3))
    s.rect(11, 7, 18, 8, ('onggi', 'lip', 'flat', 3))
    s.shade()
    s.rect(13, 7, 16, 7, ('char', 'hole', 'none', 1)); s.shade()
    # straw net cradling the lower belly, a rope round the shoulder
    for x, y in [(x, y) for y in range(24, 30) for x in range(4, 27)]:
        if s.mat[y][x] and s.mat[y][x][1] == 'belly' and ((x + y) % 4 == 0 or (x - y) % 4 == 0):
            s.c(x, y, RAMPS['straw'][3 if x < 15 else 2])
    for x in range(5, 26):
        y = 24 + (1 if x < 8 or x > 22 else 0)
        if s.mat[y][x]:
            s.c(x, y, RAMPS['straw'][4 if x < 14 else 3])
    for x in range(8, 23):
        y = 15 if 9 < x < 21 else 16
        s.c(x, y, RAMPS['straw'][4 if x < 14 else 3])
    # one carrying strap hanging loose on the left
    s.stamp(5, 16, ['v.', 'u.', '.u', 'vt', '.t', '.s', '.t'], L)
    s.stamp(4, 16, ['s', 't', 'u'], L)
    # face on the belly
    s.stamp(8, 17, [
        '.oo......oo.',
        'oWWo....oWWo',
        'oWoo....ooWo',
        '.oo......oo.',
        '............',
        '....oKKKo...',
        '.....oWo....',
    ])
    # indigo mend on the shoulder
    s.stamp(18, 18, ['BB', 'Bb'])
    s.outline()
    # water spilling from the mouth
    for x, y in [(10, 6), (9, 8), (9, 10), (19, 6)]:
        s.c(x, y, RAMPS['blue'][4 if y < 8 else 3])
    sparks(s, [(28, 4), (17, 4), (28, 10)])
    s.flame(23, 14)


@sprite('tewak', '테왁', 5)
def tewak(s):
    # orange gourd float
    s.ellipse(15.5, 14.5, 10, 7.5, ('gourd', 'gourd', 'sphere', 3))
    s.shade()
    recolour(s, 'gourd', lambda x, y, c: lv('gourd', c, -1) if x in (9, 22) and 9 < y < 21 else None)
    # rope handle on top
    s.stamp(15, 5, ['.uvvu.', 'u....u', 't....t'], L)
    # net bag of cord hanging below, shells inside
    s.poly([(8, 22), (23, 22), (21, 26), (18, 29), (13, 29), (10, 26)], ('shade', 'bag', 'none', 2))
    s.shade()
    for x, y in region(s, 'bag'):
        if (x + y) % 4 == 0 or (x - y) % 4 == 0:
            s.c(x, y, RAMPS['hanji'][2])
    s.stamp(10, 23, ['.pp.', 'pqqp', '.pq.'], {'p': 'porc:4', 'q': 'red:4'})
    s.stamp(16, 24, ['.pp', 'pqp', 'pp.'], {'p': 'porc:3', 'q': 'red:3'})
    s.stamp(8, 22, ['hhhhhhhhhhhhhhhh'], {'h': 'hanji:4'})
    # indigo patch tied over a crack
    s.stamp(21, 12, ['bB', 'BB', 'Bb'])
    # face on the gourd
    s.stamp(9, 12, [
        'oo.......oo.',
        '.oWWo..oWWo.',
        '.oWoo..ooWo.',
        '..oo....oo..',
        '............',
        '....oKKo....',
        '.....oo.....',
    ])
    s.outline()
    # bubbles around the float
    for x, y in [(3, 18), (4, 20), (2, 21), (28, 19), (27, 22), (29, 23)]:
        s.c(x, y, RAMPS['blue'][4] if (x + y) % 2 else RAMPS['porc'][4])
    sparks(s, [(4, 6), (24, 3), (16, 2)])
    s.flame(10, 8)


@sprite('geumulchu', '그물추', 5)
def geumulchu(s):
    # a hanging panel of net: bright hemp cords in a diamond mesh over dark gaps
    s.poly([(2, 5), (5, 3), (8, 5), (11, 2), (14, 4), (17, 2), (20, 5), (21, 14), (2, 14)], ('char', 'net', 'none', 1))
    s.shade()
    for x, y in region(s, 'net'):
        if (x + y) % 5 == 0 or (x - y) % 5 == 0:
            s.c(x, y, RAMPS['straw'][4 if y < 9 else 3])
    # thick lead rope along the foot of the net, running right across
    for x in range(2, 29):
        s.c(x, 14, RAMPS['straw'][4 if x % 2 else 3]); s.c(x, 15, RAMPS['straw'][2 if x % 2 else 1])
    # two little stone sinkers hanging off the rope on short strings
    for cx in (4, 26):
        s.c(cx, 16, RAMPS['straw'][2])
        s.ellipse(cx, 18.5, 1.5, 1.5, ('stone', f'small{cx}', 'sphere', 2))
    # the big sinker: a grey river stone hung on a cord from the rope
    s.rect(15, 16, 16, 17, ('straw', 'cord', 'flat', 3))
    s.ellipse(15.5, 23, 8, 5.5, ('stone', 'big', 'sphere', 3))
    s.shade()
    for y in (16, 17):
        s.c(15, y, RAMPS['straw'][4]); s.c(16, y, RAMPS['straw'][2])
    # rope bound round the stone's waist in its carved groove, knotted on top
    for x, y in region(s, 'big'):
        if y == 19:
            s.c(x, y, RAMPS['straw'][4 if x % 2 else 3])
        elif y == 20:
            s.c(x, y, RAMPS['straw'][2 if x % 2 else 1])
    s.stamp(14, 18, ['vwwv'], L)
    # face under the rope
    s.stamp(10, 21, [
        '.oWWo..oWWo.',
        '.oWoo..ooWo.',
        '..oo....oo..',
        '....oKKKo...',
        '.....oWo....',
    ])
    # a red marker tag on the rope
    s.stamp(9, 16, ['R', 'r'])
    s.outline()
    sparks(s, [(22, 3), (29, 4), (29, 9)])
    s.flame(25, 12)


@sprite('eomang', '어망', 5)
def eomang(s):
    # handle up to the right
    club(s, 23, 13, 29, 3, [1.3, 1.3], ('wood', 'handle', 'cyl', 3))
    # net bag hanging from the hoop
    s.poly([(4, 13), (25, 13), (23, 20), (19, 26), (15, 29), (11, 27), (7, 21)], ('char', 'bag', 'none', 2))
    s.shade()
    for x, y in region(s, 'bag'):
        if (x + y) % 4 == 0 or (x - y) % 4 == 0:
            s.c(x, y, RAMPS['hanji'][1 if x < 15 else 0])
    # wooden hoop: thick front rim, mesh seen inside the opening
    s.ellipse(14.5, 12, 11, 4, ('wood', 'hoop', 'flat', 3))
    s.ellipse(14.5, 10.8, 9, 2, ('shade', 'hoopin', 'none', 1))
    s.shade()
    for x, y in region(s, 'hoopin'):
        if (x + y) % 4 == 0:
            s.c(x, y, RAMPS['hanji'][0])
    # indigo fish caught in the bag, tail poking through the mesh
    s.ellipse(13, 22, 4.5, 2, ('blue', 'fish', 'sphere', 3))
    s.poly([(17, 22), (21, 19), (21, 25)], ('blue', 'tail', 'flat', 2))
    s.shade()
    s.c(10, 21, SINGLE['W']); s.c(10, 22, SINGLE['K'])
    s.stamp(12, 23, ['bb.b'])
    # red-thread mend on a torn corner
    s.stamp(7, 17, ['R.R', '.r.', 'R.R'])
    # face on the hoop rim
    s.stamp(6, 13, [
        '.oWWo...oWWo.',
        '.oWoo...ooWo.',
    ])
    s.stamp(12, 14, ['oKo'])
    # brass binding where the handle meets the hoop
    s.stamp(23, 11, ['Yy', 'yY'])
    s.outline()
    sparks(s, [(3, 6), (27, 12), (6, 3)])
    s.flame(14, 9)


@sprite('jipbae', '짚배', 5)
def jipbae(s):
    # straw-bundle hull: raised bow on the left, lower stern on the right
    s.poly([(4, 11), (7, 14), (11, 17), (26, 17), (29, 14), (29, 19), (26, 23), (9, 23), (5, 19), (4, 14)], ('straw', 'hull', 'cylv', 3))
    s.shade()
    recolour(s, 'hull', lambda x, y, c: lv('straw', c, -1) if y in (19, 21) and x % 4 else None)
    # rope bands (띠줄) round the bundles
    for xb in (9, 15, 21, 26):
        for y in range(10, 25):
            if s.mat[y][xb] and s.mat[y][xb][1] == 'hull':
                s.c(xb, y, RAMPS['wood'][2]); s.c(xb + 1, y, RAMPS['wood'][3] if y < 20 else RAMPS['wood'][1])
    # inside of the boat seen over the gunwale
    s.stamp(11, 17, ['iiiiiiiiiiiiiii'], {'i': 'straw:1'})
    # face on the side between bands
    s.stamp(11, 18, [
        'oo.........oo',
        '.oWWo...oWWo.',
        '.oWoo...ooWo.',
        '..oo.....oo..',
        '....oKKKKo...',
    ])
    # red-cloth patch on the stern
    s.stamp(27, 19, ['R', 'r'])
    s.outline()
    # water surface underneath, one continuous wave line wider than the hull
    s.stamp(2, 24, [
        '.ww...BB...ww...BB...ww...BB.',
        'BBbbBBbbBBBbbBBbbBBBbbBBbbBBB',
    ], {'w': 'porc:4'})
    sparks(s, [(10, 6), (12, 9), (2, 6)])
    # the little fire at the bow is the grade flame
    s.flame(6, 11)


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
