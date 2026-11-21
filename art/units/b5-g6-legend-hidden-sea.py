"""b5-g6-legend-hidden-sea: unit sprites -> packages/client/public/sprites/<id>.png, sheet -> art/units/b5-g6-legend-hidden-sea-sheet.png"""
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


# ======== batch helpers
HAIR = {'h': 'char:3', 'H': 'char:2', 'j': 'char:1'}          # hair
SK = lambda r: {'s': f'{r}:3', 'S': f'{r}:2', 'T': f'{r}:1'}   # skin tones for stamps


def region(s, name):
    return [(x, y) for y in range(s.h) for x in range(s.w) if s.mat[y][x] and s.mat[y][x][1] == name]


def recolor(s, names, fn):
    """fn(x, y) -> colour or None (keep)."""
    names = {names} if isinstance(names, str) else set(names)
    for y in range(s.h):
        for x in range(s.w):
            m = s.mat[y][x]
            if m and m[1] in names and s.col[y][x] is not None:
                c = fn(x, y)
                if c:
                    s.c(x, y, s.colour(c) if not c.startswith('#') else c)


def topglow(s, names, depth=1, x0=0, x1=31):
    """Flame-coloured reflection on the top 1-2 px of the named regions (6th grade)."""
    names = set(names)
    for x in range(x0, x1 + 1):
        for y in range(s.h):
            m = s.mat[y][x]
            if s.col[y][x] is not None and m and m[0] != '_':
                if m[1] in names:
                    for k in range(depth):
                        if y + k < s.h and s.mat[y + k][x] and s.mat[y + k][x][1] in names:
                            s.c(x, y + k, s.colour('N' if k == 0 else 'f:0'))
                break


def eyes(s, x, y, gap=2, brow=True):
    """Jangseung bulging eyes: brow, 2px whites, pupil turned inward."""
    g = '.' * gap
    rows = (['oo' + g + 'oo'] if brow else []) + ['WW' + g + 'WW', 'Wo' + g + 'oW']
    s.stamp(x, y, rows)


def sparks(s, pts):
    for i, (x, y) in enumerate(pts):
        s.c(x, y, s.colour('N' if i % 2 else 'Z'))


# ======================================================================= grade 6 legends

@sprite('bihyeongrang', '귀교 목수', 6)
def bihyeongrang(s):
    # tools behind the slab: ruler on the right hip, ink-line box on the left
    s.line(22, 24, 26, 29, ('wood', 'ruler', 'flat', 3), 2)
    s.rect(3, 24, 7, 27, ('wood', 'meoktong', 'flat', 3))
    # trousers, straw shoes
    s.poly([(8, 24), (22, 24), (22, 29), (16.5, 29), (15.5, 26.5), (14.5, 29), (8, 29)], ('hanji', 'pants', 'cyl', 2))
    s.rect(8, 29, 13, 30, ('straw', 'shoeL', 'flat', 2)); s.rect(17, 29, 22, 30, ('straw', 'shoeR', 'flat', 2))
    # jeogori and sleeves
    s.poly([(10, 14), (20, 14), (23, 21), (7, 21)], ('hanji', 'coat', 'flat', 3))
    s.line(9, 15, 6, 19, ('hanji', 'sleeveL', 'flat', 3), 2)
    s.line(20, 15, 23, 19, ('hanji', 'sleeveR', 'flat', 2), 2)
    # bridge stone hugged at the belly
    s.poly([(5, 21), (6, 20), (24, 20), (25, 21), (25, 25), (24, 26), (6, 26), (5, 25)], ('stone', 'slab', 'flat', 3))
    s.rect(4, 19, 7, 20, ('pwood', 'handL', 'flat', 3)); s.rect(23, 19, 26, 20, ('pwood', 'handR', 'flat', 3))
    # head
    s.rect(13, 12, 16, 14, ('pwood', 'neck', 'flat', 2))
    s.ellipse(14.5, 8.5, 4.5, 4.5, ('pwood', 'head', 'sphere', 3))
    s.c(9, 9, None); s.m(9, 9, ('pwood', 'ear', 'flat', 2)); s.m(20, 9, ('pwood', 'ear', 'flat', 2))
    s.shade()
    # hair and headband with tails blowing left
    s.stamp(10, 3, ['...hhhh...', '..hhhhhh..', '.hHhhhhHh.'], HAIR)
    s.stamp(10, 6, ['BBBBBBBBBB'])
    s.stamp(6, 5, ['b...', '.bBb', 'Bb..'])
    eyes(s, 11, 7, gap=2)
    s.stamp(12, 11, ['oWWWWo', '.oooo.'])
    # gold-edged collar and red ribbon
    s.line(17, 14, 13, 19, ('_', 'collar', 'flat', 0))
    for x, y in [(17, 14), (16, 15), (16, 16), (15, 17), (14, 18), (13, 19)]:
        s.c(x, y, s.colour('Y'))
    s.stamp(15, 18, ['R', 'r'])
    # chisel marks and moss on the slab
    for x, y in [(9, 22), (10, 23), (17, 22), (18, 23), (21, 24)]:
        s.c(x, y, RAMPS['stone'][1])
    s.c(7, 25, RAMPS['leaf'][3]); s.c(8, 25, RAMPS['leaf'][2])
    # ruler ticks, ink box line, patched knee, ankle ties
    for x, y in [(23, 25), (24, 27), (25, 28)]:
        s.c(x, y, RAMPS['char'][2])
    s.stamp(3, 24, ['KKKKK'])
    s.c(4, 25, s.colour('R'))
    s.stamp(18, 26, ['BB', 'Bb'])
    recolor(s, 'pants', lambda x, y: 'b' if y == 28 else None)
    topglow(s, {'head', 'coat', 'sleeveL', 'sleeveR'})
    s.outline()
    s.flame(26, 11)
    sparks(s, [(20, 4), (30, 13), (19, 7)])


