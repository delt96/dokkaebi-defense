"""b7-hidden-masks: grade 6 hidden results, the yeoksin masks, the 격파 targets and 24px lane mobs.

sprites -> packages/client/public/sprites/<id>.png (24px mobs -> sprites/small/<id>.png),
sheet -> art/units/b7-hidden-masks-sheet.png
"""
import sys, os, math
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))).replace(os.sep, '/') + '/'
sys.path.insert(0, ROOT + 'art/samples/v3')
import kit
from kit import Spr, RAMPS, SINGLE, OUT, FLAMES, FLAME_ART, BOARD
import make
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

# ---- this batch only
RAMPS.setdefault('moss', ['#121812', '#1c281e', '#2a3a2c', '#3c5040', '#58705a'])     # one-eyed goblin
RAMPS.setdefault('glow', ['#0c2224', '#143c40', '#1e6062', '#34948a', '#7cd8c0'])     # yagwang's phosphor
RAMPS.setdefault('cloth', ['#0c0a10', '#16121c', '#221c2a', '#30283a', '#443a50'])    # black mask hood

BATCH = os.path.splitext(os.path.basename(__file__))[0]
OUTDIR = os.environ.get('SPRITE_OUT', ROOT + 'packages/client/public/sprites/')
SHEET = os.environ.get('SHEET_OUT', ROOT + f'art/units/{BATCH}-sheet.png')
SPRITES, META = {}, {}


def sprite(id_, name, grade, size=32, enemy=True, sub=''):
    """enemy: dark enemy outline. sub: subfolder under the sprite dir (small/ for 24px lane mobs)."""
    def deco(fn):
        def build():
            s = Spr(size, size, grade)
            fn(s)
            return s.image()
        SPRITES[id_] = build
        META[id_] = (name, grade, enemy, sub)
        return fn
    return deco


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


def topglow(s, names, depth=1, x0=0, x1=None):
    """Flame-coloured reflection on the top 1-2 px of the named regions (6th grade)."""
    names = set(names)
    x1 = s.w - 1 if x1 is None else x1
    for x in range(x0, x1 + 1):
        for y in range(s.h):
            m = s.mat[y][x]
            if s.col[y][x] is not None and m and m[0] != '_':
                if m[1] in names:
                    for k in range(depth):
                        if y + k < s.h and s.mat[y + k][x] and s.mat[y + k][x][1] in names:
                            s.c(x, y + k, s.colour('N' if k == 0 else 'f:0'))
                break


def sparks(s, pts):
    for i, (x, y) in enumerate(pts):
        s.c(x, y, s.colour('N' if i % 2 else 'Z'))


def swap_colours(s, mapping, names=None):
    """Replace exact colours (after shading), optionally only inside the named regions."""
    for y in range(s.h):
        for x in range(s.w):
            c = s.col[y][x]
            if c in mapping and (names is None or (s.mat[y][x] and s.mat[y][x][1] in names)):
                s.col[y][x] = mapping[c]


def ramp_map(src, dst, shift=0):
    a, b = RAMPS[src], RAMPS[dst]
    return {c: b[max(0, min(4, i + shift))] for i, c in enumerate(a)}


# ======================================================================= grade 6 hidden results

@sprite('baekbalbaneulgaksi', '백발바늘각시', 6, 48)
def baekbalbaneulgaksi(s):
    make.jinegaksi(s)
    # the centipede body lifts a step so it reads as a unit, not a boss
    swap_colours(s, ramp_map('centi', 'red', 0))
    # hair turns white: shade ramp -> porcelain inside the hair
    swap_colours(s, {**ramp_map('shade', 'porc', 1), '#1c1428': RAMPS['porc'][1]}, names={'hair'})
    # long needle held upright on the right, eye at the top, red thread trailing to the coil
    for y in range(3, 37):
        s.c(38, y, RAMPS['porc'][4] if y < 30 else RAMPS['porc'][2])
        s.c(39, y, RAMPS['porc'][2])
    s.c(38, 2, RAMPS['porc'][3]); s.c(38, 37, RAMPS['porc'][1])
    s.c(38, 5, None); s.c(38, 6, None)
    for x, y in [(37, 5), (36, 6), (35, 8), (35, 10), (36, 12), (37, 14)]:
        s.c(x, y, SINGLE['R'])
    for x, y in [(41, 8), (42, 11), (41, 14), (42, 17), (43, 20)]:
        s.c(x, y, SINGLE['r'])
    # the hand closing on the needle
    s.stamp(36, 20, ['hhh', 'hhh'], {'h': 'hanji:3'})
    # pincushion of needles stuck in the hair
    for x, y in [(19, 6), (29, 7), (17, 9)]:
        s.c(x, y, RAMPS['iron'][4]); s.c(x, y - 1, RAMPS['porc'][4])
    topglow(s, {'hair'})
    s.outline(ENEMY_OUT)
    rim(s, SINGLE['L'], ok={ENEMY_OUT})
    s.flame(9, 14)
    sparks(s, [(4, 4), (15, 2), (2, 16)])


