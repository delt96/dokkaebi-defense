"""b1-g2g3-yard: unit sprites -> packages/client/public/sprites/<id>.png, sheet -> art/units/b1-g2g3-yard-sheet.png"""
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


def cut(s, cond):
    """Erase material pixels where cond(x, y, region) is true."""
    for y in range(s.h):
        for x in range(s.w):
            if s.mat[y][x] and cond(x, y, s.mat[y][x][1]):
                s.mat[y][x] = None
                s.col[y][x] = None


def reg(s, *names):
    return [(x, y) for y in range(s.h) for x in range(s.w)
            if s.mat[y][x] and s.mat[y][x][1] in names and s.col[y][x] is not None]


def step(s, x, y, ramp, d):
    """Move a shaded pixel d steps along its ramp."""
    c = s.col[y][x]
    R = RAMPS[ramp]
    if c in R:
        s.c(x, y, R[max(0, min(4, R.index(c) + d))])


def rell(s, cx, cy, rx, ry, ang, mat):
    """Rotated ellipse (degrees, positive turns the right end down)."""
    ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    for y in range(s.h):
        for x in range(s.w):
            dx, dy = x - cx, y - cy
            u = dx * ca + dy * sa
            v = -dx * sa + dy * ca
            if (u / (rx + .5)) ** 2 + (v / (ry + .5)) ** 2 <= 1:
                s.m(x, y, mat)


def in_rell(x, y, cx, cy, rx, ry, ang):
    ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    dx, dy = x - cx, y - cy
    u = dx * ca + dy * sa
    v = -dx * sa + dy * ca
    return (u / (rx + .5)) ** 2 + (v / (ry + .5)) ** 2 <= 1


EMBER = {'e': 'e', 'r': 'red:3', 'q': 'red:4', 'c': 'char:1', 'd': 'char:3'}

# ======================================================================= grade 2


@sprite('sseurebatgi', '쓰레받기', 2)
def sseurebatgi(s):
    # short wooden handle standing up behind the back wall
    club(s, 17, 14, 24, 5, [1.6, 1.5], ('wood', 'handle', 'cyl', 3))
    # woven floor, wide open at the front
    s.poly([(7, 17), (25, 17), (29, 27), (3, 27)], ('bamboo', 'floor', 'flat', 3))
    # low back wall (inner face) and side rims
    s.rect(7, 13, 24, 17, ('bamboo', 'wall', 'flat', 2))
    s.line(7, 13, 3, 26, ('bamboo', 'rimL', 'flat', 3), 2)
    s.line(23, 13, 27, 26, ('bamboo', 'rimR', 'flat', 2), 2)
    s.rect(3, 27, 28, 28, ('bamboo', 'lip', 'flat', 2))
    s.shade()
    # basket weave: strands across, ribs showing between them in a brick pattern
    for x, y in reg(s, 'floor'):
        if y in (20, 23, 26):
            s.c(x, y, RAMPS['bamboo'][2])
        elif (x + (4 if y in (21, 22) else 0)) % 8 == 0:
            s.c(x, y, RAMPS['bamboo'][1])
    for x, y in reg(s, 'lip'):
        if x % 3 == 0:
            s.c(x, y, RAMPS['bamboo'][1])
    for x, y in reg(s, 'wall'):
        if y == 15 and x % 2:
            s.c(x, y, RAMPS['bamboo'][1])
    # chaff held in the pan
    s.stamp(18, 21, ['.w.w.', 'wvwvw', '.vuv.'], L)
    s.stamp(8, 23, ['w.w', 'vwv'], L)
    # face on the back wall, the pan itself is the open mouth
    s.stamp(9, 13, [
        '.ooo......ooo.',
        'oWWo......oWWo',
        'oWoo......ooWo',
        '.oo........oo.',
    ])
    s.stamp(11, 17, ['oKKKKKKKKo', '.oooooooo.'])
    # burst weave bound with straw rope on the right rim, red cord on the handle
    s.stamp(25, 19, ['vt.', 'tvt', '.tv', '..t'], L)
    s.stamp(19, 10, ['RR', 'Rr'])
    s.outline()
    s.flame(6, 11)


