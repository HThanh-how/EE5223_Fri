# Licence-free fallback system (system_pico.qsys): PicoRV32 + 256 KiB on-chip RAM + JTAG UART
# + LED PIO + NPU, with the SAME memory map as the Nios V system (see create_system.tcl):
#   0x0000_0000 ram 256 KiB   0x2000_0000 npu   0x2002_0000 cycle counter (inside cpu wrapper)
#   0x2002_0040 jtag_uart     0x2002_0050 led_pio
# Run from de10/: qsys-script --search-path="ip,$" --script=scripts/create_system_pico.tcl
package require -exact qsys 24.1

# qsys-script (Jacl) does not see shell environment variables; build.sh passes the knobs
# as Tcl variables with --cmd="set NIOSV_CORE ...; set NPU_N ...; ..."
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

create_system system_pico
set_project_property DEVICE_FAMILY "Cyclone V"
set_project_property DEVICE 5CSEBA6U23I7

add_instance clk_0 clock_source
set_instance_parameter_value clk_0 clockFrequency 50000000.0
set_instance_parameter_value clk_0 clockFrequencyKnown true
set_instance_parameter_value clk_0 resetSynchronousEdges DEASSERT

add_instance cpu picorv32_avmm

add_instance ram altera_avalon_onchip_memory2
set_instance_parameter_value ram dataWidth 32
set_instance_parameter_value ram memorySize 262144.0
set_instance_parameter_value ram singleClockOperation true
set_instance_parameter_value ram initMemContent true
set_instance_parameter_value ram useNonDefaultInitFile true
set_instance_parameter_value ram initializationFileName $FW_HEX
set_instance_parameter_value ram blockType AUTO

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

foreach {inst clk rst} {cpu clock reset ram clk1 reset1 jtag_uart clk reset led_pio clk reset npu clock reset} {
    add_connection clk_0.clk $inst.$clk
    add_connection clk_0.clk_reset $inst.$rst
}
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
set_interface_property trap  EXPORT_OF cpu.trap

save_system system_pico.qsys
puts "create_system_pico: N=$NPU_N DEPTH=$NPU_D init=$FW_HEX"
