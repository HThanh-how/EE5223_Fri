# Creates de10/system.qsys (Nios V + 256 KiB on-chip RAM + JTAG UART + LED PIO + NPU)
# Run from de10/:  qsys-script --search-path="ip,$" --script=scripts/create_system.tcl
# Optional env: NIOSV_CORE (intel_niosv_g | intel_niosv_m), NPU_N, NPU_DEPTH, FW_HEX
#
# Memory map (byte addresses) - keep in sync with fw/platform.h and README.md
#   0x0000_0000  ram       256 KiB on-chip RAM (reset vector 0x0)
#   0x2000_0000  npu       64 KiB  npu_avmm (NPU_BASE)
#   0x2001_0000  cpu.dm_agent      Nios V debug module
#   0x2002_0000  cpu.timer_sw_agent mtime/mtimecmp/msip (mtime counts clk cycles)
#   0x2002_0040  jtag_uart 8 B
#   0x2002_0050  led_pio   16 B (8-bit output)
# Nios V/g peripheral (uncached) region A = 0x2000_0000 .. 0x2003_FFFF
package require -exact qsys 24.1

proc envor {name def} {
    global env
    if {[info exists env($name)]} {
        if {[string length $env($name)] > 0} { return $env($name) }
    }
    return $def
}
set CORE   [envor NIOSV_CORE intel_niosv_g]
set NPU_N  [envor NPU_N 8]
set NPU_D  [envor NPU_DEPTH 64]
set FW_HEX [envor FW_HEX onchip_init.hex]

create_system system
set_project_property DEVICE_FAMILY "Cyclone V"
set_project_property DEVICE 5CSEBA6U23I7
set_project_property HIDE_FROM_IP_CATALOG false

# ---------------- clock / reset ----------------
add_instance clk_0 clock_source
set_instance_parameter_value clk_0 clockFrequency 50000000.0
set_instance_parameter_value clk_0 clockFrequencyKnown true
set_instance_parameter_value clk_0 resetSynchronousEdges DEASSERT

# ---------------- CPU ----------------
add_instance cpu $CORE
set_instance_parameter_value cpu resetSlave Absolute
set_instance_parameter_value cpu resetOffset 0
set_instance_parameter_value cpu enableDebug true
if {[string equal $CORE intel_niosv_g]} {
    set_instance_parameter_value cpu enableMulDiv true
    set_instance_parameter_value cpu enableFPU false
    set_instance_parameter_value cpu enableBranchPrediction true
    set_instance_parameter_value cpu instCacheSize 16384
    set_instance_parameter_value cpu dataCacheSize 16384
    set_instance_parameter_value cpu peripheralRegionABase 0x20000000
    set_instance_parameter_value cpu peripheralRegionASize 262144
}

# ---------------- memory ----------------
add_instance ram altera_avalon_onchip_memory2
set_instance_parameter_value ram dataWidth 32
set_instance_parameter_value ram memorySize 262144.0
set_instance_parameter_value ram singleClockOperation true
set_instance_parameter_value ram initMemContent true
set_instance_parameter_value ram useNonDefaultInitFile true
set_instance_parameter_value ram initializationFileName $FW_HEX
set_instance_parameter_value ram blockType AUTO

# ---------------- JTAG UART ----------------
add_instance jtag_uart altera_avalon_jtag_uart
set_instance_parameter_value jtag_uart writeBufferDepth 1024
set_instance_parameter_value jtag_uart readBufferDepth 64
set_instance_parameter_value jtag_uart writeIRQThreshold 8
set_instance_parameter_value jtag_uart readIRQThreshold 8

# ---------------- LED PIO ----------------
add_instance led_pio altera_avalon_pio
set_instance_parameter_value led_pio width 8
set_instance_parameter_value led_pio direction Output
set_instance_parameter_value led_pio resetValue 0.0

# ---------------- NPU ----------------
add_instance npu npu_avmm
set_instance_parameter_value npu N $NPU_N
set_instance_parameter_value npu DEPTH $NPU_D

# ---------------- clocks & resets ----------------
foreach {inst clk rst} {cpu clk reset ram clk1 reset1 jtag_uart clk reset led_pio clk reset npu clock reset} {
    add_connection clk_0.clk $inst.$clk
    add_connection clk_0.clk_reset $inst.$rst
}

# ---------------- address map ----------------
proc amap {m s base} {
    add_connection $m $s
    set_connection_parameter_value $m/$s baseAddress $base
}
amap cpu.instruction_manager ram.s1                       0x00000000
amap cpu.instruction_manager cpu.dm_agent                 0x20010000
amap cpu.data_manager        ram.s1                       0x00000000
amap cpu.data_manager        npu.avs                      0x20000000
amap cpu.data_manager        cpu.dm_agent                 0x20010000
amap cpu.data_manager        cpu.timer_sw_agent           0x20020000
amap cpu.data_manager        jtag_uart.avalon_jtag_slave  0x20020040
amap cpu.data_manager        led_pio.s1                   0x20020050

add_connection cpu.platform_irq_rx jtag_uart.irq
set_connection_parameter_value cpu.platform_irq_rx/jtag_uart.irq irqNumber 0

# ---------------- exports ----------------
set_interface_property clk         EXPORT_OF clk_0.clk_in
set_interface_property reset       EXPORT_OF clk_0.clk_in_reset
set_interface_property led         EXPORT_OF led_pio.external_connection

save_system system.qsys
puts "create_system: core=$CORE N=$NPU_N DEPTH=$NPU_D init=$FW_HEX"
