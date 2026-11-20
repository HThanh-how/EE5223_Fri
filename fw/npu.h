// Driver MMIO cho npu_avmm trên PicoRV32 và Nios V, NPU_BASE là địa chỉ cửa sổ.
// NN phải khớp N phần cứng và chia hết cho 4; NPU_DEPTH giới hạn số hàng mỗi lần chạy.
// Kiểm tra: make soc N=8 FW=selftest (N chọn kích thước, FW chọn bài kiểm tra).
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

// Trình tự một tile khi NPU idle, offset tính theo byte từ NPU_BASE:
// 1. Nạp W[NN,NN] qua npu_load_w, mỗi word mang bốn cột kề nhau.
// 2. Nạp M hàng A qua npu_write_a, đủ NN/4 word cho từng hàng.
// 3. Nếu là chunk K cuối, đặt bias[NN], mult/shift và activation cho tile cột.
// 4. Gọi npu_run(M,flags): ghi M rồi START; chunk đầu bỏ F_ACCUM để xóa tổng cũ.
// 5. Chunk tiếp bật F_ACCUM; chỉ chunk cuối bật F_QUANT để bias không cộng nhiều lần.
// 6. npu_run poll done, đọc CYCLES rồi CLEAR; sau đó đọc INT32 C hoặc byte Q.
// Mọi lần chạy đồng bộ tại đây; không hỗ trợ nhiều request đang chờ hay interrupt.
// REG volatile buộc compiler thực hiện từng MMIO read/write, gồm vòng polling.
// Không ghi store byte: cổng phần cứng không có byteenable và chỉ nhận word 32 bit.
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

// R_STATUS bit0 busy, bit1 done, bit2 err; driver dùng mask 2 để đợi bit done.
// R_INFO[15:0]=N, [31:16]=DEPTH. NN/NPU_DEPTH phải khớp cấu hình phần cứng.
// B_W/B_A chỉ ghi, B_C/B_Q chỉ đọc; bias và cấu hình quant không có readback.
#define F_START 1u
#define F_CLEAR 2u
#define F_ACCUM 4u
#define F_QUANT 8u

#define ACT_NONE 0
#define ACT_RELU 1
#define ACT_SIG  2
#define ACT_TANH 3

