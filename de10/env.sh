# Thiết lập PATH Quartus/Nios V cho môi trường LXC ghi trong QROOT.
# Chạy từ de10/: source env.sh để giữ các biến trong shell hiện tại.
# Quartus Prime Lite 25.1std environment (LXC 190)
# Từ gốc repo có thể source de10/env.sh; đường cài QROOT hiện cố định theo LXC.
# source cần thiết vì export trong một process bash riêng không đổi shell gọi.
# PATH thêm quartus, qsys, niosv và riscv32 gcc trước PATH hiện tại.
# File chỉ chuẩn bị môi trường, không build firmware, generate IP hay nạp FPGA.
export QROOT=/home/guest/altera_lite/25.1std
export QUARTUS_ROOTDIR=$QROOT/quartus
export PATH=$QROOT/quartus/bin:$QROOT/quartus/sopc_builder/bin:$QROOT/niosv/bin:$QROOT/riscfree/toolchain/riscv32-unknown-elf/bin:$PATH
