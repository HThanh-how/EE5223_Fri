"""Post-training INT8 quantisation of the float LeNet-5 and LSTM, plus bit-exact integer golden models.

Inputs : data/mnist.npz, model/lenet_float.npz, model/lstm_float.npz
Outputs: fw/model_cnn.h, fw/model_lstm.h (padded weights, requant params, test images, golden logits)
The integer golden model uses exactly the NPU requant formula:
  y = clamp8(((acc + bias) * mult + (1 << (shift-1))) >> shift), then ReLU / sigmoid LUT / tanh LUT.
"""
import sys
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

sys.path.insert(0, "scripts")
from gen_lut import SIG, TANH

LUT_SIG = np.array(SIG, dtype=np.int64)
LUT_TANH = np.array(TANH, dtype=np.int64)
NIMG_CNN, NIMG_LSTM = 8, 16


def rnd(x):
    return np.floor(np.asarray(x, dtype=np.float64) + 0.5)


def requant_np(acc, bias, mult, shift, act):
    p = (acc + bias).astype(np.int64) * int(mult) + ((1 << (shift - 1)) if shift else 0)
    y = np.clip(p >> shift, -128, 127)
    if act == "relu":
        return np.maximum(y, 0)
    if act == "sig":
        return LUT_SIG[y & 0xFF]
    if act == "tanh":
        return LUT_TANH[y & 0xFF]
    return y


def mult_shift(real):
    """largest shift (<=31) such that round(real*2^shift) fits int16"""
    best = None
    for sh in range(0, 32):
        m = int(rnd(real * (1 << sh)))
        if abs(m) <= 32767:
            best = (m, sh)
        else:
            break
    assert best is not None and best[0] != 0, f"multiplier {real} out of range"
    return best


def quant_w(w):
    s = np.abs(w).max() / 127.0
    return np.clip(rnd(w / s), -127, 127).astype(np.int64), s


def pad2(a, rows, cols):
    out = np.zeros((rows, cols), dtype=a.dtype)
    out[: a.shape[0], : a.shape[1]] = a
    return out


def up8(n):
    return (n + 7) // 8 * 8


def im2col(x, k):  # x [N,C,H,W] -> [N*Ho*Wo, C*k*k], order (c, ky, kx)
    win = sliding_window_view(x, (k, k), axis=(2, 3))  # N,C,Ho,Wo,k,k
    n, c, ho, wo = win.shape[:4]
    return win.transpose(0, 2, 3, 1, 4, 5).reshape(n * ho * wo, c * k * k), ho, wo


