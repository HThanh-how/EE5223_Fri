// Tiled INT8 matmul + requant on the NPU (and a CPU-only twin used as baseline).
#ifndef NN_H
#define NN_H
#include "npu.h"

static uint32_t npu_calls, npu_busy_cycles;
// host-side phase profile of npu_matmul (cycles): weight tile writes, activation writes, NPU run+poll, result reads
static uint32_t ph_w, ph_a, ph_run, ph_rd;
static inline uint32_t cyc_(void) { uint32_t c; __asm__ volatile("rdcycle %0" : "=r"(c)); return c; }

// act_tab[c0 / NN] = activation used for the output column chunk starting at c0.
// X[M][ldx] int8 (ldx % 4 == 0, X 4-byte aligned), W[Kp][Cp] int8, bias[Cp], Y[M][ldy] int8.
static void npu_matmul(const int8_t *X, int ldx, int M, int Kp, const int8_t *W, int Cp,
                       const int32_t *bias, int mult, int shift, const uint8_t *act_tab,
                       int8_t *Y, int ldy) {
    for (int m0 = 0; m0 < M; m0 += NPU_DEPTH) {
        int mc = M - m0 < NPU_DEPTH ? M - m0 : NPU_DEPTH;
        for (int c0 = 0; c0 < Cp; c0 += NN) {
            for (int k0 = 0; k0 < Kp; k0 += NN) {
                uint32_t t0 = cyc_();
                npu_load_w(&W[k0 * Cp + c0], Cp);
                uint32_t t1 = cyc_();
                for (int r = 0; r < mc; r++) {
                    const uint32_t *src = (const uint32_t *)(X + (m0 + r) * ldx + k0);
                    for (int s = 0; s < NN / 4; s++) npu_write_a(r, s, src[s]);
                }
                uint32_t t2 = cyc_();
                uint32_t flags = k0 ? F_ACCUM : 0;
                if (k0 + NN >= Kp) {
                    npu_set_bias(&bias[c0]);
                    npu_set_quant(mult, shift, act_tab[c0 / NN]);
                    flags |= F_QUANT;
                }
                npu_busy_cycles += npu_run(mc, flags);
                npu_calls++;
                uint32_t t3 = cyc_();
                ph_w += t1 - t0; ph_a += t2 - t1; ph_run += t3 - t2;
            }
            uint32_t t4 = cyc_();
            for (int r = 0; r < mc; r++) {
                uint32_t *dst = (uint32_t *)(Y + (m0 + r) * ldy + c0);
                for (int s = 0; s < NN / 4; s++) dst[s] = npu_read_q_word(r, s);
            }
            ph_rd += cyc_() - t4;
        }
    }
}

// CPU-only reference: only the first K rows / C columns of W are used; padded outputs are zero.
static void cpu_matmul(const int8_t *X, int ldx, int M, int K, const int8_t *W, int Cp, int C,
                       const int32_t *bias, int mult, int shift, const uint8_t *act_tab, int NNC,
                       int8_t *Y, int ldy) {
    for (int m = 0; m < M; m++) {
        const int8_t *x = X + m * ldx;
        for (int c = 0; c < Cp; c++) {
            if (c >= C) { Y[m * ldy + c] = 0; continue; }
            int32_t acc = 0;
            for (int k = 0; k < K; k++) acc += (int32_t)x[k] * (int32_t)W[k * Cp + c];
            Y[m * ldy + c] = requant_ref(acc, bias[c], mult, shift, act_tab[c / NNC]);
        }
    }
}

static void fill_act(uint8_t *tab, int act) { for (int i = 0; i < 32; i++) tab[i] = (uint8_t)act; }
#endif
