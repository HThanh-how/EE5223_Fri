#!/usr/bin/env python3
"""Generate demo figures (300 dpi PNG) into demo/figures/.  Needs: matplotlib, numpy.
  python demo/make_figures.py [--vcd path/to/sa_top.vcd]
Inputs: results/cnn_N*.log, results/lstm_N*.log, VCD from `make wave N=4`
(default: demo/data/sa_top_N4_head.vcd, a head-of-file copy of that VCD)."""
import os, re, argparse
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(HERE, "figures")
os.makedirs(OUT, exist_ok=True)
ap = argparse.ArgumentParser()
ap.add_argument("--vcd", default=os.path.join(HERE, "data", "sa_top_N4_head.vcd"))
args = ap.parse_args()

CPU, NPU, ACC = "#6b7280", "#2563eb", "#f59e0b"
plt.rcParams.update({"font.size": 15, "axes.titlesize": 18, "axes.labelsize": 16, "figure.dpi": 100,
                     "axes.spines.top": False, "axes.spines.right": False, "font.family": "DejaVu Sans"})


def save(fig, name):
    p = os.path.join(OUT, name)
    fig.savefig(p, dpi=300, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print("wrote", p)


def rd(name):
    return open(os.path.join(ROOT, "results", name)).read()


# ---------------------------------------------------------------- parse logs
cnn, lstm, prof = {}, {}, {}
for n in (4, 8):
    t = rd(f"cnn_N{n}.log")
    m = re.search(r"avg cpu_cyc=(\d+) avg npu_cyc=(\d+)", t)
    cnn[n] = (int(m.group(1)), int(m.group(2)))
    m = re.search(r"profile\(img0\): weight_wr=(\d+) act_wr=(\d+) run\+poll=(\d+) result_rd=(\d+) other\(im2col,pool,...\)=(\d+)", t)
    prof[n] = [int(v) for v in m.groups()]
    t = rd(f"lstm_N{n}.log")
    cpu = int(re.search(r"cpu_only batch=1\s+cycles/img=(\d+)", t).group(1))
    b1 = int(re.search(r"npu batch=1\s+cycles/img=(\d+)", t).group(1))
    bn = int(re.findall(r"npu batch=\d+\s+cycles/img=(\d+)", t)[-1])
    lstm[n] = (cpu, b1, bn)


# ---------------------------------------------------------------- (a) cycles bar chart
def fig_a():
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(15, 6.5), gridspec_kw={"width_ratios": [2, 3]})
    x = np.arange(2); w = 0.36
    cpu = [cnn[n][0] / 1e6 for n in (4, 8)]; npu = [cnn[n][1] / 1e6 for n in (4, 8)]
    a1.bar(x - w / 2, cpu, w, color=CPU, label="CPU only (PicoRV32)")
    a1.bar(x + w / 2, npu, w, color=NPU, label="CPU + NPU")
    for i, n in enumerate((4, 8)):
        a1.text(x[i] - w / 2, cpu[i] + .2, f"{cpu[i]:.2f}M", ha="center", fontsize=13)
        a1.text(x[i] + w / 2, npu[i] + .2, f"{npu[i]:.2f}M", ha="center", fontsize=13)
        a1.annotate(f"{cnn[n][0] / cnn[n][1]:.1f}x", (x[i] + w / 2, npu[i] + 1.3), ha="center", fontsize=20,
                    fontweight="bold", color=NPU)
    a1.set_xticks(x, ["NPU N=4", "NPU N=8"]); a1.set_ylabel("cycles per image (millions)")
    a1.set_title("LeNet-5 INT8 (MNIST)"); a1.set_ylim(0, 16); a1.legend(loc="upper right", fontsize=13, frameon=False)
    groups = [("N=4\nbatch 1", lstm[4][0], lstm[4][1]), ("N=8\nbatch 1", lstm[8][0], lstm[8][1]),
              ("N=4\nbatch 16", lstm[4][0], lstm[4][2]), ("N=8\nbatch 16", lstm[8][0], lstm[8][2])]
    x = np.arange(len(groups))
    cpu = [g[1] / 1e6 for g in groups]; npu = [g[2] / 1e6 for g in groups]
    a2.bar(x - w / 2, cpu, w, color=CPU); a2.bar(x + w / 2, npu, w, color=NPU)
    for i, g in enumerate(groups):
        a2.text(x[i] - w / 2, cpu[i] + .05, f"{cpu[i]:.2f}M", ha="center", fontsize=13)
        a2.text(x[i] + w / 2, npu[i] + .05, f"{npu[i]:.2f}M", ha="center", fontsize=13)
        a2.annotate(f"{g[1] / g[2]:.1f}x", (x[i] + w / 2, npu[i] + .45), ha="center", fontsize=20, fontweight="bold", color=NPU)
    a2.set_xticks(x, [g[0] for g in groups]); a2.set_ylabel("cycles per image (millions)")
    a2.set_title("LSTM INT8 (28 steps x 28 features, hidden 16)"); a2.set_ylim(0, 4.6)
    fig.suptitle("Cycles per inference on PicoRV32 (lower is better)", fontsize=20, y=1.02)
    fig.text(0.5, -0.04, "Speedup = CPU-only cycles / (CPU+NPU) cycles.  Batching 16 images fills the array rows -> 16.4x at N=8.",
             ha="center", fontsize=13, color="#374151")
    fig.tight_layout()
    save(fig, "a_cycles_cpu_vs_npu.png")


