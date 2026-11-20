# Đổi binary thành word hex little-endian cho $readmemh; byte cuối được đệm 0.
# Chạy: python3 scripts/bin2hex.py input.bin > fw.hex (input.bin là ảnh firmware).
# Đối số bắt buộc duy nhất là đường dẫn raw binary, thường từ objcopy -O binary.
# Stdout là dữ liệu hex, vì vậy dùng > build_soc_N8/selftest.hex để lưu kết quả.
# Không parse ELF/header hay đặt địa chỉ base; byte 0 binary ứng với word 0 RAM.
# Không scale, zero-point hay clamp: chuyển biểu diễn byte, giữ nguyên mọi bit.
import sys
# Mỗi dòng tương ứng một word 32 bit; đệm cuối tránh mất các byte lẻ.
data = open(sys.argv[1], "rb").read()
# (-len(data))%4 là 0..3 byte zero để đủ word cuối, không đổi byte firmware có sẵn.
# Ví dụ byte 01 02 03 04 in 04030201: $readmemh nạp thành word little-endian.
# Mỗi dòng 8 hex digit, không tiền tố 0x; file rỗng không sinh word nào.
data += b"\0" * (-len(data) % 4)
for i in range(0, len(data), 4):
    print("%08x" % int.from_bytes(data[i:i + 4], "little"))