@sprite('bangmangidokkaebi', '방망이 도깨비', 6)
def bangmangidokkaebi(s):
    # stubby legs and the round body
    s.rect(9, 27, 12, 29, ('earth', 'legL', 'flat', 3)); s.rect(15, 27, 18, 29, ('earth', 'legR', 'flat', 2))
    s.rect(8, 30, 12, 30, ('earth', 'footL', 'flat', 2)); s.rect(15, 30, 19, 30, ('earth', 'footR', 'flat', 2))
    s.ellipse(13.5, 22, 7.5, 4.5, ('earth', 'body', 'sphere', 3))
    # jambangi shorts
    s.poly([(6, 24), (21, 24), (21, 28), (15.5, 28), (13.5, 26), (12, 28), (6, 28)], ('hanji', 'shorts', 'cyl', 2))
    # left arm down, right arm raising the club
    s.line(7, 19, 5, 24, ('earth', 'armL', 'flat', 3), 2)
    s.ellipse(4.5, 25, 1.5, 1.5, ('earth', 'fistL', 'flat', 3))
    s.line(19, 20, 22, 16, ('earth', 'armR', 'flat', 2), 2)
    club(s, 22, 17, 25, 6, [1.0, 1.1, 2.2, 2.8, 2.5], ('pwood', 'club', 'cyl', 3))
    s.ellipse(27.5, 8, 1.2, 1.2, ('pwood', 'knob1', 'flat', 3))
    s.ellipse(22.5, 6, 1.2, 1.2, ('pwood', 'knob2', 'flat', 3))
    s.ellipse(22.5, 16.5, 1.6, 1.6, ('earth', 'fistR', 'flat', 3))
    # head
    s.ellipse(13.5, 15, 6, 4.5, ('earth', 'head', 'sphere', 3))
    s.shade()
    # shaggy mop of hair, fringe over the brow
    s.stamp(7, 10, [
        '...hhhhhhh...',
        '.hhhHhhhHhhh.',
        'hhHhhhhhhhhHh',
        'hhh.hh.hh.hhh',
        'hh.........hh',
        'h...........h',
    ], HAIR)
    eyes(s, 9, 13, gap=3, brow=False)
    s.stamp(9, 13, ['o.......o'])
    s.stamp(10, 16, ['ooooooo', 'oWKWKWo', '.ooooo.'])
    # birch club: worn shine, cloth-wrapped grip
    for x, y in [(23, 9), (23, 10), (24, 8)]:
        s.c(x, y, RAMPS['pwood'][4])
    s.stamp(22, 14, ['.R', 'Rr'])
    # patch on the shorts, rope belt with a gold knot
    s.stamp(16, 25, ['BB', 'bB'])
    recolor(s, 'shorts', lambda x, y: (L['v'] if x % 2 else L['t']) if y == 24 else None)
    s.stamp(12, 24, ['YY'])
    topglow(s, {'club', 'knob1', 'knob2'})
    s.outline()
    # gold nugget and coins falling from the club
    s.stamp(25, 12, ['.yY.', 'yYoY', 'YoYy', '.Yy.'])
    s.stamp(26, 18, ['YY', 'Yy'])
    s.stamp(24, 22, ['yY', 'Yo'])
    s.outline()
    s.flame(13, 11)
    sparks(s, [(28, 11), (25, 20), (6, 5)])


@sprite('gamtudokkaebi', '감투 도깨비', 6)
def gamtudokkaebi(s):
    # half-vanished shadow in a ragged cloak
    s.poly([(9, 17), (22, 17), (25, 21), (28, 28), (24, 26), (21, 29), (19, 26), (16, 29), (14, 26), (11, 29), (8, 26), (4, 28), (6, 21)], ('shade', 'body', 'sphere', 3))
    # one claw reaching out, the other pressing the brim down
    s.line(7, 19, 3, 22, ('shade', 'armL', 'flat', 3), 2)
    s.line(23, 19, 24, 15, ('shade', 'armR', 'flat', 2), 2)
    # gamtu pressed down
    s.poly([(11, 9), (20, 9), (22, 12), (22, 16), (9, 16), (9, 12)], ('char', 'gamtu', 'shine', 3))
    s.rect(8, 15, 23, 16, ('brass', 'band', 'flat', 3))
    s.rect(10, 17, 21, 19, ('shade', 'face', 'none', 1))
    s.shade()
    # horsehair weave
    recolor(s, 'gamtu', lambda x, y: ('char:4' if (x + y) % 3 == 0 and y < 12 else ('char:1' if x % 3 == 0 and y > 11 else None)))
    # burnt spot mended with red cloth, white stitches
    s.stamp(17, 10, ['.RR', 'RRr', 'Rrr'])
    s.c(16, 10, SINGLE['W']); s.c(16, 12, SINGLE['W'])
    # claws
    s.stamp(23, 13, ['ll', 'lP'], {'l': 'shade:4', 'P': 'l'})
    s.stamp(1, 21, ['l.l', 'lll', '.l.'], {'l': 'shade:4'})
    # glowing eyes and a thin grin in the shadow under the brim
    s.stamp(10, 17, ['.ZZZ..ZZZ.', '.ZXo..oXZ.', '...WoWoW..'])
    # the lower body fades out
    recolor(s, 'body', lambda x, y: 'shade:1' if y >= 25 else ('shade:2' if y >= 23 else None))
    topglow(s, {'gamtu'})
    s.outline()
    rim(s, SINGLE['L'], ok=set(RAMPS['shade'][2:]))
    s.flame(15, 10)
    sparks(s, [(9, 5), (22, 7), (21, 3)])


