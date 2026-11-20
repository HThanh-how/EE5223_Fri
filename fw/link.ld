/* Link firmware mô phỏng vào RAM từ 0 đến 256 KiB, bắt đầu tại _start trong .text.start. */
/* Stack do start.S đặt ở cuối RAM; ảnh được soc_top nạp và RAM còn lại được xóa. */
/* Kiểm tra: make soc N=8 FW=selftest (N chọn mảng, FW chọn firmware). */
OUTPUT_ARCH(riscv)
ENTRY(_start)
/* Memory map linker chỉ gồm RAM 0x00000000..0x0003FFFF; MMIO không chiếm section. */
/* 0x10000000/04 là putchar/exit và 0x20000000 là NPU, dùng địa chỉ trong C. */
/* Ảnh ELF và binary không có vùng ROM riêng; .data đã nằm đúng địa chỉ chạy. */
MEMORY { ram (rwx) : ORIGIN = 0x00000000, LENGTH = 256K }
SECTIONS {
/* Giữ startup trước các hàm khác để lệnh đầu fw.hex đúng là _start. */
/* .rodata/srodata chứa weights, LUT, ảnh và golden chỉ đọc trong chương trình. */
    .text   : { *(.text.start) *(.text*) } > ram
    .rodata : { *(.rodata*) *(.srodata*) } > ram
/* Gom cả .sdata/.sbss do compiler có thể chọn small-data section cho global. */
/* .bss không cần byte trong binary; zero-fill RAM của testbench cung cấp giá trị 0. */
/* Không có symbol heap/stack hay guard; start.S đặt sp cố định ở 0x40000. */
    .data   : { *(.data*) *(.sdata*) } > ram
    .bss    : { *(.bss*) *(.sbss*) *(COMMON) } > ram
}
