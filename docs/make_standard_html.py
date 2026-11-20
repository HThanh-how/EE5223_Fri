#!/usr/bin/env python3
"""Build EE5223_slides_standard.html: one dependency-free HTML file.

Reads  ../slides/export/slides.json and ../slides/export/NN.svg (read-only).
Writes ../docs/EE5223_slides_standard.html.
Run with:  py make_standard_html.py
"""
import html
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXPORT = HERE.parent / "slides" / "export"
OUT = HERE / "EE5223_slides_standard.html"

CSS = r"""
:root{--bg:#030606;--ink:#e3f5ee;--t2:#bde0d5;--mute:#93b8ad;--grid:#17352f;
--ph:#5ff2d0;--ph-rgb:95,242,208;--am:#ffae1f;--am-rgb:255,174,31;
--blue:#7aa8ff;--blue-rgb:122,168,255;--dim:#93b8ad;--ext-rgb:147,184,173}
@media (prefers-color-scheme: light){:root{--bg:#ffffff;--ink:#0d1816;--t2:#1d2e2a;--mute:#3b4d48;--grid:#b9cbc6;
--ph:#04705d;--ph-rgb:4,112,93;--am:#8f5500;--am-rgb:143,85,0;--blue:#1f4aa6;--blue-rgb:31,74,166;--dim:#4a5e59;--ext-rgb:74,94,89}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
html.js{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 ui-monospace,Consolas,"Cascadia Mono",Menlo,monospace;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.topbar{position:sticky;top:0;z-index:10;display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between;padding:8px 16px;background:var(--bg);border-bottom:1px solid var(--grid)}
.topbar .deck{margin:0;font-size:14px;color:var(--mute)}
.topbar ol{list-style:none;display:flex;flex-wrap:wrap;gap:4px;margin:0;padding:0}
.topbar a{display:inline-block;min-width:32px;padding:3px 6px;text-align:center;color:var(--ph);text-decoration:none;border:1px solid var(--grid);border-radius:3px;font-size:14px}
.topbar a:hover,.topbar a:focus-visible{background:rgba(var(--ph-rgb),.16);outline:none}
main{padding:24px 16px 48px}
.slide{scroll-margin-top:72px;margin:0 auto 44px;max-width:1600px}
.page{position:relative;width:100%;aspect-ratio:16/9;container-type:inline-size;overflow:hidden;--u:calc(100cqw / 1920);background:var(--bg);border:1px solid var(--grid)}
.page h2{position:absolute;left:calc(var(--u)*110);top:calc(var(--u)*40);width:calc(var(--u)*1700);margin:0;font-family:system-ui,"Segoe UI",Arial,sans-serif;font-weight:600;font-size:calc(var(--u)*44);line-height:1.15;color:var(--ink)}
.dwrap{position:absolute;left:calc(var(--u)*110);top:calc(var(--u)*122);width:calc(var(--u)*1700);margin:0}
.dsvg{display:block;width:100%;height:auto;overflow:visible}
.dsvg text{font-family:ui-monospace,Consolas,"Cascadia Mono",Menlo,monospace}
.tip{display:none;margin:calc(var(--u)*14) 0 0;width:calc(var(--u)*1130);min-height:calc(var(--u)*58);padding:calc(var(--u)*8) calc(var(--u)*16);font-size:calc(var(--u)*21);line-height:1.35;color:var(--ink);background:rgba(var(--ph-rgb),.08);border-left:calc(var(--u)*3) solid var(--ph)}
.js .tip{display:block}
.tip b{color:var(--ph);font-weight:600}
.source{position:absolute;left:calc(var(--u)*110);bottom:calc(var(--u)*34);width:calc(var(--u)*1130);margin:0;font-size:calc(var(--u)*21);line-height:1.3;color:var(--mute)}
.cover{display:flex;flex-direction:column;justify-content:center;padding:0 calc(var(--u)*110)}
.cover .kicker{margin:0 0 calc(var(--u)*24);font-size:calc(var(--u)*34);font-weight:600;color:var(--ph)}
.cover h1{margin:0 0 calc(var(--u)*48);font-family:system-ui,"Segoe UI",Arial,sans-serif;font-weight:700;font-size:calc(var(--u)*92);line-height:1.08;color:var(--ink)}
.cover .meta{margin:0 0 calc(var(--u)*12);font-size:calc(var(--u)*30);color:var(--mute)}
details.notes{max-width:1600px;margin-top:10px;font-size:15px;color:var(--mute)}
details.notes summary{cursor:pointer;color:var(--ph);padding:4px 0}
details.notes p{margin:6px 0 0;line-height:1.6;color:var(--ink);max-width:95ch}
/* diagram palette (driven by the variables above) */
.dsvg .frame{fill:none;stroke:var(--ph);stroke-width:1.5;stroke-dasharray:10 8;opacity:.65}
.dsvg .fl{fill:var(--ph);font-weight:600}
.dsvg .cap{fill:var(--mute)}
.dsvg .t1{fill:var(--ink);font-weight:600}
.dsvg .t2{fill:var(--t2)}
.dsvg .bx{color:var(--ph);cursor:pointer;transition:opacity .15s}
.dsvg .bx.ctl{color:var(--am)}.dsvg .bx.mem{color:var(--blue)}.dsvg .bx.ext{color:var(--dim)}
.dsvg .bx rect{fill:rgba(var(--ph-rgb),.07);stroke:var(--ph);stroke-width:2.2}
.dsvg .bx.ctl rect{fill:rgba(var(--am-rgb),.08);stroke:var(--am)}
.dsvg .bx.mem rect{fill:rgba(var(--blue-rgb),.09);stroke:var(--blue)}
.dsvg .bx.ext rect{fill:rgba(var(--ext-rgb),.08);stroke:var(--dim)}
.dsvg .bx rect.hit{fill:transparent;stroke:none}
.dsvg .bx.hot{filter:drop-shadow(0 0 10px currentColor)}
.dsvg .bx.hot>rect{stroke-width:4}
.dsvg.hov .bx{opacity:.32}
.dsvg.hov .bx.hot{opacity:1}
.dsvg.hov .aw{opacity:.22;transition:opacity .15s}
.dsvg .ar{fill:none;stroke-width:2.6;stroke-linejoin:round}
.dsvg .ar.d{stroke:var(--ph);stroke-dasharray:12 10;animation:dflow 1.2s linear infinite}
.dsvg .ar.c{stroke:var(--am);stroke-dasharray:6 7;animation:dflow 1.6s linear infinite}
.dsvg .ar.r{stroke:var(--blue);stroke-dasharray:3 9;animation:dflow 2s linear infinite reverse}
@keyframes dflow{to{stroke-dashoffset:-44}}
.dsvg .mk.d{fill:var(--ph)}.dsvg .mk.c{fill:var(--am)}
.dsvg .ff{fill:rgba(var(--ph-rgb),.14);stroke:var(--ph);stroke-width:2}
.dsvg .lg.dp{fill:rgba(var(--ph-rgb),.2);stroke:var(--ph)}.dsvg .lg.ctl{fill:rgba(var(--am-rgb),.2);stroke:var(--am)}
.dsvg .lg.mem{fill:rgba(var(--blue-rgb),.2);stroke:var(--blue)}.dsvg .lg.ext{fill:rgba(var(--ext-rgb),.2);stroke:var(--dim)}
.dsvg .warn{fill:var(--am)}.dsvg .big{fill:var(--ph);font-weight:600}
.dsvg .axis{stroke:var(--dim);stroke-width:2}.dsvg .tick{stroke:var(--dim);stroke-width:1.5}.dsvg .axis.grid{opacity:.3;stroke-width:1}
.dsvg .bx.wave>rect{animation:wave 4.8s steps(1) infinite;animation-delay:var(--d)}
@keyframes wave{0%{fill:rgba(var(--ph-rgb),.55);stroke-width:4}12.5%,100%{fill:rgba(var(--ph-rgb),.07);stroke-width:2.2}}
.dsvg .bx.chain>rect{animation:chain 6.3s steps(1) infinite;animation-delay:var(--d)}
@keyframes chain{0%{fill:rgba(var(--ph-rgb),.55);stroke-width:4}11.1%,100%{fill:rgba(var(--ph-rgb),.07);stroke-width:2.2}}
.dsvg .wavetxt{fill:var(--am);opacity:0;animation:wtxt 4.8s steps(1) infinite;animation-delay:var(--d)}
@keyframes wtxt{0%{opacity:1}12.5%,100%{opacity:0}}
.dsvg rect.ff{animation:ffm 2.4s steps(1) infinite;animation-delay:var(--d)}
@keyframes ffm{0%{fill:rgba(var(--am-rgb),.85)}25%,100%{fill:rgba(var(--ph-rgb),.14)}}
.dsvg .bx rect.mc{fill:rgba(var(--ph-rgb),.08);stroke:var(--ph);stroke-width:1.5}
.dsvg .bx rect.ra{animation:litA 4.8s steps(1) infinite;animation-delay:var(--d)}
.dsvg .bx rect.cw{animation:litA 1.2s steps(1) infinite;animation-delay:var(--d)}
.dsvg .bx rect.cc{animation:litC 4.8s steps(1) infinite;animation-delay:var(--d)}
@keyframes litA{0%{fill:rgba(var(--am-rgb),.6)}25%,100%{fill:rgba(var(--ph-rgb),.08)}}
@keyframes litC{0%{fill:rgba(var(--ph-rgb),.8)}6.25%,100%{fill:rgba(var(--ph-rgb),.08)}}
.dsvg .fdot{fill:none;stroke:var(--dim);stroke-width:2}
.dsvg .qdot{fill:var(--ph);opacity:0;animation:snap 4.2s ease-in-out infinite;animation-delay:var(--d)}
.dsvg .qdot.sat{fill:var(--am)}
@keyframes snap{0%,10%{transform:translate(0,0);opacity:0}16%{transform:translate(0,0);opacity:1}55%,88%{transform:translate(var(--dx),var(--dy));opacity:1}100%{transform:translate(var(--dx),var(--dy));opacity:0}}
.dsvg .stamp{opacity:0;transform-box:fill-box;transform-origin:center;animation:stampin .45s cubic-bezier(.2,.9,.3,1.3) both;animation-delay:var(--d)}
.dsvg .stamp rect{fill:rgba(var(--ph-rgb),.14);stroke:var(--ph);stroke-width:3}.dsvg .stamp text{fill:var(--ph);font-weight:600}
@keyframes stampin{from{opacity:0;transform:scale(1.5)}to{opacity:1;transform:scale(1)}}
.dsvg .grow{transform-box:fill-box;transform-origin:left center;animation:growx .9s cubic-bezier(.2,.7,.2,1) both;animation-delay:var(--d)}
.dsvg .growy{transform-box:fill-box;transform-origin:center bottom;animation:growyk .9s cubic-bezier(.2,.7,.2,1) both;animation-delay:var(--d)}
@keyframes growx{from{transform:scaleX(0)}}@keyframes growyk{from{transform:scaleY(0)}}
.dsvg .bx rect.seg{stroke-width:2}
.dsvg .bx.dp rect.seg,.dsvg .bx.dp rect.bar2,.dsvg .bx.dp rect.bar{fill:rgba(var(--ph-rgb),.34);stroke:var(--ph)}
.dsvg .bx.mem rect.seg{fill:rgba(var(--blue-rgb),.34);stroke:var(--blue)}
.dsvg .bx.ctl rect.seg,.dsvg .bx.ctl rect.bar{fill:rgba(var(--am-rgb),.34);stroke:var(--am)}
.dsvg .bx.ext rect.seg,.dsvg .bx.ext rect.bar2{fill:rgba(var(--ext-rgb),.3);stroke:var(--dim)}
.dsvg .bx rect.gbg{fill:rgba(var(--ext-rgb),.1);stroke:var(--dim);stroke-width:1.5}
.dsvg .bx rect.gfill{fill:rgba(var(--ph-rgb),.45);stroke:var(--ph)}
.dsvg rect.term{fill:var(--bg);stroke:var(--ph);stroke-width:1.5}
.dsvg .tl{fill:var(--ink);opacity:0;animation:tlin .25s both;animation-delay:var(--d)}
.dsvg .tl.p{fill:var(--am)}.dsvg .tl.ok{fill:var(--ph);font-weight:600}
@keyframes tlin{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){
 .dsvg *{animation:none!important}
 .dsvg .stamp,.dsvg .tl{opacity:1}
 .dsvg .qdot{opacity:1;transform:translate(var(--dx),var(--dy))}
 .dsvg .wavetxt{opacity:0}
}
.notes-hide{display:none}
@media (max-width:760px){
 .slide{margin-bottom:28px}
 .page{aspect-ratio:auto;height:auto;overflow:visible;display:flex;flex-direction:column;gap:12px;padding:16px;--u:1px}
 .page h2{position:static;width:auto;font-size:24px}
 .dwrap{position:static;width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
 .dsvg{min-width:900px}
 .tip{width:auto;min-width:0;font-size:16px;margin:0}
 .source{position:static;width:auto;font-size:15px;margin:0}
 .cover{padding:16px}
 .cover .kicker{font-size:18px}.cover h1{font-size:34px}.cover .meta{font-size:17px}
}@page{size:297mm 210mm;margin:0}
@media print{
 :root{--bg:#ffffff;--ink:#0d1816;--t2:#1d2e2a;--mute:#3b4d48;--grid:#ffffff;
 --ph:#04705d;--ph-rgb:4,112,93;--am:#8f5500;--am-rgb:143,85,0;--blue:#1f4aa6;--blue-rgb:31,74,166;--dim:#4a5e59;--ext-rgb:74,94,89}
 html,body{background:#fff}
 *{animation:none!important;transition:none!important}
 .topbar,details.notes,.tip{display:none!important}
 main{padding:0}
 .slide{margin:0;max-width:none;width:297mm;height:210mm;display:flex;align-items:center;justify-content:center;break-after:page;page-break-after:always;break-inside:avoid}
 .slide:last-child{break-after:auto;page-break-after:auto}
 .page{width:277mm;flex:none;border:0}
 .dsvg .stamp,.dsvg .tl{opacity:1}
 .dsvg .qdot{opacity:1;transform:translate(var(--dx),var(--dy))}
 .dsvg .wavetxt{opacity:0}
 .dsvg text.wavetxt[style*="--d:0.00s"]{opacity:1}
 .dsvg .bx rect{stroke-width:2.6}
 .dsvg .bx.ctl rect{stroke-dasharray:9 5}
 .dsvg .bx.mem rect{stroke-dasharray:2 3}
 .dsvg .bx.ext rect{stroke-dasharray:14 4 2 4}
 .dsvg .bx.dp rect{stroke-dasharray:none}
 .dsvg .bx.hot>rect{stroke-width:2.6}
 .dsvg.hov .bx{opacity:1}
}
"""