@sprite('gimseobang', '김서방', 6)
def gimseobang(s):
    # net slung over the left shoulder, hanging down the back
    s.poly([(10, 14), (7, 15), (4, 20), (3, 26), (5, 28), (8, 26), (9, 20)], ('straw', 'net', 'flat', 3))
    # legs: bare shins, rolled indigo trousers
    s.rect(9, 26, 11, 27, ('onggi', 'shinL', 'flat', 3)); s.rect(16, 26, 18, 27, ('onggi', 'shinR', 'flat', 2))
    s.rect(8, 28, 12, 29, ('straw', 'shoeL', 'flat', 2)); s.rect(15, 28, 19, 29, ('straw', 'shoeR', 'flat', 2))
    s.poly([(8, 21), (20, 21), (20, 25), (15.5, 25), (14, 23.5), (12.5, 25), (8, 25)], ('blue', 'pants', 'cyl', 3))
    s.rect(8, 25, 12, 25, ('hanji', 'cuffL', 'flat', 3)); s.rect(15, 25, 20, 25, ('hanji', 'cuffR', 'flat', 3))
    # jeogori
    s.poly([(9, 15), (19, 15), (20, 21), (8, 21)], ('hanji', 'coat', 'flat', 3))
    s.line(10, 16, 11, 20, ('hanji', 'sleeveL', 'flat', 2), 2)
    s.line(19, 16, 20, 20, ('hanji', 'sleeveR', 'flat', 2), 2)
    # basket of fish on the right hip
    s.poly([(18, 21), (29, 21), (28, 24), (26, 26), (21, 26), (19, 24)], ('bamboo', 'basket', 'cyl', 3))
    s.poly([(20, 16), (23, 19), (22, 21), (20, 21)], ('porc', 'fish1', 'flat', 3))
    s.poly([(23, 21), (25, 17), (28, 16), (28, 18), (26, 21)], ('blue', 'fish2', 'flat', 3))
    s.rect(11, 19, 12, 20, ('onggi', 'handL', 'flat', 3)); s.rect(20, 21, 21, 22, ('onggi', 'handR', 'flat', 3))
    # head and paeraengi
    s.ellipse(13.5, 12, 4.5, 3.5, ('onggi', 'head', 'sphere', 3))
    s.poly([(10, 7), (17, 7), (16, 3), (11, 3)], ('bamboo', 'crown', 'cyl', 3))
    s.ellipse(13.5, 7.5, 8, 1, ('bamboo', 'brim', 'flat', 3))
    s.shade()
    # net mesh, sinkers along the hem
    recolor(s, 'net', lambda x, y: 'straw:1' if (x + y) % 3 == 0 or (x - y) % 3 == 0 else None)
    for x, y in [(4, 26), (5, 27), (7, 26), (4, 23)]:
        s.c(x, y, RAMPS['stone'][3])
    s.line(18, 15, 9, 21, ('_', 'strap', 'flat', 0))
    for x, y in [(18, 15), (17, 16), (16, 16), (15, 17), (14, 18), (13, 18), (12, 19)]:
        s.c(x, y, s.colour(L['u']))
    # hat: woven bands and a red cord, gold bead
    recolor(s, 'crown', lambda x, y: 'bamboo:1' if y == 5 else None)
    s.stamp(17, 8, ['R', 'r'])
    s.c(16, 6, s.colour('Y'))
    eyes(s, 10, 10, gap=3, brow=True)
    s.stamp(12, 13, ['oKKo'])
    # basket weave and fish eyes
    recolor(s, 'basket', lambda x, y: 'bamboo:1' if (x + y) % 3 == 0 else None)
    s.c(21, 17, SINGLE['o']); s.c(27, 17, SINGLE['W'])
    # patched knee
    s.stamp(9, 23, ['RR'])
    topglow(s, {'crown', 'brim'})
    s.outline()
    s.flame(26, 10)
    sparks(s, [(20, 4), (30, 12)])


@sprite('oedaridokkaebi', '외다리 도깨비', 6)
def oedaridokkaebi(s):
    sk = 'onggi'
    # single leg and bare foot
    s.rect(12, 25, 17, 27, (sk, 'leg', 'cyl', 3))
    s.poly([(10, 30), (11, 28), (18, 28), (20, 30)], (sk, 'foot', 'flat', 3))
    # shorts and torso
    s.poly([(9, 21), (20, 21), (19, 25), (10, 25)], ('hanji', 'shorts', 'cyl', 3))
    s.poly([(8, 13), (21, 13), (20, 21), (9, 21)], (sk, 'torso', 'cyl', 3))
    # arms spread wide, forearms up to grab
    s.line(8, 14, 4, 19, (sk, 'armL', 'flat', 3), 2)
    s.line(4, 19, 3, 14, (sk, 'armL', 'flat', 3), 2)
    s.line(20, 14, 25, 19, (sk, 'armR', 'flat', 2), 2)
    s.line(25, 19, 27, 14, (sk, 'armR', 'flat', 2), 2)
    s.rect(2, 12, 4, 13, (sk, 'handL', 'flat', 3)); s.rect(27, 12, 29, 13, (sk, 'handR', 'flat', 3))
    # head
    s.ellipse(14.5, 8.5, 4.5, 4, (sk, 'head', 'sphere', 3))
    s.shade()
    # sangtu topknot with a gold pin
    s.stamp(10, 3, ['...hh....', '..hhhh...', 'hhhhhhhhh'], HAIR)
    s.stamp(11, 2, ['.YhhY'], HAIR)
    eyes(s, 11, 7, gap=2)
    s.stamp(12, 10, ['oWKWo', '.ooo.'])
    # chest and belly lines
    for y in range(15, 19):
        s.c(14, y, RAMPS[sk][1])
    s.c(14, 19, RAMPS[sk][1])
    # fingers
    s.c(2, 11, RAMPS[sk][3]); s.c(4, 11, RAMPS[sk][3]); s.c(27, 11, RAMPS[sk][2]); s.c(29, 11, RAMPS[sk][2])
    s.c(3, 11, None); s.c(28, 11, None)
    # red satba around waist and thigh, gold knot
    s.stamp(9, 21, ['RRRRRRRRRRRR', 'rrrrrrrrrrrr'])
    s.stamp(11, 23, ['R', 'Rr', '.RR', '.RRRRRR', '.rrrrrr'])
    s.stamp(17, 21, ['YY'])
    # toes, wristbands
    s.stamp(11, 29, ['o.o.o.o.o'])
    s.stamp(3, 15, ['Y']); s.stamp(26, 15, ['Y'])
    # scar
    s.stamp(18, 15, ['o', '.o'])
    topglow(s, {'torso', 'armL', 'armR'})
    s.outline()
    s.flame(25, 10)
    sparks(s, [(20, 6), (30, 13), (8, 2)])


