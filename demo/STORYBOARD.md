# STORYBOARD - Video demo (6-8 phút)

Đề tài: **Thiết kế và tích hợp bộ nhân ma trận INT8 systolic array vào hệ thống RISC-V, mở rộng cho CNN và RNN/LSTM** (EE5223).

Chuẩn bị trước khi quay (một lần): `demo/prepare.sh` (xem README). Khi quay dùng `demo/run_demo.sh --pause` để bấm Enter chuyển từng cảnh, hoặc chạy lệnh riêng từng cảnh như bên dưới (`--only K`).
Thời gian ước tính cho mỗi cảnh gồm cả phần nói. Tổng khoảng 7 phút 30 giây nếu cắt bớt thời gian chờ mô phỏng khi dựng (stage CNN mất ~2 phút thực tế - nên tua nhanh hoặc nói trong lúc chờ).

Hình dùng trong video: `demo/figures/` (a_cycles_cpu_vs_npu, b_cnn_profile, c_waveform_dataflow, d_block_diagram, e_accuracy_table).

Con số tham chiếu (N=8, chu kỳ trên PicoRV32): LeNet-5 CPU-only 13,25M, có NPU 1,92M (6,9x); LSTM CPU-only 3,56M/ảnh, NPU batch=1 1,07M (3,3x), batch=16 217K (16,4x); độ chính xác INT8 LeNet 98,85%, LSTM 97,50%.

---

## Cảnh 1 - Mở đầu (0:00 - 0:30)

**Màn hình:** slide tên đề tài (hoặc `figures/d_block_diagram.png` làm nền), tên nhóm/sinh viên.
**Lệnh:** không.
**Chỉ vào:** tiêu đề, dòng "INT8 systolic array - RISC-V - CNN + LSTM".

**Lời thoại:**
"Em chào thầy cô và các bạn. Em xin trình bày đề tài thiết kế và tích hợp bộ tăng tốc nhân ma trận INT8 dạng systolic array vào hệ thống RISC-V. Mục tiêu là tăng tốc suy luận mạng nơ-ron: em bắt đầu từ phép nhân ma trận, rồi áp dụng cho mạng CNN LeNet-5 nhận dạng chữ số MNIST và mạng LSTM đọc ảnh theo từng hàng. Toàn bộ phần thiết kế và mô phỏng chạy bằng công cụ mã nguồn mở, sau đó em đưa lên board DE10-Nano. Trong video này em sẽ chạy trực tiếp demo, và nói rõ cả điểm mạnh lẫn nút thắt cổ chai còn lại."

---

## Cảnh 2 - Kiến trúc hệ thống (0:30 - 1:30)

**Màn hình:** `figures/d_block_diagram.png`.
**Lệnh:** không.
**Chỉ vào:** (1) CPU và Avalon-MM bên trái; (2) khối WEIGHT/ABUF; (3) lưới systolic array; (4) CBUF -> post-process -> QBUF; (5) dòng chữ "cùng một wrapper cho mô phỏng và FPGA".

**Lời thoại:**
"Đây là kiến trúc tổng thể. Bên trái là CPU chủ: trong mô phỏng là PicoRV32, trên board là Nios V. CPU giao tiếp với bộ tăng tốc qua bus Avalon-MM, các thanh ghi và bộ đệm được ánh xạ vào bộ nhớ. Bên trong khối NPU có bộ đệm trọng số, bộ đệm kích hoạt, một bộ điều khiển, và lõi chính là mảng systolic NxN kiểu weight-stationary: trọng số INT8 được nạp sẵn vào từng phần tử xử lý, mỗi chu kỳ một hàng kích hoạt đi vào và một hàng kết quả đi ra. Kết quả INT32 được cộng dồn qua nhiều tile theo chiều K, sau đó đi qua khối hậu xử lý: cộng bias, requantize bằng phép nhân với một hệ số rồi dịch phải, và áp dụng ReLU hoặc bảng tra sigmoid, tanh cho LSTM. Điểm quan trọng là cùng một wrapper và cùng bản đồ thanh ghi được dùng cả khi mô phỏng và khi chạy trên FPGA."

---

## Cảnh 3 - Dòng dữ liệu systolic và unit test (1:30 - 2:15)

