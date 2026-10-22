// Nios V platform support linked into every program (selftest / cnn / lstm).
#include <stdint.h>
#include <stddef.h>
// platform.h is force-included by the Makefile

void platform_init(void) {
    MMIO32(LED_BASE) = LED_RUN;
}

void __attribute__((noreturn)) platform_exit(int code) {
    puts_("[niosv] exit code "); putd(code); puts_("\n");
    MMIO32(LED_BASE) = LED_DONE | (code == 0 ? LED_PASS : LED_FAIL);
    for (;;) ;
}

// Trap handler. f[] holds x0..x31 of the interrupted code (f[2] = sp before the trap).
// The shared driver (proj/fw/nn.h) reads the cycle counter with the `rdcycle`
// instruction. If the core does not implement the unprivileged counter CSRs it
// raises an illegal-instruction exception; we then emulate csrr rd, {cycle,time,
// instret}[h] with the memory-mapped mtime (1 tick per clk) and skip the instruction.
void trap_handler(uint32_t *f) {
    uint32_t mcause, mepc, mtval;
    __asm__ volatile("csrr %0, mcause" : "=r"(mcause));
    __asm__ volatile("csrr %0, mepc"   : "=r"(mepc));
    __asm__ volatile("csrr %0, mtval"  : "=r"(mtval));
    if (mcause == 2) {
        uint32_t insn = *(volatile uint32_t *)mepc;
        uint32_t csr = insn >> 20, f3 = (insn >> 12) & 7, rs1 = (insn >> 15) & 31, rd = (insn >> 7) & 31;
        if ((insn & 0x7f) == 0x73 && rs1 == 0 && (f3 == 2 || f3 == 3 || f3 == 6 || f3 == 7) &&
            (csr == 0xC00 || csr == 0xC01 || csr == 0xC02 || csr == 0xC80 || csr == 0xC81 || csr == 0xC82)) {
            uint32_t v = (csr & 0x080) ? MMIO32(MTIME_BASE + 4) : MMIO32(MTIME_BASE);
            if (rd) f[rd] = v;
            mepc += 4;
            __asm__ volatile("csrw mepc, %0" :: "r"(mepc));
            return;
        }
    }
    MMIO32(LED_BASE) = LED_DONE | LED_FAIL | LED_TRAP;
    puts_("\n[niosv] TRAP mcause=0x"); puthex(mcause);
    puts_(" mepc=0x"); puthex(mepc); puts_(" mtval=0x"); puthex(mtval); puts_("\n");
    for (;;) ;
}

// freestanding helpers in case the compiler emits calls to them
void *memset(void *d, int c, size_t n) {
    volatile uint8_t *p = d; while (n--) *p++ = (uint8_t)c; return d;
}
void *memcpy(void *d, const void *s, size_t n) {
    volatile uint8_t *p = d; const uint8_t *q = s; while (n--) *p++ = *q++; return d;
}