@sprite('sonakheobeokjigi', '소낙허벅지기', 6, 48)
def sonakheobeokjigi(s):
    saved = RAMPS['steel']
    RAMPS['steel'] = ['#1e2a36', '#2e4050', '#46607a', '#6a88a4', '#9ab4cc']   # one step lighter than the boss
    try:
        make.gangcheori(s)
    finally:
        RAMPS['steel'] = saved
    # heobeok water jar held in the lower coil, tilted, its mouth pouring
    s.ellipse(10.5, 37, 6, 5.5, ('gourd', 'jar', 'sphere', 3))
    s.poly([(12, 30), (16, 27), (18, 29), (15, 32)], ('gourd', 'neck', 'flat', 3))
    s.shade()
    for x in range(5, 17):
        s.c(x, 39, RAMPS['brass'][2] if x % 2 else RAMPS['brass'][3])
    s.stamp(6, 35, ['.WW...', 'W..W..'], {'W': 'gourd:4'})
    # rain cloud over the head and the shower falling in front
    s.ellipse(39, 3, 6, 2.5, ('stone', 'cloud', 'sphere', 3))
    s.ellipse(33, 4, 3.5, 2, ('stone', 'cloud', 'sphere', 3))
    s.shade()
    rain = [(31, 8), (34, 9), (37, 8), (40, 9), (43, 8), (32, 12), (35, 13), (38, 12), (41, 13), (45, 11)]
    for x, y in rain:
        s.c(x, y, RAMPS['blue'][4]); s.c(x - 1, y + 1, RAMPS['blue'][3])
    # water pouring from the jar
    for x, y in [(18, 27), (19, 26), (20, 26), (21, 27), (22, 28), (22, 29)]:
        s.c(x, y, RAMPS['blue'][4] if (x + y) % 2 else RAMPS['porc'][4])
    topglow(s, {'head', 'cloud'})
    s.outline(ENEMY_OUT)
    rim(s, '#b8cce0', ok={ENEMY_OUT})
    s.flame(8, 14)
    sparks(s, [(3, 4), (14, 3), (2, 18)])


