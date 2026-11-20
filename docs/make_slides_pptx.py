# -*- coding: utf-8 -*-
"""Build EE5223_slides.pptx: native, editable shapes reproducing the v2 Cathode SVG slides.

Input : slides/export/slides.json, slides/export/NN.svg (read-only)
Output: docs/EE5223_slides.pptx
Run   : py docs\\make_slides_pptx.py   (python-pptx 1.0.2)

Coordinate model: the 1920x1080 stage maps to 13.333 x 7.5 in, so 1 stage px = 6350 EMU
and 1 px = 0.5 pt. The SVG (viewBox 1700x780) sits at stage (110,122), 1:1 with px.
"""
import json
import os
import re
import xml.etree.ElementTree as ET

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.dml import MSO_LINE
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, MSO_AUTO_SIZE, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

ROOT = r"D:\Phd\EE5223_Fri\proj"
EXPORT = os.path.join(ROOT, "slides", "export")
OUT = os.path.join(ROOT, "docs", "EE5223_slides.pptx")

K = 6350                      # EMU per stage px
OX, OY = 110, 122             # SVG origin on the stage
SLIDE_W, SLIDE_H = 12192000, 6858000
FONT = "Consolas"

BG = (3, 6, 6)
PH = (95, 242, 208)           # datapath green
AM = (255, 174, 31)           # control amber
BLUE = (122, 168, 255)        # memory blue
DIM = (147, 184, 173)         # external / captions
BONE = (227, 245, 238)
LIGHT = (189, 224, 213)
TERM = (3, 10, 9)
FAM = {"dp": PH, "ctl": AM, "mem": BLUE, "ext": DIM}
FAM_ALPHA = {"dp": 0.07, "ctl": 0.08, "mem": 0.09, "ext": 0.08}


def E(v):
    return Emu(int(round(v * K)))


def sx(x):
    return E(OX + x)


def sy(y):
    return E(OY + y)


def blend(c, a):
    return RGBColor(*[int(round(a * c[i] + (1 - a) * BG[i])) for i in range(3)])


def rgb(c):
    return RGBColor(*c)


def pt_px(px):
    return Pt(px * 0.5)


def strip_style(shape):
    st = shape._element.find(qn("p:style"))
    if st is not None:
        shape._element.remove(st)


def f(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------------------- primitives
def add_text(shapes, x, y, text, px, color, bold=False, anchor="start"):
    """x,y in stage px; y is the SVG baseline. anchor: start|middle|end."""
    w = len(text) * 0.58 * px + 8
    h = px * 1.35
    left = x - w / 2 if anchor == "middle" else (x - w if anchor == "end" else x)
    top = y - 0.82 * px
    tb = shapes.add_textbox(E(left), E(top), E(w), E(h))
    tf = tb.text_frame
    tf.word_wrap = False
    tf.auto_size = MSO_AUTO_SIZE.NONE
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.TOP
    p = tf.paragraphs[0]
    p.alignment = {"start": PP_ALIGN.LEFT, "middle": PP_ALIGN.CENTER, "end": PP_ALIGN.RIGHT}[anchor]
    r = p.add_run()
    r.text = text
    r.font.name = FONT
    r.font.size = pt_px(px)
    r.font.bold = bold
    r.font.color.rgb = rgb(color)
    return tb


def add_box(shapes, x, y, w, h, rx, fill, line, sw_px, dash=None, oval=False):
    """Rounded rectangle (or oval) in stage px. fill/line are RGBColor or None."""
    if oval:
        shp = shapes.add_shape(MSO_SHAPE.OVAL, sx(x), sy(y), E(w), E(h))
    elif rx > 0:
        shp = shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, sx(x), sy(y), E(w), E(h))
        shp.adjustments[0] = min(0.5, rx / min(w, h))
    else:
        shp = shapes.add_shape(MSO_SHAPE.RECTANGLE, sx(x), sy(y), E(w), E(h))
    strip_style(shp)
    if fill is None:
        shp.fill.background()
    else:
        shp.fill.solid()
        shp.fill.fore_color.rgb = rgb(fill)
    if line is None:
        shp.line.fill.background()
    else:
        shp.line.color.rgb = rgb(line)
        shp.line.width = pt_px(sw_px)
        if dash:
            shp.line.dash_style = dash
    return shp


def add_polyline(shapes, pts, color, sw_px, dash, head, tail):
    emu = [(sx(x), sy(y)) for x, y in pts]
    b = shapes.build_freeform(emu[0][0], emu[0][1], scale=1.0)
    b.add_line_segments(emu[1:], close=False)
    shp = b.convert_to_shape()
    strip_style(shp)
    shp.fill.background()
    shp.line.color.rgb = rgb(color)
    shp.line.width = pt_px(sw_px)
    if dash:
        shp.line.dash_style = dash
    ln = shp.line._get_or_add_ln()
    if head:
        ln.append(ln.makeelement(qn("a:headEnd"), {"type": "triangle", "w": "med", "len": "med"}))
    if tail:
        ln.append(ln.makeelement(qn("a:tailEnd"), {"type": "triangle", "w": "med", "len": "med"}))
    return shp


