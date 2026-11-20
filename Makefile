# Điều phối build Verilator và firmware PicoRV32; N chọn kích thước, FW chọn chương trình.
# make test N=8 kiểm tra array; make soc N=8 FW=cnn chạy SoC với CNN.
# Open-source flow: Verilator (RTL sim) + riscv gcc (firmware) + PicoRV32
# Các lệnh dưới đây chạy từ gốc repo trong môi trường Linux có Verilator/RISC-V gcc.
# N điều khiển cả RTL -GN=N và firmware -DNN=N; FW là basename file fw/FW.c.
# Build dir tách theo N; firmware hex/log tách theo FW, executable SoC dùng chung N.
# FWFLAGS thêm macro firmware, ví dụ make soc N=8 FW=cnn FWFLAGS=-DNRUN=1.
# Make không theo dõi thay đổi giá trị FWFLAGS như dependency; cần rebuild khi đổi.
N  ?= 4
FW ?= gemm_demo
RTL = rtl/delay.sv rtl/pe.sv rtl/sa_top.sv

# make hoặc make all N=8 FW=selftest: chạy cả unit array và SoC firmware đã chọn.
# Không train model/quantize tự động; model header là input có sẵn cho firmware.
all: test soc

# ---- Milestone 1: systolic array unit test ----
# make build_N8/Vsa_top N=8: chỉ build C++ testbench và RTL array, chưa chạy.
# --cc --exe --build sinh/compile model; --trace hỗ trợ VCD, -CFLAGS đồng bộ N_.
# Ba RTL delay/pe/sa_top tách khỏi wrapper để unit test kiểm MAC/skew độc lập.
build_N$(N)/Vsa_top: $(RTL) sim/tb_sa.cpp
	verilator --cc --exe --build --trace -Wall -Wno-UNUSEDSIGNAL -Wno-DECLFILENAME \
	  --top-module sa_top -GN=$(N) -CFLAGS -DN_=$(N) \
	  -Mdir build_N$(N) $(RTL) sim/tb_sa.cpp -o Vsa_top

# make test N=8: chạy 26 ca signed GEMM, valid liên tiếp/bubble và biên INT8.
# Executable trả nonzero nếu mismatch nên make nhận lỗi từ unit test.
test: build_N$(N)/Vsa_top
	./build_N$(N)/Vsa_top

# make wave N=8: chạy cùng bộ unit test với NPU_DUMP=1, ghi ./sa_top.vcd.
wave: build_N$(N)/Vsa_top
	NPU_DUMP=1 ./build_N$(N)/Vsa_top

# ---- Milestone 2/3: PicoRV32 + Avalon-MM NPU SoC ----
# make soc N=8 FW=selftest|gemm_demo|cnn|lstm
# Prefix riscv64-unknown-elf vẫn tạo mã 32 bit nhờ -march=rv32im_zicsr -mabi=ilp32.
# -ffreestanding -nostdlib dùng start.S/link.ld riêng; -lgcc cung cấp helper số học.
# Không link libc hay hệ điều hành; putchar/exit là MMIO của testbench.
RV      = riscv64-unknown-elf
CFLAGS  = -march=rv32im_zicsr -mabi=ilp32 -O2 -ffreestanding -nostdlib -DNN=$(N) -Ifw $(FWFLAGS)
SOC_SRC = third_party/picorv32/picorv32.v $(RTL) rtl/npu_avmm.sv soc/soc_top.sv soc/tb_soc.sv
BD      = build_soc_N$(N)

# make rtl/lut_tables.svh: sinh đồng thời LUT RTL và C khi script mới hơn output.
# Hai bảng generated phải đi cùng phiên bản; không sửa một bảng riêng bằng tay.
rtl/lut_tables.svh fw/lut_tables.h: scripts/gen_lut.py
	python3 scripts/gen_lut.py .

# make build_soc_N8/Vtb_soc N=8: chỉ build SoC simulator, output ở build_soc_N8/.
# --binary --timing chạy initial/#delay của tb_soc; -Irtl tìm LUT include.
$(BD)/Vtb_soc: $(SOC_SRC) rtl/lut_tables.svh
	mkdir -p $(BD)
	verilator --binary --timing --trace -Wno-fatal -Wno-lint -Irtl \
	  --top-module tb_soc -DNPU_N=$(N) \
	  -Mdir $(BD)/obj $(SOC_SRC) -o ../Vtb_soc

# make build_soc_N8/selftest.hex N=8 FW=selftest: chỉ build firmware ELF/BIN/HEX.
# objcopy bỏ metadata ELF; bin2hex đổi byte little-endian thành word cho $readmemh.
# size in dung lượng section giúp kiểm giới hạn RAM 256 KiB, không dành stack tự động.
$(BD)/$(FW).hex: fw/$(FW).c fw/start.S fw/link.ld fw/npu.h fw/nn.h fw/common.h fw/lut_tables.h $(wildcard fw/model_*.h)
	mkdir -p $(BD)
	$(RV)-gcc $(CFLAGS) -T fw/link.ld -o $(BD)/$(FW).elf fw/start.S fw/$(FW).c -lgcc
	$(RV)-objcopy -O binary $(BD)/$(FW).elf $(BD)/$(FW).bin
	python3 scripts/bin2hex.py $(BD)/$(FW).bin > $@
	$(RV)-size $(BD)/$(FW).elf

# make soc N=8 FW=selftest: build nếu cần, copy selftest.hex thành fw.hex rồi chạy.
# Log ở build_soc_N8/selftest.log; cần xem RESULT/exit code, không chỉ exit của tee.
soc: $(BD)/$(FW).hex $(BD)/Vtb_soc
	cd $(BD) && cp $(FW).hex fw.hex && ./Vtb_soc | tee $(FW).log

# make soc-wave N=8 FW=selftest: như soc nhưng +vcd ghi build_soc_N8/soc.vcd.
# Watchdog hoặc CPU trap in thông báo từ tb_soc, kiểm số học nằm trong firmware.
soc-wave: $(BD)/$(FW).hex $(BD)/Vtb_soc
	cd $(BD) && cp $(FW).hex fw.hex && ./Vtb_soc +vcd | tee $(FW).log

# make clean: xóa build_N*, build_soc_N* và *.vcd ở gốc; giữ source/model/results.
# Các target chạy là test/soc/wave; target đường dẫn chỉ build để kiểm tra artifact.
clean:
	rm -rf build_N* build_soc_N* *.vcd