@sprite('jejuyeonggam', '제주 영감', 6)
def jejuyeonggam(s):
    # robe and black shoes
    s.rect(7, 29, 10, 29, ('char', 'shoeL', 'flat', 3)); s.rect(14, 29, 17, 29, ('char', 'shoeR', 'flat', 3))
    s.poly([(7, 15), (18, 15), (21, 29), (4, 29)], ('earth', 'robe', 'flat', 3))
    s.line(7, 16, 6, 21, ('earth', 'sleeveL', 'flat', 3), 2)
    s.line(18, 16, 19, 21, ('earth', 'sleeveR', 'flat', 2), 2)
    # small drum lying on its side at the hip
    s.rect(19, 22, 24, 26, ('red', 'drum', 'cyl', 3))
    s.rect(18, 22, 18, 26, ('hanji', 'headL', 'flat', 3)); s.rect(25, 22, 25, 26, ('hanji', 'headR', 'flat', 2))
    # little straw boat held up in both hands, bow raised to the left
    s.poly([(2, 15), (4, 15), (7, 18), (18, 18), (21, 16), (23, 15), (22, 18), (19, 21), (7, 21), (4, 19)], ('straw', 'boat', 'flat', 3))
    s.rect(6, 21, 8, 22, ('pwood', 'handL', 'flat', 3)); s.rect(17, 21, 19, 22, ('pwood', 'handR', 'flat', 3))
    # head, beard, felt hat
    s.ellipse(12.5, 11.5, 4.5, 3.5, ('pwood', 'head', 'sphere', 3))
    s.ellipse(12.5, 5.5, 3.5, 2.5, ('char', 'crown', 'shine', 3))
    s.ellipse(12.5, 8, 7.5, 1, ('char', 'brim', 'shine', 3))
    s.shade()
    s.stamp(8, 12, [
        'w........w',
        'ww.oKKo.ww',
        '.wwwwwwww.',
        '..wwvwww..',
        '...wwww...',
    ], {'w': 'hanji:3', 'v': 'hanji:1'})
    eyes(s, 9, 9, gap=2, brow=False)
    # red tassel and gold bead on the hat, gold studs on the brim
    s.stamp(12, 2, ['RR', 'Rr', '.Y'])
    for x in range(6, 20, 3):
        s.c(x, 8, s.colour('y'))
    # boat weave, rim, and a tiny fire on the bow
    recolor(s, 'boat', lambda x, y: 'straw:1' if (x + y) % 3 == 0 and y > 18 else None)
    for x in range(6, 19):
        s.c(x, 18, s.colour(L['w']))
    s.stamp(1, 11, ['.A.', 'ANA', 'NZN', 'AXA'])
    # drum studs
    for x in (19, 21, 23):
        s.c(x, 22, s.colour('Y')); s.c(x + 1, 26, s.colour('Y'))
    s.stamp(20, 23, ['G.G', '.g.'])
    # patched robe
    s.stamp(8, 25, ['BB', 'Bb'])
    topglow(s, {'crown', 'brim'})
    s.outline()
    s.flame(25, 10)
    sparks(s, [(21, 5), (30, 13), (4, 9)])


@sprite('gildal', '길달', 6)
def gildal(s):
    # red gate pillar behind, on its stone base
    s.rect(6, 10, 10, 27, ('red', 'pillar', 'cyl', 3))
    # threshold beam
    s.rect(2, 28, 28, 29, ('wood', 'sill', 'flat', 3))
    s.poly([(2, 28), (28, 28), (28, 30), (2, 30)], ('wood', 'sill', 'flat', 3))
    # axe leaning by the right hand
    s.line(25, 11, 25, 27, ('wood', 'haft', 'flat', 3), 2)
    s.poly([(24, 9), (28, 7), (29, 10), (28, 14), (24, 12)], ('iron', 'axe', 'flat', 3))
    # danryeong robe
    s.poly([(13, 15), (22, 15), (24, 27), (11, 27)], ('blue', 'robe', 'flat', 3))
    s.line(13, 16, 11, 22, ('blue', 'sleeveL', 'flat', 3), 3)
    s.line(22, 16, 24, 19, ('blue', 'sleeveR', 'flat', 2), 2)
    s.rect(14, 27, 16, 27, ('char', 'bootL', 'flat', 3)); s.rect(19, 27, 21, 27, ('char', 'bootR', 'flat', 3))
    s.rect(24, 18, 26, 20, ('earth', 'hand', 'flat', 3))
    s.rect(10, 22, 12, 23, ('earth', 'hand2', 'flat', 3))
    # head and samo
    s.ellipse(17.5, 11.5, 4, 3.5, ('earth', 'head', 'sphere', 3))
    s.rect(14, 4, 21, 8, ('char', 'samo', 'shine', 3))
    s.ellipse(18, 4, 2.5, 1.5, ('char', 'samo', 'shine', 3))
    s.ellipse(12, 6, 1.5, 0.8, ('char', 'wingL', 'shine', 3))
    s.ellipse(23, 6, 1.5, 0.8, ('char', 'wingR', 'shine', 3))
    s.shade()
    # dancheong band on the pillar top, base stone
    s.stamp(6, 10, ['GGGGG', 'YYYYY', 'BBBBB'])
    s.stamp(5, 26, ['.....'])
    # round collar, rank badge, gold belt
    s.stamp(15, 15, ['WW..WW', '.WWWW.'])
    s.stamp(16, 17, ['YYYY', 'YGgY', 'YYYY'])
    for x in range(12, 24):
        s.c(x, 21 if 14 < x < 21 else 20, s.colour('Y' if x % 2 else 'y'))
    eyes(s, 15, 10, gap=1)
    s.stamp(16, 13, ['oooo'])
    # axe edge shine, nick in the blade; worn sill
    for y in range(8, 14):
        s.c(28 if 8 < y < 13 else 27, y, RAMPS['iron'][4])
    s.c(28, 10, None)
    for x in (5, 12, 19, 26):
        s.c(x, 29, RAMPS['wood'][1])
    topglow(s, {'samo', 'wingL', 'wingR', 'axe'})
    s.outline()
    s.flame(5, 10)
    sparks(s, [(11, 2), (12, 4)])


