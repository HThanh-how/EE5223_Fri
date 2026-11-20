// Hàm hỗ trợ firmware mô phỏng: UART giả lập, số thập phân, cycle và RNG xác định.
// DE10 thay giao diện này bằng platform.h; kiểm tra: make soc N=8 FW=selftest.
// N là kích thước mảng, FW chọn chương trình kiểm thử.
#ifndef COMMON_H
#define COMMON_H
#include <stdint.h>

// 0x10000000 là cổng putchar giả lập trong soc_top, không phải RAM hay UART board.
// Ghi volatile uint32_t để một ký tự thật sự thành một bus write; chỉ byte thấp in ra.
// puts_ không thêm newline tự động, chuỗi log phải chứa \n nếu cần xuống dòng.
static inline void putc_(char c) { *(volatile uint32_t *)0x10000000 = (uint32_t)c; }
static inline void puts_(const char *s) { while (*s) putc_(*s++); }
// UINT32_MAX có 10 chữ số; buffer 11 đủ lưu các chữ số đảo mà không cần malloc.
// Tách chữ số thấp trước rồi in ngược; nhánh v=0 tránh chuỗi rỗng.
static inline void putu(uint32_t v) {
    char b[11]; int i = 0;
    if (!v) { putc_('0'); return; }
    while (v) { b[i++] = '0' + v % 10; v /= 10; }
    while (i) putc_(b[--i]);
}
// Đổi sang int64_t trước khi đổi dấu để cả INT32_MIN cũng không tràn signed 32 bit.
// rdcycle trả clock CPU 32 bit thấp; chênh lệch unsigned dùng cho profile ngắn.
static inline void putd(int32_t v) {
    if (v < 0) { putc_('-'); putu((uint32_t)(-(int64_t)v)); } else putu((uint32_t)v);
}
static inline uint32_t rdcycle(void) { uint32_t c; __asm__ volatile("rdcycle %0" : "=r"(c)); return c; }

// LCG xác định giúp tái lập các ca selftest; rnd8 lấy byte thấp của kết quả rng.
// LCG chạy trên uint32_t nên wrap modulo 2^32 là có chủ đích, seed ban đầu là 1.
// rng() bỏ 8 bit thấp rồi rnd8 lấy 8 bit kế; không dùng làm RNG bảo mật.
static uint32_t rng_state = 1;
static inline uint32_t rng(void) { rng_state = rng_state * 1664525u + 1013904223u; return rng_state >> 8; }
static inline int8_t rnd8(void) { return (int8_t)(rng() & 0xFF); }
#endif
