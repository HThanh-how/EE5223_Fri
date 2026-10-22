// Driver for the Avalon-MM NPU (npu_avmm). Same code runs on PicoRV32 (sim) and Nios V (DE10-Nano).
#ifndef NPU_H
#define NPU_H
#include <stdint.h>
#include "lut_tables.h"

#ifndef NN
#define NN 4
#endif
#ifndef NPU_BASE
#define NPU_BASE 0x20000000u
#endif
#define NPU_DEPTH 64

#define REG(o)   (*(volatile uint32_t *)(NPU_BASE + (o)))
#define R_CTRL   0x0000
#define R_STATUS 0x0004
#define R_M      0x0008
#define R_CYCLES 0x000C
#define R_INFO   0x0010
#define R_QMULT  0x0014
#define R_QSHIFT 0x0018
#define R_ACT    0x001C
#define R_BIAS   0x0040
#define B_Q      0x1000
#define B_W      0x4000
#define B_A      0x8000
#define B_C      0xC000

#define F_START 1u
#define F_CLEAR 2u
#define F_ACCUM 4u
#define F_QUANT 8u

#define ACT_NONE 0
#define ACT_RELU 1
#define ACT_SIG  2
#define ACT_TANH 3

// W tile: W[i][j] = w[i*ldw + j], NN x NN; w and ldw must be 4-byte aligned (4 weights per bus write)
static inline void npu_load_w(const int8_t *w, int ldw) {
    for (int i = 0; i < NN; i++) {
        const uint32_t *row = (const uint32_t *)(w + i * ldw);
        for (int q = 0; q < NN / 4; q++) REG(B_W + 4 * (i * (NN / 4) + q)) = row[q];
    }
}
static inline void npu_set_bias(const int32_t *b) {
    for (int j = 0; j < NN; j++) REG(R_BIAS + 4 * j) = (uint32_t)b[j];
}
static inline void npu_set_quant(int mult, int shift, int act) {
    REG(R_QMULT) = (uint32_t)mult; REG(R_QSHIFT) = (uint32_t)shift; REG(R_ACT) = (uint32_t)act;
}
static inline void npu_write_a(int row, int sub, uint32_t word) { REG(B_A + 4 * (row * (NN / 4) + sub)) = word; }
static inline uint32_t npu_run(int m, uint32_t flags) {
    REG(R_M) = (uint32_t)m;
    REG(R_CTRL) = F_START | flags;
    while (!(REG(R_STATUS) & 2)) ;
    uint32_t cyc = REG(R_CYCLES);
    REG(R_CTRL) = F_CLEAR;
    return cyc;
}
static inline int32_t npu_read_c(int row, int j) { return (int32_t)REG(B_C + 4 * (row * NN + j)); }
static inline uint32_t npu_read_q_word(int row, int sub) { return REG(B_Q + 4 * (row * (NN / 4) + sub)); }

// golden requant + activation, bit-exact with the RTL
static inline int8_t requant_ref(int32_t acc, int32_t bias, int mult, int shift, int act) {
    int64_t p = (int64_t)(acc + bias) * (int64_t)mult + (shift ? ((int64_t)1 << (shift - 1)) : 0);
    int64_t y = p >> shift;
    if (y > 127) y = 127;
    if (y < -128) y = -128;
    int8_t b = (int8_t)y;
    switch (act) {
        case ACT_RELU: return b < 0 ? 0 : b;
        case ACT_SIG:  return LUT_SIG[(uint8_t)b];
        case ACT_TANH: return LUT_TANH[(uint8_t)b];
        default:       return b;
    }
}
#endif
