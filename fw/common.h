#ifndef COMMON_H
#define COMMON_H
#include <stdint.h>

static inline void putc_(char c) { *(volatile uint32_t *)0x10000000 = (uint32_t)c; }
static inline void puts_(const char *s) { while (*s) putc_(*s++); }
static inline void putu(uint32_t v) {
    char b[11]; int i = 0;
    if (!v) { putc_('0'); return; }
    while (v) { b[i++] = '0' + v % 10; v /= 10; }
    while (i) putc_(b[--i]);
}
static inline void putd(int32_t v) {
    if (v < 0) { putc_('-'); putu((uint32_t)(-(int64_t)v)); } else putu((uint32_t)v);
}
static inline uint32_t rdcycle(void) { uint32_t c; __asm__ volatile("rdcycle %0" : "=r"(c)); return c; }

static uint32_t rng_state = 1;
static inline uint32_t rng(void) { rng_state = rng_state * 1664525u + 1013904223u; return rng_state >> 8; }
static inline int8_t rnd8(void) { return (int8_t)(rng() & 0xFF); }
#endif
