import sys, math, os
sys.path.insert(0, os.path.dirname(__file__))
from kit import Spr, preview, RAMPS, SINGLE

SPRITES = {}
NAMES = {}


def sprite(id_, name, grade=1, size=32):
    def deco(fn):
        def build():
            s = Spr(size, size, grade)
            fn(s)
            return s.image()
        SPRITES[id_] = build
        NAMES[id_] = name
        return fn
    return deco


def club(s, x0, y0, x1, y1, radii, mat):
    """Discs along an axis; radii is a list of radius stops from (x0,y0) to (x1,y1)."""
    n = int(max(abs(x1 - x0), abs(y1 - y0)) * 3) + 1
    for i in range(n + 1):
        t = i / n
        f = t * (len(radii) - 1)
        k = min(int(f), len(radii) - 2)
        r = radii[k] + (radii[k + 1] - radii[k]) * (f - k)
        cx = x0 + (x1 - x0) * t; cy = y0 + (y1 - y0) * t
        for y in range(int(cy - r - 1), int(cy + r + 2)):
            for x in range(int(cx - r - 1), int(cx + r + 2)):
                if (x + .5 - cx - .5) ** 2 + (y + .5 - cy - .5) ** 2 <= r * r:
                    s.m(x, y, mat)


L = {c: f'straw:{i}' for i, c in enumerate('stuvw')}

# ======================================================================= grade 1

@sprite('jipsin', '짚신', 1)
def jipsin(s):
    s.stamp(2, 17, [
        '.ww.........................',
        'wvuw.....................wv.',
        'vuuvw.w..w..w..w..w..w..wvut',
        'vuKKvwvwwvwwvwwvwwvwwvwvuKut',
        '.vKNZKuvvuvvuvvuvvuvvuKKKKts',
        '.vKKKKKtttttttttttttKKNZKuts',
        '..vKKuvuvuvuvuvuvuvuvuKKKuts',
        '..wvuvuvuvuvuvuvuvuvuvuvuvts',
        '...vtuvtuvtuvtuvtuvtuvtuvtss',
        '...tsttsttsttsttsttsttsttsss',
        '....sssssssssssssssssssssss.',
    ], L)
    s.outline()
    s.flame(26, 15)


