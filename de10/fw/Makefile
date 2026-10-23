# Nios V firmware for the DE10-Nano NPU system (bare metal, no HAL).
# Reuses proj/fw sources/headers unchanged; platform.h is force-included and
# shadows proj/fw/common.h (same include guard).
#   make            -> build/selftest|cnn|lstm .elf/.hex/.bin/.lst
#   make init FW=cnn -> copy build/cnn.hex to ../onchip_init.hex (RAM init of the SOF)
CROSS  ?= riscv32-unknown-elf-
CC      = $(CROSS)gcc
OBJCOPY = $(CROSS)objcopy
OBJDUMP = $(CROSS)objdump
SIZE    = $(CROSS)size
ELF2HEX ?= elf2hex
N      ?= 8
SRC    ?= ../../fw
FW     ?= selftest
PROGS   = selftest cnn lstm
B       = build

# Nios V/g = rv32im ; Nios V/m and /c = rv32i only (no M extension) -> make rv32i
ARCH   ?= -march=rv32im_zicsr -mabi=ilp32
CFLAGS  = $(ARCH) -O2 -ffreestanding -nostdlib -fno-builtin -DNN=$(N) \
          -include platform.h -I. -I$(SRC)
LDFLAGS = -T link.ld -Wl,--gc-sections -Wl,-Map=$(B)/$*.map

all: $(addprefix $(B)/,$(addsuffix .hex,$(PROGS)))

$(B)/%.elf: $(SRC)/%.c crt0.S platform.c platform.h link.ld $(wildcard $(SRC)/*.h)
	@mkdir -p $(B)
	$(CC) $(CFLAGS) $(LDFLAGS) -o $@ crt0.S platform.c $(SRC)/$*.c -lgcc
	$(SIZE) $@
	$(OBJDUMP) -d $@ > $(B)/$*.lst

# Intel HEX, 32-bit words, whole 256 KiB RAM -> on-chip RAM initialisation file
$(B)/%.hex: $(B)/%.elf
	$(ELF2HEX) --input $< --output $@ --base 0x0 --end 0x3FFFF --width 32 --record=4
	$(OBJCOPY) -O binary $< $(B)/$*.bin

init: $(B)/$(FW).hex
	cp $< ../onchip_init.hex

# PicoRV32 fallback system: same sources, only crt0's csrw mtvec removed (-DPICORV_SIM)
BP = build_pico
pico: $(addprefix $(BP)/,$(addsuffix .hex,$(PROGS)))
$(BP)/%.elf: $(SRC)/%.c crt0.S platform.c platform.h link.ld $(wildcard $(SRC)/*.h)
	@mkdir -p $(BP)
	$(CC) $(CFLAGS) -DPICORV_SIM -T link.ld -Wl,--gc-sections -Wl,-Map=$(BP)/$*.map -o $@ crt0.S platform.c $(SRC)/$*.c -lgcc
	$(SIZE) $@
	$(OBJDUMP) -d $@ > $(BP)/$*.lst
$(BP)/%.hex: $(BP)/%.elf
	$(ELF2HEX) --input $< --output $@ --base 0x0 --end 0x3FFFF --width 32 --record=4
	$(OBJCOPY) -O binary $< $(BP)/$*.bin

# Nios V/m and Nios V/c: RV32I only (intel_niosv_m_callbacks.tcl: -march=rv32i). mul/div via libgcc.
BI = build_rv32i
rv32i:
	$(MAKE) ARCH="-march=rv32i_zicsr -mabi=ilp32" B=$(BI) all

clean:
	rm -rf build $(BP) $(BI)
.PHONY: all init pico rv32i clean
.PRECIOUS: $(B)/%.elf $(BP)/%.elf
