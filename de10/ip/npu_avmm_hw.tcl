# Platform Designer component: INT8 weight-stationary systolic-array NPU (npu_avmm)
# 32-bit Avalon-MM slave, 14-bit word address (64 KiB span), read latency 1 via
# readdatavalid, waitrequest tied low inside the RTL.
package require -exact qsys 16.1

set_module_property NAME          npu_avmm
set_module_property DISPLAY_NAME  "INT8 Systolic NPU (npu_avmm)"
set_module_property VERSION       1.0
set_module_property GROUP         "EE5223"
set_module_property AUTHOR        "EE5223"
set_module_property DESCRIPTION   "NxN INT8 weight-stationary systolic array with requant/activation, Avalon-MM slave"
set_module_property INTERNAL      false
set_module_property EDITABLE      false
set_module_property REPORT_TO_TALKBACK false
set_module_property ALLOW_GREYBOX_GENERATION false
set_module_property REPORT_HIERARCHY false

# ---------------- parameters ----------------
add_parameter N INTEGER 8
set_parameter_property N DISPLAY_NAME "Array size N (NxN PEs)"
set_parameter_property N ALLOWED_RANGES {4 8 16}
set_parameter_property N HDL_PARAMETER true

add_parameter DEPTH INTEGER 64
set_parameter_property DEPTH DISPLAY_NAME "Buffer depth (rows)"
set_parameter_property DEPTH ALLOWED_RANGES {16 32 64 128 256}
set_parameter_property DEPTH HDL_PARAMETER true

# ---------------- file sets ----------------
# ---------------------------------------------------------------------------
# SINGLE place that selects which NPU RTL is used by the Platform Designer
# component. Paths are relative to this file (de10/ip); Platform Designer resolves
# fileset PATHs relative to this _hw.tcl file.
#
#   ref  : proj/rtl                 (reference RTL, also used by Verilator sim)
#          used through de10/rtl_compat = syntax-only SV-2005 copy made by
#          scripts/make_compat.py (build.sh runs it), because Quartus Lite rejects
#          generate blocks without generate/endgenerate
#   fpga : proj/quartus_fit/rtl_fpga (FPGA-optimised variant, same file names) [default]
#
# Switch with ONE line below, or without editing: export NPU_RTL_VARIANT=ref
# before running scripts/build.sh (qsys-generate re-reads this file).
# ---------------------------------------------------------------------------
set NPU_RTL_VARIANT fpga
if {[info exists ::env(NPU_RTL_VARIANT)]} {
    if {[string length $::env(NPU_RTL_VARIANT)] > 0} { set NPU_RTL_VARIANT $::env(NPU_RTL_VARIANT) }
}

switch -- $NPU_RTL_VARIANT {
    fpga    { set NPU_RTL_DIR ../../quartus_fit/rtl_fpga }
    default { set NPU_RTL_DIR ../rtl_compat }
}

# {file  type}; lut_tables.svh is `included by npu_avmm.sv -> copied next to it
set NPU_RTL_FILES {
    {delay.sv       SYSTEM_VERILOG}
    {pe.sv          SYSTEM_VERILOG}
    {sa_top.sv      SYSTEM_VERILOG}
    {lut_tables.svh SYSTEM_VERILOG_INCLUDE}
    {npu_avmm.sv    SYSTEM_VERILOG}
}


proc npu_add_files {} {
    global NPU_RTL_FILES NPU_RTL_DIR
    foreach f $NPU_RTL_FILES {
        set name [lindex $f 0]
        set type [lindex $f 1]
        if {[string equal $name npu_avmm.sv]} {
            add_fileset_file $name $type PATH [file join $NPU_RTL_DIR $name] TOP_LEVEL_FILE
        } else {
            add_fileset_file $name $type PATH [file join $NPU_RTL_DIR $name]
        }
    }
}
add_fileset QUARTUS_SYNTH QUARTUS_SYNTH "" ""
set_fileset_property QUARTUS_SYNTH TOP_LEVEL npu_avmm
npu_add_files
add_fileset SIM_VERILOG SIM_VERILOG "" ""
set_fileset_property SIM_VERILOG TOP_LEVEL npu_avmm
npu_add_files

# ---------------- clock / reset ----------------
add_interface clock clock end
set_interface_property clock clockRate 0
add_interface_port clock clk clk Input 1

add_interface reset reset end
set_interface_property reset associatedClock clock
set_interface_property reset synchronousEdges DEASSERT
add_interface_port reset reset_n reset_n Input 1

# ---------------- Avalon-MM slave ----------------
add_interface avs avalon end
set_interface_property avs addressUnits WORDS
set_interface_property avs associatedClock clock
set_interface_property avs associatedReset reset
set_interface_property avs bitsPerSymbol 8
set_interface_property avs burstOnBurstBoundariesOnly false
set_interface_property avs explicitAddressSpan 0
set_interface_property avs holdTime 0
set_interface_property avs linewrapBursts false
set_interface_property avs maximumPendingReadTransactions 1
set_interface_property avs readLatency 0
set_interface_property avs readWaitTime 0
set_interface_property avs setupTime 0
set_interface_property avs timingUnits Cycles
set_interface_property avs writeWaitTime 0
set_interface_property avs ENABLED true

add_interface_port avs avs_address       address       Input  14
add_interface_port avs avs_read          read          Input  1
add_interface_port avs avs_write         write         Input  1
add_interface_port avs avs_writedata     writedata     Input  32
add_interface_port avs avs_readdata      readdata      Output 32
add_interface_port avs avs_readdatavalid readdatavalid Output 1
add_interface_port avs avs_waitrequest   waitrequest   Output 1
set_interface_assignment avs embeddedsw.configuration.isFlash 0
set_interface_assignment avs embeddedsw.configuration.isMemoryDevice 0
set_interface_assignment avs embeddedsw.configuration.isNonVolatileStorage 0
set_interface_assignment avs embeddedsw.configuration.isPrintableDevice 0