JS = r"""
document.documentElement.className='js';
(function(){
 var secs=[].slice.call(document.querySelectorAll('main > section'));
 function cur(){var y=scrollY+innerHeight*.4,i=0;secs.forEach(function(s,k){if(s.offsetTop<=y)i=k;});return i;}
 function go(k){secs[Math.max(0,Math.min(secs.length-1,k))].scrollIntoView({behavior:'smooth',block:'start'});}
 document.addEventListener('keydown',function(e){
  if(e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
  var d={ArrowDown:1,ArrowRight:1,PageDown:1,ArrowUp:-1,ArrowLeft:-1,PageUp:-1}[e.key];
  if(d){e.preventDefault();go(cur()+d);}
  if(e.key==='f'||e.key==='F'){
   if(document.fullscreenElement){document.exitFullscreen().catch(function(){});}
   else{document.documentElement.requestFullscreen().catch(function(){});}
  }
 });
 document.querySelectorAll('.dwrap').forEach(function(w){
  var svg=w.querySelector('svg'),tip=w.querySelector('.tip'),dflt=tip.textContent;
  function clear(){svg.querySelectorAll('.hot').forEach(function(n){n.classList.remove('hot');});}
  svg.addEventListener('pointerover',function(e){
   var b=e.target.closest('.bx');if(!b)return;
   clear();svg.classList.add('hov');b.classList.add('hot');
   var n=b.getAttribute('data-n')||'',t=b.getAttribute('data-i')||'',s=document.createElement('b');
   s.textContent=n;tip.textContent='';tip.append(s,' '+(t.indexOf(n+':')===0?t.slice(n.length+1):t));
  });
  svg.addEventListener('pointerleave',function(){clear();svg.classList.remove('hov');tip.textContent=dflt;});
 });
})();
"""


