// Testbench clock/reset cho soc_top; theo dõi trap, timeout và tùy chọn +vcd.
// Kiểm tra: make soc N=8 FW=selftest (N cấu hình mảng, FW chọn firmware).
`timescale 1ns/1ps
module tb_soc;
    logic clk = 0, resetn = 0;
    // Đơn vị timescale là ns nên nửa chu kỳ 5 ns tạo clock mô phỏng 100 MHz.
    // Cycle count là số cạnh clock, không tự chuyển thành thời gian board 50 MHz.
    always #5 clk = ~clk;

    // NPU_N đến từ Makefile -D và phải khớp firmware -DNN; DEPTH cố định 64.
    // FW="fw.hex" được tìm trong cwd; make soc copy file FW.hex vào thư mục build.
    soc_top #(.N(`NPU_N), .DEPTH(64), .FW("fw.hex")) dut (.clk, .resetn);

    initial begin
        // make soc-wave N=8 FW=selftest truyền +vcd, ghi soc.vcd chỉ dưới u_npu.
        // Không dump CPU/RAM để giới hạn dung lượng waveform khi inference chạy dài.
        if ($test$plusargs("vcd")) begin
            $dumpfile("soc.vcd");
            $dumpvars(0, dut.u_npu);
        end
        // Giữ reset 10 cạnh để CPU/bridge/PE/valid đều về trạng thái ban đầu.
        // Sau thả reset, firmware tự chạy; testbench không tự so golden hay đọc register.
        repeat (10) @(posedge clk);
        resetn = 1;
        // 900 triệu cạnh là watchdog cho chương trình không thoát; in TIMEOUT rồi finish.
        // Các phép kiểm số học và RESULT nằm trong firmware; soc_top in exit code.
        repeat (900_000_000) @(posedge clk);
        $display("[tb] TIMEOUT");
        $finish;
    end

    // Chỉ kiểm trap sau reset để không coi trạng thái khởi tạo là lỗi.
    // CPU TRAP thường chỉ ra lệnh không hỗ trợ hoặc firmware sai; không là mismatch NPU.
    always @(posedge clk) if (resetn && dut.trap) begin
        $display("[tb] CPU TRAP");
        $finish;
    end
endmodule
