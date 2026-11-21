"""<batch>: unit sprites -> packages/client/public/sprites/<id>.png, sheet -> art/units/<batch>-sheet.png"""
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

# ======== one function per unit id goes here ========


def band(x0, y0, x1, y1, w):
    """Corners of a straight band of width w from (x0,y0) to (x1,y1)."""
    dx, dy = x1 - x0, y1 - y0
    l = math.hypot(dx, dy)
    px, py = -dy / l * w / 2, dx / l * w / 2
    return [(x0 + px, y0 + py), (x1 + px, y1 + py), (x1 - px, y1 - py), (x0 - px, y0 - py)]


def region(s, name):
    return [(x, y) for y in range(s.h) for x in range(s.w) if s.mat[y][x] and s.mat[y][x][1] == name]


def sparks(s, pts):
    for x, y in pts:
        s.c(x, y, s.colour('Z' if (x + y) % 2 else 'N'))


# ----------------------------------------------------------------- grade 3

@sprite('sutdarimi', '숯다리미', 3)
def sutdarimi(s):
    # long wooden handle up to the right, iron neck into the bowl
    s.line(20, 18, 26, 11, ('wood', 'handle', 'flat', 3), 2)
    s.line(18, 19, 21, 18, ('iron', 'neck', 'flat', 3), 2)
    s.ellipse(11, 22, 9, 6, ('iron', 'bowl', 'sphere', 3))
    for y in range(0, 19):
        for x in range(32):
            if s.mat[y][x] and s.mat[y][x][1] == 'bowl':
                s.mat[y][x] = None
    s.ellipse(11, 18, 9, 2.4, ('iron', 'rim', 'flat', 3))
    s.shade()
    # glowing charcoal heaped in the bowl
    s.stamp(3, 15, [
        '......dc.d.......',
        '...cdcRdcRdc.....',
        '..cRerdcReRrd....',
        '.cdRreecdRreec...',
        '..crdcRrcdcRc....',
    ], {'c': 'char:2', 'd': 'char:3', 'R': 'red:3', 'r': 'red:2', 'e': 'e'})
    # face on the side of the bowl
    s.stamp(4, 20, [
        'ooo....ooo.',
        '.oWWo.oWWo.',
        '.oWoo.ooWo.',
        '..oo...oo..',
        '...........',
        '...oWoWoo..',
        '....oooo...',
    ])
    # shine on the bowl and a red rag wound round the grip
    s.c(3, 22, RAMPS['iron'][4]); s.c(3, 23, RAMPS['iron'][4])
    s.stamp(22, 13, ['..R', '.RR', 'Rr.', 'r..'])
    s.outline()
    s.flame(26, 10)


@sprite('hongdukkae', '홍두깨', 3)
def hongdukkae(s):
    p0, p1 = (6, 14), (26, 23)
    rad = [3.0, 3.4, 3.4, 3.4, 3.0]
    tube(s, [p0, p1], rad, 'pwood', tmap={})

    def at(t):
        return (p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t)
    cloth = set()
    for a, b in ((.16, .33), (.66, .84)):
        cloth |= set(tube(s, [at(a), at(b)], [3.9, 3.9], 'hanji', tmap={}))
    ux, uy = (p1[0] - p0[0]), (p1[1] - p0[1]); ul = math.hypot(ux, uy); ux, uy = ux / ul, uy / ul
    for x, y in cloth:
        c = s.col[y][x]
        if c in RAMPS['hanji'] and int(x * ux + y * uy) % 2 == 0:
            s.c(x, y, RAMPS['hanji'][max(0, RAMPS['hanji'].index(c) - 1)])
    # worn shine along the top of the bare wood
    for x, y in [(13, 14), (14, 15), (15, 15), (16, 16)]:
        s.c(x, y, RAMPS['pwood'][4])
    # face peeking between the cloth wraps
    s.stamp(11, 16, [
        'ooo..ooo.',
        'oWWo.oWWo',
        'oWoo.ooWo',
        '.oo...oo.',
        '...oKKo..',
    ])
    # loose tail of cloth hanging off the second wrap
    s.stamp(21, 25, ['W.', 'hW', '.h', '.W'], {'h': 'hanji:2'})
    # nicked, worn end
    s.c(27, 22, RAMPS['pwood'][1]); s.c(28, 23, RAMPS['pwood'][1])
    s.outline()
    s.flame(6, 10)