def prep_svg(n, raw, title, desc):
    s = raw.strip()
    # Drop xmlns attributes: not needed inline in HTML and keeps the file free of URLs.
    s = re.sub(r'\sxmlns(:\w+)?="[^"]*"', "", s)
    prefix = f"s{n:02d}-"
    # Prefix every id and its references so inlined SVGs cannot collide.
    s = re.sub(r'(\s)id="([^"]+)"', lambda m: m.group(1) + 'id="' + prefix + m.group(2) + '"', s)
    s = re.sub(r"url\(#([^)]+)\)", lambda m: "url(#" + prefix + m.group(1) + ")", s)
    s = re.sub(r'href="#([^"]+)"', lambda m: 'href="#' + prefix + m.group(1) + '"', s)
    head = "<title>" + html.escape(title, quote=False) + "</title><desc>" + html.escape(desc, quote=False) + "</desc>"
    s, k = re.subn(r"^(<svg[^>]*>)", lambda m: m.group(1) + head, s, count=1)
    assert k == 1, f"slide {n}: svg root not found"
    return s


def esc(t):
    return html.escape(t, quote=False)


def build():
    slides = json.loads((EXPORT / "slides.json").read_text(encoding="utf-8"))
    deck_title = slides[0]["title"]
    nav_items = []
    body = []
    for s in slides:
        n = s["n"]
        sid = f"s{n:02d}"
        hid = f"h{n:02d}"
        notes = esc(s.get("notes") or "")
        details = (
            '<details class="notes"><summary>Ghi chú trình bày</summary>'
            f"<p>{notes}</p></details>"
        )
        nav_items.append(
            f'<li><a href="#{sid}" title="{esc(s["title"])}">{n}</a></li>'
        )
        lines = s.get("lines") or []
        if s.get("svg") is None:
            # Title slide: first line is the kicker, the rest are the members and advisor.
            kicker = f'<p class="kicker">{esc(lines[0])}</p>' if lines else ""
            meta = "".join(f'<p class="meta">{esc(x)}</p>' for x in lines[1:])
            body.append(
                f'<section class="slide cover-slide" id="{sid}" aria-labelledby="{hid}">'
                f'<div class="page cover">{kicker}<h1 id="{hid}">{esc(s["title"])}</h1>{meta}</div>'
                f"{details}</section>"
            )
            continue
        svg_raw = (EXPORT / s["svg"]).read_text(encoding="utf-8")
        desc = " ".join(lines)
        svg = prep_svg(n, svg_raw, s["title"], desc)
        source = "<br>".join(esc(x) for x in lines)
        body.append(
            f'<section class="slide dia" id="{sid}" aria-labelledby="{hid}">'
            f'<div class="page"><h2 id="{hid}">{esc(s["title"])}</h2>'
            f'<figure class="dwrap">{svg}'
            '<p class="tip" aria-live="polite">Rê chuột vào một khối để xem chi tiết</p></figure>'
            f'<p class="source">{source}</p></div>'
            f"{details}</section>"
        )

    doc = (
        "<!doctype html>\n"
        '<html lang="vi">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f"<title>{esc(deck_title)}</title>\n"
        '<meta name="description" content="Trình bày đề tài: NPU INT8 cho RISC-V SoC (EE5223)">\n'
        f"<style>{CSS}</style>\n</head>\n<body>\n"
        '<header class="topbar">'
        f'<p class="deck">EE5223 · {esc(deck_title)}</p>'
        '<nav aria-label="Danh mục slide"><ol>' + "".join(nav_items) + "</ol></nav></header>\n"
        '<main>\n' + "\n".join(body) + "\n</main>\n"
        f"<script>{JS}</script>\n</body>\n</html>\n"
    )
    OUT.write_text(doc, encoding="utf-8", newline="\n")
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    build()