@sprite('duduri', '두두리', 6)
def duduri(s):
    # roots
    s.poly([(7, 30), (10, 26), (21, 26), (24, 30)], ('wood', 'root', 'flat', 2))
    # carved log
    s.rect(10, 11, 21, 28, ('wood', 'log', 'cyl', 3))
    s.ellipse(15.5, 11, 5.5, 3, ('wood', 'log', 'cyl', 3))
    s.rect(11, 12, 20, 22, ('pwood', 'face', 'sphere', 3))
    # axe gripped by a carved hand
    s.line(26, 9, 24, 27, ('wood', 'haft', 'flat', 3), 2)
    s.poly([(25, 8), (30, 6), (31, 9), (30, 13), (26, 12)], ('iron', 'axe', 'flat', 3))
    s.rect(21, 19, 25, 21, ('wood', 'arm', 'flat', 3))
    s.shade()
    # wood grain
    recolor(s, 'log', lambda x, y: 'wood:1' if (x in (12, 19) and y > 22) or (x == 15 and y > 24) else None)
    recolor(s, 'root', lambda x, y: 'wood:1' if x in (11, 15, 20) else None)
    # hahoe face: ink brows, crescent smiling eyes, grin over a loose chin
    s.stamp(11, 12, [
        '.KKK..KKK.',
        '..........',
        '.ooo..ooo.',
        'o...oo...o',
        '..........',
        '.o......o.',
        '..oWWWWo..',
        '...oooo...',
        'oooooooooo',
    ])
    s.c(15, 16, RAMPS['pwood'][4]); s.c(15, 17, RAMPS['pwood'][2])
    # 금줄 with five-colour strips
    for x in range(10, 22):
        s.c(x, 24, s.colour(L['v'] if x % 2 else L['t']))
    s.stamp(11, 25, ['B.R.Y.W.G', 'B.R.Y.W.G', '....Y....'])
    # crack and soot
    s.stamp(19, 25, ['o', 'o', '.o'])
    for y in range(9, 14):
        s.c(30 if 8 < y < 13 else 29, y, RAMPS['iron'][4])
    topglow(s, {'log'})
    s.outline()
    s.flame(15, 10)
    sparks(s, [(9, 6), (22, 4), (8, 2)])


@sprite('bitdondokkaebi', '빚 갚는 도깨비', 6)
def bitdondokkaebi(s):
    # money chest on the back
    s.rect(14, 10, 23, 16, ('pwood', 'chest', 'flat', 3))
    # long shabby durumagi
    s.poly([(6, 15), (16, 15), (19, 29), (3, 29)], ('hanji', 'coat', 'flat', 2))
    s.rect(5, 29, 8, 29, ('char', 'shoeL', 'flat', 3)); s.rect(13, 29, 16, 29, ('char', 'shoeR', 'flat', 3))
    # left hand: ledger
    s.line(6, 16, 5, 19, ('hanji', 'sleeveL', 'flat', 3), 2)
    s.rect(1, 18, 5, 23, ('blue', 'ledger', 'flat', 3))
    # right arm held out with the coin string
    s.line(15, 17, 21, 19, ('hanji', 'sleeveR', 'flat', 2), 2)
    s.rect(22, 18, 23, 20, ('earth', 'handR', 'flat', 3))
    s.rect(5, 20, 6, 21, ('earth', 'handL', 'flat', 3))
    # head
    s.ellipse(10, 11, 4.5, 4, ('earth', 'head', 'sphere', 3))
    s.shade()
    # topknot
    s.stamp(8, 5, ['.hh.', 'hHhh'], HAIR)
    s.stamp(6, 7, ['.hhhhhhh.'], HAIR)
    # sheepish crescent eyes, embarrassed grin
    s.stamp(6, 10, ['.oo...oo.', 'o..o.o..o', '.........', '..oWWWo..', '...ooo...'])
    # chest fittings and strap
    s.stamp(14, 10, ['YY......YY', 'Y........Y', '..........', '....YY....', '....Yo....', '..........', 'Y........Y'])
    s.stamp(14, 13, ['oooooooooo'])
    for x, y in [(16, 15), (15, 16), (14, 17)]:
        s.c(x, y, RAMPS['char'][3])
    # blue-bound ledger with its title slip
    s.stamp(1, 18, ['BBBBp', 'BWBbp', 'BWBbp', 'BWBbp', 'BBbbp', 'ppppp'], {'B': 'blue:3', 'b': 'blue:2', 'W': 'hanji:4', 'p': 'hanji:2'})
    # coat ribbon
    s.stamp(10, 17, ['RR', '.R', '.r'])
    # coin string hanging from the right hand
    s.stamp(22, 21, ['.R.', 'yYy', 'YoY', 'yYy', 'YoY', 'yYy', 'YoY', '.R.', 'RrR'])
    # patches and a torn hem
    s.stamp(13, 23, ['BB', 'Bb'])
    s.stamp(6, 25, ['RR'])
    for x in (4, 10, 17):
        s.c(x, 28, None)
    topglow(s, {'chest', 'head'})
    s.outline()
    s.flame(19, 10)
    sparks(s, [(13, 4), (25, 6), (26, 16)])


