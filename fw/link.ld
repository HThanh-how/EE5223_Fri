OUTPUT_ARCH(riscv)
ENTRY(_start)
MEMORY { ram (rwx) : ORIGIN = 0x00000000, LENGTH = 256K }
SECTIONS {
    .text   : { *(.text.start) *(.text*) } > ram
    .rodata : { *(.rodata*) *(.srodata*) } > ram
    .data   : { *(.data*) *(.sdata*) } > ram
    .bss    : { *(.bss*) *(.sbss*) *(COMMON) } > ram
}
