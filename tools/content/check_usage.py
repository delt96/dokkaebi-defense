import re,sys,io,collections
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
D=open(r'C:\workspace\web-game\docs\design\content-draft-116.md',encoding='utf-8').read().split('\n')
rows=[];g=0
for l in D:
    m=re.match(r'### (\d)등급',l)
    if m: g=int(m.group(1));continue
    if l.startswith('## '): g=0
    if l.startswith('## 5.'): g=7
    if g and l.startswith('| ') and not l.startswith('| id') and '---' not in l:
        c=[x.strip() for x in l.strip().strip('|').split('|')]
        if len(c)<8: continue
        rows.append((g,c[1],c[2],float(c[3]),float(c[4]),float(c[5]),c[6]))
kw={'추가공격':r'추가 공격|한 번 더','강타':r'강타|피해 2\.5배','처형':'처형','범위피해':r'범위 피해|주변 [\d.]+에 (공격력 )?\d+%|범위 공격|폭발','관통':'관통','주기범위':r'초마다 사거리','스턴':'스턴','둔화':'둔화','밀어내기':r'밀어내|밀어냄','받는피해':r'받는 (물딜|마딜|피해)','지속피해':r'지속 피해|나눠 피해','불길':'불길','아군오라':r'아군','적오라':r'오라[^.]*적이 받는','처치발동':'처치하면'}
for G in range(1,8):
    rs=[r for r in rows if r[0]==G]
    print(G,len(rs),{k:sum(bool(re.search(p,r[6])) for r in rs) for k,p in kw.items()})
print('--- g6 signature')
for r in rows:
    if r[0]>=6: print(r[1],r[2],r[3],r[4],r[5],[k for k,p in kw.items() if re.search(p,r[6])])
print('--- stun uptime single (prob or Nth)')
for r in rows:
    s=r[6]
    for m in re.finditer(r'스턴 ([\d.]+)초',s):
        d=float(m.group(1));pre=s[:m.start()]
        seg=re.split(r'\. ',pre)[-1]
        p=None
        mm=re.search(r'(\d+)%로',seg) or re.search(r'^(\d+)% ',seg)
        nn=re.search(r'(\d)번째',seg); pp=re.search(r'([\d.]+)초마다',seg)
        if nn: per=int(nn.group(1))*r[4]
        elif pp: per=float(pp.group(1))
        elif mm: per=r[4]/(int(mm.group(1))/100)
        else: per=None
        print(r[0],r[1],'itv',r[4],'stun',d,'every',per and round(per,2),'uptime',per and round(min(1,d/per),3))
print('--- top coef by range')
for rg in (1.5,2.0,2.5,3.0):
    rs=sorted([r for r in rows if r[3]==rg],key=lambda r:-r[5])
    print(rg,[(r[1],r[0],r[5]) for r in rs[:4]],'...',[(r[1],r[0],r[5]) for r in rs[-3:]])
