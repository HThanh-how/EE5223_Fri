// GEMM INT8 chia tile cho NPU và bản CPU tham chiếu; dùng driver npu.h.
// Kp/Cp và stride phải được padding, căn hàng theo word và phù hợp NN.
// Kiểm tra: make soc N=8 FW=cnn (N chọn kích thước, FW chọn mạng CNN).
// Tiled INT8 matmul + requant on the NPU (and a CPU-only twin used as baseline).
#ifndef NN_H
#define NN_H
#include "npu.h"

// Counters cộng dồn giữa các lần gọi; main chủ động xóa trước vùng cần profile.
// npu_calls là số K-chunk chạy, không phải số layer hoặc số ảnh.
// cyc_ đọc 32 bit thấp; hiệu unsigned xử lý một vòng wrap nếu khoảng đo <2^32.
static uint32_t npu_calls, npu_busy_cycles;
// host-side phase profile of npu_matmul (cycles): weight tile writes, activation writes, NPU run+poll, result reads
static uint32_t ph_w, ph_a, ph_run, ph_rd;
static inline uint32_t cyc_(void) { uint32_t c; __asm__ volatile("rdcycle %0" : "=r"(c)); return c; }

// act_tab[c0 / NN] = activation used for the output column chunk starting at c0.
// X[M][ldx] int8 (ldx % 4 == 0, X 4-byte aligned), W[Kp][Cp] int8, bias[Cp], Y[M][ldy] int8.
// Chia M thành tối đa DEPTH hàng, C thành NN cột và K thành các đoạn NN.
// Chunk K đầu ghi đè CBUF, các chunk sau cộng; chỉ chunk cuối thêm bias và quant.
// Trọng số, input và output được truyền theo word 4 byte; vùng padding phải bằng 0.
// Các bộ đếm phase đo overhead host, còn npu_busy_cycles đo riêng thời gian NPU.
static void npu_matmul(const int8_t *X, int ldx, int M, int Kp, const int8_t *W, int Cp,
                       const int32_t *bias, int mult, int shift, const uint8_t *act_tab,
                       int8_t *Y, int ldy) {
    // Y[M,Cp] = X[M,Kp] * W[Kp,Cp], sau đó bias/requant/activation theo cột.
    // Kp và Cp phải là bội NN; X/W vùng K đệm bằng 0 để dot product không đổi.
    // Cột C..Cp-1 của W và bias cũng zero; với sigmoid, output đệm có thể khác 0.
    // ldx/ldy là stride byte, đều căn 4; mỗi con trỏ tile cũng phải căn 4.
    // act_tab có 32 entry, nên số tile cột Cp/NN không được vượt 32.
    // M không cần chia hết DEPTH: mc=min(M-m0,DEPTH) xử lý tile hàng cuối.
    for (int m0 = 0; m0 < M; m0 += NPU_DEPTH) {
        int mc = M - m0 < NPU_DEPTH ? M - m0 : NPU_DEPTH;
        // Mỗi (m0,c0) sở hữu một vùng output mc*NN và tái dùng CBUF row 0..mc-1.
        // Vòng K bên trong phải chạy hết trước khi đổi tile cột hay đọc QBUF.
        for (int c0 = 0; c0 < Cp; c0 += NN) {
            for (int k0 = 0; k0 < Kp; k0 += NN) {
                uint32_t t0 = cyc_();
                // W lưu row-major [Kp][Cp]; điểm bắt đầu (k0,c0) giữ stride Cp khi nạp NN row.
                // Một tile W dùng cho toàn bộ mc hàng, giảm chi phí nạp weight trên mỗi hàng.
                npu_load_w(&W[k0 * Cp + c0], Cp);
                uint32_t t1 = cyc_();
                // Chỉ nạp lát X[(m0+r),k0:k0+NN]; ABUF không giữ toàn bộ chiều Kp.
                // Ép src sang uint32_t để gửi bốn activation một giao dịch Avalon.
                for (int r = 0; r < mc; r++) {
                    const uint32_t *src = (const uint32_t *)(X + (m0 + r) * ldx + k0);
                    for (int s = 0; s < NN / 4; s++) npu_write_a(r, s, src[s]);
                }
                uint32_t t2 = cyc_();
                // k0=0 phải overwrite kể cả CBUF đang chứa tile cột/hàng trước.
                // Các chunk sau cộng tổng chưa quant; quant sớm sẽ mất độ chính xác và sai scale.
                uint32_t flags = k0 ? F_ACCUM : 0;
                // Chỉ sau tích cuối mới biết tổng K đầy đủ để thêm bias một lần và đổi scale.
                // Một ACT áp dụng cho NN cột; ranh giới sigmoid/tanh phải trùng biên tile.
                // Ví dụ LSTM H=16: NN=4/8/16 chia hết H nên tile không trộn hai loại gate.
                if (k0 + NN >= Kp) {
                    npu_set_bias(&bias[c0]);
                    npu_set_quant(mult, shift, act_tab[c0 / NN]);
                    flags |= F_QUANT;
                }
                npu_busy_cycles += npu_run(mc, flags);
                npu_calls++;
                uint32_t t3 = cyc_();
                // ph_run gồm cấu hình quant/bias cuối chunk, ghi START, poll và CLEAR.
                // Nó lớn hơn busy_cycles vì còn lệnh CPU và chi phí giao dịch bus.
                ph_w += t1 - t0; ph_a += t2 - t1; ph_run += t3 - t2;
            }
            // QBUF đã chứa đủ mc hàng của chunk cuối; đọc mọi cột kể cả phần padding.
            // Store uint32_t giữ nguyên thứ tự bốn byte, ldy đưa đến đúng row đích.
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
// Tính K và C thực, bỏ qua phần padding; requant_ref phải khớp phép tính RTL.
static void cpu_matmul(const int8_t *X, int ldx, int M, int K, const int8_t *W, int Cp, int C,
                       const int32_t *bias, int mult, int shift, const uint8_t *act_tab, int NNC,
                       int8_t *Y, int ldy) {
    // CPU tính K,C thực để tránh công việc padding; Cp chỉ là stride W/output.
    // Cột >=C bị đặt 0 trực tiếp, không áp sigmoid cho cột đệm như đường NPU.
    // Chỉ so các cột thực khi activation có output khác 0 tại input 0.
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

// 32 entry đủ dùng cho các layer hiện có; caller không truyền act_tab ngắn hơn.
// Các cột trong cùng tile dùng chung act_tab[c/NN], khớp một R_ACT ở phần cứng.
static void fill_act(uint8_t *tab, int act) { for (int i = 0; i < 32; i++) tab[i] = (uint8_t)act; }
#endif
