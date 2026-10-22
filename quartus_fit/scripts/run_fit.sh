#!/bin/bash
# usage: run_fit.sh <rtl_dir> <N> <clk_mhz> <tag>   (run on LXC 190, from /root/ee5223/fit)
RTL=$1; N=$2; MHZ=$3; TAG=$4
export PATH=$PATH:/home/guest/altera_lite/25.1std/quartus/bin
D=/root/ee5223/fit/run_${TAG}_N${N}_${MHZ}
rm -rf $D; mkdir -p $D; cd $D
PER=$(python3 -c "print(1000.0/$MHZ)")
cat > npu.sdc <<S
create_clock -name clk -period $PER [get_ports clk]
derive_clock_uncertainty
S
cat > npu.qsf <<Q
set_global_assignment -name FAMILY "Cyclone V"
set_global_assignment -name DEVICE 5CSEBA6U23I7
set_global_assignment -name TOP_LEVEL_ENTITY npu_avmm
set_global_assignment -name SYSTEMVERILOG_FILE $RTL/delay.sv
set_global_assignment -name SYSTEMVERILOG_FILE $RTL/pe.sv
set_global_assignment -name SYSTEMVERILOG_FILE $RTL/sa_top.sv
set_global_assignment -name SYSTEMVERILOG_FILE $RTL/npu_avmm.sv
set_global_assignment -name SEARCH_PATH $RTL
set_global_assignment -name SDC_FILE npu.sdc
set_parameter -name N $N
set_parameter -name DEPTH 64
set_global_assignment -name NUM_PARALLEL_PROCESSORS 4
set_global_assignment -name OPTIMIZATION_MODE "HIGH PERFORMANCE EFFORT"
Q
for p in reset_n avs_address avs_read avs_write avs_writedata avs_readdata avs_readdatavalid avs_waitrequest; do
  echo "set_instance_assignment -name VIRTUAL_PIN ON -to $p*" >> npu.qsf
done
quartus_sh --flow compile npu > compile.log 2>&1
echo "exit=$?" >> compile.log
mkdir -p /root/ee5223/fit/reports
for f in *.rpt *.summary; do cp $f /root/ee5223/fit/reports/${TAG}_N${N}_${MHZ}_$(basename $f); done
cp compile.log /root/ee5223/fit/reports/${TAG}_N${N}_${MHZ}_compile.log
tail -3 compile.log
