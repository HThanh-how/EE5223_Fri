# Open-source flow: Verilator (RTL sim) + riscv gcc (firmware) + PicoRV32
N  ?= 4
FW ?= gemm_demo
RTL = rtl/delay.sv rtl/pe.sv rtl/sa_top.sv

all: test soc

# ---- Milestone 1: systolic array unit test ----
build_N$(N)/Vsa_top: $(RTL) sim/tb_sa.cpp
	verilator --cc --exe --build --trace -Wall -Wno-UNUSEDSIGNAL -Wno-DECLFILENAME \
	  --top-module sa_top -GN=$(N) -CFLAGS -DN_=$(N) \
	  -Mdir build_N$(N) $(RTL) sim/tb_sa.cpp -o Vsa_top

test: build_N$(N)/Vsa_top
	./build_N$(N)/Vsa_top

wave: build_N$(N)/Vsa_top
	NPU_DUMP=1 ./build_N$(N)/Vsa_top

# ---- Milestone 2/3: PicoRV32 + Avalon-MM NPU SoC ----
# make soc N=8 FW=selftest|gemm_demo|cnn|lstm
RV      = riscv64-unknown-elf
CFLAGS  = -march=rv32im_zicsr -mabi=ilp32 -O2 -ffreestanding -nostdlib -DNN=$(N) -Ifw $(FWFLAGS)
SOC_SRC = third_party/picorv32/picorv32.v $(RTL) rtl/npu_avmm.sv soc/soc_top.sv soc/tb_soc.sv
BD      = build_soc_N$(N)

rtl/lut_tables.svh fw/lut_tables.h: scripts/gen_lut.py
	python3 scripts/gen_lut.py .

$(BD)/Vtb_soc: $(SOC_SRC) rtl/lut_tables.svh
	mkdir -p $(BD)
	verilator --binary --timing --trace -Wno-fatal -Wno-lint -Irtl \
	  --top-module tb_soc -DNPU_N=$(N) \
	  -Mdir $(BD)/obj $(SOC_SRC) -o ../Vtb_soc

$(BD)/$(FW).hex: fw/$(FW).c fw/start.S fw/link.ld fw/npu.h fw/nn.h fw/common.h fw/lut_tables.h $(wildcard fw/model_*.h)
	mkdir -p $(BD)
	$(RV)-gcc $(CFLAGS) -T fw/link.ld -o $(BD)/$(FW).elf fw/start.S fw/$(FW).c -lgcc
	$(RV)-objcopy -O binary $(BD)/$(FW).elf $(BD)/$(FW).bin
	python3 scripts/bin2hex.py $(BD)/$(FW).bin > $@
	$(RV)-size $(BD)/$(FW).elf

soc: $(BD)/$(FW).hex $(BD)/Vtb_soc
	cd $(BD) && cp $(FW).hex fw.hex && ./Vtb_soc | tee $(FW).log

soc-wave: $(BD)/$(FW).hex $(BD)/Vtb_soc
	cd $(BD) && cp $(FW).hex fw.hex && ./Vtb_soc +vcd | tee $(FW).log

clean:
	rm -rf build_N* build_soc_N* *.vcd