@sprite('dadeumi', '다듬이방망이', 1)
def dadeumi(s):
    # a crossed pair of laundry bats, handles down, the flame sitting in the V
    rad = [1.1, 1.2, 2.4, 3.2, 3.4, 3.4, 3.2, 2.6]
    back = set(tube(s, [(24, 28), (9, 11)], rad, 'pwood', tmap={}))
    for x, y in back:
        i = RAMPS['pwood'].index(s.col[y][x])
        s.c(x, y, RAMPS['pwood'][max(0, i - 1)])
    front = set(tube(s, [(7, 28), (22, 11)], [r + .2 for r in rad], 'pwood', tmap={}))
    for x, y in front:
        if any((x + a, y + b) in back and (x + a, y + b) not in front for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            s.c(x, y, '#1e1416')
    # worn shine and an indigo cloth strip tied at the grip
    for x, y in [(12, 22), (13, 21), (14, 20)]:
        s.c(x, y, RAMPS['pwood'][4])
    s.stamp(8, 24, ['.BB', 'BBb', 'b..', 'b..'])
    # face on the front bat: heavy brows, round eyes, grim mouth
    s.stamp(16, 12, [
        'oo..oo.',
        '.Wo.Wo.',
        '.oo.oo.',
        '.......',
        '.oKKo..',
    ])
    s.outline()
    s.flame(15, 8)


@sprite('horong', '호롱', 1)
def horong(s):
    s.ellipse(15.5, 23, 7, 5.5, ('porc', 'body', 'sphere', 2))
    s.rect(13, 16, 18, 18, ('porc', 'neck', 'cyl', 2))
    s.rect(12, 16, 19, 16, ('porc', 'lip', 'flat', 2))
    s.rect(9, 29, 22, 29, ('wood', 'dish', 'flat', 2))
    s.shade()
    s.stamp(9, 20, ['.BbB.BbB.BbB.B', 'b...b...b...b.'])
    s.stamp(10, 23, [
        '.ooo....ooo.',
        'o...o..o...o',
        '............',
        '...oKKKKo...',
        '....oWWo....',
    ])
    s.c(15, 15, '#2a2224'); s.c(16, 15, '#2a2224')
    s.outline()
    s.stamp(12, 4, [
        '...A....',
        '...NA...',
        '..ANNA..',
        '..ANZNA.',
        '.ANZZNA.',
        '.ANZXZNA',
        'ANZXXZNA',
        '.ANZXZA.',
        '..ANNA..',
        '...AA...',
    ])


@sprite('bujigaengi', '부지깽이', 1)
def bujigaengi(s):
    club(s, 9, 26, 13, 18, [2.0, 2.2, 2.4], ('wood', 'stick', 'cyl', 2))
    club(s, 13, 18, 20, 9, [2.4, 2.2, 1.9], ('wood', 'stick', 'cyl', 2))
    s.shade()
    for y in range(6, 15):
        for x in range(12, 26):
            if s.col[y][x] is not None:
                s.c(x, y, RAMPS['char'][3 if (x * 7 + y * 3) % 5 == 0 else (2 if (x + y) % 3 else 1)])
    s.stamp(17, 8, ['..XZ', '.ZNA', 'NA..', 'A...'])
    s.stamp(18, 11, ['A'])
    # crack with glinting eyes
    s.stamp(10, 17, [
        '....oo',
        '.ooNZo',
        'oZNoo.',
        'oo....',
        '.o....',
    ])
    s.stamp(8, 23, ['.vvu', 'vutt', 'utts', 'ts..'], L)
    s.outline()
    s.flame(21, 7)


@sprite('buchae', '부채', 1)
def buchae(s):
    px, py = 15.5, 26.5
    for y in range(32):
        for x in range(32):
            dx, dy = x + .5 - px - .5, y + .5 - py - .5
            r = math.hypot(dx, dy); a = math.degrees(math.atan2(-dy, dx))
            if (18 <= a <= 162 and 5.5 <= r <= 14.5) or (66 <= a <= 114 and r < 5.5 and dy < 0):
                s.m(x, y, ('hanji', 'paper', 'flat', 3))
    s.shade()
    # ribs: faint radial lines, thick guard sticks at both ends, bare ribs near the rivet
    for ang in range(18, 163, 12):
        for rr in [i / 2 for i in range(2, 30)]:
            x = int(px + .5 + rr * math.cos(math.radians(ang))); y = int(py + .5 - rr * math.sin(math.radians(ang)))
            guard = ang in (18, 162)
            if rr < 6 and 66 <= ang <= 114:
                s.c(x, y, RAMPS['bamboo'][3 if ang < 90 else 2])
            elif guard and rr >= 6:
                s.c(x, y, RAMPS['bamboo'][2])
            elif s.col[y][x] is not None and 7.5 < rr < 14:
                s.c(x, y, RAMPS['hanji'][2])
    # top edge band
    for y in range(32):
        for x in range(32):
            dx, dy = x - px, y - py
            r = math.hypot(dx, dy); a = math.degrees(math.atan2(-dy, dx))
            if 22 <= a <= 158 and 13.6 <= r <= 14.6 and s.col[y][x] is not None:
                s.c(x, y, RAMPS['hanji'][1])
    # torn eye-holes lit from behind, painted grin
    s.stamp(9, 16, [
        '.oo.......oo.',
        'oZNo.....oNZo',
        '.oo.......oo.',
    ])
    s.stamp(11, 20, ['oRRRRRRo', '.oRWWRo.', '..oooo..'])
    s.c(15, 26, RAMPS['iron'][4]); s.c(16, 26, RAMPS['iron'][3])
    # tassel
    s.stamp(15, 27, ['R', 'r', 'RR', 'Rr'], {'R': 'R', 'r': 'r'})
    s.outline()
    s.flame(16, 10)


@sprite('ki', '키', 1)
def ki(s):
    # side profile of the winnowing scoop: high rounded back on the right, low open lip on the left
    pts = [(3, 25), (8, 22), (14, 18), (19, 14), (23, 11), (26, 10), (28, 12), (29, 16), (29, 22), (27, 27), (22, 29), (6, 29), (3, 27)]
    s.poly(pts, ('straw', 'side', 'flat', 2))
    s.shade()
    ps = {(x, y) for y in range(32) for x in range(32) if s.mat[y][x]}
    for x, y in ps:
        # weave lines run parallel to the slanted rim
        k = (x * 0.62 + y)
        lv = 2 + (1 if x < 14 else 0) - (1 if x > 24 else 0)
        if int(k) % 3 == 0:
            lv -= 1
        if (x, y - 1) not in ps or (x, y - 2) not in ps:
            lv = None
        if lv is None:
            s.c(x, y, RAMPS['wood'][3 if x < 22 else 2])
        else:
            s.c(x, y, RAMPS['straw'][max(0, min(4, lv))])
    # cross ribs (vertical willow sticks)
    for xx in (11, 18, 25):
        for y in range(32):
            if (xx, y) in ps and (xx, y - 2) in ps:
                s.c(xx, y, RAMPS['straw'][0])
    # inside of the scoop seen over the low front: dark, eyes glinting
    s.stamp(14, 21, [
        '.ooo....ooo',
        'oZNo...oNZo',
        '.ooo....oo.',
        '...........',
        '...oWoWoWo.',
        '....ooooo..',
    ])
    s.stamp(6, 26, ['RR', 'Rr'])
    s.outline()
    # chaff thrown off the lip
    for x, y in [(2, 21), (4, 19), (3, 16)]:
        s.c(x, y, s.colour('straw:4'))
    s.flame(25, 7)


# ======================================================================= grade 2

@sprite('gamasot', '가마솥', 2)
def gamasot(s):
    s.ellipse(15.5, 20, 11, 8.5, ('iron', 'belly', 'sphere', 2))
    for y in range(0, 17):
        for x in range(32):
            s.mat[y][x] = None
    s.ellipse(15.5, 15, 9, 5.5, ('iron', 'lid', 'sphere', 3))
    for y in range(15, 32):
        for x in range(32):
            if s.mat[y][x] and s.mat[y][x][1] == 'lid':
                s.mat[y][x] = None
    s.ellipse(15.5, 9, 2.5, 1, ('iron', 'knob', 'flat', 3))
    s.rect(14, 10, 17, 10, ('iron', 'knob', 'flat', 3))
    s.rect(2, 16, 29, 17, ('iron', 'brim', 'flat', 3))
    s.shade()
    for x in range(8, 24):
        s.c(x, 15, s.colour('A' if x in (8, 23) else ('Z' if x % 3 == 0 else 'N')))
    for x, y in [(6, 21), (7, 21), (7, 22), (24, 25), (25, 24), (20, 27)]:
        s.c(x, y, RAMPS['onggi'][3])
    for x in range(9, 23):
        s.c(x, 28, RAMPS['iron'][0])
    s.stamp(8, 19, [
        '.ooo......ooo.',
        'oWWWo....oWWWo',
        'oWooo....oooWo',
        '.ooo......ooo.',
        '..............',
        '...oooooooo...',
        '...oWKWKWKo...',
        '....oooooo....',
    ])
    s.outline()
    s.flame(16, 7)


@sprite('meongseok', '멍석', 2)
def meongseok(s):
    s.rect(8, 14, 27, 27, ('straw', 'roll', 'cylv', 2))
    s.ellipse(8, 20.5, 4.5, 7, ('straw', 'end', 'flat', 3))
    s.shade()
    for y in range(14, 28):
        for x in range(11, 28):
            if s.col[y][x] and s.mat[y][x][1] == 'roll' and (x + (y // 2) * 2) % 4 == 0:
                s.c(x, y, RAMPS['straw'][1 if y > 22 else 2])
    for xx in (14, 23):
        for y in range(14, 28):
            s.c(xx, y, RAMPS['straw'][1 if y > 22 else 0])
            s.c(xx + 1, y, RAMPS['straw'][3 if y < 22 else 2])
    s.stamp(4, 14, [
        '...uvvv..',
        '..vtsstv.',
        '.vtuvvuts',
        'vtuttttus',
        'vtustKsus',
        'vtusKZNus',
        'vtustKsus',
        'vtustttus',
        '.vtuvvuts',
        '.vtssssts',
        '..vuuuut.',
        '...tttt..',
    ], L)
    s.stamp(16, 19, ['ooooooo', 'oWoWoWo', '.ooooo.'])
    s.outline()
    s.flame(19, 11)


@sprite('jeolgu', '절구', 2)
def jeolgu(s):
    club(s, 15, 17, 24, 4, [2.2, 1.6, 1.4, 1.6, 2.2], ('pwood', 'pestle', 'cyl', 2))
    s.ellipse(15.5, 18, 9, 4, ('earth', 'bowl', 'cyl', 3))
    s.poly([(6, 18), (26, 18), (23, 24), (21, 25), (10, 25), (8, 24)], ('earth', 'bowl', 'cyl', 3))
    s.rect(11, 25, 20, 26, ('earth', 'waist', 'cyl', 2))
    s.poly([(10, 26), (21, 26), (24, 30), (7, 30)], ('earth', 'base', 'cyl', 3))
    s.shade()
    s.ellipse(15.5, 16.5, 7, 1.5, ('char', 'hole', 'none', 1))
    s.shade()

    club(s, 15, 15, 18, 11, [2, 2], ('pwood', 'p2', 'cyl', 2))
    s.shade()
    for x in range(8, 24, 4):
        s.c(x, 23, RAMPS['earth'][2]); s.c(x + 1, 23, RAMPS['earth'][2])
    s.stamp(9, 19, [
        'ooo....ooo..',
        '.ZNo..oNZ...',
        '............',
        '..oKKKKKo...',
        '...oWoWo....',
    ])
    s.outline()
    s.flame(8, 13)


@sprite('hwaro', '화로', 2)
def hwaro(s):
    s.ellipse(15.5, 20, 10, 8, ('onggi', 'bowl', 'sphere', 2))
    for y in range(0, 19):
        for x in range(32):
            s.mat[y][x] = None
    s.rect(4, 18, 27, 19, ('onggi', 'rim', 'flat', 3))
    s.rect(9, 28, 11, 29, ('onggi', 'foot1', 'flat', 2)); s.rect(20, 28, 22, 29, ('onggi', 'foot2', 'flat', 2))
    s.ellipse(3.5, 21, 1.2, 1.5, ('onggi', 'ear1', 'flat', 2)); s.ellipse(27.5, 21, 1.2, 1.5, ('onggi', 'ear2', 'flat', 2))
    s.shade()
    for x, y in [(3, 21), (28, 21)]:
        s.c(x, y, None)
    s.stamp(5, 7, [
        '.......A.......',
        '......ANA......',
        '...A..ANA...A..',
        '..ANA.ANZA.ANA.',
        '..ANAANZNA.ANA.',
        '.ANZNANZXNAANZA',
        '.ANZNNZXZNANZNA',
        'ANZXZNZXZNNZXNA',
        'ANZXXZXXXZZXZNA',
        'AcdcNcdedcNcdcA',
        'cdeccdcdcedcdec',
    ], {'c': 'char:1', 'd': 'char:3', 'e': 'N'})
    s.stamp(8, 21, [
        'ZZZ.....ZZZ.',
        'ooo.....ooo.',
        '............',
        '...ooooo....',
        '..oKWKWKo...',
        '...ooooo....',
    ], {'Z': 'onggi:4'})
    s.outline()


@sprite('cheongsachorong', '청사초롱', 2)
def cheongsachorong(s):
    s.line(2, 8, 22, 2, ('wood', 'pole', 'flat', 2), 2)
    s.rect(11, 9, 20, 9, ('wood', 'cap', 'flat', 2))
    s.rect(9, 10, 22, 13, ('blue', 'top', 'cyl', 2))
    s.ellipse(15.5, 17.5, 8, 5, ('red', 'mid', 'cyl', 2))
    s.rect(8, 15, 23, 20, ('red', 'mid', 'cyl', 2))
    s.rect(9, 21, 22, 24, ('blue', 'bot', 'cyl', 2))
    s.rect(11, 25, 20, 25, ('wood', 'cap2', 'flat', 2))
    s.shade()
    for y in range(6, 9):
        s.c(15, y, RAMPS['char'][3])
    for x in (11, 15, 19):
        for y in range(14, 22):
            if s.mat[y][x] and s.mat[y][x][1] == 'mid':
                s.c(x, y, RAMPS['red'][1])
    s.stamp(10, 16, ['.oZN.NZo', '..oo.oo.', '........', '...oKo..'])
    for x in range(10, 22, 3):
        s.c(x, 11, s.colour('Y')); s.c(x, 22, s.colour('y'))
    s.stamp(14, 26, ['RRR.', '.Rr.', 'RRrR', 'R.rR'])
    s.outline()
    s.stamp(25, 9, ['.A.', 'ANA', 'AZA', '.A.'])


@sprite('hwaetbul', '횃불', 2)
def hwaetbul(s):
    club(s, 11, 28, 15, 19, [1.6, 1.7], ('wood', 'stick', 'cyl', 2))
    s.poly([(9, 11), (22, 11), (21, 20), (10, 20)], ('straw', 'bundle', 'cyl', 2))
    s.shade()
    # charred, glowing top edge
    for x in range(9, 23):
        s.c(x, 11, RAMPS['char'][2] if x % 3 else s.colour('N'))
        s.c(x, 12, RAMPS['char'][3] if x % 2 else RAMPS['straw'][0])
    # straw ends at the bottom and two rope bands
    for x in range(10, 22, 2):
        s.c(x, 20, None); s.c(x + 1, 21, RAMPS['straw'][1])
    for x in range(9, 23):
        for y in (14, 18):
            if s.mat[y][x] and s.mat[y][x][1] == 'bundle':
                s.c(x, y, RAMPS['onggi'][2] if (x + y) % 2 else RAMPS['onggi'][1])
    s.stamp(11, 15, ['oo...oo.', 'ZNo.oNZ.'])
    s.stamp(13, 17, ['oKo'])
    s.outline()
    s.stamp(7, 0, [
        '.......A........',
        '..A...ANA....A..',
        '.ANA..ANA...ANA.',
        '.ANA.ANZA..ANA..',
        '..ANAANZNAANZA..',
        '.ANZNANZXNANZNA.',
        'ANZNNZXZNNZXNNA.',
        'ANZXZNXXZNZXZNA.',
        '.ANZXXXXXZXZNA..',
        '..ANZZXXZZNNA...',
        '..AANNZZNNAA....',
    ])
    s.c(5, 3, s.colour('N')); s.c(25, 5, s.colour('Z')); s.c(24, 1, s.colour('N'))


# ======================================================================= grade 3

@sprite('didilbangga', '디딜방아', 3)
def didilbangga(s):
    s.poly([(17, 25), (29, 25), (28, 29), (18, 29)], ('stone', 'hwak', 'flat', 2))
    # ㅅ-shaped pivot frame
    s.line(11, 18, 7, 28, ('wood', 'post1', 'flat', 2), 2)
    s.line(11, 18, 15, 28, ('wood', 'post2', 'flat', 1), 2)
    # beam: Y-forked foot end low-left, raised head end
    s.line(3, 26, 19, 11, ('wood', 'beam', 'flat', 3), 3)
    s.line(1, 24, 4, 26, ('wood', 'fork', 'flat', 3), 2)
    s.line(4, 28, 5, 26, ('wood', 'fork', 'flat', 3), 2)
    # pestle head, lifted, mid-swing
    s.rect(18, 8, 25, 19, ('pwood', 'head', 'cyl', 2))
    s.rect(19, 20, 24, 21, ('iron', 'cap', 'flat', 2))
    s.shade()
    s.rect(10, 18, 12, 19, ('iron', 'pin', 'flat', 3)); s.shade()
    s.ellipse(23, 26, 3.5, 0.6, ('char', 'pit', 'none', 1)); s.shade()
    s.c(21, 26, RAMPS['hanji'][3]); s.c(24, 26, RAMPS['hanji'][3])
    s.stamp(18, 10, [
        'oo....oo',
        '.WW..WW.',
        '.Wo..oW.',
        '........',
        '..oooo..',
        '.oWKKWo.',
        '..oooo..',
    ])
    s.stamp(18, 17, ['vuvuvuvu', '......R.', '......r.'], {**L, 'R': 'R', 'r': 'r'})
    s.outline()
    # motion ticks under the head
    s.c(20, 23, RAMPS['hanji'][1]); s.c(23, 23, RAMPS['hanji'][1])
    s.flame(21, 7)


@sprite('jangdok', '장독', 3)
def jangdok(s):
    s.ellipse(15.5, 19, 12, 7.5, ('glaze', 'body', 'sphere', 3))
    s.poly([(5, 22), (26, 22), (23, 28), (21, 29), (10, 29), (8, 28)], ('glaze', 'body', 'sphere', 3))
    s.rect(10, 11, 21, 12, ('glaze', 'neck', 'flat', 2))
    # lid lifted and tilted
    s.poly([(7, 8), (14, 5), (22, 6), (24, 8), (23, 9), (8, 10)], ('onggi', 'lid', 'flat', 3))
    s.rect(14, 3, 17, 4, ('onggi', 'knob', 'flat', 3))
    s.shade()
    # dark gap under the lid with glinting eyes
    s.stamp(9, 10, ['oooooooooooooo'])
    s.stamp(10, 11, ['.ZN.....NZ..'])
    s.stamp(10, 11, ['A..........'])
    # glaze shine
    for x, y in [(8, 15), (9, 14), (8, 16), (7, 17)]:
        s.c(x, y, '#c8a080')
    # 금줄: straw rope with red peppers and charcoal
    for x in range(4, 28):
        y = 17 + (1 if 8 < x < 23 else 0)
        s.c(x, y, s.colour(L['v'] if x % 2 else L['t']))
    s.stamp(7, 18, ['R', 'R', 'r'])
    s.stamp(10, 19, ['oo', 'o.'])
    s.stamp(21, 19, ['R', 'R', 'r'])
    s.stamp(24, 18, ['oo', '.o'])
    # crack repair (땜질) and a faint grin under the rope
    s.stamp(11, 23, ['.oooooooo', 'oWoWoWoWo'])
    s.outline()
    s.flame(16, 1) if False else None
    s.stamp(25, 1, ['..A..', '.ANA.', 'ANZNA', 'ANXNA', '.AAA.'])


@sprite('pulmu', '풀무', 3)
def pulmu(s):
    # nozzle
    s.rect(5, 19, 9, 21, ('iron', 'nozzle', 'cyl', 2))
    # leather folds
    s.poly([(9, 16), (26, 13), (27, 25), (9, 23)], ('ogre', 'leather', 'flat', 3))
    # top and bottom boards (wedge)
    s.poly([(8, 16), (27, 10), (28, 14), (9, 18)], ('wood', 'top', 'flat', 3))
    s.poly([(8, 22), (28, 25), (27, 28), (9, 24)], ('wood', 'bot', 'flat', 2))
    s.line(27, 10, 28, 8, ('wood', 'h1', 'flat', 3), 2)
    s.line(27, 26, 28, 28, ('wood', 'h2', 'flat', 2), 2)
    s.shade()
    for x in range(11, 27, 3):
        for y in range(15, 26):
            if s.mat[y][x] and s.mat[y][x][1] == 'leather':
                s.c(x, y, RAMPS['ogre'][1])
                if s.mat[y][x + 1] and s.mat[y][x + 1][1] == 'leather':
                    s.c(x + 1, y, RAMPS['ogre'][4])
    # face on the leather: bulging eyes and puffed grin
    s.stamp(14, 17, [
        '.ooo...ooo',
        'oWWo..oWWo',
        'oWoo..ooWo',
        '.oo....oo.',
        '...oooo...',
        '...oKKo...',
    ])
    s.stamp(14, 12, ['BBBB', '.bb.'])
    s.outline()
    s.stamp(2, 16, [
        '.A..',
        'ANA.',
        'NZNA',
        'ZXZN',
        'NZNA',
        'ANA.',
        '.A..',
    ])
    s.c(2, 14, s.colour('N')); s.c(3, 24, s.colour('Z'))


@sprite('jwibul', '쥐불', 3)
def jwibul(s):
    s.rect(9, 15, 22, 28, ('iron', 'can', 'cyl', 3))
    s.rect(8, 14, 23, 15, ('iron', 'rim', 'flat', 3))
    s.shade()
    # rust streaks
    for x, y in [(19, 17), (19, 18), (20, 22), (11, 26), (12, 27), (21, 25)]:
        s.c(x, y, RAMPS['onggi'][3])
    # punched holes glowing: two eyes, a grin, scattered holes
    s.stamp(10, 17, [
        '..........',
        '.oo....oo.',
        'oZNo..oNZo',
        '.oo....oo.',
        '..........',
        '.oZoZoZoZ.',
        '..o.o.o.o.',
        '..........',
        'Z....N...Z',
        '....Z.....',
    ])
    # wire handle
    s.outline()
    for x, y in [(9, 13), (9, 12), (10, 11), (10, 10), (11, 9), (12, 8), (13, 7), (14, 6), (15, 5), (16, 5), (17, 6),
                 (18, 7), (19, 8), (20, 9), (21, 10), (21, 11), (22, 12), (22, 13)]:
        s.c(x, y, RAMPS['iron'][4] if x < 16 else RAMPS['iron'][2])
    s.c(15, 4, RAMPS['iron'][3]); s.c(16, 4, RAMPS['iron'][3]); s.c(15, 3, RAMPS['iron'][2]); s.c(16, 3, RAMPS['iron'][2])
    # coals and fire in the open top
    s.stamp(10, 8, [
        '...A..A....',
        '..ANAANA...',
        '..ANZNNA.A.',
        '.ANZXZNAANA',
        'AANZXXZNNZA',
        'ANZXXXXZZNA',
    ])
    # spark trail of the swing
    for x, y in [(4, 22), (3, 17), (27, 20), (28, 15), (26, 26)]:
        s.c(x, y, s.colour('N' if (x + y) % 2 else 'Z'))
# ======================================================================= grade 4

@sprite('yeonjabangga', '연자방아', 4)
def yeonjabangga(s):
    s.ellipse(15.5, 27.5, 14, 2, ('stone', 'base', 'flat', 2))
    s.line(3, 15, 12, 15, ('wood', 'beam', 'flat', 3), 2)
    s.ellipse(17, 18, 8, 8, ('stone', 'wheel', 'sphere', 3))
    s.shade()
    for y in range(32):
        for x in range(32):
            if s.mat[y][x] and s.mat[y][x][1] == 'wheel':
                d = math.hypot(x - 17, y - 18)
                if 6.4 < d < 7.8:
                    s.c(x, y, RAMPS['stone'][1 if x + y > 33 else 2])
    for x in range(3, 29):
        if s.mat[26][x] and s.mat[26][x][1] == 'base':
            s.c(x, 26, RAMPS['stone'][3] if x < 16 else RAMPS['stone'][2])
    # axle through the hub, out to the left; the hub plug is the nose
    s.stamp(4, 14, ['vt', 'vt', 'R.', 'r.'], {**L, 'R': 'R', 'r': 'r'})
    for x, y in [(11, 24), (12, 24), (12, 23), (22, 11), (23, 11), (6, 28), (7, 28), (24, 28)]:
        s.c(x, y, RAMPS['leaf'][3] if (x + y) % 2 else RAMPS['leaf'][2])
    s.stamp(11, 13, [
        'ooo.....ooo.',
        '.oWWo.oWWo..',
        '.oWoo.ooWo..',
        '..oo...oo...',
    ])
    s.stamp(12, 20, [
        '.oooooooo.',
        '.oWKKKKWo.',
        '..oooooo..',
    ])
    s.outline()
    s.flame(17, 8)


@sprite('moru', '모루', 4)
def moru(s):
    # stump
    s.rect(9, 23, 23, 29, ('wood', 'stump', 'cyl', 2))
    # anvil
    s.poly([(2, 12), (7, 12), (7, 15), (5, 15)], ('iron', 'horn', 'flat', 3))
    s.rect(7, 12, 27, 15, ('iron', 'face', 'flat', 3))
    s.poly([(10, 16), (24, 16), (22, 20), (12, 20)], ('iron', 'waist', 'cyl', 2))
    s.rect(9, 21, 25, 22, ('iron', 'foot', 'flat', 2))
    s.shade()
    for x in range(9, 24, 4):
        s.c(x, 25, RAMPS['wood'][1]); s.c(x + 1, 26, RAMPS['wood'][1])
    # hot iron bar on the face
    s.stamp(11, 10, ['.AAAAAAAAA.', 'ANZZXXXZZNA'])
    for x in range(8, 27):
        s.c(x, 12, RAMPS['iron'][4] if x % 5 else s.colour('N'))
    # face on the waist: bulging eyes and clenched teeth
    s.stamp(11, 15, [
        'oo.......oo.',
        '.oWo...oWo..',
        '..oo...oo...',
        '...oooooo...',
        '...WoWoWo...',
    ], {})
    s.stamp(20, 23, ['BB', 'b.'])
    s.outline()
    for x, y in [(6, 8), (9, 6), (24, 7), (27, 9), (4, 10)]:
        s.c(x, y, s.colour('Z' if x % 2 else 'N'))
    s.flame(16, 8)


@sprite('onggigama', '옹기가마', 4)
def onggigama(s):
    s.poly([(2, 29), (3, 24), (7, 19), (14, 15), (21, 12), (25, 11), (28, 13), (29, 18), (29, 29)], ('earth', 'mound', 'flat', 2))
    s.rect(24, 4, 28, 12, ('onggi', 'chimney', 'cyl', 2))
    s.shade()
    # bands of the stepped chambers
    for x0 in (9, 16, 23):
        for y in range(32):
            if s.mat[y][x0] and s.mat[y][x0][1] == 'mound':
                s.c(x0, y, RAMPS['earth'][1])
                if s.mat[y][x0 - 1] and s.mat[y][x0 - 1][1] == 'mound':
                    s.c(x0 - 1, y, RAMPS['earth'][3])
    # grass tufts
    for x, y in [(6, 19), (12, 15), (13, 15), (19, 12), (3, 23)]:
        s.c(x, y, RAMPS['leaf'][3]); s.c(x, y + 1, RAMPS['leaf'][2])
    # firing mouth with fire teeth, two stoke holes as eyes
    s.stamp(3, 21, [
        '....oooo....',
        '..ooKANKoo..',
        '.oKANZZNAKo.',
        'oKNZXXXXZNKo',
        'oNZXWXXWXZNo',
        'oZXWXXXXWXZo',
        'oZXXXXXXXXZo',
        'oNZXXXXXXZNo',
    ])
    s.stamp(14, 18, ['.oo.....oo.', 'oZNo...oNZo', '.oo.....oo.'])
    # chimney mouth and smoke-flame
    s.stamp(24, 4, ['ooooo'])
    s.outline()
    s.stamp(22, 0, [
        '.A...A...',
        'ANA.ANA.A',
        'ANZANZNAN',
        '.AZXXZNA.',
    ])


@sprite('daljip', '달집', 4)
def daljip(s):
    s.poly([(16, 6), (27, 29), (4, 29)], ('straw', 'cone', 'flat', 2))
    s.line(16, 1, 16, 7, ('wood', 'pole', 'flat', 3), 1)
    s.shade()
    ps = {(x, y) for y in range(32) for x in range(32) if s.mat[y][x] and s.mat[y][x][1] == 'cone'}
    for x, y in ps:
        dx = x - 16
        lv = 3 if dx < -2 else (2 if dx < 3 else 1)
        if (x * 2 + y * 3) % 7 == 0:
            lv -= 1
        col = RAMPS['straw'][max(0, lv)]
        # pine boughs woven in
        if (x + 2 * y) % 9 in (0, 1) and y > 10:
            col = RAMPS['leaf'][3 if dx < 0 else 2]
        s.c(x, y, col)
    # 금줄 with 오방색 paper strips
    for x in range(8, 25):
        y = 15 + abs(x - 16) // 4
        if (x, y) in ps:
            s.c(x, y, s.colour(L['v'] if x % 2 else L['t']))
    for x, c in [(10, 'B'), (13, 'R'), (19, 'Y'), (22, 'W')]:
        y = 16 + abs(x - 16) // 4
        s.c(x, y, s.colour(c)); s.c(x, y + 1, s.colour(c))
    s.stamp(14, 1, ['R..', 'R.Y', '..Y'])
    # face: dark gaps, burning eyes, fiery grin at the base
    s.stamp(10, 19, [
        '.oo....oo.',
        'oZNo..oNZo',
        '.oo....oo.',
        '..........',
        '.oKKKKKKo.',
        'oKANZZNAKo',
        'oANZXXZNAo',
    ])
    s.outline()
    s.stamp(2, 25, ['.A.', 'ANA', 'NZN'])
    s.stamp(26, 24, ['.A.', 'ANA', 'NZN', 'ZXZ'])
    s.c(26, 28, None)
# ======================================================================= enemies

ENEMY_OUT = '#0c0814'


def tube(s, pts, radii, ramp, ring=0, ring_col=None, seam=None, tmap=None):
    """Thick shaded path. Later parts are drawn over earlier ones; returns t-map for edge separation."""
    R = RAMPS[ramp]
    segs = []
    tot = 0
    for i in range(len(pts) - 1):
        l = math.dist(pts[i], pts[i + 1]); segs.append((pts[i], pts[i + 1], tot, l)); tot += l
    tmap = tmap if tmap is not None else {}
    step = 0.35
    d = 0
    while d <= tot:
        for a, b, t0, l in segs:
            if t0 <= d <= t0 + l:
                f = (d - t0) / l if l else 0
                cx = a[0] + (b[0] - a[0]) * f; cy = a[1] + (b[1] - a[1]) * f
                break
        u = d / tot
        k = u * (len(radii) - 1); i = min(int(k), len(radii) - 2)
        r = radii[i] + (radii[i + 1] - radii[i]) * (k - i)
        for y in range(int(cy - r - 1), int(cy + r + 2)):
            for x in range(int(cx - r - 1), int(cx + r + 2)):
                dx, dy = x + .5 - cx, y + .5 - cy
                dd = math.hypot(dx, dy)
                if dd <= r and 0 <= x < s.w and 0 <= y < s.h:
                    nx, ny = dx / max(r, .1), dy / max(r, .1)
                    lit = -(nx * .6 + ny * .8)
                    lv = 2 + (1 if lit > .35 else 0) - (1 if lit < -.25 else 0) - (1 if lit < -.7 else 0)
                    col = R[max(0, min(4, lv))]
                    if ring and int(d) % ring == 0 and abs(nx) < .9:
                        col = ring_col if ring_col else R[max(0, lv - 1)]
                    if seam and int(d) % ring == 0 and abs(nx) < .4 and lit < 0.2:
                        col = seam
                    s.c(x, y, col)
                    tmap[(x, y)] = d
        d += step
    return tmap


def separate(s, tmap, gap=8, colour=ENEMY_OUT):
    """Dark line where a later part of a path lies over a much earlier part."""
    edge = []
    for (x, y), t in tmap.items():
        for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = tmap.get((x + a, y + b))
            if q is not None and t - q > gap:
                edge.append((x, y)); break
    for x, y in edge:
        s.c(x, y, colour)


def rim(s, colour, ok=None):
    """Cool rim light on top/left edges of the silhouette."""
    pts = []
    for y in range(s.h):
        for x in range(s.w):
            if s.col[y][x] is not None and (ok is None or s.col[y][x] in ok):
                if not s.filled(x, y - 1) or (not s.filled(x - 1, y) and not s.filled(x - 1, y - 1)):
                    pts.append((x, y))
    for x, y in pts:
        s.c(x, y, colour)


@sprite('geuseundae', '그슨대', 1)
def geuseundae(s):
    # tall stretched shadow leaning forward, long arms dragging, frayed hem
    s.poly([(15, 9), (21, 9), (23, 14), (22, 22), (24, 27), (20, 25), (19, 29), (16, 25), (13, 29), (12, 24), (9, 27), (11, 20), (12, 13)], ('shade', 'body', 'flat', 2))
    s.ellipse(18, 6, 3, 3.5, ('shade', 'head', 'flat', 2))
    s.rect(16, 8, 19, 10, ('shade', 'head', 'flat', 2))
    s.line(13, 12, 7, 20, ('shade', 'arm1', 'flat', 2), 2)
    s.line(7, 20, 5, 27, ('shade', 'arm1', 'flat', 2), 2)
    s.line(22, 12, 26, 19, ('shade', 'arm2', 'flat', 1), 2)
    s.line(26, 19, 27, 26, ('shade', 'arm2', 'flat', 1), 2)
    s.shade()
    for x, y in [(4, 28), (6, 29), (5, 29), (27, 28), (28, 27), (26, 28)]:
        s.c(x, y, RAMPS['shade'][1])
    # inner darker core so it reads as a hole in the night
    for y in range(13, 26):
        for x in range(14, 21):
            if s.mat[y][x] and s.mat[y][x][1] == 'body' and abs(x - 17) < 3 - (y < 15):
                s.c(x, y, RAMPS['shade'][0])
    s.outline(ENEMY_OUT)
    rim(s, SINGLE['L'])
    s.stamp(16, 5, ['EE.E', '.e..'])
    s.c(17, 6, None) if False else None
    s.c(17, 5, '#ffe08a')


@sprite('dueoksini', '두억시니', 1)
def dueoksini(s):
    s.ellipse(15.5, 18, 10, 9, ('ogre', 'body', 'sphere', 2))
    s.rect(8, 25, 11, 29, ('ogre', 'leg1', 'flat', 1)); s.rect(20, 25, 23, 29, ('ogre', 'leg2', 'flat', 1))
    s.line(6, 15, 4, 24, ('ogre', 'arm1', 'flat', 2), 3)
    s.line(25, 15, 26, 24, ('ogre', 'arm2', 'flat', 1), 3)
    s.ellipse(4.5, 26, 2, 1.8, ('ogre', 'fist1', 'flat', 2)); s.ellipse(26.5, 26, 2, 1.8, ('ogre', 'fist2', 'flat', 1))
    s.shade()
    # wild hair
    s.stamp(5, 3, [
        '....S.....S..S.....',
        '.S..SS...SS..SS..S.',
        '..SSSSS.SSSSSSS.SS.',
        '.SSSSSSSSSSSSSSSSS.',
        'SSSSSSSSSSSSSSSSSSS',
        '.SSSSSSSSSSSSSSSSSS',
        'SSSS...........SSSS',
        'SS...............SS',
    ])
    s.stamp(6, 11, ['S', 'S', 'S'], {}); s.stamp(24, 11, ['S', 'S'])
    # face: red eyes under a heavy brow, huge fanged mouth
    s.stamp(8, 12, [
        'ooooo...ooooo.',
        '.oEEo...oEEo..',
        '..oo.....oo...',
        '..............',
        'ooooooooooooooo',
        'oWKWKKKKKKKWKWo',
        'oKKKKKKKKKKKKKo',
        '.oWKKKKKKKKKWo.',
        '..ooooooooooo..',
    ])
    s.c(10, 13, '#ffe08a'); s.c(18, 13, '#ffe08a')
    s.outline(ENEMY_OUT)
    rim(s, '#8a6a7a')


@sprite('jinegaksi', '지네각시', 1, 48)
def jinegaksi(s):
    # centipede body coiling under the bride's head
    path = [(24, 21), (17, 25), (12, 31), (14, 37), (22, 40), (32, 39), (39, 35), (42, 40), (39, 43)]
    tm = tube(s, path, [5, 5, 5, 4.5, 4, 3.5, 2.5, 2], 'centi', ring=3, ring_col=RAMPS['centi'][0])
    # legs: short dark strokes with amber tips along the body
    import itertools
    tot = sum(math.dist(path[i], path[i + 1]) for i in range(len(path) - 1))
    d = 2
    while d < tot - 2:
        acc = 0
        for i in range(len(path) - 1):
            l = math.dist(path[i], path[i + 1])
            if acc + l >= d:
                f = (d - acc) / l
                cx = path[i][0] + (path[i + 1][0] - path[i][0]) * f; cy = path[i][1] + (path[i + 1][1] - path[i][1]) * f
                tx, ty = (path[i + 1][0] - path[i][0]) / l, (path[i + 1][1] - path[i][1]) / l
                break
            acc += l
        r = 5 - 3 * d / tot
        for sgn in (1, -1):
            nx, ny = -ty * sgn, tx * sgn
            for k in range(int(r) + 1, int(r) + 4):
                x, y = int(cx + nx * k + tx * 1.2), int(cy + ny * k + ty * 1.2)
                if 0 <= x < 48 and 0 <= y < 48 and (x, y) not in tm:
                    s.c(x, y, '#e0a040' if k == int(r) + 3 else RAMPS['centi'][1])
        d += 3
    separate(s, tm, 10)
    # long black hair falling over the shoulders
    s.ellipse(24, 12, 6.5, 5.5, ('shade', 'hair', 'flat', 1))
    s.poly([(18, 11), (30, 11), (32, 22), (33, 30), (30, 27), (29, 31), (26, 24), (22, 24), (19, 31), (18, 27), (15, 30), (16, 22)], ('shade', 'hair', 'flat', 1))
    s.shade()
    for y in range(12, 29):
        for x in (18, 20, 28, 30):
            if s.mat[y][x] and s.mat[y][x][1] == 'hair' and (x + y) % 4:
                s.c(x, y, RAMPS['shade'][3 if x < 24 else 2])
    # pale face
    s.ellipse(24.5, 15.5, 3.5, 4.5, ('hanji', 'face', 'flat', 3))
    s.shade()
    for y in range(7, 11):
        s.c(24, y, RAMPS['shade'][3])
    # 족두리 crown
    s.stamp(20, 3, [
        '...oYYo..',
        '..oSSSSo.',
        '.oSYSRSSo',
        '..oooooo.',
    ], {'S': '#1c1428'})
    # face: red slit eyes, 연지곤지, red lips
    s.stamp(21, 13, [
        '.oo..oo',
        '.oE..Eo',
        '.......',
        '.R...R.',
        '.......',
        '...RR..',
    ])
    s.outline(ENEMY_OUT)
    rim(s, '#c87888', ok=set(RAMPS['centi']))
    rim(s, SINGLE['L'], ok=set(RAMPS['shade']) | {'#1c1428'})


@sprite('gangcheori', '강철이', 1, 48)
def gangcheori(s):
    glow = '#ff7a2a'
    path = [(5, 39), (14, 41), (27, 40), (37, 35), (36, 28), (27, 26), (17, 27), (12, 21), (17, 14), (27, 11), (33, 11)]
    tm = tube(s, path, [1.5, 3, 4.5, 5.5, 5.5, 5.5, 5, 5, 4.5, 4.5], 'steel', ring=3, seam=glow)
    separate(s, tm, 12)
    # dorsal fins along the back
    for x, y in [(9, 38), (15, 37), (21, 36), (27, 34), (32, 31), (25, 21), (18, 23), (13, 16), (20, 8), (26, 6)]:
        s.c(x, y, RAMPS['steel'][1]); s.c(x, y - 1, RAMPS['steel'][0])
    # head: heavy brow, open jaw with fangs, whiskers
    s.poly([(30, 6), (38, 5), (44, 9), (45, 12), (40, 13), (33, 15), (29, 13)], ('steel', 'head', 'flat', 3))
    s.poly([(32, 15), (40, 14), (44, 17), (38, 19), (31, 18)], ('steel', 'jaw', 'flat', 2))
    s.shade()
    s.stamp(33, 12, [
        'KKKKKKKKKK.',
        'KWKWKKWKWKK',
        'KKKKKKKKKK.',
        '.WKKWKKW...',
    ])
    s.c(36, 14, glow); s.c(37, 14, glow); s.c(38, 14, '#ffd27a')
    s.stamp(34, 7, ['ooo', '.oE', '...'])
    s.c(36, 8, '#ffe08a')
    s.outline(ENEMY_OUT)
    for x, y in [(43, 17), (44, 18), (45, 19), (46, 20), (46, 21), (44, 13), (45, 13), (46, 14)]:
        s.c(x, y, RAMPS['steel'][4])
    rim(s, '#9ab0c8', ok=set(RAMPS['steel']))
ENEMIES = {'geuseundae', 'dueoksini', 'jinegaksi', 'gangcheori'}


def fit(im, out):
    """Centre horizontally, sit the bottom on row H-2, and close the outline where the art was cut by the canvas."""
    from PIL import Image as I
    from kit import hx, FLAMES
    flame = {hx(c)[:3] for g in FLAMES.values() for c in g}
    W, H = im.size
    bb = im.getbbox()
    bw, bh = bb[2] - bb[0], bb[3] - bb[1]
    nx = (W - bw) // 2
    ny = (H - 1) - bh
    if ny < 0:
        ny = max(0, H - bh)
    print('  bbox %dx%d' % (bw, bh), 'TOO BIG' if bw > W - 2 or bh > H - 1 else '')
    o = I.new('RGBA', (W, H), (0, 0, 0, 0))
    o.paste(im.crop(bb), (nx, ny))
    ox, oy = nx - bb[0], ny - bb[1]
    oc = hx(out)
    for y in range(bb[1], bb[3]):
        for x in range(bb[0], bb[2]):
            p = im.getpixel((x, y))
            if not p[3] or p[:3] in flame or p[:3] == oc[:3]:
                continue
            for cond, ddx, ddy in ((x == 0, -1, 0), (x == W - 1, 1, 0), (y == H - 1, 0, 1), (y == 0, 0, -1)):
                tx, ty = x + ox + ddx, y + oy + ddy
                if cond and 0 <= tx < W and 0 <= ty < H and not o.getpixel((tx, ty))[3]:
                    o.putpixel((tx, ty), oc)
    return o


if __name__ == '__main__':
    ids = sys.argv[1:] or list(SPRITES)
    out = sys.argv[0]
    items = []
    for i in ids:
        print(i)
        im = fit(SPRITES[i](), ENEMY_OUT if i in ENEMIES else '#1e1416')
        a = im.split()[3]
        W, H = im.size
        edge = [(x, y) for x in range(W) for y in range(H) if a.getpixel((x, y)) and (x in (0, W - 1) or y in (0, H - 1))]
        if edge:
            print('  touches edge:', edge[:6])
        im.save(f'C:/workspace/web-game/packages/client/public/sprites/{i}.png')
        items.append((f'{i} {NAMES[i]}', im))
    preview(items, os.environ.get('PREV', 'C:/Users/delt/AppData/Local/Temp/claude/09265f2abd9d9a36/fe1800dd-c29d-41f1-9467-707b13108d09/scratchpad/prev.png'), scale=6)