**Màn hình:** terminal, rồi chuyển sang `figures/c_waveform_dataflow.png`.
**Lệnh:** `demo/run_demo.sh --only 1` (tương đương `make test N=4`). Thời gian chạy dưới 1 giây.
**Chỉ vào:** các dòng `PASS` và dòng cuối `N=4 : 26 tests, ALL PASS`. Trong hình sóng: hàng `a_in` so với `a_skew` (mỗi hàng bị trễ thêm 1 chu kỳ), khoảng đỏ độ trễ 7 chu kỳ = 2N-1 giữa `in_valid` và `out_valid`, và `c_out` ra thẳng hàng.

**Lời thoại:**
"Trước hết em kiểm tra riêng lõi systolic bằng testbench Verilator so với mô hình tham chiếu: 26 test gồm ma trận đơn vị, các giá trị cực trị, ngẫu nhiên có và không có khoảng trống giữa các hàng, đều PASS. Trong dạng sóng này, phần trên là dữ liệu vào: do cấu trúc systolic, hàng i của ma trận kích hoạt phải bị trễ i chu kỳ, tạo thành mặt sóng chéo đi qua mảng. Phía ra, cột j bị trễ ngược lại N-1-j chu kỳ để một hàng kết quả hoàn chỉnh xuất hiện cùng tín hiệu out_valid. Độ trễ từ lúc đưa dòng đầu vào đến lúc có dòng đầu ra là 2N-1 chu kỳ, ở đây N bằng 4 nên là 7, đúng như đo được. Sau đó mỗi chu kỳ ra một hàng kết quả."

---

## Cảnh 4 - PicoRV32 + NPU: GEMM và hậu xử lý (2:15 - 3:00)

**Màn hình:** terminal.
**Lệnh:** `demo/run_demo.sh --only 2 --only 3` (hoặc `make soc N=8 FW=gemm_demo` rồi `make soc N=8 FW=selftest`). Thời gian: ~1 giây và ~8 giây.
**Chỉ vào:** bảng `M=1 / 8 / 32 / 64`: cột `cpu_cycles` so với `npu_total` và `npu_compute`; dòng `mismatches=0 PASS`. Ở selftest: các trial với `act=0..3` (không, ReLU, sigmoid, tanh) đều PASS.

**Lời thoại:**
"Bây giờ em chạy PicoRV32 thật trong mô phỏng RTL, điều khiển NPU qua Avalon-MM bằng phần mềm C. Bài demo GEMM nhân ma trận M hàng với trọng số 8x8, so sánh CPU tính tay với NPU. Với M bằng 64, CPU mất khoảng 177 nghìn chu kỳ, còn NPU tổng cộng 28 nghìn chu kỳ, trong đó phần tính toán thực sự của mảng chỉ có 80 chu kỳ. Chênh lệch này chính là chi phí chép dữ liệu qua bus, một điểm em sẽ quay lại ở phần nút thắt. Kết quả luôn bằng tuyệt đối với mô hình vàng, mismatch bằng 0. Phần self-test kiểm tra khối hậu xử lý với bias, hệ số requantize và dịch ngẫu nhiên cho cả bốn chế độ: không kích hoạt, ReLU, sigmoid và tanh qua bảng tra LUT. Tất cả đều khớp từng bit."

---

## Cảnh 5 - CNN: LeNet-5 -> im2col -> GEMM (3:00 - 4:45)

**Màn hình:** terminal (chữ số ASCII hiện trước, rồi kết quả từng ảnh).
**Lệnh:** `demo/run_demo.sh --only 4` (đầy đủ 8 ảnh, ~2 phút thực tế; hoặc `--only 4 --quick` ~45 giây, dừng sau 3 ảnh). Khi dựng video có thể tua nhanh phần chờ.
**Chỉ vào:** (1) hình chữ số ASCII và nhãn thật; (2) dòng `profile(img0)`; (3) với mỗi ảnh: `label=7  NPU prediction=7 [CORRECT]`, số chu kỳ CPU-only so với CPU+NPU và hệ số "6.89x faster"; (4) dòng cuối `avg ... speedup_x100=689`, `correct=8/8`. Sau đó hiện `figures/a_cycles_cpu_vs_npu.png` (nhóm LeNet).