@sprite('baneul', '바늘', 3)
def baneul(s):
    # thread strands first so the needle sits on top
    th = ('blue', 'thread', 'flat', 3)
    loop = [(18, 11), (14, 8), (9, 9), (5, 13), (5, 18), (8, 22), (6, 26), (3, 27)]
    for a, b in zip(loop, loop[1:]):
        s.line(*a, *b, th, 2)
    whisk = [(22, 13), (26, 16), (25, 20), (27, 24)]
    for a, b in zip(whisk, whisk[1:]):
        s.line(*a, *b, ('blue', 'thread2', 'flat', 2), 2)
    s.line(10, 27, 17, 16, ('porc', 'shaft', 'flat', 3), 2)
    s.c(10, 29, None); s.c(9, 29, None)
    s.shade()
    for x, y in [(12, 23), (13, 22), (14, 20)]:
        s.c(x, y, RAMPS['porc'][4])
    # tilted head: the needle's eye is a dark slot with a glint, a second eye below it
    s.stamp(15, 6, [
        '....pq..',
        '...ppqr.',
        '...pooq.',
        '..qooWr.',
        '..qoooq.',
        '..pqqqr.',
        '.qooqr..',
        '.ooWrr..',
        'pqooq...',
        'pqKr....',
        'qqr.....',
    ], {'p': 'porc:4', 'q': 'porc:3', 'r': 'porc:2'})
    s.outline()
    s.flame(21, 6)


@sprite('but', '붓', 3)
def but(s):
    # brush tip: black hair tapering down to the right
    club(s, 18, 21, 24, 28, [2.9, 3.1, 2.3, 1.2, 0.4], ('char', 'hair', 'sphere', 3))
    # bamboo shaft
    club(s, 10, 9, 18, 21, [2.4, 2.4, 2.4], ('bamboo', 'shaft', 'cyl', 3))
    s.shade()
    # bamboo node and a red ferrule band
    for y in range(32):
        for x in range(32):
            m = s.mat[y][x]
            if m and m[1] == 'shaft':
                u = x * 0.55 + y * 0.83
                if 20.6 < u < 21.6:
                    s.c(x, y, RAMPS['bamboo'][1])
                if 26.3 < u < 27.9:
                    s.c(x, y, SINGLE['R'] if u < 27.1 else SINGLE['r'])
            if m and m[1] == 'hair' and (x, y) in ((19, 21), (18, 22), (19, 23)):
                s.c(x, y, RAMPS['char'][4])
    # face on the upper shaft
    s.stamp(7, 10, [
        '.oo.oo.',
        'oWW.WWo',
        'oWo.oWo',
        '.......',
        '..oKo..',
    ])
    # hanging cord drooping from the top end
    s.stamp(4, 7, ['..RRr', '.R...', 'R....', 'R....', '.Rr..'])
    # ink drops flung off the tip
    s.stamp(14, 25, ['.c', 'cd'], {'c': 'char:1', 'd': 'char:3'})
    s.stamp(27, 23, ['c.', 'dc'], {'c': 'char:1', 'd': 'char:3'})
    s.outline()
    s.flame(10, 6)


# ----------------------------------------------------------------- grade 4

