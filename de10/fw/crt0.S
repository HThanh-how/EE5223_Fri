// Bare-metal start-up for Nios V on the DE10-Nano system (no HAL).
//  - sp = top of the 256 KiB on-chip RAM, gp = __global_pointer$
//  - mtvec -> trap_entry (emulates rdcycle/rdtime/rdinstret if the core traps on them)
//  - .data is copied from its load image every reset (so KEY0 re-runs the program
//    with pristine initialised data), .bss is cleared
//  - main() return value -> "[niosv] exit code N" on the JTAG UART + LED PIO pass/fail
    .section .text.start, "ax"
    .globl _start
_start:
    .option push
    .option norelax
    la   gp, __global_pointer$
    .option pop
    la   sp, __stack_top
#ifndef PICORV_SIM
    la   t0, trap_entry
    csrw mtvec, t0
#endif

    la   a0, __data_load
    la   a1, __data_start
    la   a2, __data_end
1:  bgeu a1, a2, 2f
    lw   t0, 0(a0)
    sw   t0, 0(a1)
    addi a0, a0, 4
    addi a1, a1, 4
    j    1b
2:  la   a1, __bss_start
    la   a2, __bss_end
3:  bgeu a1, a2, 4f
    sw   zero, 0(a1)
    addi a1, a1, 4
    j    3b
4:  call platform_init
    call main
    call platform_exit           // does not return

// ---------------- trap entry: save x1..x31 in a 32-word frame ----------------
    .text
    .align 2
    .globl trap_entry
trap_entry:
    addi sp, sp, -128
    sw   x1,   4(sp)
    sw   x3,  12(sp)
    sw   x4,  16(sp)
    sw   x5,  20(sp)
    sw   x6,  24(sp)
    sw   x7,  28(sp)
    sw   x8,  32(sp)
    sw   x9,  36(sp)
    sw   x10, 40(sp)
    sw   x11, 44(sp)
    sw   x12, 48(sp)
    sw   x13, 52(sp)
    sw   x14, 56(sp)
    sw   x15, 60(sp)
    sw   x16, 64(sp)
    sw   x17, 68(sp)
    sw   x18, 72(sp)
    sw   x19, 76(sp)
    sw   x20, 80(sp)
    sw   x21, 84(sp)
    sw   x22, 88(sp)
    sw   x23, 92(sp)
    sw   x24, 96(sp)
    sw   x25, 100(sp)
    sw   x26, 104(sp)
    sw   x27, 108(sp)
    sw   x28, 112(sp)
    sw   x29, 116(sp)
    sw   x30, 120(sp)
    sw   x31, 124(sp)
    addi t0, sp, 128
    sw   t0,   8(sp)             // original sp in frame[2]
    sw   zero, 0(sp)
    mv   a0, sp
    call trap_handler            // may modify frame[] and mepc
    lw   x1,   4(sp)
    lw   x3,  12(sp)
    lw   x4,  16(sp)
    lw   x5,  20(sp)
    lw   x6,  24(sp)
    lw   x7,  28(sp)
    lw   x8,  32(sp)
    lw   x9,  36(sp)
    lw   x10, 40(sp)
    lw   x11, 44(sp)
    lw   x12, 48(sp)
    lw   x13, 52(sp)
    lw   x14, 56(sp)
    lw   x15, 60(sp)
    lw   x16, 64(sp)
    lw   x17, 68(sp)
    lw   x18, 72(sp)
    lw   x19, 76(sp)
    lw   x20, 80(sp)
    lw   x21, 84(sp)
    lw   x22, 88(sp)
    lw   x23, 92(sp)
    lw   x24, 96(sp)
    lw   x25, 100(sp)
    lw   x26, 104(sp)
    lw   x27, 108(sp)
    lw   x28, 112(sp)
    lw   x29, 116(sp)
    lw   x30, 120(sp)
    lw   x31, 124(sp)
    addi sp, sp, 128
    mret
