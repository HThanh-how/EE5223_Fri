    .section .text.start
    .globl _start
_start:
    li   sp, 0x00040000
    call main
    li   t0, 0x10000004
    sw   a0, 0(t0)
1:  j    1b
