import json, numpy as np, random
rng = np.random.default_rng(7)
A = rng.integers(-4,5,(3,4)); W = rng.integers(-3,4,(4,4))
C = A@W
print(A,W,C,sep="\n")
data = dict(A=A.tolist(), W=W.tolist(), C=C.tolist())

# digit bitmap "7"-like
def seg(p,q,th=2.2):
    pts=[]
    for y in range(28):
        for x in range(28):
            px,py=np.array([x+.5,y+.5]); a=np.array(p,float); b=np.array(q,float)
            t=np.clip(np.dot(px-a if False else np.array([px,py])-a,b-a)/np.dot(b-a,b-a),0,1)
            if np.linalg.norm(np.array([px,py])-(a+t*(b-a)))<th: pts.append((x,y))
    return pts
cells=set()
for p,q in [((7,7),(21,7)),((21,7),(13,22)),((10,15),(18,15))]: cells|=set(seg(p,q))
rects="".join(f'<rect x="{x*12}" y="{y*12}" width="12" height="12" fill="#e6ebff"/>' for x,y in sorted(cells))
digit=f'<svg width="336" height="336" viewBox="0 0 336 336"><rect width="336" height="336" fill="#05070f" stroke="#2a3556" stroke-width="3"/>{rects}</svg>'

html = open("tools/template.html",encoding="utf8").read()
html = html.replace("/*DATA*/", "const D="+json.dumps(data)+";").replace("<!--DIGIT-->", digit)
open("explainer/index.html","w",encoding="utf8").write(html)
