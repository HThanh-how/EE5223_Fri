# Open-source synthesis flow for npu_avmm. Run on LXC 180 inside WORK (default /root/work_synth, with rtl/ copied there).
# make all            -> generic, ecp5(+pnr), intel_alm, hier for 4 configs
# make CFG=8_64 ecp5 pnr50 pnr100
WORK   ?= /root/work_synth
REP    ?= $(WORK)/reports
CFGS   ?= 4_64 8_64 8_32 4_32
READ    = read_verilog -sv -I$(WORK)/rtl $(WORK)/rtl/delay.sv $(WORK)/rtl/pe.sv $(WORK)/rtl/sa_top.sv $(WORK)/rtl/npu_avmm.sv
N       = $(word 1,$(subst _, ,$(1)))
D       = $(word 2,$(subst _, ,$(1)))
CHP     = chparam -set N $(call N,$(1)) -set DEPTH $(call D,$(1)) npu_avmm

all: $(foreach c,$(CFGS),generic_$(c) ecp5_$(c) alm_$(c) hier_$(c))
pnr: $(foreach c,$(CFGS),pnr50_$(c) pnr100_$(c))
	
generic_%:
	yosys -l $(REP)/generic_$*.log -p "$(READ); $(call CHP,$*); hierarchy -top npu_avmm; synth -top npu_avmm -flatten; tee -o $(REP)/generic_$*.stat stat" >/dev/null
hier_%:
	yosys -l $(REP)/hier_$*.log -p "$(READ); $(call CHP,$*); hierarchy -top npu_avmm; synth -top npu_avmm; tee -o $(REP)/hier_$*.stat stat" >/dev/null
ecp5_%:
	yosys -l $(REP)/ecp5_$*.log -p "$(READ); $(call CHP,$*); hierarchy -top npu_avmm; synth_ecp5 -top npu_avmm -json $(REP)/ecp5_$*.json; tee -o $(REP)/ecp5_$*.stat stat" >/dev/null
alm_%:
	yosys -l $(REP)/alm_$*.log -p "$(READ); $(call CHP,$*); hierarchy -top npu_avmm; synth_intel_alm -family cyclonev -top npu_avmm; tee -o $(REP)/alm_$*.stat stat" >/dev/null
pnr50_%:
	nextpnr-ecp5 --85k --package CABGA381 --freq 50 --json $(REP)/ecp5_$*.json --lpf-allow-unconstrained --seed 1 --router router2 -l $(REP)/pnr50_$*.log >/dev/null 2>&1; true
pnr100_%:
	nextpnr-ecp5 --85k --package CABGA381 --freq 100 --json $(REP)/ecp5_$*.json --lpf-allow-unconstrained --seed 1 --router router2 -l $(REP)/pnr100_$*.log >/dev/null 2>&1; true
# word-level view before alumacc: $mul cells with widths (hierarchy kept) and memories
word_%:
	yosys -l $(REP)/word_$*.log -p "$(READ); $(call CHP,$*); hierarchy -top npu_avmm; proc; opt_expr; opt_clean; wreduce; memory_collect; tee -o $(REP)/word_$*.stat stat -width" >/dev/null
# per-module ecp5 mapping (hierarchy kept) for area attribution
ecp5h_%:
	yosys -l $(REP)/ecp5h_$*.log -p "$(READ); $(call CHP,$*); hierarchy -top npu_avmm; synth_ecp5 -noflatten -top npu_avmm; tee -o $(REP)/ecp5h_$*.stat stat" >/dev/null
# experiment A: rtl copy in $(WORK)/expA (run mk_exp_A.sh first)
expA_%:
	yosys -l $(REP)/expA_$*.log -p "read_verilog -sv -I$(WORK)/expA $(WORK)/expA/delay.sv $(WORK)/expA/pe.sv $(WORK)/expA/sa_top.sv $(WORK)/expA/npu_avmm.sv; $(call CHP,$*); hierarchy -top npu_avmm; synth_ecp5 -top npu_avmm -json $(REP)/expA_$*.json; tee -o $(REP)/expA_$*.stat stat" >/dev/null
# pnr of experiment A (memories kept as RAM)
pnrA50_%:
	nextpnr-ecp5 --85k --package CABGA381 --freq 50 --json $(REP)/expA_$*.json --lpf-allow-unconstrained --seed 1 --router router2 -l $(REP)/pnrA50_$*.log >/dev/null 2>&1; true
