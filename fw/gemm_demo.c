// Demo GEMM INT8: nạp weight/activation, so sánh accumulator CPU và NPU.
// In INFO, cycle CPU, tổng cycle NPU, compute cycle, số sai khác và RESULT.
// Chạy: make soc N=8 FW=gemm_demo (N là kích thước mảng, FW chọn demo).
// Firmware: CPU-only INT8 GEMM vs. NPU (systolic array over Avalon-MM), with cycle counts.
// Same driver works on Nios V: only NPU_BASE changes.
#include <stdint.h>

#ifndef NN
#define NN 4
#endif
#ifndef NPU_BASE
#define NPU_BASE 0x20000000u
#endif
#define MAXM 64

// Demo dùng driver tối giản ngay trong file để tách riêng phép GEMM chưa quant.
// REG volatile tạo MMIO 32 bit; offset byte phải khớp npu_avmm và NPU_BASE.
// CTRL=1 là START overwrite, CTRL=2 là CLEAR, STATUS&2 là done sticky.
#define REG(o)   (*(volatile uint32_t *)(NPU_BASE + (o)))
#define R_CTRL   0x0000
#define R_STATUS 0x0004
#define R_M      0x0008
#define R_CYCLES 0x000C
#define R_INFO   0x0010
#define B_W      0x4000
#define B_A      0x8000
#define B_C      0xC000

// Cổng UART mô phỏng 0x10000000 in byte thấp; puts_ không tự thêm newline.
// rdcycle đo clock CPU, còn R_CYCLES chỉ đo busy của NPU nên hai metric khác nhau.
static void putc_(char c) { *(volatile uint32_t *)0x10000000 = (uint32_t)c; }
static void puts_(const char *s) { while (*s) putc_(*s++); }
static void putu(uint32_t v) {
    char b[11]; int i = 0;
    if (!v) { putc_('0'); return; }
    while (v) { b[i++] = '0' + v % 10; v /= 10; }
    while (i) putc_(b[--i]);
}
static inline uint32_t rdcycle(void) { uint32_t c; __asm__ volatile("rdcycle %0" : "=r"(c)); return c; }

static uint32_t seed = 1;
static int8_t rnd8(void) { seed = seed * 1664525u + 1013904223u; return (int8_t)(seed >> 24); }

static int8_t  A[MAXM][NN], W[NN][NN];
static int32_t Csw[MAXM][NN], Chw[MAXM][NN];

// Tạo hai ma trận xác định, tính GEMM CPU rồi nạp bốn byte mỗi word sang NPU.
// Thời gian npu_total gồm truyền và polling; npu_compute chỉ là busy cycles.
static int run(int M) {
    for (int i = 0; i < NN; i++) for (int j = 0; j < NN; j++) W[i][j] = rnd8();
    for (int m = 0; m < M; m++) for (int k = 0; k < NN; k++) A[m][k] = rnd8();
    // Chủ động đặt -128*-128 để kiểm tích 16384 cần 16 bit signed.
    // Golden Csw dùng cùng A/W và không có bias/quant nên so trực tiếp INT32 CBUF.
    A[0][0] = -128; W[0][0] = -128;   // corner case

    uint32_t t0 = rdcycle();
    for (int m = 0; m < M; m++)
        for (int j = 0; j < NN; j++) {
            int32_t acc = 0;
            for (int k = 0; k < NN; k++) acc += (int32_t)A[m][k] * (int32_t)W[k][j];
            Csw[m][j] = acc;
        }
    uint32_t t_sw = rdcycle() - t0;

    // Bắt đầu npu_total trước truyền W/A: bao gồm load, run/poll và đọc CBUF.
    // Mỗi word pack bốn weight theo cột; cast uint8_t giữ bit pattern số âm.
    t0 = rdcycle();
    for (int i = 0; i < NN; i++)
        for (int q = 0; q < NN / 4; q++) {
            uint32_t w = 0;
            for (int b = 0; b < 4; b++) w |= (uint32_t)(uint8_t)W[i][4 * q + b] << (8 * b);
            REG(B_W + 4 * (i * (NN / 4) + q)) = w;
        }
    for (int m = 0; m < M; m++)
        for (int s = 0; s < NN / 4; s++) {
            uint32_t w = 0;
            for (int b = 0; b < 4; b++) w |= (uint32_t)(uint8_t)A[m][4 * s + b] << (8 * b);
            REG(B_A + 4 * (m * (NN / 4) + s)) = w;
        }
    // M luôn <=64 qua các lời gọi main; vòng poll không xử lý err hay timeout.
    // Không bật ACCUM nên mỗi run độc lập, không phụ thuộc CBUF lần trước.
    REG(R_M) = M;
    REG(R_CTRL) = 1;
    while (!(REG(R_STATUS) & 2)) ;
    uint32_t t_cmp = REG(R_CYCLES);
    for (int m = 0; m < M; m++) for (int j = 0; j < NN; j++) Chw[m][j] = (int32_t)REG(B_C + 4 * (m * NN + j));
    uint32_t t_hw = rdcycle() - t0;
    // CLEAR sau khi đã đọc kết quả và kết thúc đo t_hw, chuẩn bị cờ cho run tiếp.
    // Không xóa nội dung CBUF nhưng START overwrite của run sau thay toàn bộ M hàng.
    REG(R_CTRL) = 2;

    int err = 0;
    for (int m = 0; m < M; m++) for (int j = 0; j < NN; j++) if (Csw[m][j] != Chw[m][j]) err++;

    // mismatches đếm từng phần tử trong M*NN, không chỉ so checksum hoặc dự đoán.
    // PASS từng M đi kèm ba metric: cpu_cycles, npu_total, npu_compute.
    puts_("M="); putu(M);
    puts_(" cpu_cycles="); putu(t_sw);
    puts_(" npu_total="); putu(t_hw);
    puts_(" npu_compute="); putu(t_cmp);
    puts_(" mismatches="); putu(err);
    puts_(err ? " FAIL\n" : " PASS\n");
    return err;
}

int main(void) {
    // INFO in N/DEPTH thật để thấy firmware NN có khớp RTL; không tự thay NN theo INFO.
    // Các M=1,8,32,64 cho thấy chi phí pipeline/transfer được chia trên batch khác nhau.
    // RESULT và exit code dựa trên tổng mismatch của cả bốn lần chạy.
    uint32_t info = REG(R_INFO);
    puts_("NPU N="); putu(info & 0xFFFF); puts_(" DEPTH="); putu(info >> 16); puts_("\n");
    int err = 0;
    err += run(1);
    err += run(8);
    err += run(32);
    err += run(64);
    puts_(err ? "RESULT: FAIL\n" : "RESULT: ALL PASS\n");
    return err != 0;
}