// W tile: W[i][j] = w[i*ldw + j], NN x NN; w and ldw must be 4-byte aligned (4 weights per bus write)
// ldw là stride BYTE của ma trận gốc, không phải độ rộng NN của tile.
// Ép uint32_t* chỉ hợp lệ với địa chỉ căn 4 và ldw chia hết 4.
// Trên RISC-V little-endian, row[q] giữ byte 4*q ở [7:0], khớp sa_top.
// Hàm không poll busy; caller chỉ gọi sau npu_run trước đã hoàn tất.
static inline void npu_load_w(const int8_t *w, int ldw) {
    for (int i = 0; i < NN; i++) {
        const uint32_t *row = (const uint32_t *)(w + i * ldw);
        for (int q = 0; q < NN / 4; q++) REG(B_W + 4 * (i * (NN / 4) + q)) = row[q];
    }
}
// Một bias cho mỗi cột output, dùng chung mọi hàng M trong tile hiện tại.
// Bias ở scale accumulator s_input*s_weight, chưa ở scale INT8 output.
static inline void npu_set_bias(const int32_t *b) {
    for (int j = 0; j < NN; j++) REG(R_BIAS + 4 * j) = (uint32_t)b[j];
}
// mult phải vừa signed INT16, shift trong 0..31, act trong 0..3.
// RTL chỉ lấy các bit thấp; truyền số ngoài miền sẽ bị cắt, không có báo lỗi.
static inline void npu_set_quant(int mult, int shift, int act) {
    REG(R_QMULT) = (uint32_t)mult; REG(R_QSHIFT) = (uint32_t)shift; REG(R_ACT) = (uint32_t)act;
}
// row là chỉ số cục bộ 0..M-1 trong ABUF, sub là nhóm bốn phần tử 0..NN/4-1.
// Offset nhân 4 vì REG nhận byte address trong khi buffer decode theo word.
static inline void npu_write_a(int row, int sub, uint32_t word) { REG(B_A + 4 * (row * (NN / 4) + sub)) = word; }
// Sau khi nạp W/A và cấu hình bias/quant, ghi M và START, poll done rồi đọc C/Q.
// M phải trong 1..NPU_DEPTH: M sai chỉ đặt err, vòng poll done này sẽ không thoát.
// ACCUM giữ tổng K-chunk trước, QUANT chỉ cần bật ở chunk cuối; CLEAR xóa done/err.
static inline uint32_t npu_run(int m, uint32_t flags) {
    // Caller phải bảo đảm 1<=m<=NPU_DEPTH và không còn lượt đang busy.
    // Vòng này không timeout và không kiểm tra err: nó dành cho đầu vào đã hợp lệ.
    // START không kèm CLEAR vẫn xóa done/err khi lượt mới được chấp nhận.
    REG(R_M) = (uint32_t)m;
    REG(R_CTRL) = F_START | flags;
    while (!(REG(R_STATUS) & 2)) ;
    // Đọc cycles trước CLEAR để lấy số clock busy của đúng lượt vừa chạy.
    // CLEAR xóa cờ sticky, giữ nguyên buffer và cấu hình phục vụ chunk sau.
    uint32_t cyc = REG(R_CYCLES);
    REG(R_CTRL) = F_CLEAR;
    return cyc;
}
// CBUF mỗi phần tử một word; cast int32_t khôi phục dấu từ MMIO unsigned.
// QBUF mỗi word bốn output; caller tách byte bằng shift/cast hoặc store uint32_t.
// Chỉ đọc QBUF sau lượt F_QUANT; nếu không thì đó có thể là output lượt cũ.
static inline int32_t npu_read_c(int row, int j) { return (int32_t)REG(B_C + 4 * (row * NN + j)); }
static inline uint32_t npu_read_q_word(int row, int sub) { return REG(B_Q + 4 * (row * (NN / 4) + sub)); }

// golden requant + activation, bit-exact with the RTL
// Bias cùng đơn vị accumulator; multiplier signed 16 bit và shift 0..31 đổi scale.
// Cộng nửa LSB trước dịch rồi saturate INT8, sau đó mới ReLU hoặc tra LUT.
// Reference dựa trên phép dịch phải số có dấu của toolchain đích.
static inline int8_t requant_ref(int32_t acc, int32_t bias, int mult, int shift, int act) {
    // Cần giữ acc+bias trong miền INT32 của reference C trước khi cast int64_t.
    // int64_t chứa tích INT32*INT16 và rounding, tránh mất bit trước dịch phải.
    // shift=0 bỏ rounding; shift>0 cộng 2^(shift-1), tie hướng về phía dương.
    // Clamp trước activation; ví dụ số rất âm qua ReLU về 0 thay vì wrap dương.
    int64_t p = (int64_t)(acc + bias) * (int64_t)mult + (shift ? ((int64_t)1 << (shift - 1)) : 0);
    int64_t y = p >> shift;
    if (y > 127) y = 127;
    if (y < -128) y = -128;
    int8_t b = (int8_t)y;
    // LUT index là (uint8_t)b: b=-1 thành 255, không phải vị trí 127.
    // Bảng hiểu x=b/16 và trả output scale 1/128; ACT_NONE giữ scale requant.
    // Cùng bảng gen_lut.py giúp CPU reference và RTL so bit-exact.
    switch (act) {
        case ACT_RELU: return b < 0 ? 0 : b;
        case ACT_SIG:  return LUT_SIG[(uint8_t)b];
        case ACT_TANH: return LUT_TANH[(uint8_t)b];
        default:       return b;
    }
}
#endif