# ---------------------------------------------------------------- (b) CNN profile
def fig_b():
    names = ["weight write", "activation write", "NPU run + poll", "result read", "other (im2col, pool, ...)"]
    cols = ["#2563eb", "#f59e0b", "#10b981", "#8b5cf6", "#ef4444"]
    fig, ax = plt.subplots(figsize=(14, 5.2))
    for y, n in zip([1, 0], (4, 8)):
        left = 0; tot = sum(prof[n])
        for k, v in enumerate(prof[n]):
            ax.barh(y, v / 1e6, left=left, color=cols[k], label=names[k] if n == 4 else None, height=.55)
            if v / tot > .045:
                ax.text(left + v / 2e6, y, f"{v / tot * 100:.0f}%", ha="center", va="center", color="white", fontweight="bold", fontsize=15)
            left += v / 1e6
        ax.text(left + .05, y, f"{tot / 1e6:.2f}M cycles", va="center", fontsize=14)
    ax.set_yticks([1, 0], ["N=4", "N=8"]); ax.set_xlabel("cycles for one image (millions), host-side profile of the CPU + NPU run")
    ax.set_xlim(0, 4.3)
    ax.set_title("Where the time goes: host-side work (im2col, pooling) dominates")
    ax.legend(loc="upper center", bbox_to_anchor=(.5, -.2), ncol=3, frameon=False, fontsize=13)
    save(fig, "b_cnn_profile.png")


# ---------------------------------------------------------------- VCD parsing
def parse_vcd(path, want):
    """Return {name: [(time, value)]} for signals in the top two scopes (TOP, TOP.sa_top)."""
    ids, vals, scope, defs = {}, {}, [], True
    t = 0
    with open(path) as f:
        for line in f:
            line = line.strip()
            if defs:
                if line.startswith("$scope"):
                    scope.append(line.split()[2])
                elif line.startswith("$upscope"):
                    scope.pop()
                elif line.startswith("$var"):
                    p = line.split(); name = p[4]
                    if len(scope) <= 2 and name in want:
                        ids.setdefault(p[3], name)
                elif line.startswith("$enddefinitions"):
                    defs = False
                    for n in ids.values(): vals[n] = []
                continue
            if not line or line[0] == "$":
                continue
            if line[0] == "#":
                t = int(line[1:]); continue
            if line[0] == "b":
                v, i = line.split()
                if i in ids: vals[ids[i]].append((t, int(v[1:].replace("x", "0").replace("z", "0"), 2)))
            elif line[0] in "01xz" and line[1:] in ids:
                vals[ids[line[1:]]].append((t, int(line[0] == "1")))
    return vals