def add_line(shapes, x1, y1, x2, y2, color, sw_px):
    c = shapes.add_connector(MSO_CONNECTOR.STRAIGHT, sx(x1), sy(y1), sx(x2), sy(y2))
    strip_style(c)
    c.line.color.rgb = rgb(color)
    c.line.width = pt_px(sw_px)
    return c


# ---------------------------------------------------------------- style maps
def rect_style(cls, fam):
    """Return (fill, line, stroke_px, dash) or None to skip."""
    if "hit" in cls:
        return None
    f_ = FAM.get(fam, PH)
    if "frame" in cls:
        return (None, blend(PH, 0.65), 1.5, MSO_LINE.DASH)
    if "term" in cls:
        return (blend(TERM, 0.92), PH, 1.5, None)
    if "stamp" in cls:
        return (blend(PH, 0.14), PH, 3, None)
    if "ff" in cls:
        return (blend(PH, 0.14), PH, 2, None)
    if "mc" in cls:
        return (blend(PH, 0.08), PH, 1.5, None)
    if "gfill" in cls:
        return (blend(PH, 0.45), PH, 2, None)
    if "gbg" in cls:
        return (blend(DIM, 0.10), DIM, 1.5, None)
    if "seg" in cls or "bar" in cls or "bar2" in cls:
        a = 0.30 if ("bar2" in cls and fam == "ext") else 0.34
        return (blend(f_, a), f_, 2, None)
    if "lg" in cls:
        return (blend(f_, 0.20), f_, 2, None)
    return (blend(f_, FAM_ALPHA.get(fam, 0.07)), f_, 2.2, None)


def text_style(cls, in_stamp):
    if "wavetxt" in cls:
        return None
    if "t1" in cls:
        return (BONE, True)
    if "t2" in cls:
        return (LIGHT, False)
    if "cap" in cls:
        return (DIM, False)
    if "fl" in cls:
        return (PH, True)
    if "warn" in cls:
        return (AM, False)
    if "big" in cls:
        return (PH, False)
    if "tl" in cls:
        if "ok" in cls:
            return (PH, True)
        if "p" in cls:
            return (AM, False)
        return (BONE, False)
    if in_stamp:
        return (PH, True)
    return (BONE, False)


PATH_CMD = re.compile(r"[MLml]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?")


def parse_path(d):
    toks = PATH_CMD.findall(d)
    nums = [float(t) for t in toks if t[0] not in "MLml"]
    if len(nums) < 4 or len(nums) % 2:
        raise ValueError("unexpected path: " + d)
    return [(nums[i], nums[i + 1]) for i in range(0, len(nums), 2)]


# ---------------------------------------------------------------- SVG walker
def first_text(el):
    for t in el.iter():
        if t.tag.split("}")[-1] == "text" and t.text:
            return t.text.strip()
    return "block"


def walk(el, shapes, fam_ctx, in_stamp, counter):
    for ch in el:
        tag = ch.tag.split("}")[-1]
        cls = ch.get("class", "").split()
        if tag in ("defs", "marker", "style", "title"):
            continue
        own = next((c for c in cls if c in FAM), None)
        fam = own or fam_ctx
        if tag == "g":
            if "bx" in cls:
                grp = shapes.add_group_shape()
                grp.name = first_text(ch)
                counter[0] += 1
                walk(ch, grp.shapes, fam, False, counter)
            else:
                walk(ch, shapes, fam, in_stamp or ("stamp" in cls), counter)
        elif tag == "rect":
            st = rect_style(cls, fam)
            if st is None:
                continue
            fill, line, sw, dash = st
            x, y = f(ch.get("x")), f(ch.get("y"))
            w, h = f(ch.get("width")), f(ch.get("height"))
            rx = f(ch.get("rx"), 0.0)
            add_box(shapes, x, y, w, h, rx, fill, line, sw, dash)
            counter[1] += 1
        elif tag == "text":
            st = text_style(cls, in_stamp)
            if st is None:
                continue
            color, bold = st
            px = f(ch.get("font-size"), 20.0)
            add_text(shapes, OX + f(ch.get("x")), OY + f(ch.get("y")), ch.text or "", px,
                     color, bold, ch.get("text-anchor", "start"))
            counter[1] += 1
        elif tag == "path" and "ar" in cls:
            kind = "d" if "d" in cls else ("c" if "c" in cls else "r")
            col = {"d": PH, "c": AM, "r": BLUE}[kind]
            dash = {"d": MSO_LINE.DASH, "c": MSO_LINE.SQUARE_DOT, "r": MSO_LINE.ROUND_DOT}[kind]
            pts = parse_path(ch.get("d"))
            add_polyline(shapes, pts, col, 2.6, dash,
                         head=ch.get("marker-start") is not None,
                         tail=ch.get("marker-end") is not None)
            counter[1] += 1
        elif tag == "line":
            if "axis" in cls and "grid" in cls:
                col, sw = blend(DIM, 0.3), 1.0
            elif "axis" in cls:
                col, sw = DIM, 2.0
            else:
                col, sw = DIM, 1.5
            add_line(shapes, f(ch.get("x1")), f(ch.get("y1")), f(ch.get("x2")), f(ch.get("y2")), col, sw)
            counter[1] += 1
        elif tag == "circle":
            cx, cy, r = f(ch.get("cx")), f(ch.get("cy")), f(ch.get("r"), 8)
            style = ch.get("style", "")
            if "fdot" in cls:
                add_box(shapes, cx - r, cy - r, 2 * r, 2 * r, 0, None, DIM, 2, oval=True)
            elif "qdot" in cls:
                dx = re.search(r"--dx:\s*([-\d.]+)px", style)
                dy = re.search(r"--dy:\s*([-\d.]+)px", style)
                ex = cx + (f(dx.group(1)) if dx else 0)   # drawn at its end (snapped) position
                ey = cy + (f(dy.group(1)) if dy else 0)
                col = AM if "sat" in cls else PH
                add_box(shapes, ex - r, ey - r, 2 * r, 2 * r, 0, col, None, 0, oval=True)
            counter[1] += 1


