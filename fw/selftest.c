// NPU post-processing self-test: K-chunk accumulation, bias, requant, ReLU/sigmoid/tanh vs. C reference.
#include "common.h"
#include "npu.h"

#define MAXM 64
static int8_t  A[MAXM][2 * NN], W0[NN][NN] __attribute__((aligned(4))), W1[NN][NN] __attribute__((aligned(4)));
static int32_t bias[NN], acc_ref[MAXM][NN];

int main(void) {
    int err = 0, ntest = 0;
    puts_("selftest N="); putu(NN); puts_("\n");
    for (int trial = 0; trial < 24; trial++) {
        int M = (trial == 0) ? 1 : (trial == 1) ? 64 : 1 + rng() % 64;
        int act = trial % 4;
        int mult = (trial % 5 == 0) ? 32767 : (int)(rng() % 32767) + 1;
        if (trial % 7 == 3) mult = -mult;
        int shift = (trial % 6 == 0) ? 0 : (int)(rng() % 24) + 8;
        if (trial == 5) { shift = 31; mult = 32767; }

        for (int i = 0; i < NN; i++) for (int j = 0; j < NN; j++) { W0[i][j] = rnd8(); W1[i][j] = rnd8(); }
        for (int m = 0; m < M; m++) for (int k = 0; k < 2 * NN; k++) A[m][k] = rnd8();
        for (int j = 0; j < NN; j++) bias[j] = (int32_t)(rng() % 20001) - 10000;
        if (trial == 2) { for (int m = 0; m < M; m++) for (int k = 0; k < 2 * NN; k++) A[m][k] = -128;
                          for (int i = 0; i < NN; i++) for (int j = 0; j < NN; j++) { W0[i][j] = -128; W1[i][j] = -128; } }

        for (int m = 0; m < M; m++) for (int j = 0; j < NN; j++) {
            int32_t a = 0;
            for (int k = 0; k < NN; k++) a += (int32_t)A[m][k] * W0[k][j] + (int32_t)A[m][NN + k] * W1[k][j];
            acc_ref[m][j] = a;
        }

        for (int c = 0; c < 2; c++) {
            npu_load_w(c ? &W1[0][0] : &W0[0][0], NN);
            for (int m = 0; m < M; m++)
                for (int s = 0; s < NN / 4; s++) {
                    uint32_t w = 0;
                    for (int b = 0; b < 4; b++) w |= (uint32_t)(uint8_t)A[m][c * NN + 4 * s + b] << (8 * b);
                    npu_write_a(m, s, w);
                }
            if (c == 0) {
                npu_run(M, 0);
            } else {
                npu_set_bias(bias);
                npu_set_quant(mult, shift, act);
                npu_run(M, F_ACCUM | F_QUANT);
            }
        }

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
        err += e; ntest++;
        puts_("trial "); putu(trial); puts_(" M="); putu(M); puts_(" act="); putu(act);
        puts_(" mult="); putd(mult); puts_(" shift="); putu(shift);
        puts_(e ? " FAIL\n" : " PASS\n");
    }
    puts_(err ? "RESULT: FAIL\n" : "RESULT: ALL PASS\n");
    return err != 0;
}
