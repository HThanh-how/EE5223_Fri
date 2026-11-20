# PTQ LeNet và LSTM từ weights float, tạo model header và golden integer bit-exact.
# Chạy: python3 scripts/quantize.py từ gốc repo; cần NumPy, MNIST và weights .npz.
"""Post-training INT8 quantisation of the float LeNet-5 and LSTM, plus bit-exact integer golden models.

Inputs : data/mnist.npz, model/lenet_float.npz, model/lstm_float.npz
Outputs: fw/model_cnn.h, fw/model_lstm.h (padded weights, requant params, test images, golden logits)
The integer golden model uses exactly the NPU requant formula:
  y = clamp8(((acc + bias) * mult + (1 << (shift-1))) >> shift), then ReLU / sigmoid LUT / tanh LUT.
"""
# Không có CLI flags: chạy từ gốc repo để các đường dẫn tương đối đúng.
# Đọc data/mnist.npz (x_train/x_test/y_test) và hai model float .npz có sẵn.
# Chỉ dùng PTQ, không train lại; cần NumPy và sliding_window_view.
# Script ghi đè fw/model_cnn.h và fw/model_lstm.h; không sửa weight float.
# Header chứa weight/bias integer, mult/shift, ảnh/nhãn thử và logits golden.
# Không có affine zero-point khác 0: real xấp xỉ scale*q cho mọi tensor.
# Ảnh pixel>>1 là xấp xỉ input không âm; CNN dùng scale 2/255, LSTM 1/128.
import sys
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

sys.path.insert(0, "scripts")
from gen_lut import SIG, TANH

LUT_SIG = np.array(SIG, dtype=np.int64)
LUT_TANH = np.array(TANH, dtype=np.int64)
NIMG_CNN, NIMG_LSTM = 8, 16


# floor(x+0.5) làm tròn tie về phía dương, khác round kiểu ties-to-even.
# Quy tắc chung dùng cho weights/bias/mult và LUT để tránh lệch một LSB.
def rnd(x):
    return np.floor(np.asarray(x, dtype=np.float64) + 0.5)


# Thực hiện rounding giống RTL: cộng nửa bước trước arithmetic shift, rồi saturate.
# LUT được đánh chỉ số bằng byte two's complement; không dùng float ở golden.
def requant_np(acc, bias, mult, shift, act):
    # bias broadcast theo cột; accumulator và bias phải có miền vừa INT32 như firmware.
    # Dùng int64 cho tích mult để NumPy không tràn khi requant.
    # real_multiplier xấp xỉ mult/2^shift; shift=0 không có số hạng rounding.
    # Saturate [-128,127] trước activation; y&0xFF ánh xạ signed sang index LUT.
    # ACT none/relu giữ scale output layer; sig/tanh trả q với scale 1/128.
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
    # Tăng shift nâng độ chính xác fixed-point; dừng khi multiplier không còn vừa 32767.
    # Giữ cặp hợp lệ cuối, chỉ xét abs(m)<=32767 nên không dùng giá trị -32768.
    # Assert loại real quá lớn hoặc quá nhỏ làm multiplier cuối bằng 0.
    best = None
    for sh in range(0, 32):
        m = int(rnd(real * (1 << sh)))
        if abs(m) <= 32767:
            best = (m, sh)
        else:
            break
    assert best is not None and best[0] != 0, f"multiplier {real} out of range"
    return best


# Lượng tử đối xứng per-tensor: scale=max(abs(w))/127, weight trong [-127,127].
def quant_w(w):
    # Weight symmetric per-tensor dùng q=clamp(floor(w/s+0.5),-127,127), zero-point=0.
    # Không dùng -128 để hai biên biểu diễn cân đối; dequant weight xấp xỉ s*q.
    # Giả thiết tensor weight không toàn 0, nếu không s=0 sẽ không lượng tử được.
    s = np.abs(w).max() / 127.0
    return np.clip(rnd(w / s), -127, 127).astype(np.int64), s


# Đệm zero để tile K và C vừa mảng; phần đệm không đóng góp vào dot product.
def pad2(a, rows, cols):
    out = np.zeros((rows, cols), dtype=a.dtype)
    out[: a.shape[0], : a.shape[1]] = a
    return out


# Làm tròn chiều lên bội 8, hỗ trợ tiling NN=4 hoặc 8 của firmware hiện tại.
# Không tự đệm cho NN bất kỳ; Kp/Cp trong header phải chia hết NN chọn khi build.
def up8(n):
    return (n + 7) // 8 * 8


