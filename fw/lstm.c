// LSTM MNIST: GEMM gate trên NPU hoặc CPU, cập nhật cell trên CPU.
// So sánh logits golden, độ chính xác và cycle cho batch 1 và batch nhiều ảnh.
// Chạy: make soc N=8 FW=lstm (N là kích thước mảng, FW chọn LSTM).
// LSTM (28 steps x 28 features, H=16) INT8 on MNIST rows. Gate GEMM on the NPU, sigmoid/tanh via NPU LUT,
// element-wise cell update on the CPU. Compares CPU-only, NPU batch=1, and NPU batch=NIMG_LSTM.
#include "common.h"
#include "nn.h"
#include "lut_tables.h"
#include "model_lstm.h"

#define BMAX NIMG_LSTM
#define H LSTM_H

// Mỗi ảnh là 28 bước thời gian, mỗi bước đọc một row 28 pixel; H=16 hidden unit.
// Z chứa [x(28),h(16),padding(4)] với stride 48; W_lstm có 64 cột i/f/g/o.
// Mỗi lần gọi run_batch reset cell/hidden, không mang state từ ảnh hoặc batch trước.
static int8_t Z[BMAX][LSTM_KP] __attribute__((aligned(4)));   // [x_q(28) | h(16) | 0 pad]
static int8_t G[BMAX][LSTM_C] __attribute__((aligned(4)));    // gates i,f,g,o (int8, scale 1/128)
static int8_t L[BMAX][16] __attribute__((aligned(4)));        // logits (padded)
static int32_t cst[BMAX][H];
static uint8_t act_gate[32], act_none[32];

// run images [first, first+B) as one batch; logits go to L
// Z ghép pixel và hidden state; thứ tự gate là i, f, g, o.
// Gate và hidden có scale 1/128; cell có scale 1/16384.
// Dịch cell 10 bit để vào miền LUT x=q/16, cộng 512 để làm tròn;
// nhân output gate với tanh rồi cộng 64 và dịch 7 bit để về scale 1/128.
static void run_batch(int first, int B, int use_npu) {
    for (int b = 0; b < B; b++) {
        for (int j = 0; j < LSTM_KP; j++) Z[b][j] = 0;
        for (int j = 0; j < H; j++) cst[b][j] = 0;
    }
    // Ở mỗi bước chỉ thay 28 pixel đầu Z; hidden do bước trước lưu ở Z[LSTM_F+j].
    // Cùng một weight tile áp cho B row ảnh nên batch lớn chia sẻ chi phí nạp weight.
    for (int t = 0; t < LSTM_T; t++) {
        for (int b = 0; b < B; b++)
            for (int f = 0; f < LSTM_F; f++) Z[b][f] = (int8_t)(IMG_LSTM[first + b][t * LSTM_F + f] >> 1);
        if (use_npu)
            npu_matmul(&Z[0][0], LSTM_KP, B, LSTM_KP, &W_lstm[0][0], LSTM_C, B_lstm, LSTM_MULT, LSTM_SHIFT, act_gate, &G[0][0], LSTM_C);
        else
            cpu_matmul(&Z[0][0], LSTM_KP, B, LSTM_K, &W_lstm[0][0], LSTM_C, LSTM_C, B_lstm, LSTM_MULT, LSTM_SHIFT, act_gate, NN, &G[0][0], LSTM_C);
        for (int b = 0; b < B; b++)
            for (int j = 0; j < H; j++) {
                int32_t i = G[b][j], f = G[b][H + j], g = G[b][2 * H + j], o = G[b][3 * H + j];
                // i/f/o là sigmoid không âm scale 1/128; g là tanh có dấu cùng scale.
                // f*c cũ có scale 1/2^21, dịch 7 trả scale cell 1/2^14; i*g đã ở scale ấy.
                // Dịch f*c không cộng rounding, phải giữ đúng quy tắc này để khớp golden.
                // Đổi cell sang LUT q/16 cần chia 2^10: (c+512)>>10, rồi clamp [-128,127].
                int32_t c = ((f * cst[b][j]) >> 7) + i * g;
                cst[b][j] = c;
                int32_t ti = (c + 512) >> 10;
                if (ti > 127) ti = 127;
                if (ti < -128) ti = -128;
                // TANH[(uint8_t)ti] giải mã byte âm theo two's complement; scale output 1/128.
                // o*tanh có scale 1/16384; +64 rồi >>7 đưa hidden về scale 1/128.
                int32_t h = (o * (int32_t)LUT_TANH[(uint8_t)ti] + 64) >> 7;
                Z[b][LSTM_F + j] = (int8_t)h;
            }
    }
    // Classifier lấy hidden cuối từ offset 28 trong mỗi row Z, vẫn dùng stride 48.
    // FC có K=16, 10 cột thật đệm thành 16; không activation ở logits cuối.
    if (use_npu)
        npu_matmul(&Z[0][LSTM_F], LSTM_KP, B, 16, &W_lfc[0][0], 16, B_lfc, LFC_MULT, LFC_SHIFT, act_none, &L[0][0], 16);
    else
        cpu_matmul(&Z[0][LSTM_F], LSTM_KP, B, 16, &W_lfc[0][0], 16, 10, B_lfc, LFC_MULT, LFC_SHIFT, act_none, NN, &L[0][0], 16);
}

