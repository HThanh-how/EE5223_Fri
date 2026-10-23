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

// Trap handler: only for UNEXPECTED traps (the firmware itself executes no counter CSRs,
// see the rdcycle macro in platform.h). Reads only mcause/mepc (mandatory M-mode CSRs),
// lights LED5 and reports on the JTAG UART.
void trap_handler(uint32_t *f) {
    uint32_t mcause, mepc;
    (void)f;
    __asm__ volatile("csrr %0, mcause" : "=r"(mcause));
    __asm__ volatile("csrr %0, mepc"   : "=r"(mepc));
    MMIO32(LED_BASE) = LED_DONE | LED_FAIL | LED_TRAP;
    puts_("\n[niosv] TRAP mcause=0x"); puthex(mcause);
    puts_(" mepc=0x"); puthex(mepc); puts_("\n");
    for (;;) ;
}

// freestanding helpers in case the compiler emits calls to them
void *memset(void *d, int c, size_t n) {
    volatile uint8_t *p = d; while (n--) *p++ = (uint8_t)c; return d;
}
void *memcpy(void *d, const void *s, size_t n) {
    volatile uint8_t *p = d; const uint8_t *q = s; while (n--) *p++ = *q++; return d;
}
