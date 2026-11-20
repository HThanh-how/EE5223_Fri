# Tạo hệ PicoRV32 thay thế, giữ memory map tương thích firmware DE10.
# scripts/build_pico.sh truyền NPU_N, NPU_DEPTH và FW_HEX_PICO qua biến Tcl.
# Licence-free fallback system (system_pico.qsys): PicoRV32 + 256 KiB on-chip RAM + JTAG UART
# + LED PIO + NPU, with the SAME memory map as the Nios V system (see create_system.tcl):
#   0x0000_0000 ram 256 KiB   0x2000_0000 npu   0x2002_0000 cycle counter (inside cpu wrapper)
#   0x2002_0040 jtag_uart     0x2002_0050 led_pio
# Run from de10/: qsys-script --search-path="ip,$" --script=scripts/create_system_pico.tcl
package require -exact qsys 24.1

# qsys-script (Jacl) does not see shell environment variables; build.sh passes the knobs
# as Tcl variables with --cmd="set NIOSV_CORE ...; set NPU_N ...; ..."
# Từ de10: qsys-script --search-path="ip,$" --cmd="set NPU_N 8"   --script=scripts/create_system_pico.tcl
# FW_HEX_PICO đổi tên ảnh RAM bằng biến Tcl, mặc định onchip_init_pico.hex.
# Hàm envor đọc biến Tcl global, không lấy trực tiếp biến shell environment.
proc envor {name def} {
    upvar #0 $name v
    if {[info exists v]} {
        if {[string length $v] > 0} { return $v }
    }
    return $def
}
set NPU_N  [envor NPU_N 8]
set NPU_D  [envor NPU_DEPTH 64]
set FW_HEX [envor FW_HEX_PICO onchip_init_pico.hex]

# Hệ riêng system_pico tránh ghi đè system.qsys dùng cho Nios V.
# Target cùng Cyclone V và clock 50 MHz, giữ vị trí MMIO tương thích platform DE10.
create_system system_pico
set_project_property DEVICE_FAMILY "Cyclone V"
set_project_property DEVICE 5CSEBA6U23I7

add_instance clk_0 clock_source
set_instance_parameter_value clk_0 clockFrequency 50000000.0
set_instance_parameter_value clk_0 clockFrequencyKnown true
set_instance_parameter_value clk_0 resetSynchronousEdges DEASSERT

# PicoRV32 gộp instruction/data vào master m0; không có hai manager như Nios V.
# Counter 0x20020000 nằm trong wrapper CPU, không nối thành một Qsys slave riêng.
add_instance cpu picorv32_avmm

# RAM 262144 byte, dataWidth 32; initializationFileName chọn ảnh hex firmware.
# Dữ liệu init được đưa vào FPGA build, không tự compile ELF ở bước Tcl này.
add_instance ram altera_avalon_onchip_memory2
set_instance_parameter_value ram dataWidth 32
set_instance_parameter_value ram memorySize 262144.0
set_instance_parameter_value ram singleClockOperation true
set_instance_parameter_value ram initMemContent true
set_instance_parameter_value ram useNonDefaultInitFile true
set_instance_parameter_value ram initializationFileName $FW_HEX
set_instance_parameter_value ram blockType AUTO

# Giữ UART base 0x20020040 và LED base 0x20020050 như flow Nios V.
# Firmware dùng platform.h DE10 thay vì putchar giả lập tại 0x10000000.
add_instance jtag_uart altera_avalon_jtag_uart
set_instance_parameter_value jtag_uart writeBufferDepth 1024
set_instance_parameter_value jtag_uart readBufferDepth 64
set_instance_parameter_value jtag_uart writeIRQThreshold 8
set_instance_parameter_value jtag_uart readIRQThreshold 8

add_instance led_pio altera_avalon_pio
set_instance_parameter_value led_pio width 8
set_instance_parameter_value led_pio direction Output
set_instance_parameter_value led_pio resetValue 0.0

add_instance npu npu_avmm
set_instance_parameter_value npu N $NPU_N
set_instance_parameter_value npu DEPTH $NPU_D

# Tất cả IP cùng clock/reset; bảng tên cổng dùng clock của CPU wrapper và NPU.
# Nhả reset đồng bộ do clock_source cấu hình DEASSERT phía trên.
foreach {inst clk rst} {cpu clock reset ram clk1 reset1 jtag_uart clk reset led_pio clk reset npu clock reset} {
    add_connection clk_0.clk $inst.$clk
    add_connection clk_0.clk_reset $inst.$rst
}
# Master address theo byte, interconnect đổi sang đơn vị WORDS của NPU slave.
# Map chỉ RAM/NPU/UART/PIO; không tạo debug module hay timer của Nios V.
# Kích thước cửa sổ lấy từ component slave, baseAddress lấy từ các lệnh amap.
proc amap {m s base} {
    add_connection $m $s
    set_connection_parameter_value $m/$s baseAddress $base
}
amap cpu.m0 ram.s1                       0x00000000
amap cpu.m0 npu.avs                      0x20000000
amap cpu.m0 jtag_uart.avalon_jtag_slave  0x20020040
amap cpu.m0 led_pio.s1                   0x20020050

set_interface_property clk   EXPORT_OF clk_0.clk_in
set_interface_property reset EXPORT_OF clk_0.clk_in_reset
set_interface_property led   EXPORT_OF led_pio.external_connection
# Export cpu_trap ra top-level để báo CPU fault; không là cổng interrupt NPU.
set_interface_property trap  EXPORT_OF cpu.trap

# Chỉ tạo .qsys; chạy generate_ip.sh pico hoặc build_pico.sh để sinh system_pico/.
# puts cuối script in N/DEPTH/FW init làm dấu xác nhận cấu hình trong log.
save_system system_pico.qsys
puts "create_system_pico: N=$NPU_N DEPTH=$NPU_D init=$FW_HEX"
