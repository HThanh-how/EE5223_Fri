/* Điểm vào mô phỏng: stack ở cuối RAM 256 KiB, gọi main rồi ghi mã trả về ra cổng exit. */
/* RAM được testbench khởi tạo từ ảnh hex và zero-fill; không có runtime khởi tạo .data/.bss. */
/* Kiểm tra: make soc N=8 FW=selftest (N chọn mảng, FW chọn firmware). */
/* Linker đặt .text.start đầu .text tại 0x0, trùng PROGADDR_RESET của PicoRV32. */
/* Không có CRT/libc: không copy .data, không loop xóa .bss, không cấu hình interrupt. */
/* Điều kiện mô phỏng: soc_top zero-fill RAM rồi nạp fw.hex trước khi thả reset. */
    .section .text.start
    .globl _start
_start:
/* 0x40000 là địa chỉ ngay SAU RAM 256 KiB; stack RISC-V tăng xuống vùng RAM. */
/* Đỉnh stack căn 16 byte theo ABI; linker chưa dành một vùng stack riêng. */
/* Kích thước .text/.data/.bss cộng stack thực dùng phải vừa RAM để tránh đè dữ liệu. */
    li   sp, 0x00040000
/* call thiết lập return address; main trả mã trạng thái trong a0 theo ABI ilp32. */
    call main
/* Ghi a0 tới exit MMIO khiến soc_top in exit code rồi $finish. */
/* Nếu chạy ngoài testbench và write không dừng hệ, vòng 1b giữ CPU tại đây. */
    li   t0, 0x10000004
    sw   a0, 0(t0)
1:  j    1b
