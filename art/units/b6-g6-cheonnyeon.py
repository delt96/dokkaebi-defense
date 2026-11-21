"""b6-g6-cheonnyeon: unit sprites -> packages/client/public/sprites/<id>.png, sheet -> art/units/b6-g6-cheonnyeon-sheet.png"""
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


def hsh(x, y, n):
    return ((x * 73856093) ^ (y * 19349663) ^ 0x5bd1e995) % n


def reg(s, *names):
    return {(x, y) for y in range(s.h) for x in range(s.w) if s.mat[y][x] and s.mat[y][x][1] in names}


def glint(s, names, colour=None):
    """Grade-6 reflection: the top edge pixel of the given regions takes the flame colour. Call after outline."""
    colour = colour or FLAMES[6][1]
    pts = []
    for x, y in reg(s, *names):
        if y > 0 and s.col[y - 1][x] == OUT and (s.mat[y - 1][x] is None or s.mat[y - 1][x][0] == '_'):
            ramp = s.mat[y][x][0]
            if ramp in RAMPS and s.col[y][x] in RAMPS[ramp]:
                pts.append((x, y))
    for x, y in pts:
        s.c(x, y, colour)


def sparks(s, pts):
    for k, (x, y) in enumerate(pts):
        s.c(x, y, s.colour('N' if k % 2 else 'Z'))


def ring(s, cx, cy, rx, ry, w, mat, keep=None):
    for y in range(s.h):
        for x in range(s.w):
            d = ((x - cx) / (rx + .5)) ** 2 + ((y - cy) / (ry + .5)) ** 2
            di = ((x - cx) / max(.1, rx + .5 - w)) ** 2 + ((y - cy) / max(.1, ry + .5 - w)) ** 2
            if d <= 1 and di > 1 and (keep is None or keep(x, y)):
                s.m(x, y, mat)


# ======== one function per unit id

RAMPS.setdefault('celadon', ['#1a3432', '#2a524c', '#43776c', '#649c8e', '#92c4b2'])


def sep(s, front, colour=OUT):
    """Outline-coloured seam on the pixels of other parts that touch the front part."""
    front = set(front)
    hits = set()
    for x, y in front:
        for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + a, y + b)
            if q not in front and s.filled(*q) and s.col[q[1]][q[0]] != colour:
                hits.add(q)
    for x, y in hits:
        s.c(x, y, colour)


@sprite('cheonnyeonmaetbangseok', '천년 맷방석', 6)
def cheonnyeonmaetbangseok(s):
    # thick coiled straw mat
    s.ellipse(15.5, 26, 13, 3, ('straw', 'mside', 'cyl', 2))
    s.rect(2, 19, 29, 26, ('straw', 'mside', 'cyl', 2))
    s.ellipse(15.5, 19, 13, 3.5, ('straw', 'mtop', 'flat', 3))
    # sesame meal heaped on the right
    s.poly([(18, 21), (20, 17), (23, 15), (26, 15), (29, 18), (29, 21)], ('hanji', 'meal', 'sphere', 3))
    # one millstone with its wooden handle peg
    s.ellipse(12, 15.5, 6.5, 2.3, ('stone', 'stside', 'cyl', 2))
    s.rect(5, 10, 18, 15, ('stone', 'stside', 'cyl', 2))
    s.ellipse(12, 10, 6.5, 2.3, ('stone', 'sttop', 'flat', 3))
    s.rect(6, 5, 7, 9, ('wood', 'peg', 'cyl', 3))
    s.shade()
    for x, y in reg(s, 'mtop'):
        d = math.hypot((x - 15.5) / 13.5, (y - 19) / 4)
        if 0.62 < d < 0.74:
            s.c(x, y, RAMPS['straw'][2])
        elif d >= 0.86:
            s.c(x, y, RAMPS['straw'][4] if x < 16 else RAMPS['straw'][3])
    for x, y in reg(s, 'mside'):
        if (x + (y % 2) * 2) % 4 == 0:
            s.c(x, y, RAMPS['straw'][1])
    for x, y in reg(s, 'meal'):
        if hsh(x, y, 5) == 0:
            s.c(x, y, RAMPS['earth'][2])
    for x, y in [(4, 18), (19, 18), (5, 19)]:
        s.c(x, y, RAMPS['hanji'][3])
    # grinding hole, dressing marks
    s.stamp(11, 9, ['oKKo'])
    for x, y in [(8, 10), (15, 11)]:
        s.c(x, y, RAMPS['stone'][2])
    s.stamp(6, 7, ['YY'])
    # 금줄 round the stone: rope, white paper, red pepper
    for x in range(5, 19):
        s.c(x, 13, s.colour(L['v'] if x % 2 else L['t']))
    s.stamp(7, 14, ['W', 'W'])
    s.stamp(12, 14, ['R', 'r'])
    s.stamp(16, 14, ['W', 'W'])
    # face on the rim band
    s.stamp(8, 22, [
        '.ooo....ooo.',
        'oWWo....oWWo',
        'oWoo....ooWo',
        '.oo......oo.',
        '...oKKKKo...',
        '...oWWWWo...',
        '....oooo....',
    ])
    s.stamp(23, 23, ['BB', 'bB'])
    s.outline()
    glint(s, ['mtop', 'sttop', 'meal'])
    s.flame(24, 14)
    sparks(s, [(19, 6), (29, 9), (18, 2)])