def sample(series, times):
    out, k, cur = [], 0, 0
    for t in times:
        while k < len(series) and series[k][0] <= t:
            cur = series[k][1]; k += 1
        out.append(cur)
    return out


def sgn(v, bits):
    return v - (1 << bits) if v >= (1 << (bits - 1)) else v


# ---------------------------------------------------------------- (c) waveform
def fig_c():
    N = 4
    want = ["clk", "in_valid", "a_in", "out_valid", "c_out"] + [f"a_bus[{i}][0]" for i in range(N)]
    vals = parse_vcd(args.vcd, want)
    rises = [t for (t, v) in vals["clk"] if v == 1]
    first_in = next(t for t, v in vals["in_valid"] if v == 1)
    c0 = max(0, next(i for i, t in enumerate(rises) if t >= first_in) - 3)
    cyc = rises[c0:c0 + 30]
    probe = [t - 0.5 for t in cyc]            # value seen by the flops at each rising edge
    s_iv = sample(vals["in_valid"], probe); s_ov = sample(vals["out_valid"], probe)
    a_in = sample(vals["a_in"], probe); c_out = sample(vals["c_out"], probe)
    a_sk = [sample(vals[f"a_bus[{i}][0]"], probe) for i in range(N)]
    n = len(cyc)
    first = next(k for k in range(n) if s_iv[k]); fo = next(k for k in range(n) if s_ov[k])
    last_in = first
    while last_in + 1 < n and s_iv[last_in + 1]: last_in += 1
    # in_valid is high for M consecutive cycles
    rows = [("clk", None, None), ("in_valid", s_iv, None)]
    rows += [(f"a_in[{i}]", [sgn((v >> 8 * i) & 0xFF, 8) for v in a_in], [bool(s_iv[k]) for k in range(n)]) for i in range(N)]
    rows += [(f"a_skew[{i}]", [sgn(v, 8) for v in a_sk[i]],
              [first + i <= k <= last_in + i for k in range(n)]) for i in range(N)]
    rows += [("out_valid", s_ov, None)]
    rows += [(f"c_out[{j}]", [sgn((v >> 32 * j) & 0xFFFFFFFF, 32) for v in c_out], [bool(s_ov[k]) for k in range(n)]) for j in range(N)]
    fig, ax = plt.subplots(figsize=(20, 11))
    ypos = {}
    for r, (nm, data, act) in enumerate(rows):
        y = (len(rows) - 1 - r) * 1.25
        ypos[nm] = y
        if nm == "clk":
            xs, ys = [], []
            for c in range(n):
                xs += [c, c, c + .5, c + .5]; ys += [0, 1, 1, 0]
            ax.plot(xs + [n], [y + v * .8 for v in ys] + [y], color="#111827", lw=2)
        elif nm in ("in_valid", "out_valid"):
            c = NPU if nm == "in_valid" else "#059669"
            yy = [y + v * .8 for v in data]
            ax.step(list(range(n)) + [n], yy + [yy[-1]], where="post", color=c, lw=2.5)
            ax.fill_between(list(range(n)) + [n], y, yy + [yy[-1]], step="post", color=c, alpha=.15)
        else:
            c = NPU if nm.startswith("a_in") else (ACC if nm.startswith("a_skew") else "#059669")
            for k in range(n):
                ax.add_patch(plt.Rectangle((k + .04, y), .92, .8, fc=c if act[k] else "#e5e7eb", ec="white"))
                if act[k]:
                    ax.text(k + .5, y + .4, str(data[k]), ha="center", va="center", fontsize=9, color="white", fontweight="bold")
        ax.text(-.4, y + .4, nm, ha="right", va="center", fontsize=14, family="monospace", fontweight="bold")
    ytop = len(rows) * 1.25
    ax.annotate("", xy=(fo, ytop - .15), xytext=(first, ytop - .15), arrowprops=dict(arrowstyle="<->", lw=2.5, color="#dc2626"))
    ax.text((first + fo) / 2, ytop + .05, f"latency in_valid -> out_valid = 2N-1 = {2 * N - 1} cycles   (measured: {fo - first})",
            ha="center", color="#dc2626", fontsize=16, fontweight="bold")
    ax.axvline(first, color="#9ca3af", ls="--", lw=1); ax.axvline(fo, color="#9ca3af", ls="--", lw=1)
    ax.text(n + .3, (ypos["a_in[3]"] + ypos["a_skew[0]"]) / 2 + .4, "input skew:\nrow i is delayed\nby i cycles ->\ndiagonal wavefront", fontsize=14,
            color="#b45309", va="center")
    ax.text(n + .3, (ypos["c_out[0]"] + ypos["c_out[3]"]) / 2 + .4, "output de-skew:\ncolumn j delayed by\nN-1-j cycles -> one\nfull row of C per\ncycle with out_valid", fontsize=14,
            color="#047857", va="center")
    ax.set_xlim(-.2, n + 6); ax.set_ylim(-.4, ytop + .7)
    ax.set_yticks([]); ax.set_xticks(range(0, n, 5))
    ax.set_xlabel("clock cycle  (30-cycle window of the unit test 'identity': N=4, M=8 rows, weights = identity so c_out = a_in)")
    ax.spines["left"].set_visible(False)
    ax.set_title("Systolic array dataflow from the Verilator VCD (N=4): skewed inputs in, de-skewed row of C out", pad=18)
    fig.subplots_adjust(left=.1)
    save(fig, "c_waveform_dataflow.png")