@sprite('gaetgilbuldokkaebi', '갯불 도깨비', 6)
def gaetgilbuldokkaebi(s):
    # ball of blue goblin-fire with a curling tail and flickering tongues
    s.poly([(10, 18), (21, 18), (20, 23), (17, 26), (13, 28), (9, 28), (12, 25), (12, 22)], ('blue', 'tail', 'shine', 3))
    s.ellipse(15.5, 15, 6.5, 5, ('blue', 'body', 'shine', 3))
    s.line(9, 18, 6, 20, ('blue', 'armL', 'flat', 3), 2)
    s.line(21, 18, 23, 20, ('blue', 'armR', 'flat', 2), 2)
    s.ellipse(15.5, 15.5, 4, 3, ('porc', 'core', 'shine', 3))
    # jojokdeung lantern hanging from the left hand
    s.line(5, 21, 5, 21, ('wood', 'handle', 'flat', 2))
    s.ellipse(4.5, 24, 3, 2.5, ('hanji', 'lantern', 'sphere', 3))
    # tewak float tied at the right hip
    s.ellipse(24, 23, 3.5, 3, ('gourd', 'tewak', 'sphere', 3))
    s.shade()
    # lantern ribs, brass cap, light falling from the open bottom
    recolor(s, 'lantern', lambda x, y: 'bamboo:2' if x in (3, 6) else None)
    s.stamp(3, 21, ['YYY'])
    s.stamp(2, 27, ['.NZN.', '..N..'])
    # ripples of the tidal channel at the feet
    s.stamp(6, 28, ['BBb..', '...bB'])
    s.stamp(18, 28, ['.BBb', 'bB..'])
    # straw rope belt and net on the tewak
    for x in range(11, 21):
        s.c(x, 19, s.colour(L['v'] if x % 2 else L['t']))
    recolor(s, 'tewak', lambda x, y: L['u'] if x == 24 or y == 23 else None)
    s.stamp(21, 19, ['vt'], L)
    # face on the pale hot core
    eyes(s, 13, 13, gap=2)
    s.stamp(14, 16, ['oKKo'])
    # brighter flicker inside the tail
    for x, y in [(15, 22), (14, 23), (13, 25), (16, 21)]:
        s.c(x, y, RAMPS['blue'][4])
    topglow(s, {'body', 'tongueL', 'tongueR'})
    s.outline()
    s.flame(15, 10)
    sparks(s, [(7, 6), (25, 5), (1, 28)])


# ======================================================================= hidden (tamed bosses)