@sprite('topnisoemeokbo', '톱니쇠먹보', 6)
def topnisoemeokbo(s):
    st = 'iron'
    # legs (far pair darker)
    s.rect(12, 24, 14, 28, (st, 'legF2', 'flat', 2)); s.rect(23, 23, 25, 28, (st, 'legB2', 'flat', 2))
    s.rect(8, 24, 10, 29, (st, 'legF1', 'flat', 3)); s.rect(19, 24, 21, 29, (st, 'legB1', 'flat', 3))
    # body and head
    s.ellipse(17.5, 20, 9, 5, (st, 'body', 'shine', 3))
    s.ellipse(8, 18, 5, 4.5, (st, 'head', 'shine', 3))
    s.rect(1, 19, 6, 21, (st, 'snout', 'flat', 3))
    s.rect(1, 22, 6, 23, (st, 'jaw', 'flat', 2))
    # saw handle for a tail
    s.poly([(25, 18), (29, 12), (31, 14), (31, 19), (27, 22)], ('wood', 'grip', 'flat', 3))
    s.shade()
    s.c(29, 16, None); s.c(29, 17, None); s.c(30, 16, None)
    # plates
    recolor(s, 'body', lambda x, y: 'iron:1' if y % 3 == 0 and (x + (y // 3) * 2) % 4 in (1, 2) else None)
    # saw blade along the back: a bright steel strip with teeth
    top = {}
    for x, y in region(s, 'body') + region(s, 'head'):
        top[x] = min(top.get(x, 99), y)
    for x in range(6, 26):
        if x not in top:
            continue
        y0 = top[x]
        s.c(x, y0 - 1, RAMPS['stone'][4])
        s.c(x, y0 - 2, RAMPS['stone'][3])
        if x % 2 == 0:
            s.c(x, y0 - 3, RAMPS['porc'][4])
    # saw-tooth jaw
    s.stamp(1, 21, ['WoWoWo', 'oWoWoW'])
    s.c(0, 22, SINGLE['W'])
    # ember eyes under a heavy brow, sawdust and iron crumbs
    s.stamp(5, 15, ['oooooo', 'EF..EF'], {'E': '#ff7a2a', 'F': '#ffd27a'})
    for x, y in [(2, 26), (4, 27), (1, 28)]:
        s.c(x, y, RAMPS['straw'][3])
    topglow(s, {'body', 'head'})
    s.outline(ENEMY_OUT)
    rim(s, '#c0b0d8', ok={ENEMY_OUT})
    s.flame(22, 10)
    sparks(s, [(15, 4), (28, 6), (30, 10)])


@sprite('satbadolgaejangsa', '샅바돌개장사', 6)
def satbadolgaejangsa(s):
    sk = 'onggi'
    # legs planted wide
    s.line(11, 22, 8, 27, (sk, 'thighL', 'flat', 3), 3)
    s.line(20, 22, 23, 27, (sk, 'thighR', 'flat', 2), 3)
    s.rect(5, 29, 10, 29, (sk, 'footL', 'flat', 3)); s.rect(22, 29, 27, 29, (sk, 'footR', 'flat', 2))
    s.rect(7, 27, 9, 28, (sk, 'shinL', 'flat', 3)); s.rect(22, 27, 24, 28, (sk, 'shinR', 'flat', 2))
    s.rect(10, 20, 21, 23, ('hanji', 'shorts', 'cyl', 2))
    # torso
    s.poly([(9, 13), (22, 13), (23, 16), (21, 21), (10, 21), (8, 16)], (sk, 'torso', 'shine', 3))
    # arms raised, holding the lifting stone overhead
    s.line(9, 14, 6, 9, (sk, 'armL', 'flat', 3), 3)
    s.line(22, 14, 25, 9, (sk, 'armR', 'flat', 2), 3)
    s.ellipse(15.5, 5.5, 9, 4.5, ('stone', 'stone', 'sphere', 3))
    s.ellipse(15.5, 11.5, 3, 2.5, (sk, 'head', 'shine', 3))
    s.shade()
    # rope satba wound round the stone
    for x in range(8, 24):
        y = 6 + (1 if 11 < x < 20 else 0)
        if s.mat[y][x] and s.mat[y][x][1] == 'stone':
            s.c(x, y, s.colour('R' if x % 2 else 'W'))
    # fists over the stone
    s.stamp(5, 7, ['ss', 'ss'], {'s': f'{sk}:4'}); s.stamp(25, 7, ['ss', 'ss'], {'s': f'{sk}:3'})
    # wild hair, strained face
    s.stamp(12, 8, ['.h.hh.h', 'hhhhhhh'], {'h': 'shade:3'})
    s.stamp(13, 10, ['oo.oo', 'WE.EW', '.....'])
    s.stamp(14, 13, ['WKW'])
    # satba at the waist and round the thighs
    s.stamp(10, 20, ['RRRRRRRRRRRR', 'rrrrrrrrrrrr'])
    s.stamp(9, 22, ['RR........RR.', '.Rr......rR..'])
    # chest line, navel
    s.c(15, 16, RAMPS[sk][1]); s.c(16, 16, RAMPS[sk][1]); s.c(15, 18, RAMPS[sk][1])
    topglow(s, {'stone'})
    s.outline(ENEMY_OUT)
    rim(s, SINGLE['L'], ok={ENEMY_OUT})
    s.flame(26, 11)
    sparks(s, [(3, 3), (30, 13), (2, 12)])


@sprite('geumeumdeungjigi', '그믐등지기', 6)
def geumeumdeungjigi(s):
    sh = 'shade'
    # the shadow hand from below, fingers closed round the lantern pole
    s.poly([(5, 29), (13, 29), (14, 21), (4, 21)], (sh, 'arm', 'flat', 3))
    s.ellipse(9, 17, 5.5, 4.5, (sh, 'palm', 'sphere', 4))
    s.line(5, 16, 2, 11, (sh, 'thumb', 'flat', 4), 2)
    s.line(7, 13, 7, 6, (sh, 'f1', 'flat', 4), 2)
    s.line(10, 12, 12, 6, (sh, 'f2', 'flat', 3), 2)
    s.line(13, 14, 16, 9, (sh, 'f3', 'flat', 3), 2)
    # pole across the fingertips, the jojokdeung hanging off its end
    s.line(6, 8, 23, 6, ('wood', 'pole', 'flat', 3))
    s.line(23, 6, 23, 10, ('wood', 'hook', 'flat', 3))
    s.ellipse(23, 17, 6, 6.5, ('hanji', 'lamp', 'sphere', 3))
    s.rect(19, 10, 27, 11, ('char', 'cap', 'flat', 3))
    s.shade()
    # the lamp is dark save for a thin waning-moon light
    for x, y in region(s, 'lamp'):
        d = math.hypot(x - 23, y - 17.5)
        if d < 5.6:
            s.c(x, y, RAMPS['cloth'][2] if d < 4 else RAMPS['cloth'][3])
    s.stamp(23, 13, ['.ZZ', '..XZ', '..XZ', '..XZ', '..XZ', '.ZZ'], {})
    s.stamp(18, 23, ['.RRRRRRRRR.', '..rrrrrrr..'])
    s.stamp(21, 25, ['R..R..R', 'r.....r'])
    # claw tips and knuckle creases
    for x, y in [(2, 10), (7, 5), (12, 5), (16, 8)]:
        s.c(x, y, SINGLE['l'])
    for x, y in [(7, 9), (11, 9), (14, 12)]:
        s.c(x, y, RAMPS['shade'][1])
    # moonlit eyes and grin in the palm
    s.stamp(6, 15, ['oZo.oZo', 'oXo.oXo'])
    s.stamp(7, 18, ['oKKKo', '.WKW.'])
    topglow(s, {'palm', 'f1', 'f2', 'f3', 'thumb', 'cap'})
    s.outline(ENEMY_OUT)
    rim(s, SINGLE['P'], ok={ENEMY_OUT})
    s.flame(26, 9)
    sparks(s, [(18, 2), (30, 13), (1, 4)])


# ======================================================================= the yeoksin's masks (shared enemy)

def masked(s, face, mat, hood_w=13):
    """Black hood around the mask and a shadow robe fraying into mist below."""
    s.poly([(20 - hood_w, 16), (20 + hood_w, 16), (34, 28), (33, 36), (29, 34), (26, 38), (22, 35), (19, 38), (16, 35), (12, 38), (9, 34), (6, 36), (5, 28)],
           ('cloth', 'robe', 'flat', 2))
    s.ellipse(20, 14, hood_w, 11, ('cloth', 'hood', 'sphere', 3))
    face(s)
    s.shade()
    # the hem fades into the mist
    recolor(s, 'robe', lambda x, y: 'cloth:1' if y >= 34 else ('cloth:2' if y >= 31 else None))


def finish_mask(s):
    s.outline(ENEMY_OUT)
    rim(s, SINGLE['L'], ok={ENEMY_OUT})


def eye_holes(s, pts, glow='#ff3b2f'):
    for x, y in pts:
        s.stamp(x, y, ['ooo', 'oEo', '.o.'], {'E': glow})


@sprite('yeoksin1', '역신 첫째 탈', 1, 40)
def yeoksin1(s):
    # choraengi: pale, lopsided, crooked open mouth and a pointed chin
    def face(s):
        s.poly([(12, 8), (27, 7), (30, 14), (27, 24), (21, 30), (15, 26), (11, 18)], ('hanji', 'mask', 'sphere', 3))
    masked(s, face, 'hanji')
    s.stamp(13, 11, ['.oo.....ooo', 'o..o...o...'])
    eye_holes(s, [(13, 13), (22, 12)])
    s.stamp(17, 20, ['ooo..', 'oKKoo', '.oKKo', '..ooo'])
    s.c(26, 17, RAMPS['red'][3]); s.c(12, 17, RAMPS['red'][3])
    finish_mask(s)


@sprite('yeoksin2', '역신 둘째 탈', 1, 40)
def yeoksin2(s):
    # chwibari: broad red face, furrowed brow, a black fringe
    def face(s):
        s.ellipse(20, 16, 9, 9.5, ('red', 'mask', 'sphere', 3))
    masked(s, face, 'red')
    s.stamp(12, 6, ['..hhhhhhhhhhh..', '.hhhhhhhhhhhhh.', 'hh.h.hh.hh.h.hh'], {'h': 'char:1'})
    for y in (10, 12):
        s.stamp(15, y, ['r.rrrr.rr', '.r....r..'][0:1])
    eye_holes(s, [(14, 14), (22, 14)])
    s.stamp(17, 18, ['.rr.', 'r..r'])
    s.stamp(16, 21, ['oooooo', 'oWKKWo', '.oooo.'])
    finish_mask(s)


@sprite('yeoksin3', '역신 셋째 탈', 1, 40)
def yeoksin3(s):
    # meokjung: dark red-brown face covered in bumps, big ringed eyes
    def face(s):
        s.ellipse(20, 16, 9.5, 10, ('onggi', 'mask', 'sphere', 2))
    masked(s, face, 'onggi')
    for x, y in [(14, 9), (19, 8), (24, 10), (12, 15), (27, 16), (15, 23), (25, 22), (20, 12)]:
        s.stamp(x, y, ['bB', 'bb'], {'B': 'onggi:4', 'b': 'onggi:3'})
    s.stamp(13, 13, ['.WWW...WWW.', 'W...W.W...W', '.WWW...WWW.'], {'W': 'porc:3'})
    eye_holes(s, [(14, 13), (21, 13)])
    s.stamp(16, 20, ['ooooooo', 'oWKKKWo', '.ooooo.'])
    finish_mask(s)


@sprite('yeoksin4', '역신 넷째 탈', 1, 40)
def yeoksin4(s):
    # nojang: black, gaunt, long narrow chin, dotted with white spots
    def face(s):
        s.poly([(13, 7), (27, 7), (28, 14), (25, 24), (21, 31), (19, 31), (15, 24), (12, 14)], ('char', 'mask', 'sphere', 4))
    masked(s, face, 'char', hood_w=12)
    mask = set(region(s, 'mask'))
    for x, y in mask:
        if any((x + a, y + b) not in mask for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            s.c(x, y, '#8a7c88' if y < 20 else '#6a5e6a')
    for x, y in [(15, 9), (19, 10), (24, 9), (14, 17), (26, 17), (17, 24), (23, 23), (20, 27), (21, 19)]:
        s.c(x, y, RAMPS['porc'][4])
    s.stamp(14, 12, ['ooo..ooo'])
    eye_holes(s, [(14, 13), (20, 13)], glow='#ffd27a')
    s.stamp(18, 21, ['oooo', 'oKKo'])
    s.stamp(17, 28, ['.W.W.', 'W.W.W'], {'W': 'porc:2'})
    finish_mask(s)


@sprite('yeoksin5', '역신 다섯째 탈', 1, 40)
def yeoksin5(s):
    # bangsangsi: square gold face with four eyes, red mouth and fangs, red tassels
    def face(s):
        s.poly([(10, 6), (30, 6), (31, 10), (30, 25), (25, 29), (15, 29), (10, 25), (9, 10)], ('brass', 'mask', 'sphere', 3))
    masked(s, face, 'brass', hood_w=14)
    s.stamp(11, 8, ['oooo....oooo..', '..........oooo'][0:1])
    eye_holes(s, [(11, 10), (16, 10), (22, 10), (27, 10)])
    eye_holes(s, [(13, 15), (24, 15)], glow='#ffd27a')
    for x, y in [(12, 10), (17, 10), (23, 10), (28, 10)]:
        s.c(x, y, '#ff3b2f')
    s.stamp(14, 20, ['oooooooooooo', 'oRWRRRRRRWRo', 'oRRWWWWWWRRo', '.oooooooooo.'])
    s.stamp(6, 18, ['R', 'R', 'r', 'R', 'r'])
    s.stamp(33, 18, ['R', 'R', 'r', 'R', 'r'])
    finish_mask(s)


# ======================================================================= 격파 targets

@sprite('ev_oenun', '외눈박이', 1)
def ev_oenun(s):
    m = 'moss'
    # stout body on bowed legs, a log club over the shoulder
    s.rect(9, 25, 12, 29, (m, 'legL', 'flat', 3)); s.rect(19, 25, 22, 29, (m, 'legR', 'flat', 2))
    s.ellipse(15.5, 19, 9, 8, (m, 'body', 'sphere', 3))
    s.line(7, 17, 4, 24, (m, 'armL', 'flat', 3), 3)
    s.ellipse(4, 25.5, 2, 1.8, (m, 'fistL', 'flat', 3))
    club(s, 24, 21, 29, 4, [1.2, 1.6, 2.2, 2.8, 2.6], ('wood', 'club', 'cyl', 3))
    s.line(23, 17, 25, 21, (m, 'armR', 'flat', 2), 3)
    s.ellipse(25, 21, 2, 1.8, (m, 'fistR', 'flat', 2))
    s.shade()
    # tuft of hair, no horns
    s.stamp(10, 9, ['..h.hh.h..', '.hhhhhhhh.', 'hhhhhhhhhh'], {'h': 'char:2'})
    # one huge eye in the middle of the face
    s.stamp(10, 12, [
        '..oooooo...',
        '.oWWWWWWo..',
        'oWWWEEWWWo.',
        'oWWEYEEWWo.',
        '.oWWEEWWo..',
        '..oooooo...',
    ], {'Y': '#ffe08a'})
    # wide mouth with two tusks
    s.stamp(10, 20, ['ooooooooooo', 'oWKKKKKKKWo', '.ooooooooo.'])
    # loincloth of straw rope, club knots
    for x in range(8, 24):
        if s.mat[25][x] and s.mat[25][x][1] == 'body':
            s.c(x, 25, s.colour(L['v'] if x % 2 else L['t']))
    for x, y in [(27, 8), (25, 13), (28, 5)]:
        s.c(x, y, RAMPS['wood'][1])
    s.outline(ENEMY_OUT)
    rim(s, '#8aa08a', ok={ENEMY_OUT})


@sprite('ev_yagwang', '야광귀', 1)
def ev_yagwang(s):
    g = 'glow'
    # small hunched ghost, glowing pale green, tail of mist
    s.poly([(10, 14), (21, 14), (23, 20), (22, 26), (18, 25), (15, 29), (12, 26), (8, 27), (9, 20)], (g, 'body', 'sphere', 3))
    s.ellipse(15, 11, 6, 5, (g, 'head', 'sphere', 3))
    # long thin arms: one holding a stolen straw shoe up high, one pointing to the next
    s.line(20, 15, 24, 9, (g, 'armR', 'flat', 3), 2)
    s.line(10, 17, 5, 21, (g, 'armL', 'flat', 2), 2)
    s.shade()
    # the shoe: brightest thing on the sprite
    s.stamp(18, 4, [
        '.........ss',
        '...ssssssSs',
        '.sSStSStSts',
        'sStttttttSs',
        '.sssssssss.',
    ], {'s': 'straw:1', 'S': 'straw:3', 't': 'straw:4'})
    s.stamp(22, 8, ['gg', 'g.'], {'g': 'glow:4'})
    # big round lamp eyes and a sly smile
    s.stamp(11, 9, ['oo..oo', 'XZ..ZX', 'oo..oo'], {'X': '#fff8c8', 'Z': '#ffe35a'})
    s.stamp(13, 13, ['o..o', '.oo.'])
    # a glowing core and sparks of phosphor
    for x, y in [(15, 19), (14, 20), (16, 21)]:
        s.c(x, y, RAMPS[g][4])
    s.outline(ENEMY_OUT)
    rim(s, '#b8f0dc', ok={ENEMY_OUT})
    for x, y in [(3, 12), (6, 7), (29, 14), (27, 20)]:
        s.c(x, y, RAMPS[g][4])


# ======================================================================= 24px lane mobs

@sprite('japgwi', '잡귀', 1, 24, sub='small/')
def japgwi_s(s):
    s.ellipse(12, 11, 8.5, 5.5, ('shade', 'body', 'flat', 3))
    s.rect(3, 11, 20, 15, ('shade', 'body', 'flat', 3))
    # dripping hem strands of uneven length
    for x, n in [(3, 2), (5, 4), (8, 2), (10, 4), (13, 3), (15, 1), (17, 4), (20, 2)]:
        s.rect(x, 16, x, 15 + n, ('shade', 'body', 'flat', 3))
    # feelers
    s.line(7, 6, 5, 3, ('shade', 'body', 'flat', 3))
    s.line(12, 5, 12, 2, ('shade', 'body', 'flat', 3))
    s.line(17, 6, 19, 3, ('shade', 'body', 'flat', 3))
    s.shade()
    for x, y in [(5, 19), (10, 19), (17, 19)]:
        s.c(x, y, RAMPS['shade'][1])
    # red eyes and teeth
    s.stamp(6, 9, ['EE....EE', '.EY..YE.'], {'Y': '#ffe08a'})
    s.stamp(9, 12, ['WKWKW'])
    s.outline(ENEMY_OUT)
    rim(s, SINGLE['L'], ok={ENEMY_OUT})


@sprite('geuseundae', '그슨대', 1, 24, sub='small/')
def geuseundae_s(s):
    s.poly([(11, 7), (15, 7), (17, 11), (16, 16), (18, 20), (15, 19), (14, 22), (12, 19), (10, 22), (9, 18), (7, 20), (8, 15), (9, 10)], ('shade', 'body', 'flat', 2))
    s.ellipse(13, 4.5, 2.2, 2.6, ('shade', 'head', 'flat', 2))
    s.line(9, 9, 5, 15, ('shade', 'arm1', 'flat', 2))
    s.line(5, 15, 4, 20, ('shade', 'arm1', 'flat', 2))
    s.line(16, 9, 19, 14, ('shade', 'arm2', 'flat', 1))
    s.line(19, 14, 20, 19, ('shade', 'arm2', 'flat', 1))
    s.shade()
    for y in range(10, 19):
        for x in range(11, 16):
            if s.mat[y][x] and s.mat[y][x][1] == 'body' and abs(x - 13) < 2:
                s.c(x, y, RAMPS['shade'][0])
    s.outline(ENEMY_OUT)
    rim(s, SINGLE['L'], ok={ENEMY_OUT})
    s.stamp(12, 4, ['E.E'])
    s.c(13, 4, '#ffe08a')


@sprite('dueoksini', '두억시니', 1, 24, sub='small/')
def dueoksini_s(s):
    s.ellipse(12, 13.5, 7.5, 6.5, ('ogre', 'body', 'sphere', 2))
    s.rect(6, 19, 8, 22, ('ogre', 'leg1', 'flat', 1)); s.rect(15, 19, 17, 22, ('ogre', 'leg2', 'flat', 1))
    s.line(4, 11, 3, 18, ('ogre', 'arm1', 'flat', 2), 2)
    s.line(19, 11, 20, 18, ('ogre', 'arm2', 'flat', 1), 2)
    s.shade()
    s.stamp(4, 2, [
        '...S....S..S...',
        '.S.SS..SS.SS.S.',
        'SSSSSSSSSSSSSSS',
        'SSSSSSSSSSSSSSS',
        'SSS.........SSS',
        'S.............S',
    ])
    s.stamp(6, 9, [
        'oooo..oooo',
        '.oEo..oEo.',
        '..........',
        'oooooooooo',
        'WKWKKKKWKW',
        'oKKKKKKKKo',
        '.oooooooo.',
    ])
    s.c(8, 10, '#ffe08a'); s.c(14, 10, '#ffe08a')
    s.outline(ENEMY_OUT)
    rim(s, '#8a6a7a', ok={ENEMY_OUT})


# ======================================================================= output

def contact_sheet(ids, refs=('jinegaksi', 'gangcheori', 'bulgasari', 'ssireumdokkaebi', 'eoduksini')):
    f1 = ImageFont.truetype('C:/Windows/Fonts/malgunbd.ttf', 16)
    f2 = ImageFont.truetype('C:/Windows/Fonts/malgun.ttf', 12)
    SC, CW, CH, COLS = 5, 270, 300, 6
    rows = [(i, META[i][0], META[i][1], OUTDIR + META[i][3] + f'{i}.png') for i in ids]
    rows += [(r, '(재료 참고)', '?', ROOT + f'packages/client/public/sprites/{r}.png') for r in refs]
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
        d.text((cx + 12, cy + CH - 26), f'{id_} · {im.width}px', fill=(170, 160, 190), font=f2)
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
        sub = META[i][3]
        im = fit(SPRITES[i](), ENEMY_OUT if META[i][2] else OUT)
        a = im.split()[3]
        Wd, H = im.size
        edge = [(x, y) for x in range(Wd) for y in range(H) if a.getpixel((x, y)) and (x in (0, Wd - 1) or y in (0, H - 1))]
        print(i, im.size, 'touches edge' if edge else 'ok')
        os.makedirs(OUTDIR + sub, exist_ok=True)
        im.save(OUTDIR + sub + f'{i}.png')
    contact_sheet([i for i in SPRITES if os.path.exists(OUTDIR + META[i][3] + f'{i}.png')])
