// Kiểm thử hai K-chunk, CBUF, bias, requant và bốn activation so với C reference.
// In tham số và PASS/FAIL từng trial, sau đó RESULT; dữ liệu RNG có seed cố định.
// Chạy: make soc N=8 FW=selftest (N là kích thước mảng, FW chọn selftest).
// NPU post-processing self-test: K-chunk accumulation, bias, requant, ReLU/sigmoid/tanh vs. C reference.
#include "common.h"
#include "npu.h"

// A có chiều K=2*NN; W0/W1 là hai tile nối nhau dọc K, không phải hai output tile.
// acc_ref lưu dot product đầy đủ trước bias để kiểm tra CBUF độc lập post-processing.
#define MAXM 64
static int8_t  A[MAXM][2 * NN], W0[NN][NN] __attribute__((aligned(4))), W1[NN][NN] __attribute__((aligned(4)));
static int32_t bias[NN], acc_ref[MAXM][NN];

int main(void) {
    int err = 0, ntest = 0;
    puts_("selftest N="); putu(NN); puts_("\n");
    // Các trial bao gồm M=1/64, signed multiplier, shift=0/31 và dữ liệu -128.
    // So sánh cả accumulator trước quant lẫn byte sau quant để phân biệt lỗi hai pha.
    for (int trial = 0; trial < 24; trial++) {
        // 24 trial luân phiên ACT_NONE/RELU/SIG/TANH; M=1 và 64 kiểm biên đầu/cuối buffer.
        // Các trial khác chọn M xác định từ RNG, không dùng đồng hồ làm seed.
        // Multiplier âm kiểm tra signed datapath; shift=0 bỏ rounding, shift=31 kiểm biên 5 bit.
        int M = (trial == 0) ? 1 : (trial == 1) ? 64 : 1 + rng() % 64;
        int act = trial % 4;
        int mult = (trial % 5 == 0) ? 32767 : (int)(rng() % 32767) + 1;
        if (trial % 7 == 3) mult = -mult;
        int shift = (trial % 6 == 0) ? 0 : (int)(rng() % 24) + 8;
        if (trial == 5) { shift = 31; mult = 32767; }

        for (int i = 0; i < NN; i++) for (int j = 0; j < NN; j++) { W0[i][j] = rnd8(); W1[i][j] = rnd8(); }
        for (int m = 0; m < M; m++) for (int k = 0; k < 2 * NN; k++) A[m][k] = rnd8();
        for (int j = 0; j < NN; j++) bias[j] = (int32_t)(rng() % 20001) - 10000;
        // Ép cả A/W=-128 tạo tích dương 16384, bắt lỗi dùng INT8/unsigned cho tích.
        // Bias ngẫu nhiên [-10000,10000] kiểm cả cộng/trừ trước requant.
        if (trial == 2) { for (int m = 0; m < M; m++) for (int k = 0; k < 2 * NN; k++) A[m][k] = -128;
                          for (int i = 0; i < NN; i++) for (int j = 0; j < NN; j++) { W0[i][j] = -128; W1[i][j] = -128; } }

        // Golden cộng cả hai nửa K bằng int32_t; không bias, clamp hay activation ở đây.
        // Vì vậy sai CBUF và sai QBUF có thể cùng tăng e, không phải số hàng sai duy nhất.
        for (int m = 0; m < M; m++) for (int j = 0; j < NN; j++) {
            int32_t a = 0;
            for (int k = 0; k < NN; k++) a += (int32_t)A[m][k] * W0[k][j] + (int32_t)A[m][NN + k] * W1[k][j];
            acc_ref[m][j] = a;
        }

        // Mỗi chunk nạp W và lát A khác nhau; ABUF được ghi lại vì chỉ chứa NN feature.
        // Cast uint8_t trước shift để byte âm không sign-extend vào ba byte còn lại.
        for (int c = 0; c < 2; c++) {
            npu_load_w(c ? &W1[0][0] : &W0[0][0], NN);
            for (int m = 0; m < M; m++)
                for (int s = 0; s < NN / 4; s++) {
                    uint32_t w = 0;
                    for (int b = 0; b < 4; b++) w |= (uint32_t)(uint8_t)A[m][c * NN + 4 * s + b] << (8 * b);
                    npu_write_a(m, s, w);
                }
            // Chunk 0 overwrite CBUF và không quant; chunk 1 ACCUM|QUANT mới thêm bias.
            // Quy trình này bắt lỗi vô tình xóa tổng khi đổi W hoặc cộng bias ở mọi chunk.
            if (c == 0) {
                npu_run(M, 0);
            } else {
                npu_set_bias(bias);
                npu_set_quant(mult, shift, act);
                npu_run(M, F_ACCUM | F_QUANT);
            }
        }

        // Đọc CBUF bằng word signed rồi QBUF theo nhóm bốn byte.
        // requant_ref dùng cùng mult/shift/act; tách từng byte Q kiểm cả packing và dấu.
        int e = 0;
        for (int m = 0; m < M; m++) {
            for (int j = 0; j < NN; j++) {
                if (npu_read_c(m, j) != acc_ref[m][j]) e++;
            }
            for (int s = 0; s < NN / 4; s++) {
                uint32_t w = npu_read_q_word(m, s);
                for (int b = 0; b < 4; b++) {
                    int j = 4 * s + b;
                    int8_t ref = requant_ref(acc_ref[m][j], bias[j], mult, shift, act);
                    if ((int8_t)(w >> (8 * b)) != ref) e++;
                }
            }
        }
        // Log từng trial in M/act/mult/shift và PASS/FAIL; err cộng số phần tử sai.
        // ntest được tăng nhưng dòng cuối chỉ in RESULT; main trả 1 nếu có bất kỳ mismatch.
        err += e; ntest++;
        puts_("trial "); putu(trial); puts_(" M="); putu(M); puts_(" act="); putu(act);
        puts_(" mult="); putd(mult); puts_(" shift="); putu(shift);
        puts_(e ? " FAIL\n" : " PASS\n");
    }
    puts_(err ? "RESULT: FAIL\n" : "RESULT: ALL PASS\n");
    return err != 0;
}
