// LeNet-5 (INT8) on MNIST: CPU-only vs NPU (im2col + tiled GEMM + requant/ReLU in hardware).
#include "common.h"
#include "nn.h"
#include "model_cnn.h"

#ifndef NRUN
#define NRUN NIMG_CNN
#endif

static int8_t xq[28 * 28];
static int8_t X1[576][CONV1_KP] __attribute__((aligned(4)));
static int8_t Y1[576][CONV1_CP] __attribute__((aligned(4)));
static int8_t fm1[6][12][12];
static int8_t X2[64][CONV2_KP] __attribute__((aligned(4)));
static int8_t Y2[64][CONV2_CP] __attribute__((aligned(4)));
static int8_t flat[256] __attribute__((aligned(4)));
static int8_t Y3[FC1_CP] __attribute__((aligned(4)));
static int8_t Y4[FC2_CP] __attribute__((aligned(4)));
static int8_t Y5[FC3_CP] __attribute__((aligned(4)));
static uint8_t act_relu[32], act_none[32];

static void layer(int use_npu, const int8_t *X, int ldx, int M, int K, int Kp, const int8_t *W, int C, int Cp,
                  const int32_t *B, int mult, int shift, int relu, int8_t *Y, int ldy) {
    const uint8_t *at = relu ? act_relu : act_none;
    if (use_npu) npu_matmul(X, ldx, M, Kp, W, Cp, B, mult, shift, at, Y, ldy);
    else         cpu_matmul(X, ldx, M, K, W, Cp, C, B, mult, shift, at, NN, Y, ldy);
}

static void infer(const uint8_t *img, int use_npu, int8_t *logits) {
    for (int i = 0; i < 784; i++) xq[i] = (int8_t)(img[i] >> 1);

    // conv1: im2col -> [576][25]
    for (int y = 0; y < 24; y++)
        for (int x = 0; x < 24; x++)
            for (int ky = 0; ky < 5; ky++)
                for (int kx = 0; kx < 5; kx++) X1[y * 24 + x][ky * 5 + kx] = xq[(y + ky) * 28 + x + kx];
    layer(use_npu, &X1[0][0], CONV1_KP, 576, CONV1_K, CONV1_KP, &W_conv1[0][0], CONV1_C, CONV1_CP,
          B_conv1, CONV1_MULT, CONV1_SHIFT, 1, &Y1[0][0], CONV1_CP);
    for (int c = 0; c < 6; c++)
        for (int y = 0; y < 12; y++)
            for (int x = 0; x < 12; x++) {
                int8_t a = Y1[(2 * y) * 24 + 2 * x][c], b = Y1[(2 * y) * 24 + 2 * x + 1][c];
                int8_t d = Y1[(2 * y + 1) * 24 + 2 * x][c], e = Y1[(2 * y + 1) * 24 + 2 * x + 1][c];
                if (b > a) a = b; if (e > d) d = e; if (d > a) a = d;
                fm1[c][y][x] = a;
            }

    // conv2: im2col -> [64][150]
    for (int y = 0; y < 8; y++)
        for (int x = 0; x < 8; x++)
            for (int c = 0; c < 6; c++)
                for (int ky = 0; ky < 5; ky++)
                    for (int kx = 0; kx < 5; kx++) X2[y * 8 + x][c * 25 + ky * 5 + kx] = fm1[c][y + ky][x + kx];
    layer(use_npu, &X2[0][0], CONV2_KP, 64, CONV2_K, CONV2_KP, &W_conv2[0][0], CONV2_C, CONV2_CP,
          B_conv2, CONV2_MULT, CONV2_SHIFT, 1, &Y2[0][0], CONV2_CP);
    for (int c = 0; c < 16; c++)
        for (int y = 0; y < 4; y++)
            for (int x = 0; x < 4; x++) {
                int8_t a = Y2[(2 * y) * 8 + 2 * x][c], b = Y2[(2 * y) * 8 + 2 * x + 1][c];
                int8_t d = Y2[(2 * y + 1) * 8 + 2 * x][c], e = Y2[(2 * y + 1) * 8 + 2 * x + 1][c];
                if (b > a) a = b; if (e > d) d = e; if (d > a) a = d;
                flat[c * 16 + y * 4 + x] = a;
            }

    layer(use_npu, flat, 256, 1, FC1_K, FC1_KP, &W_fc1[0][0], FC1_C, FC1_CP, B_fc1, FC1_MULT, FC1_SHIFT, 1, Y3, FC1_CP);
    layer(use_npu, Y3, FC1_CP, 1, FC2_K, FC2_KP, &W_fc2[0][0], FC2_C, FC2_CP, B_fc2, FC2_MULT, FC2_SHIFT, 1, Y4, FC2_CP);
    layer(use_npu, Y4, FC2_CP, 1, FC3_K, FC3_KP, &W_fc3[0][0], FC3_C, FC3_CP, B_fc3, FC3_MULT, FC3_SHIFT, 0, Y5, FC3_CP);
    for (int i = 0; i < 10; i++) logits[i] = Y5[i];
}