@sprite('cheonnyeondadeumitdol', '천년 다듬잇돌', 6)
def cheonnyeondadeumitdol(s):
    # granite block
    s.poly([(6, 18), (25, 18), (28, 21), (3, 21)], ('stone', 'top', 'flat', 3))
    s.rect(3, 22, 28, 28, ('stone', 'front', 'flat', 2))
    # folded cloth: indigo, red hem, gold stripe
    s.rect(9, 15, 22, 18, ('blue', 'cloth', 'flat', 3))
    s.rect(8, 19, 23, 20, ('red', 'hem', 'flat', 3))
    s.shade()
    for x, y in reg(s, 'front', 'top'):
        k = hsh(x, y, 9)
        if k == 0:
            s.c(x, y, RAMPS['stone'][1])
        elif k == 1:
            s.c(x, y, RAMPS['stone'][4])
    for x in range(9, 23):
        s.c(x, 17, s.colour('Y' if x % 3 else 'y'))
    # a pair of bats raised and crossed like arms
    rad = [1.1, 1.2, 2.2, 2.9, 3.1, 3.1, 2.9, 2.5]
    back = set(tube(s, [(23, 20), (8, 4)], rad, 'pwood', tmap={}))
    for x, y in back:
        i = RAMPS['pwood'].index(s.col[y][x])
        s.c(x, y, RAMPS['pwood'][max(0, i - 1)])
    front = set(tube(s, [(8, 20), (23, 4)], [r + .2 for r in rad], 'pwood', tmap={}))
    for x, y in front:
        if any((x + a, y + b) in back and (x + a, y + b) not in front for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            s.c(x, y, OUT)
    for x, y in [(12, 15), (13, 14), (14, 13)]:
        s.c(x, y, RAMPS['pwood'][4])
    s.stamp(7, 18, ['RR', 'rR'])          # cloth wrapped on a grip
    s.stamp(23, 18, ['BB', 'Bb'])
    # face on the stone front, crack at the right end
    s.stamp(9, 22, [
        'ooo....ooo',
        '.WWo..oWW.',
        '.Woo..ooW.',
        '..........',
        '..oKKKKo..',
        '..oWKKWo..',
        '...oooo...',
    ])
    s.stamp(24, 22, ['o.', '.o', '.o', 'o.'])
    s.outline()
    glint(s, ['top', 'cloth'])
    s.flame(16, 10)
    sparks(s, [(4, 9), (27, 8), (5, 14)])


@sprite('cheonnyeonmunbitjang', '천년 문빗장', 6)
def cheonnyeonmunbitjang(s):
    # gate plank
    s.rect(7, 11, 27, 29, ('wood', 'plank', 'flat', 2))
    s.rect(7, 13, 27, 14, ('iron', 'strap1', 'flat', 2))
    s.rect(7, 26, 27, 27, ('iron', 'strap2', 'flat', 2))
    # bolt bar
    s.rect(9, 17, 28, 22, ('pwood', 'bolt', 'cylv', 3))
    s.ellipse(28.5, 19.5, 1, 2.5, ('pwood', 'bolt', 'cylv', 3))
    s.shade()
    sep(s, reg(s, 'bolt'))
    # iron staples over the bar
    s.rect(15, 15, 16, 24, ('iron', 'loop1', 'flat', 3))
    s.rect(23, 15, 24, 24, ('iron', 'loop2', 'flat', 3))
    # brass bolt head
    s.poly([(4, 14), (11, 14), (13, 16), (13, 24), (11, 26), (4, 26), (2, 24), (2, 16)], ('brass', 'head', 'flat', 3))
    s.shade()
    sep(s, reg(s, 'loop1') | reg(s, 'loop2'))
    for xx in (12, 18, 21):
        for y in range(11, 30):
            if s.mat[y][xx] and s.mat[y][xx][1] == 'plank' and s.col[y][xx] != OUT:
                s.c(xx, y, RAMPS['wood'][1])
                if s.mat[y][xx + 1] and s.mat[y][xx + 1][1] == 'plank' and s.col[y][xx + 1] != OUT:
                    s.c(xx + 1, y, RAMPS['wood'][3])
    for x in range(9, 27, 4):
        s.c(x, 13, RAMPS['iron'][4]); s.c(x, 26, RAMPS['iron'][4])
    for y in (15, 24):
        s.c(15, y, RAMPS['iron'][4]); s.c(23, y, RAMPS['iron'][4])
    s.c(26, 18, RAMPS['pwood'][1]); s.c(27, 18, RAMPS['pwood'][1])
    s.stamp(19, 23, ['o', 'o', '.o'])
    for x, y in [(4, 15), (11, 15), (4, 25), (11, 25)]:
        s.c(x, y, RAMPS['brass'][4])
    s.stamp(3, 16, [
        'oo....oo.',
        'oWWooWWo.',
        'oWooooWo.',
        '.oo..oo..',
        '.........',
        '.oKKKKo..',
        '.oWKKWo..',
        '..oooo...',
    ])
    s.stamp(6, 27, ['.Y.', 'RBG', 'R.G'])
    s.outline()
    glint(s, ['plank', 'head'])
    s.flame(19, 10)
    sparks(s, [(26, 6), (12, 4), (28, 9)])


@sprite('cheonnyeondoe', '천년 되', 6)
def cheonnyeondoe(s):
    s.poly([(4, 18), (21, 18), (20, 29), (5, 29)], ('wood', 'front', 'flat', 3))
    s.poly([(21, 18), (26, 13), (25, 24), (20, 29)], ('wood', 'side', 'flat', 2))
    s.poly([(4, 18), (9, 13), (26, 13), (21, 18)], ('wood', 'rim', 'flat', 3))
    s.poly([(7, 17), (10, 14), (24, 14), (20, 17)], ('hanji', 'grain', 'sphere', 3))
    s.ellipse(15, 13, 6, 2.5, ('hanji', 'grain', 'sphere', 3))
    for y in range(17, 32):
        for x in range(32):
            if s.mat[y][x] and s.mat[y][x][1] == 'grain':
                s.mat[y][x] = None
    s.ellipse(4, 27, 2, 1, ('hanji', 'pile', 'sphere', 3))
    s.shade()
    st = set()
    for x, y in [(27, 28), (27, 27), (27, 26), (27, 25), (27, 24), (27, 23), (26, 22), (26, 21), (26, 20), (26, 19), (26, 18), (26, 17), (26, 16), (25, 15), (25, 14), (25, 13), (25, 12), (25, 11)]:
        st |= {(x, y), (x + 1, y)}
    for x, y in st:
        s.c(x, y, RAMPS['wood'][4] if (x + 1, y) in st else RAMPS['wood'][2])
    sep(s, st)
    for x, y in reg(s, 'grain', 'pile'):
        if hsh(x, y, 4) == 0:
            s.c(x, y, RAMPS['straw'][3])
    for y in range(18, 26):
        s.c(3, y, RAMPS['hanji'][4 if y % 3 else 3])
        s.c(4, y, RAMPS['hanji'][3] if y % 4 else RAMPS['straw'][3])
    for x in range(5, 21):
        s.c(x, 18, RAMPS['iron'][3])
    for x, y in [(22, 17), (23, 16), (24, 15), (25, 14)]:
        s.c(x, y, RAMPS['iron'][2])
    for y in list(range(19, 22)) + list(range(25, 29)):
        xs = [x for x in range(32) if s.mat[y][x] and s.mat[y][x][1] == 'front']
        if xs:
            s.c(xs[0], y, RAMPS['iron'][3]); s.c(xs[-1], y, RAMPS['iron'][2])
    for x in range(5, 8):
        s.c(x, 28, RAMPS['iron'][3])
    for x in range(17, 20):
        s.c(x, 28, RAMPS['iron'][2])
    for x, y in [(5, 18), (12, 18), (20, 18)]:
        s.c(x, y, s.colour('Y'))
    for x, y in reg(s, 'side'):
        if (y - x // 2) % 4 == 0 and s.col[y][x] in RAMPS['wood']:
            s.c(x, y, RAMPS['wood'][1])
    for x, y in reg(s, 'front'):
        if y in (23, 27) and (x * 3 + y) % 7 and s.col[y][x] == RAMPS['wood'][3]:
            s.c(x, y, RAMPS['wood'][2])
    s.stamp(7, 20, [
        '.ooo.ooo.',
        'oWWo.oWWo',
        'oWoo.ooWo',
        '.oo...oo.',
        '..oKKKo..',
        '..oWKWo..',
        '...ooo...',
    ])
    s.stamp(22, 19, ['R', 'Rr', 'r'])
    s.outline()
    glint(s, ['grain', 'rim'])
    s.flame(15, 9)
    sparks(s, [(5, 8), (24, 7), (21, 2)])


@sprite('cheonnyeontteokpan', '천년 떡판', 6)
def cheonnyeontteokpan(s):
    s.poly([(5, 17), (27, 17), (29, 21), (3, 21)], ('wood', 'top', 'flat', 3))
    s.rect(3, 22, 29, 28, ('wood', 'edge', 'flat', 2))
    s.ellipse(11, 17.5, 7, 3, ('porc', 'cake', 'sphere', 3))
    s.ellipse(10, 15, 4, 2, ('porc', 'cake', 'sphere', 3))
    s.poly([(5, 19), (9, 19), (9, 23), (7, 24), (5, 22)], ('porc', 'cake', 'sphere', 3))
    # mallet: round log head lying on the board, handle up to the right
    club(s, 22, 12, 27, 2, [1.3, 1.3], ('pwood', 'handle', 'cyl', 3))
    club(s, 18, 14, 24, 14, [2.6, 3.0, 3.0, 2.8], ('wood', 'mhead', 'cylv', 3))
    s.ellipse(26, 14, 1.5, 3, ('wood', 'mend', 'flat', 3))
    s.shade()
    sep(s, reg(s, 'mend'))
    s.c(26, 14, RAMPS['wood'][1]); s.c(26, 13, RAMPS['wood'][2]); s.c(26, 15, RAMPS['wood'][2])
    for x in range(4, 29):
        for y in (24, 27):
            if s.mat[y][x] and s.mat[y][x][1] == 'edge' and (x + y) % 5:
                s.c(x, y, RAMPS['wood'][1])
    for x, y in reg(s, 'mhead'):
        if x in (19, 23) and s.col[y][x] != OUT:
            s.c(x, y, RAMPS['brass'][3 if y < 14 else 2])
    for x, y in [(7, 14), (8, 14), (7, 15)]:
        s.c(x, y, RAMPS['porc'][4])
    s.stamp(12, 21, [
        '.ooo...ooo.',
        'oWWo...oWWo',
        'oWoo...ooWo',
        '.oo.....oo.',
        '...oKKKKo..',
        '...oWWWWo..',
        '....oooo...',
    ])
    s.stamp(24, 23, ['oo', 'o.'], {'o': 'iron:4'})
    s.stamp(25, 5, ['RR', 'Rr', '.R', '.B', '.Y'])
    s.outline()
    glint(s, ['top', 'cake', 'mhead'])
    s.flame(10, 12)
    sparks(s, [(3, 6), (18, 5), (4, 11)])


@sprite('cheonnyeontteoksal', '천년 떡살', 6)
def cheonnyeontteoksal(s):
    s.poly([(5, 22), (26, 22), (29, 25), (2, 25)], ('porc', 'caketop', 'flat', 3))
    s.rect(2, 26, 29, 28, ('porc', 'cakeedge', 'flat', 2))
    s.poly([(6, 12), (25, 12), (27, 14), (4, 14)], ('pwood', 'btop', 'flat', 3))
    s.rect(4, 15, 27, 20, ('pwood', 'block', 'flat', 2))
    club(s, 19, 12, 19, 5, [2.0, 1.4, 1.6, 2.4], ('pwood', 'handle', 'cyl', 3))
    s.shade()
    for x in range(5, 27):
        s.c(x, 20, RAMPS['pwood'][1] if x % 2 else RAMPS['pwood'][3])
    s.stamp(17, 10, ['YYYYY'])
    s.stamp(18, 6, ['BB', 'bB'])
    for fx, c in [(6, 'R'), (12, 'G'), (19, 'R'), (25, 'G')]:
        s.stamp(fx, 22, ['.%s.' % c, '%sY%s' % (c, c), '.%s.' % c])
    s.stamp(14, 26, ['ooo'], {'o': 'porc:1'})
    s.stamp(8, 14, [
        '.ooo....ooo.',
        'oWWo....oWWo',
        'oWoo....ooWo',
        '.oo......oo.',
        '...oKKKKo...',
    ])
    s.stamp(11, 19, ['oWWWWo'])
    s.c(26, 15, RAMPS['pwood'][1]); s.c(26, 16, RAMPS['pwood'][1])
    s.outline()
    glint(s, ['btop', 'caketop', 'handle'])
    s.flame(9, 11)
    sparks(s, [(3, 4), (16, 2), (27, 8)])


@sprite('cheonnyeondolmulhwak', '천년 돌물확', 6)
def cheonnyeondolmulhwak(s):
    s.ellipse(15.5, 17, 13, 10, ('stone', 'body', 'cyl', 3))
    for y in range(0, 15):
        for x in range(32):
            s.mat[y][x] = None
    s.ellipse(15.5, 14, 13, 4, ('stone', 'rim', 'flat', 3))
    s.ellipse(15.5, 13.5, 9, 2, ('blue', 'water', 'flat', 3))
    s.shade()
    for x, y in reg(s, 'body'):
        if hsh(x, y, 9) == 0:
            s.c(x, y, RAMPS['stone'][1])
    for x, y in reg(s, 'water'):
        if (x + y * 3) % 7 == 0:
            s.c(x, y, RAMPS['blue'][4])
    for x in range(8, 24):
        if s.mat[16][x] and s.mat[16][x][1] == 'rim':
            s.c(x, 16, RAMPS['stone'][2])
    # water brimming over the front-right lip and running down
    for x, y in [(21, 15), (22, 15), (21, 16), (22, 16), (22, 17), (22, 18), (23, 19), (23, 20), (23, 21), (23, 22), (22, 23)]:
        s.c(x, y, RAMPS['blue'][3] if x < 23 or y < 21 else RAMPS['blue'][4])
    s.c(22, 24, RAMPS['blue'][4])
    # moss on the left
    for x, y in [(4, 21), (5, 22), (5, 23), (6, 24), (7, 25), (3, 19), (4, 20), (8, 26), (24, 26), (25, 25)]:
        s.c(x, y, RAMPS['leaf'][4] if (x + y) % 2 else RAMPS['leaf'][3])
    s.stamp(18, 12, ['.gGg', 'gGGg', '.gg.'], {'g': 'gourd:2', 'G': 'gourd:4'})
    s.stamp(22, 12, ['yy'], {'y': 'brass:3'})
    s.stamp(8, 18, [
        'ooo....ooo.',
        '.oWWooWWo..',
        '.oWooooWo..',
        '..oo..oo...',
        '...oooo....',
        '..oKWWKo...',
        '...oooo....',
    ])
    s.outline()
    glint(s, ['rim'])
    s.flame(12, 11)
    sparks(s, [(19, 4), (4, 7), (21, 8)])


@sprite('cheonnyeonmuseosot', '천년 무쇠솥', 6)
def cheonnyeonmuseosot(s):
    s.rect(7, 25, 9, 28, ('iron', 'leg1', 'flat', 2))
    s.rect(15, 26, 16, 29, ('iron', 'leg2', 'flat', 2))
    s.rect(22, 25, 24, 28, ('iron', 'leg3', 'flat', 1))
    s.ellipse(15.5, 22, 10, 4.5, ('iron', 'pot', 'sphere', 3))
    s.rect(7, 16, 24, 17, ('iron', 'lip', 'flat', 3))
    ring(s, 4.5, 16, 2.5, 3, 1.4, ('iron', 'earL', 'flat', 3))
    ring(s, 26.5, 16, 2.5, 3, 1.4, ('iron', 'earR', 'flat', 2))
    s.poly([(8, 13), (23, 13), (22, 16), (9, 16)], ('onggi', 'siru', 'cyl', 3))
    s.ellipse(7.5, 14, 1, 1, ('onggi', 'lugL', 'flat', 3))
    s.ellipse(23.5, 14, 1, 1, ('onggi', 'lugR', 'flat', 2))
    # lid jumping up, tilted
    s.poly([(9, 11), (21, 9), (23, 10), (10, 12)], ('wood', 'lid', 'flat', 3))
    # steam cloud billowing out on the right
    s.ellipse(25.5, 10, 2, 1.5, ('hanji', 'puff1', 'sphere', 3))
    s.ellipse(27, 7.5, 1.2, 1.1, ('hanji', 'puff2', 'sphere', 3))
    s.shade()
    for x in range(9, 23, 2):
        s.c(x, 13, RAMPS['onggi'][4])
    for x in range(10, 22, 3):
        s.c(x, 15, RAMPS['onggi'][1])
    s.c(4, 14, s.colour('Y')); s.c(26, 14, s.colour('Y'))
    for x, y in [(21, 25), (22, 24), (8, 21), (19, 26)]:
        s.c(x, y, RAMPS['onggi'][3])
    s.stamp(8, 18, [
        '.ooo.....ooo.',
        'oWWWo...oWWWo',
        'oWWoo...ooWWo',
        '.ooo.....ooo.',
        '...ooooooo...',
        '...oWKWKWo...',
        '....ooooo....',
    ])
    s.outline()
    for x, y in [(7, 12), (6, 11), (5, 11), (4, 10), (24, 7), (25, 6), (25, 5)]:
        s.c(x, y, RAMPS['hanji'][4] if x < 20 else RAMPS['hanji'][3])
    glint(s, ['lid', 'lip', 'siru'])
    s.flame(14, 10)
    sparks(s, [(8, 4), (20, 3)])


@sprite('cheonnyeonjing', '천년 징', 6)
def cheonnyeonjing(s):
    s.rect(3, 9, 4, 27, ('wood', 'post1', 'flat', 3))
    s.rect(27, 9, 28, 27, ('wood', 'post2', 'flat', 2))
    s.rect(2, 8, 29, 9, ('wood', 'beam', 'flat', 3))
    s.ellipse(15.5, 19.5, 9, 7.5, ('brass', 'gong', 'sphere', 3))
    s.shade()
    for x, y in reg(s, 'gong'):
        d = math.hypot((x - 15.5) / 9.5, (y - 19.5) / 8)
        if d > 0.86:
            s.c(x, y, RAMPS['brass'][2 if x + y < 36 else 1])
        elif 0.62 < d < 0.7 and y < 21:
            s.c(x, y, RAMPS['brass'][4] if x < 16 else RAMPS['brass'][2])
    for x, y in [(10, 10), (11, 11), (21, 10), (20, 11)]:
        s.c(x, y, s.colour('R'))
    s.stamp(5, 10, ['RY', 'RB', 'RB', '.B'])
    s.stamp(25, 10, ['GW', 'GR', 'GR', 'G.'])
    s.stamp(3, 10, ['vt'], L); s.stamp(27, 10, ['vt'], L)
    s.stamp(10, 15, [
        'oo....oo..',
        '.oWWooWWo.',
        '.oWooooWo.',
        '..oo..oo..',
    ])
    s.stamp(13, 20, ['.oo.', 'oKKo', 'oKKo', '.oo.'])
    # mallet in front, lower right
    club(s, 19, 28, 24, 23, [0.9, 0.9], ('wood', 'stick', 'cyl', 3))
    s.ellipse(24.5, 22.5, 1.8, 1.8, ('red', 'pad', 'sphere', 3))
    for p in reg(s, 'stick') | reg(s, 'pad'):
        s.col[p[1]][p[0]] = None
    s.shade()
    sep(s, reg(s, 'stick') | reg(s, 'pad'))
    s.outline()
    glint(s, ['beam', 'gong'])
    s.flame(16, 9)
    for x, y in [(6, 18), (6, 19), (6, 20), (25, 16), (25, 17), (25, 18)]:
        s.c(x, y, RAMPS['brass'][4])


@sprite('cheonnyeoneohwa', '천년 관솔횃대', 6)
def cheonnyeoneohwa(s):
    # straw boat: flat deck, rounded hull, prow swept up on the left
    s.poly([(2, 17), (4, 17), (6, 21), (10, 23), (22, 23), (27, 21), (29, 21), (28, 25), (23, 28), (9, 28), (4, 25), (2, 21)], ('straw', 'boat', 'flat', 3))
    s.rect(15, 16, 16, 23, ('wood', 'pole', 'cyl', 3))
    s.poly([(9, 10), (23, 10), (21, 14), (19, 17), (13, 17), (11, 14)], ('char', 'cage', 'none', 1))
    s.shade()
    for x, y in reg(s, 'boat'):
        if (y - 23) % 2 == 1 and y > 23:
            s.c(x, y, RAMPS['straw'][2])
    for xx in (8, 14, 20, 25):
        for y in range(16, 30):
            if s.mat[y][xx] and s.mat[y][xx][1] == 'boat':
                s.c(xx, y, RAMPS['onggi'][2]); s.c(xx + 1, y, RAMPS['onggi'][3])
    for x in range(5, 28):
        if s.mat[23][x] and s.mat[23][x][1] == 'boat' and s.mat[22][x] is None or (s.mat[22][x] and s.mat[22][x][1] == 'pole'):
            pass
    # fire glow on the top of the basket, bars, brass rim
    for x, y in reg(s, 'cage'):
        if y == 11:
            s.c(x, y, s.colour('N' if x % 2 else 'Z'))
    for x in (12, 15, 16, 19):
        for y in range(11, 18):
            if s.mat[y][x] and s.mat[y][x][1] == 'cage':
                s.c(x, y, RAMPS['iron'][4] if x < 16 else RAMPS['iron'][3])
    for x in range(9, 24):
        if s.mat[10][x]:
            s.c(x, 10, RAMPS['brass'][4] if x < 16 else RAMPS['brass'][3])
        if s.mat[15][x] and s.mat[15][x][1] == 'cage':
            s.c(x, 15, RAMPS['iron'][3])
    s.stamp(13, 12, ['WW..WW', 'Wo..oW'])
    s.stamp(10, 12, ['N'])
    s.stamp(20, 12, ['.N'])
    s.stamp(13, 14, ['ZN..NZ'])
    s.stamp(14, 19, ['YYYY'])
    s.stamp(17, 20, ['RR', '.Rr', '..R'])
    s.outline()
    glint(s, ['boat'])
    s.flame(16, 9)
    sparks(s, [(6, 7), (26, 4), (24, 9), (8, 2)])


@sprite('cheonnyeongombangdae', '천년 곰방대', 6)
def cheonnyeongombangdae(s):
    s.ellipse(10, 26, 3.5, 3, ('blue', 'pouch', 'sphere', 3))
    s.line(4, 24, 18, 19, ('bamboo', 'stem', 'flat', 3), 3)
    s.line(1, 26, 4, 25, ('brass', 'mouth', 'flat', 3), 2)
    s.ellipse(23, 20.5, 5.5, 4.5, ('brass', 'bowl', 'sphere', 3))
    s.ellipse(23, 16.5, 5, 1.5, ('brass', 'cup', 'flat', 3))
    s.shade()
    for x in (9, 14):
        for y in range(16, 26):
            if s.mat[y][x] and s.mat[y][x][1] == 'stem':
                s.c(x, y, RAMPS['bamboo'][1])
    s.stamp(20, 16, ['oNZNNo'])
    s.stamp(8, 23, ['RRRR'])
    s.stamp(10, 21, ['R', 'r'])
    s.stamp(7, 28, ['R'])
    s.stamp(13, 26, ['Y', 'R'])
    s.stamp(16, 19, ['r', 'R', 'r'])
    s.stamp(18, 18, [
        'oo....oo.',
        'oWWooWWo.',
        'oWooooWo.',
        '.oo..oo..',
        '..oKKKo..',
        '...ooo...',
    ])
    s.outline()
    glint(s, ['bowl', 'stem'])
    s.flame(23, 15)
    sparks(s, [(18, 9), (29, 9)])


@sprite('cheonnyeonjocheongdanji', '천년 조청단지', 6)
def cheonnyeonjocheongdanji(s):
    # celadon-glazed jar: the blue-green body sets it apart from the brown onggi pots
    s.ellipse(15.5, 21.5, 12, 6.5, ('celadon', 'belly', 'sphere', 3))
    s.rect(12, 13, 19, 15, ('celadon', 'neck', 'cyl', 3))
    # hanji cover with ruffled skirt
    s.ellipse(15.5, 11.5, 6, 1.5, ('hanji', 'cover', 'sphere', 3))
    s.rect(10, 11, 21, 13, ('hanji', 'cover', 'sphere', 3))
    for x in range(10, 22, 2):
        s.mat[13][x] = None
    # amber syrup running down from the mouth
    s.rect(11, 14, 20, 15, ('brass', 'syrupT', 'flat', 2))
    s.line(11, 15, 8, 20, ('brass', 'syrupL', 'flat', 2), 2)
    s.ellipse(8, 21, 1.3, 1.3, ('brass', 'syrupL', 'flat', 2))
    s.line(20, 15, 22, 17, ('brass', 'syrupR', 'flat', 2), 2)
    s.ellipse(23, 18.5, 1, 1.2, ('brass', 'syrupR', 'flat', 2))
    s.shade()
    for x in range(10, 22):
        s.c(x, 12, s.colour('R' if x % 2 else 'r'))
    s.stamp(22, 12, ['R', '.R', '.r'])
    for x, y in [(8, 18), (9, 17), (12, 14), (13, 14), (22, 16), (7, 21)]:
        s.c(x, y, RAMPS['brass'][4])
    s.stamp(21, 23, ['.o.', 'yoy', '.o.', 'o..'], {'y': 'iron:4'})
    s.stamp(10, 19, [
        '.ooo..ooo.',
        'oWWo..oWWo',
        'oWoo..ooWo',
        '.oo....oo.',
        '..oKKKKo..',
        '..oWKKWo..',
        '...oooo...',
    ])
    s.outline()
    glint(s, ['cover', 'belly'])
    s.flame(16, 9)
    sparks(s, [(6, 5), (25, 3), (24, 8)])


@sprite('cheonnyeonyogang', '천년 요강', 6)
def cheonnyeonyogang(s):
    s.ellipse(15.5, 22.5, 12, 5.5, ('brass', 'body', 'sphere', 3))
    s.ellipse(15.5, 16, 10, 1, ('brass', 'lip', 'flat', 3))
    s.ellipse(15.5, 12, 8.5, 2, ('brass', 'lid', 'sphere', 3))
    for y in range(13, 32):
        for x in range(32):
            if s.mat[y][x] and s.mat[y][x][1] == 'lid':
                s.mat[y][x] = None
    s.rect(8, 13, 23, 14, ('char', 'gap', 'none', 0))
    s.shade()
    for x, y in [(7, 20), (8, 19), (9, 19), (6, 21), (6, 22), (10, 10), (11, 10)]:
        s.c(x, y, RAMPS['brass'][4])
    s.c(8, 20, SINGLE['W'])
    s.stamp(8, 13, ['..oWWWo..oWWWo..', '..oWWoo..ooWWo..'])
    s.stamp(12, 22, ['oooooo', 'oWKKWo', '.oooo.'])
    s.stamp(22, 21, ['.y', 'yy'], {'y': 'brass:1'})
    s.stamp(19, 25, ['ss', 's.'], {'s': 'iron:4'})
    s.stamp(23, 10, ['R', 'Rr', '.R'])
    s.outline()
    glint(s, ['lid', 'lip'])
    s.flame(16, 9)
    sparks(s, [(4, 8), (27, 5), (26, 10)])


@sprite('cheonnyeonyeonjeok', '천년 연적', 6)
def cheonnyeonyeonjeok(s):
    s.ellipse(15.5, 21.5, 12.5, 7, ('porc', 'body', 'sphere', 3))
    s.ellipse(6, 27.5, 2.5, 1.2, ('porc', 'footL', 'flat', 3))
    s.ellipse(25, 27.5, 2.5, 1.2, ('porc', 'footR', 'flat', 2))
    s.ellipse(7.5, 15, 3.5, 3, ('porc', 'domeL', 'sphere', 3))
    s.ellipse(23.5, 15, 3.5, 3, ('porc', 'domeR', 'sphere', 3))
    s.shade()
    sep(s, reg(s, 'footL') | reg(s, 'footR'))
    # cobalt painting: flowers on the flanks, wave band on the back, toes
    for cx, cy in [(5, 23), (26, 23), (15, 26)]:
        s.stamp(cx - 1, cy - 1, ['.B.', 'BbB', '.B.'])
    for x in range(11, 21):
        s.c(x, 17 + (x % 2), s.colour('B'))
    for x, y in [(5, 28), (7, 28), (24, 28), (26, 28)]:
        s.c(x, y, s.colour('b'))
    s.stamp(14, 15, ['yYYy'])
    # bulging eyes
    s.stamp(5, 13, ['.oo..', 'oWWWo', 'oWWoo', '.ooo.'])
    s.stamp(21, 13, ['..oo.', 'oWWWo', 'ooWWo', '.ooo.'])
    # wide toad mouth, spout at the middle
    s.stamp(4, 20, [
        'oo....................oo',
        '.oooooooooo..oooooooooo.',
        '..........oKKo..........',
        '...........oo...........',
    ])
    s.stamp(28, 18, ['R', 'Y', 'R'])
    s.outline()
    s.c(15, 24, RAMPS['blue'][4]); s.c(15, 25, RAMPS['blue'][3]); s.c(16, 25, RAMPS['blue'][2])
    glint(s, ['body', 'domeL', 'domeR'])
    s.flame(16, 13)
    sparks(s, [(4, 8), (27, 8)])


@sprite('cheonnyeonjokja', '천년 족자', 6)
def cheonnyeonjokja(s):
    s.line(5, 9, 11, 5, ('red', 'cordL', 'flat', 3), 1)
    s.line(26, 9, 20, 5, ('red', 'cordR', 'flat', 3), 1)
    s.rect(4, 10, 27, 11, ('wood', 'rod', 'cyl', 3))
    s.rect(6, 12, 25, 23, ('leaf', 'silk', 'flat', 3))
    s.rect(8, 13, 23, 22, ('hanji', 'paper', 'flat', 3))
    s.rect(4, 23, 27, 26, ('hanji', 'roll', 'cylv', 3))
    s.rect(2, 23, 3, 26, ('wood', 'knobL', 'flat', 3))
    s.rect(28, 23, 29, 26, ('wood', 'knobR', 'flat', 2))
    s.shade()
    for x in range(6, 26):
        s.c(x, 12, s.colour('R') if x % 2 else s.colour('r'))
    for x in range(4, 28):
        s.c(x, 24, RAMPS['hanji'][2])
    s.stamp(3, 10, ['Y'] * 2); s.stamp(28, 10, ['y'] * 2)
    s.stamp(2, 23, ['YY']); s.stamp(28, 23, ['Yy'])
    s.stamp(9, 13, [
        'oo......oo.',
        '.oWWo.oWWo.',
        '.oWoo.ooWo.',
        '..oo...oo..',
        '....oKo....',
    ])
    for xx, rows in [(10, (19, 20, 21)), (13, (19, 21)), (17, (19, 20)), (20, (19, 21))]:
        for y in rows:
            s.c(xx, y, RAMPS['char'][1]); s.c(xx + 1, y, RAMPS['char'][2])
    s.stamp(21, 15, ['RR', 'RR'])
    s.stamp(8, 21, ['hh', 'hh'], {'h': 'hanji:1'})
    s.stamp(2, 27, ['R', 'r'])
    s.stamp(29, 27, ['B', 'b'])
    s.outline()
    glint(s, ['rod', 'silk'])
    s.flame(16, 9)
    sparks(s, [(4, 4), (27, 3), (24, 7)])


@sprite('cheonnyeonbyeongpung', '천년 병풍', 6)
def cheonnyeonbyeongpung(s):
    bx = [2, 7, 11, 21, 25, 30]
    top = [13, 10, 13, 13, 10, 13]
    bot = [29, 26, 29, 29, 26, 29]
    base = [2, 3, 3, 2, 3]
    for p in range(5):
        x0, x1 = bx[p], bx[p + 1]
        for x in range(x0, x1):
            t = (x - x0) / (x1 - x0)
            yt = round(top[p] + (top[p + 1] - top[p]) * t)
            yb = round(bot[p] + (bot[p + 1] - bot[p]) * t)
            for y in range(yt, yb + 1):
                if x == x0 or (p == 4 and x == x1 - 1) or y in (yt, yb):
                    s.m(x, y, ('wood', f'fr{p}', 'none', 3 if base[p] == 3 else 2))
                elif y >= yb - 3:
                    s.m(x, y, ('blue', f'silk{p}', 'none', base[p]))
                else:
                    s.m(x, y, ('hanji', f'p{p}', 'none', base[p]))
    s.shade()
    s.stamp(4, 17, ['..g.', '.gGg', 'gGGG'])
    s.stamp(8, 14, ['.R.', 'RYR', '.R.', '.g.', '.g.'])
    s.stamp(22, 15, ['.G.', 'GGG', '.y.'])
    s.stamp(26, 17, ['BB.', '.BB', 'BB.'])
    s.stamp(12, 15, [
        'oo.....oo',
        'oWWo.oWWo',
        'oWoo.ooWo',
        '.oo...oo.',
        '.........',
        '...oKo...',
        '..oWWWo..',
        '...ooo...',
    ])
    for x in (7, 11, 21, 25):
        for y in (16, 24):
            s.c(x, y, s.colour('Y'))
    s.c(5, 23, RAMPS['hanji'][1]); s.c(4, 22, RAMPS['hanji'][1])
    s.outline()
    glint(s, ['fr0', 'fr1', 'fr2', 'fr3', 'fr4'])
    s.flame(16, 12)
    sparks(s, [(5, 6), (27, 5), (8, 3)])


@sprite('cheonnyeonsangmo', '천년 상모', 6)
def cheonnyeonsangmo(s):
    s.ellipse(15.5, 23, 12.5, 2.5, ('steel', 'brim', 'flat', 2))
    s.ellipse(15.5, 17, 8, 6.5, ('steel', 'crown', 'shine', 3))
    for y in range(22, 32):
        for x in range(32):
            if s.mat[y][x] and s.mat[y][x][1] == 'crown':
                s.mat[y][x] = None
    s.rect(8, 20, 23, 21, ('char', 'mang', 'flat', 3))
    s.rect(15, 6, 16, 10, ('brass', 'rod', 'flat', 3))
    s.shade()
    for x in range(8, 24):
        if x % 2 == 0:
            s.c(x, 20, RAMPS['char'][2])
    s.stamp(7, 20, ['YY', 'yY'])
    s.stamp(23, 20, ['Yy', 'yy'])
    s.stamp(15, 4, ['YY', 'YY'], {'Y': 'brass:4'})
    s.stamp(14, 11, ['.RR.', 'RRRr', '.rr.'])
    s.stamp(10, 14, [
        '.ooo..ooo.',
        'oWWo..oWWo',
        'oWoo..ooWo',
        '.oo....oo.',
        '...oKKo...',
        '...oWWo...',
    ])
    # the long paper streamer whirling off the spinning rod: up, over and down the right side
    pts = [(17, 4), (20, 2), (24, 2), (27, 4), (28, 7), (27, 10), (26, 13), (27, 16), (29, 19)]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        s.line(x0, y0, x1, y1, ('hanji', 'ribbon', 'flat', 4), 2)
    for x, y in reg(s, 'ribbon'):
        s.col[y][x] = RAMPS['hanji'][4] if (x + y) % 5 else RAMPS['hanji'][3]
    for x, y in reg(s, 'ribbon'):
        if not s.filled(x + 1, y) and not s.filled(x, y + 1):
            s.col[y][x] = RAMPS['hanji'][2]
    s.stamp(29, 20, ['R', 'r'])
    s.outline()
    glint(s, ['crown'])
    s.flame(7, 14)
    sparks(s, [(3, 4), (11, 5), (22, 8)])


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