# Mỗi cửa sổ convolution trở thành một hàng, giữ thứ tự kênh, ky, kx như firmware.
def im2col(x, k):  # x [N,C,H,W] -> [N*Ho*Wo, C*k*k], order (c, ky, kx)
    win = sliding_window_view(x, (k, k), axis=(2, 3))  # N,C,Ho,Wo,k,k
    n, c, ho, wo = win.shape[:4]
    return win.transpose(0, 2, 3, 1, 4, 5).reshape(n * ho * wo, c * k * k), ho, wo


# Pool 2x2 stride 2 giữ scale vì chỉ chọn max, không tạo phép nhân/đổi đơn vị.
# H/W phải chẵn như các feature map 24x24 và 8x8 trong LeNet này.
def pool2(x):  # [N,C,H,W]
    n, c, h, w = x.shape
    return x.reshape(n, c, h // 2, 2, w // 2, 2).max(axis=(3, 5))


# Serialize row-major với đủ shape C; aligned(4) đáp ứng npu_load_w/uint32_t*.
# Hàm trả chuỗi cho header, không tự mở file; bias dùng ctype int32_t.
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
    # Float CNN chỉ phục vụ calibration/accuracy baseline, không phải golden INT8.
    # collect lưu activation sau ReLU từng layer và logits cuối để chọn scale.
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


# Scale activation lấy từ tập calibration; bias đổi sang đơn vị tích input-weight.
# mult/shift xấp xỉ tỉ số scale đầu vào và đầu ra bằng multiplier int16.
def build_cnn(p, xcal):
    layers = ["conv1", "conv2", "fc1", "fc2", "fc3"]
    col = {}
    cnn_float(p, xcal, col)
    # CNN input pixel>>1 xấp xỉ pixel/255 bằng q*(2/255), không trừ mean/zero-point.
    # Scale hidden dùng percentile 99.9% để giảm tác động outlier, chấp nhận clamp đuôi.
    # FC3 dùng max abs thay percentile vì cần giữ miền logits cho argmax.
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
        # Với real acc=(s_in*s_w)*acc_q, bias_q=round(bias_real/(s_in*s_w)).
        # Đổi sang output scale s_out cần real=s_in*s_w/s_out, xấp xỉ mult/2^shift.
        # Bias được cộng một lần sau đủ K, đúng trình tự của npu_matmul/RTL.
        bq = rnd(p[L + "_b"] / (s_in * sw)).astype(np.int64)
        m, sh = mult_shift(s_in * sw / s_act[L])
        q[L] = dict(wq=wq, bq=bq, mult=m, shift=sh, act="none" if L == "fc3" else "relu")
    return q


# Golden dùng phép matmul int64 và requant_np sau mỗi layer, không dequant float.
# Thứ tự im2col/transpose/flatten phải khớp cnn.c để weight cùng một chỉ số K.
# Max-pool nằm sau ReLU của convolution, FC cuối không ReLU.
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
# LSTM đọc ảnh theo 28 row thời gian, mỗi row 28 feature; hidden size H=16.
# Thứ tự 64 gate là [i(16), f(16), g(16), o(16)], cùng thứ tự fw/lstm.c.
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


# Gate dùng miền LUT q/16, còn output LUT và hidden có scale 1/128.
def build_lstm(p, xcal):
    # Ghép [w_ih.T;w_hh.T] theo chiều K: [28+16,64], tương ứng z=[pixel,hidden].
    # Cả pixel và hidden được xem scale 1/128 nên dùng chung scale weight sw.
    # Bias_q chia sw/128; output trước LUT có scale 1/16, nên multiplier=sw*16/128.
    wcat = np.concatenate([p["w_ih"].T, p["w_hh"].T], axis=0)  # [44, 64], both inputs have scale 1/128
    wq, sw = quant_w(wcat)
    bq = rnd(p["b"] / (sw / 128.0)).astype(np.int64)
    m, sh = mult_shift(sw / 128.0 * 16.0)  # acc -> LUT index domain (x = q/16)
    # Classifier cuối dùng hidden scale 1/128 và weight scale fsw, không qua LUT.
    # Chọn s_out từ max abs float logits calibration; bias/mult đổi đơn vị tương tự CNN.
    fwq, fsw = quant_w(p["fc_w"].T)  # [16,10]
    logits, _ = lstm_float(p, xcal)
    s_out = np.abs(logits).max() / 127.0
    fbq = rnd(p["fc_b"] / ((1 / 128.0) * fsw)).astype(np.int64)
    fm, fsh = mult_shift((1 / 128.0) * fsw / s_out)
    return dict(wq=wq, bq=bq, mult=m, shift=sh, fwq=fwq, fbq=fbq, fmult=fm, fshift=fsh)


# Mô hình golden nguyên giữ scale cell 1/16384 và hidden 1/128 qua từng bước.
def lstm_int(q, xq):  # xq [N,28,28] int64 0..127
    n = xq.shape[0]
    h = np.zeros((n, H), dtype=np.int64); c = np.zeros((n, H), dtype=np.int64)
    for t in range(T):
        z = np.concatenate([xq[:, t], h], axis=1)
        acc = z @ q["wq"]
        y = np.clip(((acc + q["bq"]) * q["mult"] + ((1 << (q["shift"] - 1)) if q["shift"] else 0)) >> q["shift"], -128, 127)
        i, f = LUT_SIG[y[:, :H] & 0xFF], LUT_SIG[y[:, H:2 * H] & 0xFF]
        g, o = LUT_TANH[y[:, 2 * H:3 * H] & 0xFF], LUT_SIG[y[:, 3 * H:] & 0xFF]
        # f*c>>7 giữ scale cell 1/16384, i*g đã cùng scale; không rounding tích f*c.
        # Đổi cell sang q cho x=q/16 bằng (c+512)>>10 rồi clamp vào miền INT8.
        # Hidden=o*tanh(cell) có tích scale 1/16384, +64 và >>7 về 1/128.
        # Các hằng 512/10 và 64/7 phải giữ nguyên để golden khớp firmware.
        c = ((f * c) >> 7) + i * g
        tidx = np.clip((c + 512) >> 10, -128, 127)
        h = (o * LUT_TANH[tidx & 0xFF] + 64) >> 7
    acc = h @ q["fwq"]
    return requant_np(acc, q["fbq"], q["fmult"], q["fshift"], "none")


# ======================= main =======================
def main():
    # Calibration chỉ lấy 2000 ảnh train đầu; đánh accuracy trên 10000 ảnh test.
    # Các ảnh nhúng đầu ra là 8 CNN và 16 LSTM đầu tập test, không phải toàn bộ MNIST.
    d = np.load("data/mnist.npz")
    xt, yt, xtr = d["x_test"], d["y_test"], d["x_train"]
    xq_all = (xt.astype(np.int64) >> 1)  # pixel>>1, 0..127

    # ---- CNN ----
    p = dict(np.load("model/lenet_float.npz"))
    xcal = (xtr[:2000].astype(np.float64) / 255.0)[:, None]
    q = build_cnn(p, xcal)
    acc_f = 0; acc_q = 0
    # Chia batch 500 để hạn chế RAM cho im2col; acc_f/acc_q là số dự đoán đúng.
    # Chia 100 đổi số đúng trên 10000 thành phần trăm, không phải số cycle.
    for i in range(0, 10000, 500):
        xb = xt[i:i + 500]
        acc_f += int((cnn_float(p, (xb / 255.0)[:, None]).argmax(1) == yt[i:i + 500]).sum())
        acc_q += int((cnn_int(q, xq_all[i:i + 500][:, None]).argmax(1) == yt[i:i + 500]).sum())
    print(f"CNN  float acc {acc_f/100:.2f}%  int8 acc {acc_q/100:.2f}%")
    for L in q:
        print("  ", L, "mult", q[L]["mult"], "shift", q[L]["shift"])
    gold = cnn_int(q, xq_all[:NIMG_CNN][:, None])
    # K thực conv1=25, conv2=150; FC là 256x120,120x84,84x10.
    # Đệm weight/bias bằng 0 tới Kp/Cp, giữ K/C thật để CPU bỏ qua padding.
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
    # Ảnh uint8 giữ pixel gốc cho firmware tự >>1; GOLD_CNN là logit INT8 sau FC3.
    # Các file model_*.h được sinh, không chỉnh tay khi sửa chú thích mã nguồn.
    open("fw/model_cnn.h", "w").write("".join(out))

    # ---- LSTM ----
    p = dict(np.load("model/lstm_float.npz"))
    # LSTM float baseline cũng nhận input đã lượng tử pixel>>1 rồi chia 128.
    # Điều này khớp quy ước hidden/input của build_lstm, khác CNN pixel/255.
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
    # K=44 đệm thành 48, 64 gate không cần đệm; FC 16x10 đệm thành 16x16.
    # GOLD_LSTM chỉ chứa 10 logits thật, không tính 6 cột classifier đệm.
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
