#!/usr/bin/env python3
"""ASCII-art MNIST viewer + pretty-printer for the firmware log lines.

  ascii_mnist.py show 3            # draw test image #3 (+ label)
  ascii_mnist.py show all          # draw all images embedded in fw/model_cnn.h
  sim | ascii_mnist.py filter      # stream filter: pretty-prints "img i label=L pred=P ..." lines
                                   # (draws the digit before the result); other lines pass through
Images come from fw/model_cnn.h (IMG_CNN, same 8 images the firmware classifies),
falling back to data/mnist.npz. Pure python3, no dependencies (numpy optional).
"""
import os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RAMP = " .:-=+*#%@"
C = dict(g="\033[32m", r="\033[31m", y="\033[33m", c="\033[36m", b="\033[1m", d="\033[2m", z="\033[0m")
if not sys.stdout.isatty() and not os.environ.get("FORCE_COLOR"):
    C = {k: "" for k in C}


def load_images():
    hdr = os.path.join(ROOT, "fw", "model_cnn.h")
    if os.path.exists(hdr):
        t = open(hdr).read()
        m = re.search(r"IMG_CNN\[\d+\]\[784\][^=]*=\s*\{(.*?)\};", t, re.S)
        l = re.search(r"LABEL_CNN\[\d+\][^=]*=\s*\{(.*?)\};", t, re.S)
        if m and l:
            px = [int(v) for v in re.findall(r"\d+", m.group(1))]
            lab = [int(v) for v in re.findall(r"\d+", l.group(1))]
            return [px[i * 784:(i + 1) * 784] for i in range(len(lab))], lab
    npz = os.path.join(ROOT, "data", "mnist.npz")
    if os.path.exists(npz):
        import numpy as np
        d = np.load(npz)
        k = [k for k in d.files if "test" in k and ("x" in k or "img" in k)][0]
        kl = [k for k in d.files if "test" in k and ("y" in k or "lab" in k)][0]
        x = d[k].reshape(-1, 784)[:8]
        return [list(map(int, r)) for r in x], list(map(int, d[kl][:8]))
    sys.exit("no image source found (fw/model_cnn.h or data/mnist.npz)")


def art(px):
    rows = []
    for y in range(0, 28, 1):
        # double each pixel horizontally so the aspect ratio looks square
        rows.append("".join(RAMP[min(9, px[y * 28 + x] * 10 // 256)] * 2 for x in range(28)))
    top = "+" + "-" * 56 + "+"
    return "\n".join([top] + ["|" + r + "|" for r in rows] + [top])


def show(i, imgs, labs):
    print(f"{C['b']}{C['c']}MNIST test image #{i}   (ground-truth label = {labs[i]}){C['z']}")
    print(art(imgs[i]))


LINE = re.compile(r"img (\d+) label=(\d+) pred=(\d+) cpu_cyc=(\d+) npu_cyc=(\d+)(.*)")


def filt(imgs, labs, art_on=True, skip=()):
    for line in sys.stdin:
        line = line.rstrip("\n")
        m = LINE.match(line)
        if not m:
            print(line, flush=True)
            continue
        i, lab, pred, cpu, npu = (int(v) for v in m.groups()[:5])
        if art_on and i < len(imgs) and i not in skip:
            show(i, imgs, labs)
        ok = lab == pred
        tag = f"{C['g']}CORRECT{C['z']}" if ok else f"{C['r']}WRONG{C['z']}"
        print(f"{C['b']}  -> label={lab}  NPU prediction={pred}  [{tag}{C['b']}]{C['z']}")
        print(f"     CPU-only : {cpu:>10,} cycles")
        print(f"     CPU + NPU: {npu:>10,} cycles   -> {C['y']}{cpu / npu:.2f}x faster{C['z']}")
        print(f"{C['d']}     (raw) {line}{C['z']}\n", flush=True)


if __name__ == "__main__":
    imgs, labs = load_images()
    mode = sys.argv[1] if len(sys.argv) > 1 else "show"
    if mode == "filter":
        skip = {int(sys.argv[sys.argv.index("--skip-art") + 1])} if "--skip-art" in sys.argv else set()
        filt(imgs, labs, art_on="--no-art" not in sys.argv, skip=skip)
    else:
        arg = sys.argv[2] if len(sys.argv) > 2 else "0"
        for i in (range(len(imgs)) if arg == "all" else [int(arg)]):
            show(i, imgs, labs)
