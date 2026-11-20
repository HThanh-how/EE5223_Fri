# Đối chiếu cập nhật báo cáo EE5223 — Nhóm 5

Ngày đối chiếu: 20/11/2026. Tài liệu nguồn: `D:\Phd\EE5223_Fri\Nhóm 5 - 100% 20261120.docx`.
Đã đọc toàn bộ `word/document.xml` bằng Python `-I`, `zipfile` và regex, gồm các đoạn trong bảng; dấu highlight yellow chỉ dùng để nhận diện yêu cầu, không coi các khẳng định kỹ thuật trong Word là bằng chứng.
Đã đọc `report.tex`, toàn bộ `tex/*.tex`, mười chương, năm phụ lục, `references.bib`, README và năm tệp RTL yêu cầu. Đối chiếu số liệu với `results/*.log`, `model/README.txt`, `de10/reports/niosv_g/fmax.txt` và fitter report.

## Ánh xạ đề cương Word sang LaTeX

Word chương 3 → LaTeX chương 4; Word 5.1 → chương 6 và 8; Word 5.2–5.4 → chương 7 và 8; Word 5.5 → chương 7 và 9; Word chương 6 → chương 10. Không ép LaTeX thành sáu chương và không đánh số sai mục 5.5 vào chương kết quả hiện tại.

“Đã có” là đủ nội dung nền; “Mở rộng” là có nhưng cần bổ sung/định nghĩa rõ; “Thiếu” là chưa có phần riêng đáp ứng mục đó. Các tiêu đề trùng nội dung được gộp thành 28 hạng mục để đếm.

