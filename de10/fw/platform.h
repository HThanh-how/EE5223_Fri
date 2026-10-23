// DE10-Nano / Nios V platform layer. It is force-included (gcc -include platform.h) before
// every source, so it replaces proj/fw/common.h without editing it: it defines the same
// include guard (COMMON_H) and the same API (putc_/puts_/putu/putd/rdcycle/rng/rnd8).
//   putc_   -> JTAG UART data register (blocking while the host drains the FIFO; if no
//              host drains it for ~1 s the character is dropped so the program still finishes)
//   rdcycle -> low word of the mtime counter at 0x2002_0000 (increments once per clk = CPU cycle);
//              the `rdcycle` mnemonic itself is redefined as an assembler macro (see below)
#if !defined(COMMON_H) && !defined(__ASSEMBLER__)
#define COMMON_H
#include <stdint.h>

// ---- memory map (must match de10/scripts/create_system.tcl) ----
#define RAM_BASE     0x00000000u
#define RAM_SIZE     0x00040000u
#ifndef NPU_BASE
#define NPU_BASE     0x20000000u
#endif
#define DM_BASE      0x20010000u
#define MTIME_BASE   0x20020000u   // +0 mtime lo, +4 mtime hi, +8 mtimecmp lo, +C mtimecmp hi
#define JUART_BASE   0x20020040u   // +0 data, +4 control (WSPACE = bits 31:16)
#define LED_BASE     0x20020050u   // altera_avalon_pio data register

#define MMIO32(a) (*(volatile uint32_t *)(a))

// LED PIO bits (LED[0] is a hardware heartbeat; LED[7:1] = PIO[7:1])
#define LED_RUN  0x02u
#define LED_DONE 0x04u
#define LED_PASS 0x08u
#define LED_FAIL 0x10u
#define LED_TRAP 0x20u

static inline void putc_(char c) {
    static uint32_t juart_dead;              // set once the host stopped draining the FIFO
    uint32_t spins = 0;
    while ((MMIO32(JUART_BASE + 4) >> 16) == 0) {
        if (juart_dead || ++spins > 5000000u) { juart_dead = 1; return; }
    }
    juart_dead = 0;
    MMIO32(JUART_BASE) = (uint32_t)(uint8_t)c;
}
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
static inline void puthex(uint32_t v) {
    for (int i = 7; i >= 0; i--) putc_("0123456789abcdef"[(v >> (4 * i)) & 15]);
}
static inline uint32_t rdcycle(void) { return MMIO32(MTIME_BASE); }

// proj/fw/nn.h reads the counter with the inline-asm instruction `rdcycle` (CSR 0xC00), which a
// Nios V core may not implement (illegal-instruction trap). This GNU-as macro overrides the
// mnemonic in every C file of the firmware, so `rdcycle rd` assembles to a load of mtime-low
// (lui rd,0x20020 ; lw rd,0(rd)). Result: the firmware executes NO counter CSR instruction at all.
__asm__(".ifndef PLATFORM_RDCYCLE_MACRO\n"
        ".set PLATFORM_RDCYCLE_MACRO, 1\n"
        ".macro rdcycle rd\n"
        "  lui \\rd, 0x20020\n"
        "  lw  \\rd, 0(\\rd)\n"
        ".endm\n"
        ".endif\n");

// identical to proj/fw/common.h so the self-test draws the same random cases
static uint32_t rng_state = 1;
static inline uint32_t rng(void) { rng_state = rng_state * 1664525u + 1013904223u; return rng_state >> 8; }
static inline int8_t rnd8(void) { return (int8_t)(rng() & 0xFF); }
#endif
