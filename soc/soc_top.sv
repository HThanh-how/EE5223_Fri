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

    wire npu_sel = mem_valid && mem_addr[31:28] == 4'h2;
    wire is_wr   = |mem_wstrb;
    logic ph;   // 0 = issue read, 1 = wait for readdatavalid

    assign avs_address   = mem_addr[15:2];
    assign avs_writedata = mem_wdata;
    assign avs_write     = npu_sel && is_wr  && !mem_ready;
    assign avs_read      = npu_sel && !is_wr && !mem_ready && !ph;

    always_ff @(posedge clk) begin
        if (!resetn) begin
            mem_ready <= 0; ph <= 0; mem_rdata <= '0;
        end else begin
            mem_ready <= 0;
            if (mem_valid && !mem_ready) begin
                if (mem_addr[31:28] == 4'h0) begin
                    mem_rdata <= ram[mem_addr[17:2]];
                    if (mem_wstrb[0]) ram[mem_addr[17:2]][7:0]   <= mem_wdata[7:0];
                    if (mem_wstrb[1]) ram[mem_addr[17:2]][15:8]  <= mem_wdata[15:8];
                    if (mem_wstrb[2]) ram[mem_addr[17:2]][23:16] <= mem_wdata[23:16];
                    if (mem_wstrb[3]) ram[mem_addr[17:2]][31:24] <= mem_wdata[31:24];
                    mem_ready <= 1;
                end else if (mem_addr == 32'h1000_0000 && is_wr) begin
                    $write("%c", mem_wdata[7:0]);
                    mem_ready <= 1;
                end else if (mem_addr == 32'h1000_0004 && is_wr) begin
                    $display("[soc] exit code %0d", mem_wdata);
                    $finish;
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
                end else begin
                    mem_rdata <= '0;
                    mem_ready <= 1;
                end
            end
        end
    end
endmodule