def pool2(x):  # [N,C,H,W]
    n, c, h, w = x.shape
    return x.reshape(n, c, h // 2, 2, w // 2, 2).max(axis=(3, 5))


def c_array(name, a, ctype="int8_t"):
    flat = ",".join(str(int(v)) for v in np.asarray(a).reshape(-1))
    dims = "".join(f"[{d}]" for d in np.asarray(a).shape)
    return f"static const {ctype} {name}{dims} __attribute__((aligned(4))) = {{{flat}}};\n"


# ======================= CNN =======================
def cnn_float(p, x, collect=None):
    def conv(x, w, b):
        cols, ho, wo = im2col(x, 5)
        y = cols @ w.reshape(w.shape[0], -1).T + b
        return y.reshape(x.shape[0], ho, wo, -1).transpose(0, 3, 1, 2)
    a1 = np.maximum(conv(x, p["conv1_w"], p["conv1_b"]), 0)
    a1p = pool2(a1)
    a2 = np.maximum(conv(a1p, p["conv2_w"], p["conv2_b"]), 0)
    a2p = pool2(a2).reshape(x.shape[0], -1)
    a3 = np.maximum(a2p @ p["fc1_w"].T + p["fc1_b"], 0)
    a4 = np.maximum(a3 @ p["fc2_w"].T + p["fc2_b"], 0)
    a5 = a4 @ p["fc3_w"].T + p["fc3_b"]
    if collect is not None:
        collect.update(c1=a1, c2=a2, f1=a3, f2=a4, f3=a5)
    return a5


def build_cnn(p, xcal):
    layers = ["conv1", "conv2", "fc1", "fc2", "fc3"]
    col = {}
    cnn_float(p, xcal, col)
    s_act = {"in": 2.0 / 255.0}
    keys = {"conv1": "c1", "conv2": "c2", "fc1": "f1", "fc2": "f2", "fc3": "f3"}
    for L in layers:
        v = col[keys[L]]
        s_act[L] = np.percentile(np.abs(v), 99.9) / 127.0 if L != "fc3" else np.abs(v).max() / 127.0
    prev = {"conv1": "in", "conv2": "conv1", "fc1": "conv2", "fc2": "fc1", "fc3": "fc2"}
    q = {}
    for L in layers:
        w = p[L + "_w"]
        w2 = w.reshape(w.shape[0], -1).T  # [K, Cout]
        wq, sw = quant_w(w2)
        s_in = s_act[prev[L]]
        bq = rnd(p[L + "_b"] / (s_in * sw)).astype(np.int64)
        m, sh = mult_shift(s_in * sw / s_act[L])
        q[L] = dict(wq=wq, bq=bq, mult=m, shift=sh, act="none" if L == "fc3" else "relu")
    return q


def cnn_int(q, xq):  # xq [N,1,28,28] int64 (0..127)
    def conv(x, L):
        cols, ho, wo = im2col(x, 5)
        acc = cols @ q[L]["wq"]
        y = requant_np(acc, q[L]["bq"], q[L]["mult"], q[L]["shift"], q[L]["act"])
        return y.reshape(x.shape[0], ho, wo, -1).transpose(0, 3, 1, 2)
    a = pool2(conv(xq, "conv1"))
    a = pool2(conv(a, "conv2")).reshape(xq.shape[0], -1)
    for L in ["fc1", "fc2", "fc3"]:
        acc = a @ q[L]["wq"]
        a = requant_np(acc, q[L]["bq"], q[L]["mult"], q[L]["shift"], q[L]["act"])
    return a


# ======================= LSTM =======================
H, T, F = 16, 28, 28


def lstm_float(p, x):  # x [N,28,28] float
    n = x.shape[0]
    h = np.zeros((n, H)); c = np.zeros((n, H))
    sg = lambda z: 1 / (1 + np.exp(-z))
    for t in range(T):
        z = x[:, t] @ p["w_ih"].T + h @ p["w_hh"].T + p["b"]
        i, f, g, o = sg(z[:, :H]), sg(z[:, H:2 * H]), np.tanh(z[:, 2 * H:3 * H]), sg(z[:, 3 * H:])
        c = f * c + i * g
        h = o * np.tanh(c)
    return h @ p["fc_w"].T + p["fc_b"], h


def build_lstm(p, xcal):
    wcat = np.concatenate([p["w_ih"].T, p["w_hh"].T], axis=0)  # [44, 64], both inputs have scale 1/128
    wq, sw = quant_w(wcat)
    bq = rnd(p["b"] / (sw / 128.0)).astype(np.int64)
    m, sh = mult_shift(sw / 128.0 * 16.0)  # acc -> LUT index domain (x = q/16)
    fwq, fsw = quant_w(p["fc_w"].T)  # [16,10]
    logits, _ = lstm_float(p, xcal)
    s_out = np.abs(logits).max() / 127.0
    fbq = rnd(p["fc_b"] / ((1 / 128.0) * fsw)).astype(np.int64)
    fm, fsh = mult_shift((1 / 128.0) * fsw / s_out)
    return dict(wq=wq, bq=bq, mult=m, shift=sh, fwq=fwq, fbq=fbq, fmult=fm, fshift=fsh)


def lstm_int(q, xq):  # xq [N,28,28] int64 0..127
    n = xq.shape[0]
    h = np.zeros((n, H), dtype=np.int64); c = np.zeros((n, H), dtype=np.int64)
    for t in range(T):
        z = np.concatenate([xq[:, t], h], axis=1)
        acc = z @ q["wq"]
        y = np.clip(((acc + q["bq"]) * q["mult"] + ((1 << (q["shift"] - 1)) if q["shift"] else 0)) >> q["shift"], -128, 127)
        i, f = LUT_SIG[y[:, :H] & 0xFF], LUT_SIG[y[:, H:2 * H] & 0xFF]
        g, o = LUT_TANH[y[:, 2 * H:3 * H] & 0xFF], LUT_SIG[y[:, 3 * H:] & 0xFF]
        c = ((f * c) >> 7) + i * g
        tidx = np.clip((c + 512) >> 10, -128, 127)
        h = (o * LUT_TANH[tidx & 0xFF] + 64) >> 7
    acc = h @ q["fwq"]
    return requant_np(acc, q["fbq"], q["fmult"], q["fshift"], "none")


# ======================= main =======================
def main():
    d = np.load("data/mnist.npz")
    xt, yt, xtr = d["x_test"], d["y_test"], d["x_train"]
    xq_all = (xt.astype(np.int64) >> 1)  # pixel>>1, 0..127

    # ---- CNN ----
    p = dict(np.load("model/lenet_float.npz"))
    xcal = (xtr[:2000].astype(np.float64) / 255.0)[:, None]
    q = build_cnn(p, xcal)
    acc_f = 0; acc_q = 0
    for i in range(0, 10000, 500):
        xb = xt[i:i + 500]
        acc_f += int((cnn_float(p, (xb / 255.0)[:, None]).argmax(1) == yt[i:i + 500]).sum())
        acc_q += int((cnn_int(q, xq_all[i:i + 500][:, None]).argmax(1) == yt[i:i + 500]).sum())
    print(f"CNN  float acc {acc_f/100:.2f}%  int8 acc {acc_q/100:.2f}%")
    for L in q:
        print("  ", L, "mult", q[L]["mult"], "shift", q[L]["shift"])
    gold = cnn_int(q, xq_all[:NIMG_CNN][:, None])
    dims = {"conv1": (25, 6), "conv2": (150, 16), "fc1": (256, 120), "fc2": (120, 84), "fc3": (84, 10)}
    out = ["// generated by scripts/quantize.py - do not edit\n#include <stdint.h>\n"]
    for L, (K, C) in dims.items():
        Kp, Cp = up8(K), up8(C)
        out.append(f"#define {L.upper()}_K {K}\n#define {L.upper()}_C {C}\n#define {L.upper()}_KP {Kp}\n#define {L.upper()}_CP {Cp}\n")
        out.append(f"#define {L.upper()}_MULT {q[L]['mult']}\n#define {L.upper()}_SHIFT {q[L]['shift']}\n")
        out.append(c_array(f"W_{L}", pad2(q[L]["wq"], Kp, Cp)))
        out.append(c_array(f"B_{L}", np.pad(q[L]["bq"], (0, Cp - C)), "int32_t"))
    out.append(f"#define NIMG_CNN {NIMG_CNN}\n")
    out.append(c_array("IMG_CNN", xt[:NIMG_CNN].reshape(NIMG_CNN, 784), "uint8_t"))
    out.append(c_array("LABEL_CNN", yt[:NIMG_CNN], "uint8_t"))
    out.append(c_array("GOLD_CNN", gold))
    open("fw/model_cnn.h", "w").write("".join(out))

    # ---- LSTM ----
    p = dict(np.load("model/lstm_float.npz"))
    xcal = (xtr[:2000].astype(np.int64) >> 1).astype(np.float64) / 128.0
    ql = build_lstm(p, xcal)
    acc_f = 0; acc_q = 0
    for i in range(0, 10000, 1000):
        xb = xq_all[i:i + 1000]
        acc_f += int((lstm_float(p, xb / 128.0)[0].argmax(1) == yt[i:i + 1000]).sum())
        acc_q += int((lstm_int(ql, xb).argmax(1) == yt[i:i + 1000]).sum())
    print(f"LSTM float acc {acc_f/100:.2f}%  int8 acc {acc_q/100:.2f}%")
    print("   gates mult", ql["mult"], "shift", ql["shift"], " fc mult", ql["fmult"], "shift", ql["fshift"])
    gold = lstm_int(ql, xq_all[:NIMG_LSTM])
    out = ["// generated by scripts/quantize.py - do not edit\n#include <stdint.h>\n"]
    out.append(f"#define LSTM_H {H}\n#define LSTM_T {T}\n#define LSTM_F {F}\n#define LSTM_K 44\n#define LSTM_KP 48\n#define LSTM_C 64\n")
    out.append(f"#define LSTM_MULT {ql['mult']}\n#define LSTM_SHIFT {ql['shift']}\n")
    out.append(f"#define LFC_MULT {ql['fmult']}\n#define LFC_SHIFT {ql['fshift']}\n")
    out.append(c_array("W_lstm", pad2(ql["wq"], 48, 64)))
    out.append(c_array("B_lstm", ql["bq"], "int32_t"))
    out.append(c_array("W_lfc", pad2(ql["fwq"], 16, 16)))
    out.append(c_array("B_lfc", np.pad(ql["fbq"], (0, 6)), "int32_t"))
    out.append(f"#define NIMG_LSTM {NIMG_LSTM}\n")
    out.append(c_array("IMG_LSTM", xt[:NIMG_LSTM].reshape(NIMG_LSTM, 784), "uint8_t"))
    out.append(c_array("LABEL_LSTM", yt[:NIMG_LSTM], "uint8_t"))
    out.append(c_array("GOLD_LSTM", gold))
    open("fw/model_lstm.h", "w").write("".join(out))
    print("headers written")


if __name__ == "__main__":
    main()