// Đếm sai khác từng logit so với golden và số dự đoán khớp nhãn.
static int check(int first, int B, int *correct) {
    int bad = 0;
    for (int b = 0; b < B; b++) {
        int best = 0;
        for (int j = 0; j < 10; j++) {
            if (L[b][j] != GOLD_LSTM[first + b][j]) bad++;
            if (L[b][j] > L[b][best]) best = j;
        }
        if (best == LABEL_LSTM[first + b]) (*correct)++;
    }
    return bad;
}

int main(void) {
    fill_act(act_none, ACT_NONE);
    // Một activation cho cả NN cột; gate=(tile_start)/H chọn miền i/f/g/o.
    // Chỉ gate 2 dùng tanh; các gate còn lại dùng sigmoid.
    // Điều kiện H chia hết cho NN bảo đảm một tile không cắt qua hai loại activation.
    for (int i = 0; i < 32; i++) { int gate = (i * NN) / H; act_gate[i] = (gate == 2) ? ACT_TANH : ACT_SIG; }
    puts_("LSTM INT8, N="); putu(NN); puts_(" images="); putu(NIMG_LSTM); puts_("\n");
    int bad = 0, correct = 0;
    uint32_t t0;

    // CPU baseline chỉ đo hai ảnh đầu rồi lấy trung bình; không đo cả NIMG_LSTM.
    // Mọi đường đều cộng bad từ so 10 logits, accuracy nhãn được đếm riêng.
    // CPU only, batch 1 (2 images, cost is data independent)
    t0 = rdcycle();
    for (int i = 0; i < 2; i++) { run_batch(i, 1, 0); bad += check(i, 1, &correct); }
    uint32_t cpu_per_img = (rdcycle() - t0) / 2;
    puts_("cpu_only batch=1   cycles/img="); putu(cpu_per_img); puts_("\n");

    // NPU, batch 1: all images one by one
    correct = 0; npu_busy_cycles = 0; npu_calls = 0;
    t0 = rdcycle();
    for (int i = 0; i < NIMG_LSTM; i++) { run_batch(i, 1, 1); bad += check(i, 1, &correct); }
    uint32_t t_b1 = (rdcycle() - t0) / NIMG_LSTM;
    puts_("npu batch=1        cycles/img="); putu(t_b1); puts_(" npu_busy/img="); putu(npu_busy_cycles / NIMG_LSTM);
    puts_(" calls/img="); putu(npu_calls / NIMG_LSTM); puts_(" correct="); putu(correct); puts_("/"); putu(NIMG_LSTM); puts_("\n");

    // Batch gom NIMG_LSTM hàng vào GEMM mỗi step, không rút ngắn 28 step phụ thuộc nhau.
    // cycles/img là tổng vùng đo chia số ảnh; busy/img và calls giúp tách compute/host.
    // NPU, batch = NIMG_LSTM
    correct = 0; npu_busy_cycles = 0; npu_calls = 0;
    t0 = rdcycle();
    run_batch(0, NIMG_LSTM, 1); bad += check(0, NIMG_LSTM, &correct);
    uint32_t t_bn = (rdcycle() - t0) / NIMG_LSTM;
    puts_("npu batch="); putu(NIMG_LSTM); puts_("       cycles/img="); putu(t_bn); puts_(" npu_busy/img="); putu(npu_busy_cycles / NIMG_LSTM);
    puts_(" calls total="); putu(npu_calls); puts_(" correct="); putu(correct); puts_("/"); putu(NIMG_LSTM); puts_("\n");

    // Hai speedup dùng cùng cpu_per_img; x100 giữ hai chữ số thập phân bằng số nguyên.
    // RESULT ALL PASS chỉ khi bad=0 ở CPU baseline, NPU batch=1 và NPU batch lớn.
    puts_("speedup_x100 vs cpu: batch1="); putu((uint32_t)((uint64_t)cpu_per_img * 100 / t_b1));
    puts_(" batchN="); putu((uint32_t)((uint64_t)cpu_per_img * 100 / t_bn)); puts_("\n");
    puts_("mismatches vs golden: "); putu(bad); puts_("\n");
    puts_(bad ? "RESULT: FAIL\n" : "RESULT: ALL PASS\n");
    return bad != 0;
}
