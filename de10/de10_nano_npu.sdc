# DE10-Nano NPU system timing constraints
create_clock -name CLOCK_50 -period 20.000 [get_ports FPGA_CLK1_50]
derive_pll_clocks
derive_clock_uncertainty

# JTAG (USB-Blaster) - standard constraint used by the Nios/JTAG UART designs
if {[llength [get_ports -nowarn altera_reserved_tck]] > 0} {
    create_clock -name altera_reserved_tck -period 40.000 [get_ports altera_reserved_tck]
    set_clock_groups -asynchronous -group [get_clocks altera_reserved_tck]
}

# asynchronous push-button and LEDs
set_false_path -from [get_ports {KEY[*]}]
set_false_path -to   [get_ports {LED[*]}]
