import sys
from PIL import Image
S='C:/Users/delt/AppData/Local/Temp/claude/09265f2abd9d9a36/fe1800dd-c29d-41f1-9467-707b13108d09/scratchpad/'
ids=sys.argv[1:]
sc=10
ims=[Image.open(f'C:/workspace/web-game/packages/client/public/sprites/{i}.png') for i in ids]
W=Image.new('RGBA',(sum(im.width*sc+10 for im in ims),max(im.height for im in ims)*sc),(34,29,48,255))
x=0
for im in ims:
    W.alpha_composite(im.resize((im.width*sc,im.height*sc),Image.NEAREST),(x,0)); x+=im.width*sc+10
W.save(S+'zoom.png')
