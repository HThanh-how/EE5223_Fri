# BOARD RUNBOOK – DE10-Nano NPU (5 phút trên board)

Tóm tắt: nạp file SOF thì chương trình có sẵn trong RAM chạy ngay. Sau đó mở terminal JTAG UART và bấm KEY0 để chạy lại, lần này thấy được toàn bộ output.

## 0. Chuẩn bị trên PC Windows (làm TRƯỚC khi mượn board)

1. Copy toàn bộ thư mục `de10\out\` vào `C:\npu\`. Kiểm tra checksum bằng `certutil -hashfile <file>.sof SHA256`; giá trị phải khớp với `out\SHA256SUMS.txt` (mục 6).
2. Cài Quartus Prime Programmer 25.1 hoặc bản Quartus Lite đầy đủ, kèm driver USB-Blaster II. Kiểm tra các lệnh sau có chạy được không:
   - `quartus_pgm -v`
   - `jtagconfig`
   - `juart-terminal --help` (bản cũ hơn thì dùng `nios2-terminal --help`)
   Nên mở sẵn "Nios V Command Shell" hoặc cmd đã có `quartus\bin64` trong PATH.
3. Cắm cáp mini-USB vào cổng USB-Blaster của DE10-Nano, rồi cấp nguồn 5 V. Chạy `jtagconfig`. Kết quả phải có:
   ```
   1) DE-SoC [USB-1]
     4BA00477   SOCVHPS
     02D020DD   5CSEBA6(.|ES)/5CSEBA6
   ```
   Thiết bị FPGA là **@2**. Nếu tên cáp khác, ví dụ `[USB-2]`, thì thay tên đó vào tất cả lệnh bên dưới.
4. Chuẩn bị điện thoại để chụp ảnh và quay video LED.

## 1. Thứ tự nạp SOF (đề xuất)

| Ưu tiên | SOF | Lý do |
|---|---|---|
| **1 (chính)** | `de10_nano_npu_picorv32_selftest.sof` | Không có cảnh báo licence. CPU giống hệt CPU đã verify trong simulation. Bridge Avalon đã được test với waitrequest ngẫu nhiên. |
| 2 | `de10_nano_npu_niosvg_selftest.sof` | Đây là kết quả chính cho báo cáo (Nios V). Quartus có cảnh báo licence IP-NIOSVG nhưng vẫn ra SOF bình thường. Chưa test trên board. |
| 3 | `de10_nano_npu_niosvm_selftest.sof` | Nios V/m, firmware rv32i. Cũng có cảnh báo licence. |

Mỗi CPU có thêm bản `_cnn.sof` và `_lstm.sof`: cùng phần cứng, chỉ khác chương trình nạp sẵn trong RAM.

## 2. Lệnh trên board (cmd 1 và cmd 2 chạy song song)

```
:: cmd 1 - nạp FPGA (khoảng 5 giây)
quartus_pgm -c "DE-SoC [USB-1]" -m JTAG -o "p;C:\npu\de10_nano_npu_picorv32_selftest.sof@2"