@sprite('bulgasari', '쇠밥짐승', 6, hidden=True)
def bulgasari(s):
    # legs (far pair darker)
    s.rect(12, 23, 14, 28, ('steel', 'legF2', 'flat', 2)); s.rect(23, 22, 25, 28, ('steel', 'legB2', 'flat', 2))
    s.rect(8, 23, 10, 29, ('steel', 'legF1', 'flat', 3)); s.rect(19, 23, 21, 29, ('steel', 'legB1', 'flat', 3))
    # body, tail, head
    s.ellipse(17.5, 19, 9, 5, ('steel', 'body', 'shine', 3))
    s.poly([(25, 17), (29, 13), (28, 17), (26, 21)], ('steel', 'tail', 'flat', 3))
    s.ellipse(8, 17, 5, 4.5, ('steel', 'head', 'shine', 3))
    s.rect(2, 18, 6, 21, ('steel', 'snout', 'flat', 3))
    # chewed pot shard in the mouth
    s.poly([(1, 21), (4, 20), (7, 22), (6, 25), (3, 24), (1, 25)], ('iron', 'shard', 'flat', 3))
    s.shade()
    # scales
    recolor(s, 'body', lambda x, y: 'steel:1' if y % 3 == 0 and (x + (y // 3) * 2) % 4 in (1, 2) else ('steel:4' if y % 3 == 1 and (x + (y // 3) * 2) % 4 == 0 else None))
    # nail and needle spines on the back
    for x, top in [(12, 9), (15, 8), (18, 9), (21, 10), (24, 12)]:
        bot = min(y for y in range(32) if s.mat[y][x] and s.mat[y][x][1] == 'body')
        for y in range(top, bot):
            s.c(x, y, RAMPS['iron'][4] if y > top else RAMPS['porc'][3])
        s.c(x - 1, top, RAMPS['iron'][3]) if x % 2 == 0 else None
    # teeth, crumbs of iron, ember eyes
    s.stamp(2, 20, ['WKWK'])
    s.c(5, 23, RAMPS['iron'][1]); s.c(2, 23, RAMPS['char'][3])
    s.stamp(5, 14, ['oo..oo', 'EF..EF'], {'E': '#ff7a2a', 'F': '#ffd27a'})
    s.outline(ENEMY_OUT)
    rim(s, '#9ab0c8', ok=set(RAMPS['steel']))


@sprite('ssireumdokkaebi', '씨름 도깨비', 6, hidden=True)
def ssireumdokkaebi(s):
    # stubby broom tied at the back of the waist, sticking up behind the shoulder
    s.line(21, 15, 26, 9, ('wood', 'handle', 'flat', 2), 2)
    s.poly([(24, 8), (27, 3), (30, 5), (28, 10)], ('straw', 'broom', 'flat', 3))
    # deep squat: thighs out, shins down
    s.line(10, 20, 5, 24, ('ogre', 'thighL', 'flat', 3), 3)
    s.line(4, 24, 4, 26, ('ogre', 'shinL', 'flat', 3), 3)
    s.line(19, 20, 24, 24, ('ogre', 'thighR', 'flat', 2), 3)
    s.line(25, 24, 25, 26, ('ogre', 'shinR', 'flat', 2), 3)
    s.rect(2, 29, 7, 29, ('ogre', 'footL', 'flat', 3)); s.rect(24, 29, 29, 29, ('ogre', 'footR', 'flat', 2))
    s.rect(10, 19, 21, 22, ('hanji', 'shorts', 'cyl', 1))
    # hunched bare torso, head pushed low between the shoulders
    s.poly([(8, 12), (23, 12), (25, 15), (22, 20), (9, 20), (6, 15)], ('ogre', 'torso', 'shine', 3))
    s.ellipse(15.5, 10.5, 3.5, 3, ('ogre', 'head', 'shine', 3))
    # arms reaching down and forward to grip
    s.line(7, 13, 4, 18, ('ogre', 'armL', 'flat', 3), 2)
    s.line(4, 18, 8, 22, ('ogre', 'armL', 'flat', 3), 2)
    s.line(24, 13, 27, 18, ('ogre', 'armR', 'flat', 2), 2)
    s.line(27, 18, 23, 22, ('ogre', 'armR', 'flat', 2), 2)
    s.shade()
    # wild hair
    s.stamp(11, 6, ['.S.SS.S.', 'SSSSSSSS', 'S......S'], {'S': 'shade:3'})
    # own satba at the waist and round the thighs
    s.stamp(10, 19, ['RRRRRRRRRRRR', 'rrrrrrrrrrrr'])
    s.stamp(8, 21, ['RR..........RR', '.Rr........rR.'])
    # the gripped satba loop between the fists
    s.stamp(8, 23, ['ss.............', 'RRRRRRRRRRRRRRR', '.r...........r.'], {'s': 'ogre:4'})
    s.stamp(21, 23, ['ss'], {'s': 'ogre:4'})
    # broom binding
    s.stamp(24, 9, ['RR'])
    # chest line, navel
    s.c(15, 15, RAMPS['ogre'][1]); s.c(16, 15, RAMPS['ogre'][1]); s.c(15, 17, RAMPS['ogre'][1])
    # face: brow, red eyes, gritted teeth
    s.stamp(12, 9, ['oo..oo.', 'WE..EW.', '.......', '.WKWKW.'])
    s.outline(ENEMY_OUT)
    rim(s, SINGLE['L'], ok=set(RAMPS['ogre']) | set(RAMPS['shade']))


@sprite('eoduksini', '그늘손', 6, hidden=True)
def eoduksini(s):
    # long shadow hand rising behind the lamp
    s.poly([(11, 27), (19, 27), (21, 19), (8, 19)], ('shade', 'arm', 'flat', 2))
    s.ellipse(14.5, 15, 6.5, 5, ('shade', 'palm', 'sphere', 3))
    s.line(9, 15, 3, 11, ('shade', 'thumb', 'flat', 3), 3)
    s.line(10, 11, 8, 4, ('shade', 'f1', 'flat', 3), 2)
    s.line(13, 10, 13, 3, ('shade', 'f2', 'flat', 3), 2)
    s.line(17, 10, 19, 4, ('shade', 'f3', 'flat', 2), 2)
    s.line(20, 12, 25, 7, ('shade', 'f4', 'flat', 2), 2)
    s.shade()
    # claw tips
    for x, y in [(3, 10), (8, 3), (13, 2), (20, 3), (26, 6)]:
        s.c(x, y, SINGLE['l'])
    # knuckle creases
    for x, y in [(9, 8), (13, 6), (19, 7), (23, 9), (5, 12)]:
        s.c(x, y, RAMPS['shade'][1])
    # lamplight eyes and mouth in the palm
    s.stamp(10, 12, ['oZZo.oZZo', 'oXNo.oNXo'])
    s.stamp(12, 15, ['oKKKKo', '.WKWK.'])
    # oil lamp: dish, stand, foot; wick flame
    s.ellipse(15.5, 23, 4, 1.2, ('porc', 'dish', 'cyl', 3))
    s.rect(15, 25, 16, 26, ('porc', 'stand', 'cyl', 3))
    s.ellipse(15.5, 27.5, 3.5, 0.8, ('wood', 'foot', 'flat', 3))
    s.shade()
    s.stamp(15, 21, ['KK'])
    s.outline(ENEMY_OUT)
    rim(s, SINGLE['L'], ok=set(RAMPS['shade']))
    s.stamp(14, 18, ['.A.', 'ANA', 'NXN'])
    s.c(12, 20, s.colour('Z')); s.c(19, 20, s.colour('Z'))


# ======================================================================= grade 6 thousand-year objects

@sprite('cheonnyeondatdol', '천년 닻돌', 6)
def cheonnyeondatdol(s):
    # rope loop above, strand down the right side
    s.ellipse(19.5, 6, 3.5, 2.5, ('straw', 'loop', 'flat', 3))
    s.ellipse(19.5, 6, 1.5, 0.6, ('straw', 'hole', 'none', 0))
    s.line(21, 8, 23, 16, ('straw', 'strand', 'flat', 3), 2)
    # long grooved stone
    s.poly([(10, 9), (21, 9), (23, 12), (23, 28), (21, 30), (10, 30), (8, 28), (8, 12)], ('stone', 'stone', 'cyl', 3))
    # thick rope wound in the groove
    s.poly([(7, 17), (24, 16), (25, 21), (7, 22)], ('straw', 'rope', 'flat', 3))
    s.shade()
    for x, y in region(s, 'hole'):
        s.c(x, y, None)
    # twisted strands with gold cord
    recolor(s, 'rope', lambda x, y: ('Y' if (x + y) % 6 == 0 else L['t']) if (x + y) % 3 == 0 else None)
    recolor(s, 'loop', lambda x, y: L['t'] if (x + y) % 3 == 0 else None)
    recolor(s, 'strand', lambda x, y: L['t'] if y % 2 == 0 else None)
    # wet shine
    for x, y in [(10, 12), (10, 13), (11, 14), (10, 24), (10, 25)]:
        s.c(x, y, RAMPS['stone'][4])
    # jangseung eyes and a tight-shut mouth
    s.stamp(10, 10, [
        'oooo..oooo',
        '.WWo..oWW.',
        '.Woo..ooW.',
        '..........',
        '..oooooo..',
        '.o......o.',
    ])
    # barnacles and sea moss
    for bx, by in [(11, 25), (18, 27), (20, 23)]:
        s.stamp(bx, by, ['pq', 'qo'], {'p': 'porc:4', 'q': 'porc:2'})
    for x, y in [(8, 27), (8, 28), (9, 29), (10, 29), (22, 28), (21, 29), (9, 26)]:
        s.c(x, y, RAMPS['leaf'][3] if (x + y) % 2 else RAMPS['leaf'][2])
    # chip off the corner
    s.c(23, 12, None); s.c(22, 11, RAMPS['stone'][1])
    topglow(s, {'stone', 'loop'})
    s.outline()
    s.flame(8, 10)
    sparks(s, [(14, 5), (2, 12), (13, 2)])


@sprite('cheonnyeonno', '천년 노', 6)
def cheonnyeonno(s):
    # curved shaft from the grip (top left) down to the blade
    tube(s, [(4, 6), (8, 9), (13, 13), (16, 16)], [1.3, 1.5, 1.6, 1.8], 'wood')
    s.line(2, 8, 5, 4, ('wood', 'grip', 'flat', 3), 2)
    # wide blade
    club(s, 15, 15, 24, 24, [1.6, 3.2, 4.3, 4.5, 4.0], ('wood', 'blade', 'flat', 3))
    s.shade()
    # rope wraps on the handle
    for x, y in [(5, 5), (6, 6), (7, 7)]:
        s.c(x, y + 1, s.colour(L['v'])); s.c(x + 1, y, s.colour(L['t']))
    # brass ring
    s.stamp(10, 10, ['.Y.', 'YyY', '.YY'])
    s.stamp(11, 13, ['y'])
    # blue painted edge along the upper side of the blade
    bl = set(region(s, 'blade'))
    for x, y in bl:
        if (x + 1, y - 1) not in bl and (x + 1, y) not in bl and x + y > 33:
            s.c(x, y, RAMPS['blue'][3])
    # face on the blade
    s.stamp(15, 17, [
        'oo....oo',
        'oWWo.oWW',
        'oWoo.ooW',
        '........',
        '..oWWWo.',
        '...ooo..',
    ])
    # crack mended with a strip of indigo cloth
    s.stamp(21, 25, ['BB', 'bB'])
    topglow(s, {'blade'})
    s.outline()
    # spray off the blade tip
    s.stamp(24, 24, ['...bB', '..bBp', '.bBp.', 'bBp..'], {'p': 'porc:4'})
    s.stamp(27, 21, ['p', 'B'], {'p': 'porc:4'})
    s.stamp(22, 28, ['Bp'], {'p': 'porc:4'})
    s.outline()
    s.flame(24, 10)
    sparks(s, [(17, 4), (29, 12), (19, 8)])


@sprite('cheonnyeondot', '천년 돛', 6)
def cheonnyeondot(s):
    # mast
    s.rect(15, 3, 16, 25, ('wood', 'mast', 'flat', 3))
    # straw boat bow below, raised prow on the right
    s.poly([(3, 23), (8, 27), (22, 27), (27, 24), (29, 19), (30, 20), (28, 25), (23, 29), (8, 29), (3, 25)], ('straw', 'hull', 'flat', 3))
    s.poly([(3, 23), (27, 23), (29, 19), (23, 28), (8, 28)], ('straw', 'hull', 'flat', 3))
    # sail full of wind, bulging to the right
    s.poly([(7, 10), (24, 5), (27, 8), (29, 13), (28, 18), (25, 21), (6, 21), (5, 15)], ('hanji', 'sail', 'sphere', 3))
    s.shade()
    # bamboo battens following the slanted yard
    for k, (y0, slope) in enumerate([(10, 5 / 17), (14, 3 / 20), (18, 1 / 20)]):
        for x in range(4, 30):
            y = round(y0 - (x - 6) * slope)
            if 0 <= y < 32 and s.mat[y][x] and s.mat[y][x][1] == 'sail':
                s.c(x, y, RAMPS['bamboo'][3 if x < 16 else 2])
    # yard and boom
    for x in range(6, 26):
        y = round(10 - (x - 7) * 5 / 17)
        if s.mat[y][x] and s.mat[y][x][1] == 'sail':
            s.c(x, y, RAMPS['bamboo'][2])
    # edge stitching
    sail = set(region(s, 'sail'))
    for x, y in sail:
        inner = all((x + a, y + b) in sail for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        near = any((x + a, y + b) not in sail for a, b in ((2, 0), (-2, 0), (0, 2), (0, -2)))
        if inner and near and s.col[y][x] in RAMPS['hanji'][2:]:
            s.c(x, y, RAMPS['hanji'][2])
    # puffed face
    s.stamp(14, 11, ['oo...oo', 'WWo.oWW', 'Wo...oW'])
    s.stamp(17, 15, ['.oo.', 'oKKo', '.oo.'])
    # hull weave, a red cloth tied to the prow
    recolor(s, 'hull', lambda x, y: 'straw:1' if (x + 2 * y) % 4 == 0 else None)
    s.stamp(28, 20, ['R', 'r'])
    # patch on the sail
    s.stamp(9, 18, ['BB', 'Bb'])
    topglow(s, {'sail'})
    s.outline()
    s.flame(6, 9)
    sparks(s, [(12, 3), (1, 12)])


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