@sprite('geumulbaneul', '그물바늘', 4)
def geumulbaneul(s):
    s.poly([(14.5, 8), (19, 13), (19, 27), (17, 29), (16, 27), (13, 27), (12, 29), (10, 27), (10, 13)], ('bamboo', 'body', 'cylv', 3))
    s.rect(9, 19, 20, 25, ('hanji', 'yarn', 'cyl', 3))
    s.shade()
    # the window with its tongue
    s.stamp(12, 10, [
        '.oo..',
        'oZNo.',
        'oNoNo',
        'oNoZo',
        'oooo.',
    ])
    for y in range(19, 27):
        for x in range(9, 21):
            if s.mat[y][x] and s.mat[y][x][1] == 'yarn' and (y + (x // 3)) % 2 == 0:
                s.c(x, y, RAMPS['hanji'][2])
    s.stamp(10, 15, [
        'oo..oo',
        'WW..WW',
        'Wo..oW',
        '..oo..',
    ])
    s.outline()
    # yarn running off into a few knotted meshes
    net = ['....h......',
           '...h.h.....',
           '..h...h..h.',
           '.h.....hh.h',
           'h......h...h',
           '.h....h.h.h.',
           '..h..h...h..',
           '...hh.....h.',
           '...h.h...h..',
           '..h...h.h...',
           '.......h....']
    s.stamp(20, 15, net, {'h': 'hanji:3'})
    s.c(20, 19, RAMPS['hanji'][3]); s.c(21, 19, RAMPS['hanji'][3])
    for x, y in [(23, 18), (27, 18), (25, 23), (22, 22)]:
        s.c(x, y, RAMPS['hanji'][4])
    s.flame(15, 8)
    sparks(s, [(9, 4), (21, 3), (20, 7)])


@sprite('indupan', '인두판', 4)
def indupan(s):
    s.poly([(7, 16), (26, 16), (29, 20), (3, 20)], ('hanji', 'cover', 'flat', 3))
    s.poly([(3, 20), (29, 20), (28, 27), (4, 27)], ('wood', 'front', 'cyl', 3))
    s.rect(3, 20, 29, 21, ('hanji', 'lip', 'flat', 2))
    # folded indigo cloth on top
    s.poly([(12, 11), (23, 11), (24, 17), (11, 17)], ('blue', 'cloth', 'flat', 3))
    s.shade()
    for x in range(11, 25):
        if s.mat[14][x] and s.mat[14][x][1] == 'cloth':
            s.c(x, 14, RAMPS['blue'][1])
    for x in range(12, 24):
        s.c(x, 15, RAMPS['blue'][3])
    # pressing marks on the cover, and a scorch with a live ember
    for x, y in [(6, 18), (7, 18), (8, 18), (25, 18), (26, 18), (27, 19)]:
        s.c(x, y, RAMPS['hanji'][2])
    s.stamp(24, 17, ['ccd', 'cNc'], {'c': 'char:2', 'd': 'char:3'})
    # face on the wooden front
    s.stamp(8, 21, [
        'oooo......oooo',
        '.oWWo....oWWo.',
        '.oWoo....ooWo.',
        '..oo......oo..',
        '.....oooo.....',
    ])
    for x in (6, 26):
        s.c(x, 25, RAMPS['wood'][1])
    s.outline()
    s.flame(17, 10)
    sparks(s, [(11, 6), (23, 5), (27, 15)])


@sprite('gawi', '가위', 4)
def gawi(s):
    # blades opening downward from the rivet
    s.poly([(15, 19), (17, 21), (9, 29), (6, 29)], ('iron', 'blade1', 'flat', 3))
    s.poly([(17, 19), (15, 21), (23, 29), (26, 29)], ('iron', 'blade2', 'flat', 2))
    # arms up to the finger loops
    s.line(15, 20, 11, 16, ('iron', 'arm1', 'flat', 3), 2)
    s.line(16, 20, 20, 16, ('iron', 'arm2', 'flat', 2), 2)
    s.ellipse(10, 12, 4.4, 4.4, ('iron', 'loop1', 'flat', 3))
    s.ellipse(22, 12, 4.4, 4.4, ('iron', 'loop2', 'flat', 2))
    s.shade()
    # loop holes are the eyes
    s.stamp(7, 10, [
        '.oo.',
        'oWWo',
        'oWoo',
        '.oo.',
    ])
    s.stamp(19, 10, [
        '.oo.',
        'oWWo',
        'ooWo',
        '.oo.',
    ])
    # rusty rivet nose
    s.stamp(15, 19, ['ab', 'bc'], {'a': 'onggi:4', 'b': 'onggi:3', 'c': 'onggi:2'})
    # teeth inside the open blades
    s.stamp(14, 22, ['W..W', '.WW.'])
    # glinting edges
    for x, y in [(7, 28), (8, 27), (24, 28), (23, 27)]:
        s.c(x, y, RAMPS['porc'][4])
    s.outline()
    s.flame(16, 8)
    sparks(s, [(4, 27), (28, 27), (27, 24)])


@sprite('indu', '인두', 4)
def indu(s):
    s.line(5, 10, 13, 18, ('wood', 'handle', 'flat', 3), 3)
    s.line(13, 18, 15, 20, ('iron', 'neck', 'flat', 3), 2)
    s.poly([(13, 19), (29, 25), (13, 27)], ('iron', 'head', 'flat', 3))
    s.poly([(13, 27), (29, 25), (28, 27), (13, 29)], ('iron', 'edge', 'flat', 1))
    s.shade()
    # tip glowing hot
    for y in range(32):
        for x in range(32):
            m = s.mat[y][x]
            if m and m[1] in ('head', 'edge') and x >= 22:
                s.c(x, y, s.colour('N' if x < 25 else ('Z' if x < 28 else 'X')))
            elif m and m[1] in ('head', 'edge') and x == 21:
                s.c(x, y, s.colour('A'))
    # face on the iron head
    s.stamp(13, 21, [
        'ooo..ooo',
        'oWWooWWo',
        'oWooooWo',
        '.oo..oo.',
        '...oWo..',
    ])
    # cloth wrap on the grip
    s.stamp(6, 11, ['.BB', 'BBb', '.b.'])
    s.outline()
    s.flame(5, 8)
    sparks(s, [(30, 22), (29, 20), (27, 21)])


@sprite('byeoru', '벼루', 4)
def byeoru(s):
    s.poly([(4, 16), (6, 14), (10, 13), (21, 13), (25, 14), (27, 16), (28, 25), (3, 25)], ('stone', 'top', 'flat', 2))
    s.rect(3, 25, 28, 26, ('stone', 'front', 'cyl', 1))
    s.rect(6, 17, 25, 23, ('char', 'basin', 'none', 3))
    s.shade()
    for x in range(6, 26):
        s.c(x, 17, RAMPS['char'][1])
    for y in range(18, 24):
        s.c(6, y, RAMPS['char'][2])
    for x, y in [(9, 21), (10, 21), (20, 22), (21, 22), (22, 22)]:
        s.c(x, y, RAMPS['char'][4])
    # two pools of ink at the top of the well are the eyes
    s.stamp(7, 17, [
        '.oooo....oooo.',
        'oKWWKo..oKWWKo',
        'oKWbKo..oKbWKo',
        '.oooo....oooo.',
    ], {'b': 'blue:0', 'K': 'blue:1'})
    # lower end of the grinding slope is the mouth
    s.stamp(11, 21, [
        'oooooooo',
        'oKWKWKWo',
        '.oooooo.',
    ])
    # carved clouds along the top rim
    s.stamp(8, 14, [
        '.dd.....dd...',
        'd..d.dd.d.d..',
    ], {'d': 'stone:4'})
    # chipped corner
    for x, y in [(25, 14), (26, 15), (24, 14), (25, 15)]:
        s.c(x, y, None)
    s.c(23, 14, RAMPS['stone'][4]); s.c(24, 15, RAMPS['stone'][4]); s.c(25, 16, RAMPS['stone'][3])
    s.outline()
    s.flame(15, 12)
    sparks(s, [(9, 8), (22, 7), (20, 11)])


@sprite('meok', '먹', 4)
def meok(s):
    s.poly([(10, 12), (19, 11), (21, 25), (12, 26)], ('char', 'face', 'flat', 3))
    s.poly([(19, 11), (22, 12), (24, 24), (21, 25)], ('char', 'side', 'flat', 2))
    s.poly([(10, 12), (13, 10), (22, 9), (22, 12), (19, 11)], ('char', 'top', 'flat', 3))
    s.ellipse(17, 26.8, 7, 1.0, ('blue', 'pool', 'none', 1))
    s.shade()
    for x, y in region(s, 'top'):
        s.c(x, y, RAMPS['char'][4])
    fc = set(region(s, 'face'))
    for x, y in fc:
        if (x - 1, y) not in fc:
            s.c(x, y, RAMPS['char'][4])
    # gilded frame and a cloud on the front face
    s.stamp(12, 13, [
        'YYYYYYy',
        'Y.....y',
        'Y.....y',
        'Y.....y',
        'Y.....y',
        'y.....y',
        'y.YYY.y',
        'yY...Yy',
        'y.yyy.y',
        '.yyyyyy',
    ])
    # face inside the frame
    s.stamp(13, 14, [
        'oo.oo',
        'WW.WW',
        'Wo.oW',
        '.....',
        '.oKo.',
    ])
    # ink running off the ground end into a pool
    s.stamp(20, 25, ['b', 'b'], {'b': 'blue:1'})
    s.c(13, 26, RAMPS['blue'][3]); s.c(14, 26, RAMPS['blue'][2]); s.c(22, 27, RAMPS['blue'][2])
    s.outline()
    # soot curling up from the top
    for x, y in [(9, 9), (8, 8), (8, 6), (24, 8), (25, 7), (25, 5)]:
        s.c(x, y, RAMPS['stone'][2])
    s.flame(17, 8)
    sparks(s, [(12, 3), (22, 2)])


@sprite('ja', '자', 4)
def ja(s):
    s.poly(band(4, 25, 26, 10, 6), ('wood', 'rule', 'flat', 3))
    s.shade()
    # tick marks along the lower edge
    ux, uy = 22 / math.hypot(22, 15), -15 / math.hypot(22, 15)
    nx, ny = -uy, ux
    for k in range(1, 26, 2):
        bx, by = 4 + ux * k, 25 + uy * k
        ln = 2 if k % 4 == 1 else 1
        for j in range(ln):
            x, y = int(bx + nx * (2.4 - j)), int(by + ny * (2.4 - j))
            if s.mat[y][x] and s.mat[y][x][1] == 'rule':
                s.c(x, y, RAMPS['wood'][1])
    # face in between the ticks
    s.stamp(9, 17, ['oWWo', 'oWoo', '.oo.'])
    s.stamp(14, 14, ['oWWo', 'ooWo', '.oo.'])
    s.stamp(14, 19, ['oKKo', '.oo.'])
    # hanging hole with an indigo cord
    s.c(23, 12, RAMPS['wood'][0])
    s.outline()
    s.stamp(23, 13, ['B..', 'B.b', '.Bb', '..B'])
    s.flame(25, 9)
    sparks(s, [(20, 4), (29, 6), (21, 8)])


@sprite('golmu', '골무', 4)
def golmu(s):
    s.ellipse(16, 21, 9, 8.5, ('red', 'pad', 'sphere', 3))
    s.poly([(12, 14), (16, 10), (20, 14)], ('red', 'pad', 'sphere', 3))
    for y in range(25, 32):
        for x in range(32):
            if s.mat[y][x] and s.mat[y][x][1] == 'pad':
                s.mat[y][x] = None
    s.rect(7, 24, 25, 25, ('hanji', 'lining', 'cyl', 3))
    s.rect(7, 26, 25, 27, ('blue', 'hem', 'cyl', 3))
    s.shade()
    # quilted seams with stitch dots
    for y in (16, 21):
        for x in range(8, 25):
            if s.mat[y][x] and s.mat[y][x][1] == 'pad':
                s.c(x, y, RAMPS['red'][1] if x % 2 else SINGLE['W'])
    for x in range(8, 25, 2):
        s.c(x, 26, SINGLE['Y'])
    # five-colour flower
    s.stamp(18, 12, ['..W..', '.BYG.', 'WYWYW', '.GYB.', '..W..'])
    s.c(20, 14, SINGLE['R'])
    # face
    s.stamp(8, 17, [
        'ooo...ooo',
        'oWWo.oWWo',
        'oWoo.ooWo',
        '.oo...oo.',
        '...oKKo..',
    ])
    s.outline()
    s.flame(16, 9)
    sparks(s, [(10, 5), (22, 3), (23, 8)])


@sprite('mulle', '물레', 4)
def mulle(s):
    cx, cy, R = 12, 19, 9
    s.rect(2, 28, 29, 29, ('wood', 'base', 'flat', 3))
    s.rect(11, 22, 13, 27, ('wood', 'post', 'flat', 2))
    s.rect(25, 19, 26, 27, ('wood', 'post2', 'flat', 2))
    for y in range(32):
        for x in range(32):
            d = math.hypot(x - cx, y - cy)
            if R - 1.6 <= d <= R + .4:
                s.m(x, y, ('wood', 'rim', 'flat', 3))
    for k in range(8):
        a = math.radians(k * 45 + 22.5)
        if k == 1:
            continue
        s.line(round(cx + 4 * math.cos(a)), round(cy + 4 * math.sin(a)), round(cx + 7.5 * math.cos(a)), round(cy + 7.5 * math.sin(a)), ('wood', 'spoke', 'flat', 2), 1)
    s.ellipse(cx, cy, 4.6, 4.4, ('wood', 'hub', 'flat', 3))
    # spindle with a cone of spun yarn
    s.line(21, 18, 29, 18, ('iron', 'spindle', 'flat', 3), 1)
    s.ellipse(25.5, 17.5, 2.4, 1.6, ('hanji', 'cop', 'sphere', 3))
    s.shade()
    # broken spoke bound with straw rope
    s.stamp(14, 21, ['wv', 'uv', '.ut'], L)
    s.stamp(8, 15, [
        'ooo.ooo',
        'oWWoWWo',
        'oWooooW',
        '...y...',
        '..oKo..',
    ])
    s.outline()
    # yarn from the wheel to the spindle
    for x, y in [(15, 11), (17, 12), (18, 12), (19, 13), (20, 14), (21, 15), (22, 15), (23, 16)]:
        s.c(x, y, RAMPS['hanji'][4])
    s.flame(12, 9)
    sparks(s, [(6, 4), (18, 3), (20, 7)])


@sprite('jumadeung', '주마등', 4)
def jumadeung(s):
    s.rect(11, 13, 20, 24, ('hanji', 'front', 'flat', 3))
    s.poly([(7, 14), (11, 13), (11, 24), (7, 23)], ('hanji', 'left', 'flat', 3))
    s.poly([(20, 13), (24, 14), (24, 23), (20, 24)], ('hanji', 'right', 'flat', 2))
    s.poly([(6, 13), (11, 12), (20, 12), (25, 13), (25, 14), (6, 14)], ('wood', 'topframe', 'flat', 3))
    s.poly([(6, 23), (25, 23), (25, 24), (20, 25), (11, 25), (6, 24)], ('wood', 'botframe', 'flat', 2))
    # spinning paper cap
    s.poly([(9, 11), (22, 11), (19, 8), (12, 8)], ('red', 'cap', 'flat', 3))
    s.shade()
    for x, y in [(13, 10), (14, 9), (17, 10), (18, 9), (21, 10), (10, 10)]:
        s.c(x, y, SINGLE['B'])
    for y in range(14, 24):
        s.c(11, y, RAMPS['wood'][2]); s.c(20, y, RAMPS['wood'][1])
    # horse shadows running round the sides
    s.stamp(7, 19, ['...d', 'dddd', 'd.d.'], {'d': 'wood:2'})
    s.stamp(21, 18, ['...d', 'dddd', 'd.d.'], {'d': 'wood:1'})
    s.stamp(13, 21, ['....d', '.dddd', 'd.d.d'], {'d': 'wood:2'})
    # eyes with the lamp light leaking between them
    s.stamp(11, 14, [
        'oo..oo',
        'WWZNWW',
        'WoNZoW',
        '..Z...',
    ])
    s.stamp(17, 20, ['oKo'])
    # red tassel
    s.stamp(15, 25, ['Y.', 'RR', 'Rr', 'r.'])
    s.outline()
    s.flame(16, 7)
    sparks(s, [(9, 4), (23, 3), (24, 7)])


@sprite('soemangchi', '쇠망치', 4)
def soemangchi(s):
    s.line(15, 18, 13, 26, ('wood', 'haft', 'flat', 3), 3)
    s.poly([(4, 11), (6, 10), (24, 10), (27, 9), (28, 19), (24, 18), (6, 18), (4, 17)], ('iron', 'head', 'flat', 3))
    s.shade()
    # one end red-hot
    for y in range(32):
        for x in range(32):
            if s.mat[y][x] and s.mat[y][x][1] == 'head' and x >= 23:
                s.c(x, y, s.colour('A' if x == 23 else ('N' if x < 26 else 'Z')))
    s.c(27, 13, s.colour('X')); s.c(27, 14, s.colour('X'))
    # wedge driven in the top
    s.stamp(14, 10, ['bab', '.b.'], {'a': 'wood:4', 'b': 'iron:4'})
    # bulging eyes and clenched teeth
    s.stamp(6, 11, [
        'oooo.....oooo',
        '.oWWo...oWWo.',
        '.oWoo...ooWo.',
        '..oo.....oo..',
        '...ooooooo...',
        '...oWoWoWo...',
    ])
    s.stamp(13, 23, ['BB', 'Bb', 'bB'])
    s.outline()
    s.flame(13, 8)
    sparks(s, [(29, 8), (30, 11), (28, 6), (30, 16)])


@sprite('yagyeon', '약연', 4)
def yagyeon(s):
    s.ellipse(16, 14, 6, 6, ('iron', 'wheel', 'sphere', 3))
    s.poly([(2, 17), (5, 20), (27, 20), (30, 17), (28, 23), (23, 26), (8, 26), (4, 23)], ('iron', 'boat', 'cyl', 3))
    s.rect(9, 27, 11, 28, ('iron', 'foot1', 'flat', 2)); s.rect(20, 27, 22, 28, ('iron', 'foot2', 'flat', 2))
    s.shade()
    for y in range(32):
        for x in range(32):
            if s.mat[y][x] and s.mat[y][x][1] == 'wheel' and abs(math.hypot(x - 16, y - 14) - 4.6) < .55:
                s.c(x, y, RAMPS['iron'][1])
    # handle rod straight through the hub, knobs at both ends
    s.rect(6, 13, 27, 14, ('wood', 'rod', 'flat', 3))
    s.rect(5, 12, 7, 15, ('wood', 'knob1', 'flat', 3)); s.rect(26, 12, 28, 15, ('wood', 'knob2', 'flat', 2))
    s.rect(15, 13, 17, 14, ('brass', 'hub', 'flat', 3))
    s.shade()
    s.stamp(9, 13, ['R', 'r'])
    # groove with green herb powder
    for x in range(6, 27):
        s.c(x, 20, RAMPS['leaf'][3] if x % 3 else RAMPS['leaf'][4])
    s.c(11, 19, RAMPS['leaf'][3]); s.c(21, 19, RAMPS['leaf'][4])
    # face on the side of the boat
    s.stamp(10, 21, [
        'ooo.....ooo.',
        '.oWWo.oWWo..',
        '.oWoo.ooWo..',
        '..oo...oo...',
        '....oKKo....',
    ])
    s.stamp(25, 21, ['dd', 'd.'], {'d': 'onggi:3'})
    s.outline()
    s.flame(16, 8)
    sparks(s, [(10, 4), (22, 3), (9, 8)])


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