**Lời thoại:**
"Tiếp theo là LeNet-5 trên MNIST. Đây là ảnh đầu vào 28x28, em vẽ bằng ký tự ASCII: nhãn thật là số 7. Cách ánh xạ CNN lên NPU là im2col: mỗi cửa sổ trượt 5x5 của tích chập được trải thành một hàng của ma trận, nên tích chập trở thành một phép nhân ma trận lớn. Ví dụ lớp conv1 thành ma trận 576 hàng nhân 25 cột, lớp conv2 thành 64 hàng nhân 150 cột, còn ba lớp fully-connected là phép nhân một hàng. Khi ma trận quá lớn, phần mềm chia thành các tile NxN và cộng dồn trong bộ đệm INT32. Firmware chạy mỗi ảnh hai lần: một lần chỉ dùng CPU, một lần dùng NPU, rồi so sánh. Em thấy mạng dự đoán đúng số 7. CPU một mình tốn khoảng 13,25 triệu chu kỳ, có NPU chỉ còn 1,92 triệu, nhanh hơn 6,9 lần với N bằng 8, và 3,9 lần với N bằng 4. Cả tám ảnh đều đúng và kết quả của NPU trùng khớp từng bit với mô hình vàng."

---

## Cảnh 6 - Nút thắt cổ chai thật sự (4:45 - 5:30)

**Màn hình:** `figures/b_cnn_profile.png`.
**Lệnh:** không (số liệu từ dòng `profile(img0)` vừa chạy ở cảnh 5).
**Chỉ vào:** thanh N=8: phần đỏ "other (im2col, pool)" 63%; phần xanh lá "NPU run + poll" chỉ 7%.

**Lời thoại:**
"Em cũng muốn nói thẳng về nút thắt. Đây là phân tích thời gian của một ảnh. Thời gian mảng systolic thực sự tính toán chỉ chiếm chưa đến 1% tổng số chu kỳ; phần NPU chạy cộng thăm dò trạng thái là 7%. Phần lớn thời gian, 63% ở N bằng 8, nằm ở công việc phía CPU: dựng ma trận im2col, max-pooling và sắp xếp lại dữ liệu; thêm khoảng 28% là chép trọng số và kích hoạt qua bus. Khi tăng N từ 4 lên 8 thì lõi tính toán nhanh hơn nhưng phần phía CPU không đổi, nên hệ số tăng tốc bị chặn lại - đúng với định luật Amdahl. Vì vậy hướng cải tiến tiếp theo là đưa im2col và pooling vào phần cứng và dùng DMA."

---

## Cảnh 7 - LSTM và hiệu ứng batch (5:30 - 6:30)

**Màn hình:** terminal, sau đó `figures/a_cycles_cpu_vs_npu.png` (nhóm LSTM) và `figures/e_accuracy_table.png`.
**Lệnh:** `demo/run_demo.sh --only 5` (hoặc `make soc N=8 FW=lstm`). Thời gian ~30 giây.
**Chỉ vào:** ba dòng `cpu_only batch=1`, `npu batch=1`, `npu batch=16` (cột `cycles/img`); dòng tổng kết `batch=1 : 3.33x ... batch=16 : 16.38x`; `correct=16/16`, `mismatches vs golden: 0`.

**Lời thoại:**
"Với LSTM, em đọc ảnh MNIST theo 28 bước, mỗi bước là một hàng 28 điểm ảnh, trạng thái ẩn 16. Mỗi bước thời gian là đúng một phép nhân ma trận: ghép đầu vào và trạng thái ẩn trước đó, nhân với ma trận trọng số cho cả bốn cổng i, f, g, o. Sau đó sigmoid và tanh được tra bảng LUT ngay trong NPU, còn các phép nhân từng phần tử của ô nhớ c và trạng thái h do CPU làm. Điều thú vị là hiệu quả phụ thuộc rất nhiều vào kích thước batch. Với một ảnh một lúc, mỗi phép nhân chỉ có một hàng, mảng 8x8 hầu như để trống, nên chỉ tăng tốc 3,3 lần: 1,07 triệu so với 3,56 triệu chu kỳ. Khi gom 16 ảnh lại, mỗi lần gọi NPU xử lý 16 hàng, chi phí nạp trọng số được chia đều, còn 217 nghìn chu kỳ mỗi ảnh, tức nhanh hơn 16,4 lần. Về độ chính xác, lượng tử hóa INT8 gần như không làm mất gì: LeNet đi từ 98,83% xuống 98,85%, LSTM từ 97,58% xuống 97,50%."

---

