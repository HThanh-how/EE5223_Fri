// SoC mô phỏng nối PicoRV32, RAM 256 KiB và NPU qua bridge native/Avalon.
// N, DEPTH cấu hình NPU; FW là ảnh hex nạp RAM. resetn reset CPU và bridge.
// Kiểm tra: make soc N=8 FW=cnn (N là kích thước mảng, FW chọn chương trình).
// Simulation SoC: PicoRV32 + 256 KiB RAM + sim UART/exit + Avalon-MM bridge to npu_avmm.
//   0x0000_0000 RAM (256 KiB)
//   0x1000_0000 putchar (W)      0x1000_0004 exit (W, value = exit code)
//   0x2000_0000 NPU (Avalon-MM, 64 KiB)
module soc_top #(
    parameter N     = 4,
    parameter DEPTH = 64,
    parameter FW    = "fw.hex"
) (
    input logic clk,
    input logic resetn
);
    logic        mem_valid, mem_instr, trap;
    logic        mem_ready;
    logic [31:0] mem_addr, mem_wdata, mem_rdata;
    logic [3:0]  mem_wstrb;

    // CPU dùng native bus: mem_valid giữ request tới khi mem_ready, wstrb!=0 là write.
    // Instruction và data dùng chung bus; mem_instr có ở cổng nhưng decode không tách.
    // Reset vector=0 khớp fw/link.ld; STACKADDR=0x40000 khớp fw/start.S.
    // Bật M extension/counters cho firmware rv32im_zicsr và phép đo rdcycle.
    picorv32 #(
        .ENABLE_COUNTERS(1), .ENABLE_COUNTERS64(1),
        .ENABLE_FAST_MUL(1), .ENABLE_DIV(1),
        .COMPRESSED_ISA(0), .BARREL_SHIFTER(1),
        .PROGADDR_RESET(32'h0), .STACKADDR(32'h0004_0000)
    ) u_cpu (
        .clk, .resetn, .trap,
        .mem_valid, .mem_instr, .mem_ready, .mem_addr, .mem_wdata, .mem_wstrb, .mem_rdata,
        .mem_la_read(), .mem_la_write(), .mem_la_addr(), .mem_la_wdata(), .mem_la_wstrb(),
        .pcpi_valid(), .pcpi_insn(), .pcpi_rs1(), .pcpi_rs2(),
        .pcpi_wr(1'b0), .pcpi_rd(32'b0), .pcpi_wait(1'b0), .pcpi_ready(1'b0),
        .irq(32'b0), .eoi(), .trace_valid(), .trace_data()
    );

    // 65536 word * 4 byte = 256 KiB; ram index [17:2] bỏ hai bit byte offset.
    // Zero-fill trước $readmemh cung cấp .bss=0, ảnh hex chứa .text/.rodata/.data.
    // RAM chỉ khởi tạo ở initial, resetn không tải lại firmware hoặc xóa RAM.
    logic [31:0] ram [0:65535];
    initial begin
        for (int i = 0; i < 65536; i++) ram[i] = 32'd0;
        $readmemh(FW, ram);
    end

    // ---- Avalon-MM master signals driven by the bridge ----
    logic [13:0] avs_address;
    logic        avs_read, avs_write, avs_readdatavalid, avs_waitrequest;
    logic [31:0] avs_writedata, avs_readdata;

    npu_avmm #(.N(N), .DEPTH(DEPTH)) u_npu (
        .clk, .reset_n(resetn),
        .avs_address, .avs_read, .avs_write, .avs_writedata,
        .avs_readdata, .avs_readdatavalid, .avs_waitrequest
    );

    // Bridge chỉ cho một read đang chờ: ph=0 phát read, ph=1 chờ readdatavalid.
    // Địa chỉ byte CPU bỏ hai bit thấp để thành word address; write được nhận ngay.
    // Memory map danh nghĩa dùng base 0x0 RAM, 0x10000000 UART, 0x20000000 NPU.
    // Decode mô phỏng RAM chỉ xét nibble [31:28]==0 nên alias mỗi 256 KiB.
    // NPU xét nibble ==2 và chỉ truyền [15:2], nên cửa sổ 64 KiB cũng có alias.
    // Firmware chỉ dùng địa chỉ chuẩn trong map; đây không phải bộ bảo vệ địa chỉ.
    // NPU không nhận byteenable: mọi mem_wstrb!=0 trở thành write nguyên word.
    wire npu_sel = mem_valid && mem_addr[31:28] == 4'h2;
    wire is_wr   = |mem_wstrb;
    logic ph;   // 0 = issue read, 1 = wait for readdatavalid

    // Đường đi store/load: C volatile -> PicoRV32 native -> bridge -> Avalon NPU.
    // [15:2] đổi byte address thành word address 14 bit, bỏ base 0x20000000.
    // !mem_ready ngăn phát lặp write ở cạnh CPU đang nhận acknowledgement.
    // ph ngăn phát lại read khi request native vẫn giữ mem_valid trong lúc chờ.
    assign avs_address   = mem_addr[15:2];
    assign avs_writedata = mem_wdata;
    assign avs_write     = npu_sel && is_wr  && !mem_ready;
    assign avs_read      = npu_sel && !is_wr && !mem_ready && !ph;

    always_ff @(posedge clk) begin
        if (!resetn) begin
            mem_ready <= 0; ph <= 0; mem_rdata <= '0;
        end else begin
            // mem_ready mặc định hạ mỗi cạnh để mỗi request chỉ được acknowledge một lần.
            // Nhánh RAM đọc cả word; bốn wstrb chọn byte store, hỗ trợ sb/sh của CPU.
            mem_ready <= 0;
            if (mem_valid && !mem_ready) begin
                if (mem_addr[31:28] == 4'h0) begin
                    mem_rdata <= ram[mem_addr[17:2]];
                    if (mem_wstrb[0]) ram[mem_addr[17:2]][7:0]   <= mem_wdata[7:0];
                    if (mem_wstrb[1]) ram[mem_addr[17:2]][15:8]  <= mem_wdata[15:8];
                    if (mem_wstrb[2]) ram[mem_addr[17:2]][23:16] <= mem_wdata[23:16];
                    if (mem_wstrb[3]) ram[mem_addr[17:2]][31:24] <= mem_wdata[31:24];
                    mem_ready <= 1;
                // Cổng putchar nhận byte thấp và in ngay bằng $write, không mô hình baud rate.
                // Cổng exit in giá trị firmware trả rồi $finish kể cả mã khác 0.
                // Do đó regression cần xem RESULT/exit code trong log, không chỉ process exit.
                end else if (mem_addr == 32'h1000_0000 && is_wr) begin
                    $write("%c", mem_wdata[7:0]);
                    mem_ready <= 1;
                end else if (mem_addr == 32'h1000_0004 && is_wr) begin
                    $display("[soc] exit code %0d", mem_wdata);
                    $finish;
                // Write NPU được acknowledge ngay vì waitrequest luôn 0 trong wrapper hiện tại.
                // Bridge này không chờ avs_waitrequest; không dùng nguyên xi với slave có stall.
                // Read: cạnh issue đặt ph=1, cạnh có readdatavalid chốt data và mem_ready.
                // Chờ response đăng ký là bắt buộc do read latency 1, tránh đọc giá trị cũ.
                end else if (npu_sel) begin
                    if (is_wr) begin
                        mem_ready <= 1;
                    end else if (!ph) begin
                        ph <= 1;
                    end else if (avs_readdatavalid) begin
                        mem_rdata <= avs_readdata;
                        mem_ready <= 1;
                        ph <= 0;
                    end
                // Địa chỉ không khớp được hoàn tất với read data=0, không trap bus error.
                // Trap CPU là đường báo riêng để tb_soc phát hiện lệnh/luồng thực thi lỗi.
                end else begin
                    mem_rdata <= '0;
                    mem_ready <= 1;
                end
            end
        end
    end
endmodule