@sprite('dunggumi', '둥구미', 2)
def dunggumi(s):
    s.ellipse(15.5, 19.5, 11, 9.5, ('straw', 'body', 'sphere', 3))
    cut(s, lambda x, y, r: y < 14)
    s.ellipse(15.5, 13.5, 11, 3, ('straw', 'rim', 'flat', 3))
    s.ellipse(15.5, 13.2, 8.5, 1.5, ('straw', 'hole', 'none', 0))
    s.shade()
    # coils: a groove every third row and short slanted stitches
    for x, y in reg(s, 'body'):
        if (y - 17) % 3 == 0:
            step(s, x, y, 'straw', -1)
        elif (x + (y // 3) * 2) % 5 == 0 and (y - 17) % 3 == 1:
            step(s, x, y, 'straw', 1)
    for x, y in reg(s, 'rim'):
        if (x + y) % 3 == 0:
            step(s, x, y, 'straw', -1)
    # one coil from an old sandal's straw: darker, greyer
    for x, y in reg(s, 'body'):
        if y in (24, 25):
            c = s.col[y][x]
            if c in RAMPS['straw']:
                s.c(x, y, RAMPS['earth'][RAMPS['straw'].index(c)])
    # hahoe crescent eyes under the rim and a wide smile
    s.stamp(8, 18, [
        '.ooo.....ooo.',
        'o...o...o...o',
    ])
    s.stamp(11, 21, ['o.....o', '.oKKKo.', '..ooo..'])
    # indigo rag tied to the rim
    s.stamp(23, 15, ['BB', 'Bb', '.b'])
    s.outline()
    s.flame(16, 12)


@sprite('sut', '숯', 2)
def sut(s):
    logs = [(5, 11, 24, 'logA'), (19, 25, 24, 'logB'), (10, 20, 16, 'logC')]
    for x0, x1, y, name in logs:
        club(s, x0, y, x1, y, [3.4, 3.4], ('char', name, 'flat', 3))
    s.shade()
    # silvery sheen of 참숯: light on top, dark underneath (lifted a step so it holds on the dark lane)
    sheen = [RAMPS['char'][1], RAMPS['char'][2], RAMPS['char'][3], RAMPS['char'][4], RAMPS['stone'][2]]
    for x0, x1, cy, name in logs:
        for x, y in reg(s, name):
            t = (y - cy) / 3.4
            lv = 4 if t < -.6 else (3 if t < .1 else (2 if t < .7 else 1))
            if x > x1 + 1 and lv > 1:
                lv -= 1
            s.c(x, y, sheen[lv])
        # grain lines along the log
        for x in range(x0, x1 + 2):
            if s.mat[cy][x] and s.mat[cy][x][1] == name and x % 3:
                s.c(x, cy, RAMPS['char'][1])
    # cut ends on the left with rings
    for x0, x1, cy, name in logs:
        s.stamp(x0 - 3, cy - 2, [
            '.dd',
            'dqd',
            'qeq',
            'dqd',
            '.d.',
        ], EMBER)
    # silvery ash sheen along the top edge of each log, so the form reads on a dark lane
    for x0, x1, cy, name in logs:
        for x, y in reg(s, name):
            if (y == 0 or s.mat[y - 1][x] is None or s.mat[y - 1][x][1] != name) and x <= x1 + 1:
                s.c(x, y, RAMPS['stone'][3] if x < x1 - 2 else RAMPS['stone'][2])
    # embers glowing along the underside where the logs rest
    for x0, x1, cy, name in logs:
        for x, y in reg(s, name):
            below = s.mat[y + 1][x] if y + 1 < s.h else None
            if (below is None or below[1] != name) and x0 - 1 <= x <= x1 + 1:
                s.c(x, y, RAMPS['red'][3] if x % 3 else RAMPS['red'][2])
    # glowing cracks
    s.stamp(6, 22, ['qe.', '.rq', '..r'], EMBER)
    s.stamp(21, 24, ['.e', 'qq', 'r.'], EMBER)
    s.stamp(15, 26, ['eq', '.r'], EMBER)
    s.stamp(13, 15, ['q'], EMBER)
    # face in the split of the top log
    s.stamp(10, 14, [
        '.oo.....oo.',
        'oZNo...oNZo',
        '.oo.....oo.',
        '...oqeqo...',
        '....ooo....',
    ], EMBER)
    s.outline()
    s.flame(16, 11)


@sprite('dadeumitdol', '다듬잇돌', 2)
def dadeumitdol(s):
    s.poly([(5, 15), (27, 15), (28, 19), (4, 19)], ('stone', 'top', 'flat', 3))
    s.rect(4, 19, 28, 26, ('stone', 'side', 'cyl', 2))
    s.rect(5, 27, 27, 27, ('stone', 'side', 'cyl', 2))
    # folded white cotton on top
    s.rect(8, 12, 20, 14, ('hanji', 'cloth', 'flat', 3))
    s.rect(8, 15, 20, 16, ('hanji', 'clothside', 'flat', 2))
    # chipped corners
    for x, y in [(27, 15), (26, 15), (27, 16), (28, 19), (4, 26), (4, 25), (5, 27)]:
        s.mat[y][x] = None
    s.shade()
    for x in range(8, 21):
        s.c(x, 15, RAMPS['hanji'][1] if x < 20 else RAMPS['hanji'][2])
    s.c(9, 13, RAMPS['hanji'][4]); s.c(10, 13, RAMPS['hanji'][4])
    # polished glint on the top face, granite specks on the side
    for x, y in [(22, 16), (23, 16), (24, 17), (6, 17), (7, 17)]:
        s.c(x, y, RAMPS['stone'][4])
    for x, y in [(6, 24), (7, 24), (25, 21), (24, 25), (25, 25), (19, 26)]:
        s.c(x, y, RAMPS['stone'][1])
    # jangseung face: heavy brows, bulging eyes, shut mouth
    s.stamp(9, 19, [
        'ooo......ooo.',
        '.oWWo..oWWo..',
        '.oWoo..ooWo..',
        '..oo....oo...',
        '.............',
        '...oooooo....',
    ])
    s.outline()
    s.flame(24, 13)


@sprite('mumyeong', '무명', 2)
def mumyeong(s):
    # outer layer peeling off the bolt and lolling to the ground like a tongue
    s.poly([(19, 16), (23, 17), (26, 21), (28, 26), (29, 29), (23, 29), (22, 24), (21, 20)], ('porc', 'tail', 'flat', 2))
    s.rect(8, 11, 20, 27, ('porc', 'roll', 'cyl', 3))
    s.ellipse(14, 27, 6, 2, ('porc', 'roll', 'cyl', 3))
    s.ellipse(14, 11, 6, 2.2, ('porc', 'top', 'flat', 3))
    s.shade()
    # layer lines down the bolt
    for x, y in reg(s, 'roll'):
        if y in (19, 24) and x < 20:
            step(s, x, y, 'porc', -1)
    # rolled cross-section on top: rings of cloth round a bright core
    s.stamp(9, 9, [
        '...........',
        '..sssssss..',
        '.s..s4s..s.',
        '..sssssss..',
    ], {'s': 'porc:1', '4': 'porc:4'})
    # fold marks on the tongue and a loose thread
    for x, y in [(23, 21), (24, 22), (24, 23), (25, 25), (26, 26)]:
        s.c(x, y, RAMPS['porc'][1])
    s.line(28, 28, 30, 25, ('porc', 'thread', 'flat', 2), 1)
    s.c(30, 25, RAMPS['porc'][2]); s.c(29, 26, RAMPS['porc'][2]); s.c(29, 27, RAMPS['porc'][2]); s.c(28, 28, RAMPS['porc'][2])
    # face
    s.stamp(9, 14, [
        '.oo....oo.',
        'oWWo..oWWo',
        'oWoo..ooWo',
        '.oo....oo.',
        '..........',
        '...oKKo...',
        '....oo....',
    ])
    # tear sewn with indigo thread
    s.stamp(9, 22, ['BoB', '.o.', 'BoB', '.o.'])
    s.outline()
    s.flame(14, 8)


@sprite('hanji', '한지', 2)
def hanji(s):
    T = [(6, 14), (23, 11), (27, 23), (9, 26)]
    s.poly([(x + 2, y + 3) for x, y in T], ('hanji', 'sheet3', 'flat', 1))
    s.poly([(x + 1, y + 1) for x, y in T], ('hanji', 'sheet2', 'flat', 2))
    s.poly(T, ('hanji', 'top', 'flat', 3))
    # two corners curling up into heavy eyelids
    club(s, 6, 15, 12, 13, [1.7, 1.4], ('hanji', 'curlL', 'cyl', 3))
    club(s, 16, 12, 22, 11, [1.4, 1.8], ('hanji', 'curlR', 'cyl', 3))
    s.shade()
    for x, y in reg(s, 'curlL', 'curlR'):
        if s.col[y][x] == RAMPS['hanji'][1]:
            s.c(x, y, RAMPS['hanji'][2])
    # fibre flecks
    for x, y in [(14, 21), (15, 21), (20, 23), (21, 23), (11, 24), (24, 18), (13, 18)]:
        s.c(x, y, RAMPS['hanji'][2])
    # torn corner patched with a paler scrap
    s.stamp(21, 21, [
        '4444.',
        '43334',
        '4333.',
        '.44..',
    ], {'4': 'hanji:2', '3': 'hanji:4'})
    # half-closed eyes under the curls, small smile
    s.stamp(8, 16, [
        'oWWo...oWWo',
        '.oo.....oo.',
        '...........',
        '...o...o...',
        '....oKo....',
    ])
    s.outline()
    s.flame(20, 8)

# ======================================================================= grade 3


@sprite('samtaegi', '삼태기', 3)
def samtaegi(s):
    s.ellipse(15.5, 23, 10.5, 12, ('straw', 'shell', 'sphere', 3))
    cut(s, lambda x, y, r: y > 28)
    s.ellipse(15.5, 25.5, 7, 6, ('straw', 'inside', 'flat', 1))
    cut(s, lambda x, y, r: y > 28)
    s.ellipse(15.5, 28, 7.5, 4.5, ('earth', 'dirt', 'sphere', 3))
    cut(s, lambda x, y, r: y > 28)
    s.rect(6, 29, 25, 29, ('straw', 'lip', 'flat', 2))
    # loop handles on both sides
    s.stamp(3, 18, ['.ss', 's.s', '.ss'], {'s': ('straw', 'loopL', 'flat', 3)})
    s.stamp(26, 18, ['ss.', 's.s', 'ss.'], {'s': ('straw', 'loopR', 'flat', 2)})
    s.shade()
    # woven ribs fanning out from the bottom, round strands across
    for x, y in reg(s, 'shell'):
        a = math.degrees(math.atan2(y - 30, x - 15.5))
        if int(a + 180) % 20 < 4:
            step(s, x, y, 'straw', -1)
        elif y % 3 == 0:
            step(s, x, y, 'straw', -1)
    # the inside back wall in shadow, darker at the top
    for x, y in reg(s, 'inside'):
        if y < 21:
            s.c(x, y, SINGLE['K'])
        elif y % 2 == 0:
            s.c(x, y, RAMPS['straw'][0])
    for x, y in reg(s, 'lip'):
        if x % 3 == 0:
            s.c(x, y, RAMPS['straw'][1])
    # chaff on the heap of earth
    for x, y in [(11, 26), (14, 25), (18, 26), (20, 27), (12, 28), (16, 27)]:
        s.c(x, y, RAMPS['straw'][4])
    for x, y in [(8, 15), (9, 14), (10, 13)]:
        s.c(x, y, RAMPS['straw'][4])
    # broken rib poking out
    for x, y in [(22, 12), (23, 11), (24, 10)]:
        s.c(x, y, RAMPS['straw'][1])
    s.stamp(11, 14, [
        '.ooo..ooo.',
        'oWWo..oWWo',
        'oWoo..ooWo',
        '.oo....oo.',
    ])
    s.outline()
    s.flame(16, 10)


@sprite('mogitbul', '모깃불', 3)
def mogitbul(s):
    # three puffs of smoke drifting up and to the left
    for k, (x, y, rx, ry) in enumerate([(13, 16, 2, 1.3), (8.5, 11, 2.5, 1.8), (12, 5.5, 3.2, 2)]):
        s.ellipse(x, y, rx, ry, ('hanji', f'sm{k}', 'sphere', 3 if k else 2))
    # heap of mugwort and straw
    s.ellipse(14, 25, 11, 6.5, ('straw', 'heap', 'sphere', 3))
    cut(s, lambda x, y, r: y > 29)
    s.ellipse(8, 21.5, 3, 2, ('leaf', 'mug1', 'sphere', 3))
    s.ellipse(19.5, 21.5, 3, 2, ('leaf', 'mug2', 'sphere', 3))
    cut(s, lambda x, y, r: r in ('mug1', 'mug2') and y > 22)
    s.shade()
    for x, y in reg(s, 'heap'):
        if (x + y * 2) % 5 == 0:
            step(s, x, y, 'straw', -1)
    for x, y in [(5, 27), (6, 26), (23, 26), (24, 27), (14, 20), (11, 20)]:
        s.c(x, y, RAMPS['leaf'][3])
    # inner curl of the puffs
    for x, y in [(11, 6), (12, 6), (13, 5), (8, 11), (9, 11)]:
        s.c(x, y, RAMPS['hanji'][1])
    # embers deep in the heap are the eyes; smouldering mouth
    s.stamp(8, 22, [
        '.oo.....oo.',
        'oZNo...oNZo',
        '.oo.....oo.',
        '...........',
        '...oKZZKo..',
        '....oooo...',
    ])
    for x, y in [(5, 29), (22, 29)]:
        s.c(x, y, RAMPS['red'][3])
    s.outline()
    s.flame(21, 17)
    s.c(17, 12, s.colour('N')); s.c(26, 13, s.colour('Z'))


@sprite('saekkijul', '새끼줄', 3)
def saekkijul(s):
    s.ellipse(14, 26, 11, 3.5, ('straw', 'r1', 'flat', 2))
    s.ellipse(14, 22.5, 10, 3.5, ('straw', 'r2', 'flat', 3))
    s.ellipse(14, 19, 9, 3.2, ('straw', 'r3', 'flat', 3))
    s.ellipse(14, 18.7, 5, 1.4, ('char', 'hole', 'none', 0))
    # loose end runs out of the bottom turn and lies flat on the ground, frayed
    s.line(23, 28, 28, 28, ('straw', 'end', 'flat', 3), 2)
    s.shade()
    # twisted strands, dark groove under every turn
    for x, y in reg(s, 'r1', 'r2', 'r3', 'end'):
        r = s.mat[y][x][1]
        below = s.mat[y + 1][x] if y + 1 < s.h else None
        if r != 'end' and (below is None or below[1] != r):
            s.c(x, y, RAMPS['straw'][1])
        elif (x + y) % 4 < 2:
            s.c(x, y, RAMPS['straw'][3])
        else:
            s.c(x, y, RAMPS['straw'][2])
    # splayed straw at the cut end
    s.stamp(29, 27, ['w.', 'vw', 'uv', 'w.'], L)
    # eyes peering from the middle of the coil
    s.stamp(8, 17, [
        '.KKKKKKKKKK.',
        'KoWWKKKKWWoK',
        '.KWoKKKKoWK.',
    ])
    s.stamp(10, 23, ['oKKKKKo', '.ooooo.'])
    # 금줄 tucks: a lump of charcoal and a white paper strip
    s.stamp(4, 21, ['dc', 'cd', 'dc'], EMBER)
    s.stamp(19, 22, ['WW', '.W', 'WW', 'W.'])
    s.outline()
    s.flame(14, 16)


@sprite('hamjibak', '함지박', 3)
def hamjibak(s):
    s.ellipse(15.5, 18.5, 13, 8.5, ('pwood', 'body', 'sphere', 3))
    cut(s, lambda x, y, r: y < 15)
    s.ellipse(15.5, 15, 13, 4.5, ('pwood', 'rim', 'flat', 3))
    s.ellipse(15.5, 15, 10.5, 2.7, ('pwood', 'inner', 'none', 1))
    s.shade()
    for x, y in reg(s, 'inner'):
        if y >= 16:
            s.c(x, y, RAMPS['pwood'][2])
    # yellow beans
    for x, y in [(10, 15), (11, 15), (13, 16), (14, 16), (16, 15), (17, 15), (19, 16), (20, 16), (15, 17), (12, 17)]:
        s.c(x, y, SINGLE['Y'] if (x + y) % 2 else RAMPS['straw'][4])
    # hand-polished glint on the rim, adze marks on the side
    for x, y in [(5, 13), (6, 12), (7, 12), (4, 14)]:
        s.c(x, y, RAMPS['pwood'][4])
    for x, y in reg(s, 'body'):
        if y == 25 and x % 4 == 1:
            step(s, x, y, 'pwood', -1)
    # face
    s.stamp(10, 19, [
        '.ooo....ooo.',
        'oWWo....oWWo',
        'oWoo....ooWo',
        '.oo......oo.',
        '............',
        '.oKKKKKKKKo.',
        '..oWWooWWo..',
        '...oo..oo...',
    ])
    # crack stitched shut with iron staples
    for y in range(18, 27):
        s.c(25 - (y > 22), y, SINGLE['o'])
    for y in (19, 22, 25):
        for x in range(23, 27):
            if s.col[y][x]:
                s.c(x, y, RAMPS['iron'][4] if x < 25 else RAMPS['iron'][3])
    s.outline()
    s.flame(25, 11)


@sprite('bagaji', '바가지', 3)
def bagaji(s):
    A = -10
    cx, cy = 15, 14
    s.ellipse(15.5, 15, 11.5, 13, ('gourd', 'body', 'sphere', 3))
    ta = math.tan(math.radians(-A))
    cut(s, lambda x, y, r: y < cy - (x - cx) * ta * -1 and not in_rell(x, y, cx, cy, 11, 4, A))
    rell(s, cx, cy, 11, 4, A, ('gourd', 'rim', 'flat', 3))
    rell(s, cx, cy, 9.5, 2.8, A, ('hanji', 'inside', 'flat', 3))
    rell(s, cx + 1.5, cy + .6, 5.5, 1.4, A, ('blue', 'water', 'flat', 3))
    # stem at the narrow end of the rim
    s.line(25, 13, 27, 10, ('wood', 'stem', 'flat', 3), 2)
    s.shade()
    for x, y in reg(s, 'water'):
        if s.col[y][x] == RAMPS['blue'][2]:
            s.c(x, y, RAMPS['blue'][3])
    s.c(14, 14, RAMPS['blue'][4]); s.c(15, 14, RAMPS['blue'][4])
    # gourd shine
    for x, y in [(6, 18), (6, 19), (7, 17), (7, 20)]:
        s.c(x, y, RAMPS['gourd'][4])
    # crescent eyes and smile on the belly
    s.stamp(9, 19, [
        '.ooo...ooo.',
        'o...o.o...o',
        '...........',
        '..o.....o..',
        '...oKKKo...',
        '....ooo....',
    ])
    # crack sewn up with thread
    s.stamp(21, 18, ['oW', 'Wo', '.oW', 'Wo', '.o'])
    s.outline()
    s.flame(7, 9)


@sprite('che', '체', 3)
def che(s):
    A = 12
    rell(s, 16, 18, 12, 7, A, ('wood', 'band', 'cyl', 3))
    rell(s, 16, 13, 12, 7, A, ('wood', 'rim', 'flat', 3))
    rell(s, 16, 13, 10, 5.3, A, ('hanji', 'mesh', 'flat', 2))
    s.shade()
    for x, y in reg(s, 'mesh'):
        if x % 3 == 0 or y % 3 == 0:
            s.c(x, y, RAMPS['hanji'][1])
    # worn-through hole in the mesh
    s.stamp(18, 11, ['.K.', 'KKK', '.Kw'], {'w': 'hanji:4'})
    # sinew lashing on the hoop
    for x, y in reg(s, 'band'):
        if x in (8, 9) and y > 17:
            s.c(x, y, RAMPS['straw'][3] if x == 8 else RAMPS['straw'][2])
    # shine on the rim
    for x, y in [(6, 10), (7, 9), (8, 8), (9, 8)]:
        if s.col[y][x]:
            s.c(x, y, RAMPS['wood'][4])
    # face on the hoop band
    s.stamp(11, 20, [
        'ooo....ooo.',
        'oWWo...oWWo',
        'oWoo...ooWo',
        '.oo.....oo.',
        '....oKo....',
    ])
    s.outline()
    # sparks sifting down through the mesh
    for x, y in [(12, 29), (13, 30), (17, 30), (21, 28), (22, 29)]:
        s.c(x, y, s.colour('N' if (x + y) % 2 else 'Z'))
    s.flame(6, 9)


@sprite('gireumbyeong', '기름병', 3)
def gireumbyeong(s):
    # small squat belly under a long narrow neck: the bottle's tell
    s.ellipse(15.5, 23.5, 8.5, 5.5, ('glaze', 'belly', 'sphere', 3))
    s.rect(14, 9, 17, 18, ('glaze', 'neck', 'cyl', 3))
    s.rect(13, 8, 18, 8, ('glaze', 'lip', 'flat', 3))
    s.rect(14, 4, 17, 7, ('straw', 'stopper', 'cyl', 3))
    s.shade()
    # straw plug tufts
    s.stamp(13, 3, ['w.v.w.'], L)
    for y in range(4, 8):
        s.c(15, y, RAMPS['straw'][2])
    # oil run: a glossy streak from the lip down the neck and belly
    for x, y in [(14, 10), (14, 11), (14, 12), (14, 13), (14, 14), (14, 15), (13, 18), (12, 19), (11, 20)]:
        s.c(x, y, '#c8a080')
    for x, y in [(10, 21), (9, 22), (9, 23)]:
        s.c(x, y, RAMPS['glaze'][4])
    # red cord round the neck with a dangling end
    for x in range(14, 18):
        s.c(x, 16, SINGLE['R'] if x % 2 else SINGLE['r'])
    s.stamp(18, 16, ['R', 'r', '.R'])
    # face
    s.stamp(11, 20, [
        '.oo....oo.',
        'oWWo..oWWo',
        'oWoo..ooWo',
        '.oo....oo.',
        '...oKKo...',
        '....oo....',
    ])
    s.outline()
    s.flame(23, 12)


@sprite('bujipge', '부집게', 3)
def bujipge(s):
    # two arms sprung open from the ring, tips closing on a live coal
    s.line(13, 13, 7, 24, ('iron', 'armA', 'flat', 3), 2)
    s.line(7, 24, 9, 27, ('iron', 'armA', 'flat', 3), 2)
    s.line(17, 13, 23, 24, ('iron', 'armB', 'flat', 3), 2)
    s.line(23, 24, 21, 27, ('iron', 'armB', 'flat', 3), 2)
    s.ellipse(15.5, 26, 5, 2.8, ('char', 'coal', 'sphere', 3))
    # the bent ring at the top is the head
    s.ellipse(15.5, 9, 6, 4.5, ('iron', 'head', 'flat', 3))
    s.ellipse(15.5, 9.3, 4, 2.6, ('char', 'face', 'none', 0))
    s.shade()
    # worn bright edge along the outer side of each arm and the ring
    for x, y in reg(s, 'armA', 'armB', 'head'):
        if not s.filled(x - 1, y) or not s.filled(x, y - 1):
            s.c(x, y, RAMPS['iron'][4])
    # the coal: grey crust over red heat
    s.stamp(11, 24, [
        '..dddddd.',
        '.dqqrdcdd',
        'drqeqqrdc',
        '.crreqrc.',
        '..ccccc..',
    ], EMBER)
    # rag wound round one arm
    s.stamp(9, 17, ['BB.', 'BbB', '.bb'])
    # face inside the ring; the gap between the arms is the open mouth
    s.stamp(12, 7, [
        '.KKKKKK.',
        'WWKKKKWW',
        'WoKKKKoW',
        '..KoKo..',
    ])
    s.stamp(14, 14, ['WoW'])
    s.outline()
    for x, y in [(5, 27), (26, 26), (25, 21)]:
        s.c(x, y, s.colour('N' if x % 2 else 'Z'))
    s.flame(25, 9)


@sprite('jaetmulsiru', '잿물시루', 3)
def jaetmulsiru(s):
    # lye-making set-up: the steamer full of ash sits on a wooden bridge laid over a wide basin
    s.poly([(3, 25), (28, 25), (25, 29), (6, 29)], ('glaze', 'basin', 'cyl', 3))
    s.ellipse(15.5, 25, 12, 1, ('blue', 'lye', 'flat', 3))
    s.rect(2, 21, 29, 22, ('wood', 'bridge', 'flat', 3))
    s.poly([(7, 11), (24, 11), (21, 20), (10, 20)], ('onggi', 'body', 'cyl', 3))
    s.rect(5, 13, 6, 14, ('onggi', 'earL', 'flat', 3))
    s.rect(25, 13, 26, 14, ('onggi', 'earR', 'flat', 2))
    s.ellipse(15.5, 11, 9, 2, ('onggi', 'rim', 'flat', 3))
    # heap of grey ash in the mouth
    s.ellipse(15.5, 10, 7, 3, ('stone', 'ash', 'sphere', 3))
    cut(s, lambda x, y, r: r == 'ash' and y > 10 and not (((x - 15.5) / 8) ** 2 + ((y - 11) / 1.6) ** 2 <= 1))
    s.shade()
    for x, y in [(12, 8), (13, 8), (18, 9), (16, 8)]:
        s.c(x, y, RAMPS['stone'][4])
    for x, y in [(15, 9), (11, 10), (20, 10)]:
        s.c(x, y, RAMPS['stone'][2])
    for x, y in reg(s, 'bridge'):
        s.c(x, y, RAMPS['wood'][4 if y == 21 else 2])
    for x, y in reg(s, 'lye'):
        s.c(x, y, RAMPS['blue'][4] if x < 12 else RAMPS['blue'][3])
    # lye dripping from the bottom holes down into the basin
    for x, y in [(12, 23), (12, 24), (19, 23), (19, 24)]:
        s.c(x, y, RAMPS['blue'][4])
    s.stamp(10, 13, [
        '.oo...oo.'.center(11, '.'),
        'oWWo...oWWo',
        'oWoo...ooWo',
        '.oo.....oo.',
        '...oKKKo...',
        '....ooo....',
    ])
    s.outline()
    s.flame(16, 8)


@sprite('jipsingol', '짚신골', 3)
def jipsingol(s):
    # wooden last in two blocks, a pale wedge driven between them
    s.poly([(3, 23), (4, 18), (8, 14), (12, 12), (15, 12), (15, 23)], ('pwood', 'toe', 'flat', 3))
    s.poly([(19, 24), (19, 12), (21, 10), (25, 10), (27, 12), (27, 24)], ('pwood', 'heel', 'cyl', 3))
    s.poly([(15, 8), (20, 8), (18, 18), (17, 18)], ('bamboo', 'wedge', 'cyl', 3))
    # the straw sandal pulled over them
    s.poly([(2, 25), (4, 21), (28, 21), (29, 24), (28, 28), (26, 29), (5, 29), (2, 27)], ('straw', 'sole', 'flat', 3))
    s.shade()
    # gaps either side of the wedge so it reads as a separate piece
    for y in range(12, 21):
        for x in (16, 19):
            if s.mat[y][x] and s.mat[y][x][1] != 'wedge':
                s.c(x, y, SINGLE['o'])
    # weave of the sandal: vertical warp and a dark welt
    for x, y in reg(s, 'sole'):
        if x % 3 == 0:
            step(s, x, y, 'straw', -1)
        if y == 26:
            step(s, x, y, 'straw', -1)
    s.stamp(4, 20, ['.w..w..w..w..w..w..w..w..'], L)
    # hand-worn shine on the tops, grain on the heel
    for x, y in [(7, 15), (8, 14), (9, 14), (21, 11), (22, 11), (23, 11), (16, 9)]:
        s.c(x, y, RAMPS['pwood'][4] if x != 16 else RAMPS['bamboo'][4])
    for y in range(14, 20, 2):
        s.c(25, y, RAMPS['pwood'][2]); s.c(25, y + 1, RAMPS['pwood'][2])
    # face above the toe of the sandal
    s.stamp(5, 14, [
        '.oo...oo.',
        'oWWo.oWWo',
        'oWoo.ooWo',
        '.oo...oo.',
        '...oKKo..',
    ])
    # frayed straw at the heel
    s.stamp(29, 24, ['w', 'v'], L)
    s.outline()
    s.flame(23, 8)


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