## Cảnh 8 - Quy trình mã nguồn mở (6:30 - 7:00)

**Màn hình:** terminal hoặc thư mục dự án (`rtl/`, `fw/`, `Makefile`); có thể chạy `make test N=4` để chỉ lệnh.
**Lệnh:** `ls rtl fw` và `sed -n 1,40p Makefile` (chỉ các dòng `verilator`, `riscv64-unknown-elf-gcc`).
**Chỉ vào:** `rtl/sa_top.sv`, `rtl/npu_avmm.sv` (bản đồ thanh ghi ở đầu file), `third_party/picorv32`, các lệnh `verilator` và `riscv64-unknown-elf-gcc` trong Makefile.

**Lời thoại:**
"Toàn bộ luồng thiết kế ở đây là mã nguồn mở. RTL viết bằng SystemVerilog, mô phỏng bằng Verilator, lõi CPU là PicoRV32, firmware biên dịch bằng trình biên dịch GCC cho RISC-V, và tổng hợp thử bằng Yosys. Em có thể chạy lại mọi thứ chỉ bằng một dòng make. Cùng mã RTL và cùng firmware C được dùng lại cho FPGA, chỉ thay CPU bằng Nios V."

---

## Cảnh 9 - [CHỖ TRỐNG] Demo trên board DE10-Nano (7:00 - 7:40)

> **PLACEHOLDER - người quay điền vào khi board đã chạy.** Một thành viên khác đang chuẩn bị phần này; thay khối này bằng cảnh quay board.
>
> Nội dung gợi ý, 3 dòng:
> 1. Quay board DE10-Nano và lệnh nạp file `.sof` (Quartus Programmer hoặc `quartus_pgm`), thấy tiến trình nạp thành công.
> 2. Mở cửa sổ JTAG UART (`nios2-terminal` hoặc terminal của Nios V) và chỉ vào dòng kết quả: dự đoán chữ số, số chu kỳ CPU-only so với NPU, `ALL PASS`.
> 3. So sánh con số trên board với số liệu mô phỏng (ghi lại chu kỳ/ảnh và hệ số tăng tốc) và nói một câu nhận xét.

**Lời thoại (mẫu, sửa theo kết quả thật):**
"Sau mô phỏng, em nạp thiết kế lên board DE10-Nano. Em nạp file SOF qua JTAG, và đây là kết quả trên cổng JTAG UART: Nios V chạy cùng firmware, NPU trả về kết quả đúng, và số chu kỳ đo được là [điền số]. [Nhận xét so với mô phỏng.]"

---

## Cảnh 10 - Kết luận và hướng phát triển (7:40 - 8:15)

**Màn hình:** slide tóm tắt, hoặc `figures/a_cycles_cpu_vs_npu.png` làm nền.
**Lệnh:** không.
**Chỉ vào:** các hệ số 6,9x (CNN), 16,4x (LSTM batch 16), độ chính xác INT8.

**Lời thoại:**
"Tóm lại, em đã thiết kế và kiểm chứng một bộ nhân ma trận INT8 systolic array, tích hợp qua Avalon-MM vào hệ thống RISC-V, và chạy được cả CNN lẫn LSTM với độ chính xác INT8 gần bằng số thực: tăng tốc 6,9 lần cho LeNet-5 và tới 16,4 lần cho LSTM khi gom batch. Hạn chế hiện tại là phần lớn thời gian nằm ở CPU, nhất là im2col, pooling và chép dữ liệu. Hướng phát triển là bộ im2col bằng phần cứng, DMA để cấp dữ liệu trực tiếp cho NPU, mảng lớn hơn như 16x16, và chạy đầy đủ trên board DE10-Nano với Nios V. Em xin cảm ơn thầy cô và các bạn đã theo dõi."

---

### Ghi chú quay phim
- Phông chữ terminal lớn (>= 16 pt), nền tối; chữ ASCII rộng 58 cột nên cửa sổ cần >= 70 cột, >= 45 dòng.
- Nếu một lần chạy trực tiếp bị lỗi, dùng bản lưu `demo/demo_output/stage*.txt` làm dự phòng (cùng nội dung, đã bỏ mã màu).
- Số chu kỳ có thể lệch vài chục đơn vị giữa các ảnh (ngắt, bộ đếm), nhưng hệ số tăng tốc ổn định ở 6,89x.
