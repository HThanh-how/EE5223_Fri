/* Nios V on DE10-Nano: everything in the 256 KiB on-chip RAM at 0x0 (reset vector 0x0). */
OUTPUT_ARCH(riscv)
ENTRY(_start)
/* 256 KiB RAM split into a load image (code, constants, initial .data) and a
   read/write area (.data at run time, .bss, stack). */
MEMORY {
    img (rx)  : ORIGIN = 0x00000000, LENGTH = 112K
    ram (rwx) : ORIGIN = 0x0001C000, LENGTH = 144K
}
__stack_size = 16K;
SECTIONS {
    .text : {
        KEEP(*(.text.start))
        *(.text .text.*)
    } > img
    .rodata : ALIGN(4) { *(.rodata .rodata.* .srodata .srodata.*) } > img
    /* .data runs in RAM but its pristine copy (load image) is kept after .rodata;
       crt0 copies it on every reset */
    .data : ALIGN(4) {
        __data_start = .;
        *(.data .data.*)
        __global_pointer$ = . + 0x800;
        *(.sdata .sdata.*)
        . = ALIGN(4);
        __data_end = .;
    } > ram AT > img
    __data_load = LOADADDR(.data);
    .bss (NOLOAD) : ALIGN(4) {
        __bss_start = .;
        *(.sbss .sbss.* .bss .bss.* COMMON)
        . = ALIGN(4);
        __bss_end = .;
    } > ram
    __stack_top = ORIGIN(ram) + LENGTH(ram);
    ASSERT(__bss_end + __stack_size <= __stack_top, "bss + 16 KiB stack does not fit in the 144 KiB r/w area")
    /DISCARD/ : { *(.comment) *(.riscv.attributes) *(.note*) }
}