:: cmd 2 - mở terminal JTAG UART và để nguyên cửa sổ này
juart-terminal -c "DE-SoC [USB-1]" -d 2 -i 0
::  nếu không có juart-terminal:  nios2-terminal -c "DE-SoC [USB-1]" -d 2 -i 0
```

Sau đó **bấm KEY0** (nút gần LED, có ghi KEY0) để chạy lại chương trình. Lần này terminal sẽ nhận đủ output.

Đổi sang chương trình khác: nạp lại SOF tương ứng (`..._cnn.sof`, `..._lstm.sof`) bằng cmd 1, rồi bấm KEY0.

Với Nios V/g và Nios V/m (không áp dụng cho PicoRV32 và /c) có thể tải ELF thay vì nạp lại SOF:
```
niosv-download -g -c "DE-SoC [USB-1]" -d 2 C:\npu\cnn_niosvg.elf
```
Với /m thì dùng `cnn_niosvm.elf`.

## 3. LED

| LED | Ý nghĩa |
|---|---|
| LED0 | Nhấp nháy khoảng 0,75 Hz: FPGA đã được nạp và clock đang chạy |
| LED1 | Firmware đang chạy |
| LED2 | Firmware đã chạy xong |
| LED3 | **PASS** |
| LED4 | **FAIL** |
| LED5 | **TRAP** (CPU gặp lỗi) |

Trạng thái PASS: LED0 nhấp nháy, LED2 và LED3 sáng, LED1 và LED4 tắt.

## 4. Output mong đợi

Output dưới đây lấy từ các lần chạy simulation thật: đúng các file ELF trong `out\`, chạy trên PicoRV32 với memory map của DE10 (Verilator). Số cycle trên board sẽ khác, nhất là với Nios V.

**selftest** (khoảng 0,3 s với PicoRV32):
```
selftest N=8
trial 0 M=1 act=0 mult=32767 shift=0 PASS
... (trial 1..23 đều PASS)
RESULT: ALL PASS
[niosv] exit code 0
```

**lstm** (khoảng 1 s với PicoRV32, khoảng 3 s với /m):
```
LSTM INT8, N=8 images=16
cpu_only batch=1   cycles/img=...
npu batch=1        cycles/img=... npu_busy/img=26742 calls/img=1348 correct=16/16
npu batch=16       cycles/img=... npu_busy/img=2935 calls total=1348 correct=16/16
speedup_x100 vs cpu: batch1=... batchN=...
mismatches vs golden: 0
RESULT: ALL PASS
```

**cnn** (khoảng 5 s với PicoRV32; với Nios V/m khoảng 30 s vì nhân/chia làm bằng phần mềm, nên với /m chỉ chạy selftest/lstm nếu thiếu thời gian):
```
LeNet-5 INT8, N=8
img 0 label=7 pred=7 cpu_cyc=... npu_cyc=... npu_busy=18936 calls=741 mism(cpu/npu vs golden)=0/0
... img 1..7: label 2 1 0 4 1 4 9, pred trùng với label
correct=8/8
RESULT: ALL PASS
```

`npu_busy` là số cycle bên trong NPU, nên trên board phải giữ đúng các giá trị này (18936 / 26742 / 2935).

Chuỗi `[niosv] exit code 0` được in ra với mọi CPU, kể cả PicoRV32.

## 5. Xử lý sự cố (mỗi bước tối đa khoảng 30 s)

- **`quartus_pgm` báo lỗi hoặc không thấy cáp:**
  1. Chạy `jtagconfig`.
  2. Rút cáp ra cắm lại, kiểm tra lại driver.
  3. Kiểm tra tên cáp và chỉ số thiết bị `@2`.
- **LED0 không nhấp nháy:** FPGA chưa được nạp. Kiểm tra lại cáp và lệnh `@2`, rồi nạp lại.
- **LED0 nhấp nháy, LED1 không bao giờ sáng** (CPU không chạy):
  - Nếu đang dùng Nios V: có thể do licence. Chuyển ngay sang PicoRV32.
  - Nếu đang dùng PicoRV32: bấm KEY0, rồi nạp lại.
- **LED2 + LED3 sáng nhưng terminal trống:** output đã chạy trước khi terminal kết nối. Mở `juart-terminal` rồi bấm KEY0. Nếu có nhiều JTAG UART thì thử `-i 0`.
- **LED4 sáng (FAIL):** chụp màn hình terminal (dòng nào FAIL). Nạp lại SOF của CPU khác để so sánh.
- **LED5 sáng (TRAP):** terminal sẽ in `TRAP mcause=... mepc=...`. Chụp lại, rồi chuyển sang CPU tiếp theo theo thứ tự ở mục 1.
- **Terminal báo "no JTAG UART" / "connection refused":** đóng các tool JTAG khác (ví dụ Programmer GUI), rồi chạy lại cmd 2.

## Kế hoạch 5 phút

| Thời gian | Việc làm |
|---|---|
| Phút 0–1 | `jtagconfig`, nạp `picorv32_selftest`, mở juart-terminal, bấm KEY0. Chụp terminal và ảnh LED (LED2 + LED3). |
| Phút 1–2 | Nạp `picorv32_cnn`, bấm KEY0, đợi khoảng 5 s, chụp terminal. Sau đó nạp `picorv32_lstm`, bấm KEY0, chụp terminal. |
| Phút 2–4 | Nạp `niosvg_selftest`, bấm KEY0, chụp. Nếu PASS thì chạy tiếp `niosvg_cnn` và `niosvg_lstm`. Nếu CPU không chạy thì thử `niosvm_selftest`. |
| Phút 4–5 | Quay video ngắn: LED0 nhấp nháy và LED PASS. Chụp cửa sổ quartus_pgm (dòng "successful"). Ghi lại tên SOF đã dùng cho từng ảnh. |

## Cần ghi lại cho báo cáo (`\todo board results`)

1. Ảnh chụp terminal cho từng lần chạy: selftest, cnn và lstm, ghi rõ chạy trên CPU nào.
2. Ảnh LED (LED2 + LED3) cho ít nhất một lần PASS.
3. Ảnh cửa sổ quartus_pgm báo "Quartus Prime Programmer was successful".
4. Output của `jtagconfig`.
5. Các con số: `cycles/img`, `cpu_cyc`, `npu_cyc`, `speedup_x100` trên board.

## 6. SHA256 các file SOF

```
4b24a564f77fd850e865edec2ec9b3c991fc63bc5652a2f95fd1ccac0b457257  de10_nano_npu_picorv32_selftest.sof
258d2d4664dee8df7420f63d5399f87b3429da9ddb809153546983ea6fa0f1f2  de10_nano_npu_picorv32_cnn.sof
832c3ce8092abdcc530a3b12b4909bc4707e024d8821003eeb76642b742e8c9c  de10_nano_npu_picorv32_lstm.sof
6ffb45135d1fdd7b5ac3cb53d060d3d900464631a61f14c4254c247d1fcef531  de10_nano_npu_niosvg_selftest.sof
2409e1ccecaae40732d55d20a9c6e83982f8ec1d7f79679499b48019ccacf4e0  de10_nano_npu_niosvg_cnn.sof
cc6bbac6f0ada173e25085f4849772afa17acb7e233515affcf464d8221d68b3  de10_nano_npu_niosvg_lstm.sof
60000c4669d124d8db66bf729afc5d02e50d6de0171d6722f589c2a451cb9803  de10_nano_npu_niosvm_selftest.sof
9c08318127e2ab75a05de405ca4bd4fd1bfc1fa1bf6a6a417d5727be1a4510ee  de10_nano_npu_niosvm_cnn.sof
7525b7684afcd82e8301447030520bc89d10f6b0997d0e6e13e4ae1681a883d7  de10_nano_npu_niosvm_lstm.sof
00c6013c25376541c8997d439859ee27565d545582c7918e4b25414404901bdb  de10_nano_npu_niosvc_selftest_only.sof
704c45e5f27f62dbb2e2567b24bd0c0718aea5d575145853849b8e75d13d5f73  de10_nano_npu_niosvg_refrtl_selftest.sof
```
