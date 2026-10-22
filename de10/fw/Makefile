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

ARCH    = -march=rv32im_zicsr -mabi=ilp32
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
	$(ELF2HEX) --input $< --output $@ --base 0x0 --end 0x3FFFF --width 32
	$(OBJCOPY) -O binary $< $(B)/$*.bin

init: $(B)/$(FW).hex
	cp $< ../onchip_init.hex

clean:
	rm -rf $(B)
.PHONY: all init clean
.PRECIOUS: $(B)/%.elf
