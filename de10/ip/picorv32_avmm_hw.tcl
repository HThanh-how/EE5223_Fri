# Platform Designer component: PicoRV32 with Avalon-MM master (licence-free fallback CPU)
package require -exact qsys 16.1

set_module_property NAME          picorv32_avmm
set_module_property DISPLAY_NAME  "PicoRV32 (Avalon-MM master)"
set_module_property VERSION       1.0
set_module_property GROUP         "EE5223"
set_module_property AUTHOR        "EE5223 (PicoRV32 by Claire Xenia Wolf, ISC licence)"
set_module_property DESCRIPTION   "RV32IM PicoRV32 + native-to-Avalon bridge + local 64-bit cycle counter at 0x2002_0000"
set_module_property INTERNAL      false
set_module_property EDITABLE      false
set_module_property REPORT_TO_TALKBACK false
set_module_property ALLOW_GREYBOX_GENERATION false

proc pico_add_files {} {
    add_fileset_file picorv32.v      VERILOG        PATH ../../third_party/picorv32/picorv32.v
    add_fileset_file picorv32_avmm.sv SYSTEM_VERILOG PATH picorv32_avmm.sv TOP_LEVEL_FILE
}
add_fileset QUARTUS_SYNTH QUARTUS_SYNTH "" ""
set_fileset_property QUARTUS_SYNTH TOP_LEVEL picorv32_avmm
pico_add_files
add_fileset SIM_VERILOG SIM_VERILOG "" ""
set_fileset_property SIM_VERILOG TOP_LEVEL picorv32_avmm
pico_add_files

add_interface clock clock end
set_interface_property clock clockRate 0
add_interface_port clock clk clk Input 1

add_interface reset reset end
set_interface_property reset associatedClock clock
set_interface_property reset synchronousEdges DEASSERT
add_interface_port reset reset_n reset_n Input 1

add_interface m0 avalon start
set_interface_property m0 addressUnits SYMBOLS
set_interface_property m0 associatedClock clock
set_interface_property m0 associatedReset reset
set_interface_property m0 bitsPerSymbol 8
set_interface_property m0 burstOnBurstBoundariesOnly false
set_interface_property m0 doStreamReads false
set_interface_property m0 doStreamWrites false
set_interface_property m0 holdTime 0
set_interface_property m0 linewrapBursts false
set_interface_property m0 maximumPendingReadTransactions 0
set_interface_property m0 readLatency 0
set_interface_property m0 readWaitTime 1
set_interface_property m0 setupTime 0
set_interface_property m0 timingUnits Cycles
set_interface_property m0 writeWaitTime 0
add_interface_port m0 avm_address       address       Output 32
add_interface_port m0 avm_byteenable    byteenable    Output 4
add_interface_port m0 avm_read          read          Output 1
add_interface_port m0 avm_write         write         Output 1
add_interface_port m0 avm_writedata     writedata     Output 32
add_interface_port m0 avm_readdata      readdata      Input  32
add_interface_port m0 avm_readdatavalid readdatavalid Input  1
add_interface_port m0 avm_waitrequest   waitrequest   Input  1

add_interface trap conduit end
add_interface_port trap cpu_trap export Output 1