static int argmax(const int8_t *v) { int b = 0; for (int i = 1; i < 10; i++) if (v[i] > v[b]) b = i; return b; }

int main(void) {
    fill_act(act_relu, ACT_RELU); fill_act(act_none, ACT_NONE);
    puts_("LeNet-5 INT8, N="); putu(NN); puts_("\n");
    int8_t lg[10];
    uint32_t sum_cpu = 0, sum_npu = 0, busy_total = 0, calls_total = 0;
    int bad = 0, correct_npu = 0;
    for (int i = 0; i < NRUN; i++) {
        uint32_t t0 = rdcycle();
        infer(IMG_CNN[i], 0, lg);
        uint32_t t_cpu = rdcycle() - t0;
        int e_cpu = 0; for (int j = 0; j < 10; j++) if (lg[j] != GOLD_CNN[i][j]) e_cpu++;

        npu_busy_cycles = 0; npu_calls = 0; ph_w = ph_a = ph_run = ph_rd = 0;
        t0 = rdcycle();
        infer(IMG_CNN[i], 1, lg);
        uint32_t t_npu = rdcycle() - t0;
        int e_npu = 0; for (int j = 0; j < 10; j++) if (lg[j] != GOLD_CNN[i][j]) e_npu++;
        if (i == 0) {
            puts_("  profile(img0): weight_wr="); putu(ph_w); puts_(" act_wr="); putu(ph_a);
            puts_(" run+poll="); putu(ph_run); puts_(" result_rd="); putu(ph_rd);
            puts_(" other(im2col,pool,...)="); putu(t_npu - ph_w - ph_a - ph_run - ph_rd); puts_("\n");
        }
        int pred = argmax(lg);
        if (pred == LABEL_CNN[i]) correct_npu++;
        bad += e_cpu + e_npu;
        sum_cpu += t_cpu; sum_npu += t_npu; busy_total += npu_busy_cycles; calls_total += npu_calls;

        puts_("img "); putu(i); puts_(" label="); putu(LABEL_CNN[i]); puts_(" pred="); putu(pred);
        puts_(" cpu_cyc="); putu(t_cpu); puts_(" npu_cyc="); putu(t_npu);
        puts_(" npu_busy="); putu(npu_busy_cycles); puts_(" calls="); putu(npu_calls);
        puts_(" mism(cpu/npu vs golden)="); putu(e_cpu); puts_("/"); putu(e_npu); puts_("\n");
    }
    puts_("avg cpu_cyc="); putu(sum_cpu / NRUN); puts_(" avg npu_cyc="); putu(sum_npu / NRUN);
    puts_(" speedup_x100="); putu((uint32_t)((uint64_t)sum_cpu * 100 / sum_npu));
    puts_(" npu_busy_share_x100="); putu((uint32_t)((uint64_t)busy_total * 10000 / sum_npu)); puts_("\n");
    puts_("correct="); putu(correct_npu); puts_("/"); putu(NRUN); puts_("\n");
    puts_(bad ? "RESULT: FAIL\n" : "RESULT: ALL PASS\n");
    return bad != 0;
}