| # | Yêu cầu tô vàng | Trước cập nhật: đã có ở đâu / trạng thái | Bổ sung hoặc nơi đáp ứng cuối |
|---|---|---|---|
| 1 | Sơ đồ tổng thể | Mở rộng: ch04, hình raster | `tex/figures/fig_system.tex`, `fig:system-rtl`; giữ label `fig:block`, phân biệt SoC mô phỏng và DE10 |
| 2 | Systolic Array | Mở rộng: ch02 wavefront; ch04 mô tả | `fig_systolic.tex`, `fig:systolic-rtl`: PE, W ngoài PE, A ngang, psum dọc |
| 3 | Skew/De-skew | Thiếu sơ đồ riêng; có công thức ch04 | `fig_skew_deskew.tex`, `fig:skew-deskew`, trễ i và N−1−j, valid 2N−1 |
| 4 | Wrapper Avalon-MM | Thiếu sơ đồ riêng; có bản đồ thanh ghi ch04 | `fig_wrapper.tex`, `fig:wrapper-rtl`: decode, buffers, sequencer, read latency |
| 5 | Datapath hậu xử lý | Thiếu sơ đồ riêng; có mô tả hai tầng ch04 | `fig_postprocess.tex`, `fig:postprocess-rtl`: ACCUM, bias, nhân, round/shift, saturate, ACT |
| 6 | Phương pháp kiểm chứng, Verilator/ModelSim | Mở rộng: ch06 bốn tầng và sơ đồ đối chiếu | Thêm môi trường, CPU-only/CPU+NPU, không nhận là đã chạy ModelSim |
| 7 | Chạy trên FPGA nếu có | Đã có: ch08 trạng thái và quy trình | Giữ trạng thái chưa chạy board, thay ô TODO bằng “Chưa đo”, không gán PASS thực tế |
| 8 | Hiện thực DE10-Nano | Mở rộng: ch08 fit toàn SoC | Thêm số bit bộ nhớ, DSP theo fitter, Fmax chính xác 72,56 MHz |
| 9 | Latency | Mở rộng: ch04 pipeline, ch07 chu kỳ | ch07_metrics: phân biệt hàng/lượt/ảnh và quy đổi t=C/f tại 50 MHz giả định |
| 10 | Throughput GOPS | Thiếu mục riêng | ch07_metrics, `eq:gops`, bảng `tab:derived-performance`, peak và useful GOPS |
| 11 | PE utilization | Mở rộng: ch07 busy utilization | `eq:utilization`: U_busy và U_end, denominator/đệm/pipeline rõ ràng |
| 12 | Số chu kỳ | Đã có: ch07 bảng GEMM/CNN/LSTM | Giữ log gốc, 741/2964 lượt, phân biệt busy và host |
| 13 | Công suất, hiệu quả năng lượng | Thiếu đánh giá riêng | ch08 `sec:power-energy`: “chưa đo trên board”, phương pháp Power Analyzer/VCD/đo dòng, công thức E và GOPS/W, không số giả |
| 14 | Tài nguyên và chi phí diện tích | Mở rộng: ch08 fitter | `sec:area-cost`: toàn SoC so với NPU, % bit so với % khối RAM, không đổi ALM thành mm² |
| 15 | Dataflow và sparsity/pruning | Mở rộng: ch02 WS, ch05 tiling, ch10 hướng sparse | ch09 `sec:sparsity`: RTL dense, số 0 chưa giảm chu kỳ; hướng pruning có cấu trúc và điều kiện đúng |
| 16 | Arithmetic intensity/băng thông | Thiếu định lượng riêng | ch07 `sec:arithmetic-intensity`: ranh giới Avalon, byte payload, cận roofline lý tưởng và giới hạn |
| 17 | Demo LeNet | Đã có: ch05 ánh xạ, ch06 kiểm chứng, ch07 kết quả | Giữ 98,85% INT8/98,83% float; 8 ảnh RTL khác 10.000 ảnh mô hình số nguyên |
| 18 | So sánh thuần phần mềm RISC-V | Đã có: ch05 cpu_matmul, ch07 bảng | Giữ baseline PicoRV32; ch06 nêu hai đường dữ liệu và điều kiện công bằng |
| 19 | CPU ARM/x86 nếu có | Thiếu phạm vi so sánh riêng | ch09 `sec:modern-cpu`: chưa benchmark, HPS chưa dùng; không có số để so sánh định lượng |
| 20 | Bảng tốc độ/chu kỳ/hiệu suất | Mở rộng: ch07 chu kỳ, speedup, utilization | Thêm bảng ms/ảnh, ảnh/s, useful GOPS cùng giả thiết và công thức |
| 21 | 5.5 phân tích/nhận xét | Đã có: ch07 profile/Amdahl, ch09 | Thêm kết nối với bandwidth, pruning và phạm vi kết luận ở ch09 |
| 22 | 6.1 Kết luận | Đã có: ch10.1 | Giữ kết luận với ranh giới mô phỏng/fit/board rõ |
| 23 | 6.2 Hạn chế | Mở rộng: trước đây tập trung ch09 | Thêm ch10.2 Hạn chế của đề tài, tham chiếu ch09 |
| 24 | 6.3 Hướng phát triển | Đã có: ch10 | Đặt thành ch10.3, thêm ưu tiên đo board/công suất/baseline |
| 25 | Phụ lục | Mở rộng: appA–appE | appE thêm bảng truy nguyên số liệu và cách tính lại chỉ số |
| 26 | Bảng / danh mục bảng | Đã có: report.tex listoftables và bảng từng chương | Giữ danh mục tự sinh, thêm bảng chỉ số và nguồn dữ liệu |
| 27 | Từ viết tắt | Mở rộng: tex/acronyms.tex chưa đủ | Hoàn thiện thuật ngữ xuất hiện trong các chương/phụ lục, sắp danh mục |
| 28 | Tài liệu tham khảo | Đã có: references.bib và biblatex | Giữ thư mục tài liệu, không thêm dữ liệu thư mục chưa kiểm tra; kiểm tra biber/citation khi build |

Tổng phân loại trước cập nhật: **9 đã có, 12 cần mở rộng, 7 thiếu phần riêng**. Sau cập nhật: cả 28 mục có vị trí nội dung; ba loại bằng chứng thực nghiệm vẫn chưa có là chạy board vật lý, công suất/năng lượng và ARM/x86. Đã nêu giới hạn và cách đo thay vì điền số không có nguồn. PPT chỉnh sửa được thuộc worker khác, không tạo/sửa `slides/` trong tác vụ này.