# ---------------------------------------------------------------- slide builders
def add_title(slide, text):
    px = min(54.0, 1620.0 / (0.55 * max(len(text), 1)))
    tb = slide.shapes.add_textbox(Inches(0.76), Inches(0.28), Inches(11.8), Inches(0.8))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    r = tf.paragraphs[0].add_run()
    r.text = text
    r.font.name = FONT
    r.font.size = pt_px(px)
    r.font.bold = False
    r.font.color.rgb = rgb(BONE)


def add_legend(slide):
    items = [("datapath", PH, 110), ("điều khiển", AM, 278), ("bộ nhớ", BLUE, 470), ("ngoài khối", DIM, 615)]
    for label, col, x in items:
        # legend coordinates are given in stage px; add_box/add_text take SVG-relative px
        add_box(slide.shapes, x - OX, 873 - OY, 26, 16, 3, blend(col, 0.2), col, 2)
        add_text(slide.shapes, x + 36, 888, label, 20, DIM)


def build_title_slide(prs, data):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = rgb(BG)
    shapes = slide.shapes
    lines = data.get("lines", [])
    tb = shapes.add_textbox(Inches(0.76), Inches(1.6), Inches(11.8), Inches(1.0))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    r = tf.paragraphs[0].add_run()
    r.text = data["title"]
    r.font.name = FONT
    r.font.size = Pt(44)
    r.font.color.rgb = rgb(BONE)
    specs = [(24, BONE, 2.6), (22, PH, 3.15), (18, DIM, 3.6)]
    for (size, col, top), text in zip(specs, lines):
        t = shapes.add_textbox(Inches(0.76), Inches(top), Inches(11.8), Inches(0.5))
        t.text_frame.word_wrap = False
        t.text_frame.margin_left = t.text_frame.margin_right = 0
        t.text_frame.margin_top = t.text_frame.margin_bottom = 0
        rr = t.text_frame.paragraphs[0].add_run()
        rr.text = text
        rr.font.name = FONT
        rr.font.size = Pt(size)
        rr.font.color.rgb = rgb(col)
    slide.notes_slide.notes_text_frame.text = data.get("notes") or ""
    return slide


def build_svg_slide(prs, data, counter):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = rgb(BG)
    add_title(slide, data["title"])
    tree = ET.parse(os.path.join(EXPORT, data["svg"]))
    root = tree.getroot()
    walk(root, slide.shapes, None, False, counter)
    y = 1000
    for line in data.get("lines", []):
        add_text(slide.shapes, OX, y, line, 28, DIM)   # 14 pt caption
        y += 34
    slide.notes_slide.notes_text_frame.text = data.get("notes") or ""
    return slide


def main():
    with open(os.path.join(EXPORT, "slides.json"), encoding="utf-8") as fh:
        slides = json.load(fh)
    prs = Presentation()
    prs.slide_width = Emu(SLIDE_W)
    prs.slide_height = Emu(SLIDE_H)
    report = []
    for data in slides:
        counter = [0, 0]  # [groups, leaf shapes]
        if data["n"] == 1 or not data.get("svg"):
            build_title_slide(prs, data)
        else:
            build_svg_slide(prs, data, counter)
        report.append((data["n"], counter[0], counter[1]))
    cp = prs.core_properties
    cp.author = "Nhom 5 - EE5223"
    cp.last_modified_by = "Nhom 5 - EE5223"
    cp.title = "EE5223 NPU INT8"
    cp.subject = ""
    cp.keywords = ""
    cp.comments = ""
    prs.save(OUT)
    for n, g, s in report:
        print("slide %2d: groups=%d shapes=%d" % (n, g, s))
    print("saved", OUT, os.path.getsize(OUT), "bytes")


if __name__ == "__main__":
    main()