# ---------------------------------------------------------------- (d) block diagram
def box(ax, x, y, w, h, txt, fc, ec="#1f2937", fs=14, bold=False):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.12", fc=fc, ec=ec, lw=2))
    ax.text(x + w / 2, y + h / 2, txt, ha="center", va="center", fontsize=fs, color="#111827", fontweight="bold" if bold else "normal")


def arrow(ax, p, q, both=False, lw=2.5):
    ax.add_patch(FancyArrowPatch(p, q, arrowstyle="<|-|>" if both else "-|>", mutation_scale=22, lw=lw, color="#111827"))


def fig_d():
    fig, ax = plt.subplots(figsize=(18, 9.5))
    ax.set_xlim(0, 18); ax.set_ylim(0, 9.5); ax.axis("off")
    box(ax, .3, 3.6, 2.8, 2.3, "Host CPU\n\nPicoRV32 (sim)\nNios V (DE10-Nano)\n\nim2col, pooling,\ndata copies", "#e5e7eb", bold=True)
    box(ax, 3.7, 3.6, 1.7, 2.3, "Avalon-MM\nslave\n32-bit word\naddress,\nreadLatency=1", "#fde68a", bold=True, fs=13)
    arrow(ax, (3.1, 4.75), (3.7, 4.75), both=True)
    ax.add_patch(FancyBboxPatch((6.0, .5), 11.6, 8.4, boxstyle="round,pad=0.02,rounding_size=0.2", fc="#eff6ff", ec=NPU, lw=3, ls="--"))
    ax.text(11.8, 8.45, "npu_avmm  (NPU wrapper)", ha="center", fontsize=18, color=NPU, fontweight="bold")
    arrow(ax, (5.4, 4.75), (6.4, 4.75), both=True)
    box(ax, 6.4, 6.6, 3.0, 1.2, "WEIGHT buffer\nN x N INT8  (0x4000)", "#dbeafe", fs=13)
    box(ax, 6.4, 4.4, 3.0, 1.2, "ABUF  activations\nDEPTH x N INT8  (0x8000)", "#dbeafe", fs=13)
    box(ax, 6.4, 1.1, 3.0, 1.2, "Registers\nbias, QMULT, QSHIFT, ACT", "#dbeafe", fs=13)
    box(ax, 6.4, 2.65, 3.0, 1.2, "Controller (FSM)\nstart / busy / done", "#bfdbfe", fs=13, bold=True)
    ax.add_patch(FancyBboxPatch((10.0, 2.7), 3.2, 4.6, boxstyle="round,pad=0.02,rounding_size=0.12", fc="#fff7ed", ec=ACC, lw=3))
    ax.text(11.6, 7.05, "N x N systolic array", ha="center", fontsize=14, fontweight="bold", color="#92400e")
    for i in range(4):
        for j in range(4):
            ax.add_patch(plt.Rectangle((10.3 + j * .7, 3.0 + (3 - i) * .85 + .25), .55, .6, fc="#fbbf24", ec="#92400e", lw=1.5))
    ax.text(11.6, 3.05, "weight-stationary INT8 MACs\ninput skew / output de-skew", ha="center", va="top", fontsize=11.5, color="#78350f")
    arrow(ax, (9.4, 7.2), (10.0, 6.4)); arrow(ax, (9.4, 5.0), (10.0, 5.0))
    box(ax, 13.8, 5.7, 3.5, 1.1, "CBUF  INT32 accumulate\n(ACCUM: sum tiles over K)", "#d1fae5", fs=13)
    box(ax, 13.8, 3.9, 3.5, 1.4, "Post-process\n+bias, requant (x mult >> shift)\nReLU / sigmoid / tanh LUT", "#d1fae5", fs=12, bold=True)
    box(ax, 13.8, 2.2, 3.5, 1.1, "QBUF  INT8 results\n(0x1000, read by host)", "#d1fae5", fs=13)
    arrow(ax, (13.2, 5.9), (13.8, 6.2)); arrow(ax, (15.55, 5.7), (15.55, 5.3)); arrow(ax, (15.55, 3.9), (15.55, 3.3))
    arrow(ax, (7.9, 3.85), (7.9, 4.4), both=True, lw=2); arrow(ax, (7.9, 2.3), (7.9, 2.65), both=True, lw=2)
    ax.text(.3, 2.6, "Same wrapper + register map\non both platforms:\nsimulation (Verilator + PicoRV32)\nand FPGA (DE10-Nano + Nios V)", fontsize=14, color="#374151", va="top")
    ax.text(.3, 9.3, "INT8 NPU system", fontsize=24, fontweight="bold", va="top")
    save(fig, "d_block_diagram.png")


# ---------------------------------------------------------------- (e) accuracy table
def fig_e():
    rows = [["LeNet-5  (MNIST, 10 000 test imgs)", "98.83 %", "98.85 %", "+0.02"],
            ["LSTM  (row-wise MNIST, 10 000 test imgs)", "97.58 %", "97.50 %", "-0.08"]]
    fig, ax = plt.subplots(figsize=(13, 3.6)); ax.axis("off")
    tb = ax.table(cellText=rows, colLabels=["Model", "Float32", "INT8 (NPU path)", "Delta (pp)"], loc="center", cellLoc="center",
                  colWidths=[.46, .17, .22, .15])
    tb.auto_set_font_size(False); tb.set_fontsize(17); tb.scale(1, 2.6)
    for (r, c), cell in tb.get_celld().items():
        cell.set_edgecolor("#d1d5db")
        if r == 0:
            cell.set_facecolor(NPU); cell.set_text_props(color="white", fontweight="bold")
        elif c == 2:
            cell.set_facecolor("#dbeafe")
    ax.set_title("Post-training INT8 quantisation costs < 0.1 percentage point", fontsize=19, pad=8)
    save(fig, "e_accuracy_table.png")


for f in (fig_a, fig_b, fig_c, fig_d, fig_e):
    f()