## Quyết định kỹ thuật và nguồn

- Năm hình là TikZ vector đen/trắng, input trong ch04, cùng chú giải. Trọng số là thanh ghi trong sa_top, ngoài PE; không vẽ SRAM W độc lập, DMA, sparse decoder hoặc khối pooling không tồn tại.
- Datapath RTL gốc có prod 48 bit, hàm post tính round/shift trong 64 bit, hai tầng; biến thể rtl_fpga của DE10 có thêm tầng và được mô tả riêng trong ch08.
- Word có bảng conv1 dùng C_p=16 và 72 lượt nhưng vẫn ghi tổng 741. Giữ giá trị đúng trong LaTeX: C_p=8, 36 lượt conv1, tổng 741 (N=8), 2964 (N=4), theo log và ánh xạ thực tế.
- Danh tính bìa lấy từ Word: Phạm Tuấn An 2470215; Phạm Huy Thanh 2570317; Vũ Tiến Giang 2570188; giảng viên Trương Quang Vinh; Nhóm 5.
- Không đổi các phần khảo sát ECP5 có sẵn thành kết quả DE10; không lấy số mới từ `synth/results.md`. Những bảng khảo sát sẵn có được giữ với nhãn thiết bị riêng.
- `de10/reports/niosv_g/de10_nano_npu.fit.rpt`: 6758/41910 ALM (16%), 8603 registers, 2433272/5662720 memory bits (43%), 319/553 M10K (58%), 51/112 DSP (46%). `fmax.txt`: CLOCK_50 Slow 1100mV 100C 72.56 MHz. Đây là toàn SoC, không phải mảng riêng.

## Các phép tính bổ sung (tính toán/ước lượng)

Quy ước 1 MAC = 2 ops. Chu kỳ từ log PicoRV32; f=50e6 Hz chỉ là mốc quy đổi giả định, không phải đo Nios V trên board.

- Q_LeNet=576×25×6+64×150×16+256×120+120×84+84×10=281640 MAC/ảnh; Q_LSTM=28×44×64+16×10=79008. Kích thước lấy từ `model/README.txt`.
- t=C/f; ảnh/s=f/C; GOPS_useful=2Qf/(C×1e9); GOPS_peak=2N²f/1e9=6.4 với N=8.
- LeNet CPU/NPU: 13254324/1923665=6.89014×; t=265.08648/38.47330 ms; GOPS=0.00212489/0.01464080.
- LSTM CPU/batch1/batch16: C=3559094/1068230/217262; t=71.18188/21.36460/4.34524 ms bình quân/ảnh; GOPS=0.00221989/0.00739616/0.03636531. Batch16 latency toàn batch≈69.524 ms, chưa gồm gom batch.
- U_busy=Q/(N²×C_busy), U_end=Q/(N²×C_host). LeNet N=8: 25.4401%/0.228763%; LSTM batch1: 5.33446%/0.115565%, batch16: 45.5535%/0.568208% (busy/ảnh từ log đã làm tròn).
- GEMM M=64,N=8: Q=4096 MAC; B32=N²+MN+4MN=2624 bytes; I32=8192/2624=3.12195 ops/byte. Nếu chỉ đọc INT8 một tile QUANT: B8=N²+2MN=1088, I8=7.52941 ops/byte, bỏ qua bias/config và tile K trước.
- Cận bus lý tưởng β=4f=200 MB/s; min(6.4, I32×β/1e9)=0.62439 GOPS, không phải số đo. GEMM host log 28209 chu kỳ cho useful GOPS=8192×50e6/(28209×1e9)≈0.01452.
- Không có số công suất/năng lượng, không có benchmark ARM/x86. Công thức dự kiến E_img=∫Pdt/B, η=2QB/(1e9×P_avg×Δt); chỉ điền sau phép đo đúng phạm vi.

## Biên dịch và kiểm tra

Sẽ cập nhật phần này sau khi build và kiểm tra hình của PDF cuối.
