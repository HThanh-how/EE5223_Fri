// Firmware-level check of the DE10 build WITHOUT the (encrypted, Questa-only) Nios V model:
// PicoRV32 + npu_avmm, but with the DE10-Nano Platform Designer memory map and register
// models of the JTAG UART, Nios V mtime and LED PIO. Runs the same de10/fw ELF code
// (only crt0's `csrw mtvec` is compiled out with -DPICORV_SIM, PicoRV32 has no mtvec).
//   0x0000_0000 RAM 256 KiB   0x2000_0000 NPU   0x2002_0000 mtime
//   0x2002_0040 JTAG UART (data/control)          0x2002_0050 LED PIO (sim ends on DONE bit)
`timescale 1ns/1ps
module tb_de10_map;
    parameter N = 8;
    logic clk = 0, resetn = 0;
    always #10 clk = ~clk;                     // 50 MHz
    initial begin repeat (20) @(posedge clk); resetn = 1; end

    logic        mem_valid, mem_instr, trap, mem_ready;
    logic [31:0] mem_addr, mem_wdata, mem_rdata;
    logic [3:0]  mem_wstrb;

    picorv32 #(
        .ENABLE_COUNTERS(1), .ENABLE_COUNTERS64(1), .ENABLE_FAST_MUL(1), .ENABLE_DIV(1),
        .COMPRESSED_ISA(0), .BARREL_SHIFTER(1), .PROGADDR_RESET(32'h0), .STACKADDR(32'h0004_0000)
    ) u_cpu (
        .clk, .resetn, .trap, .mem_valid, .mem_instr, .mem_ready, .mem_addr, .mem_wdata, .mem_wstrb, .mem_rdata,
        .mem_la_read(), .mem_la_write(), .mem_la_addr(), .mem_la_wdata(), .mem_la_wstrb(),
        .pcpi_valid(), .pcpi_insn(), .pcpi_rs1(), .pcpi_rs2(),
        .pcpi_wr(1'b0), .pcpi_rd(32'b0), .pcpi_wait(1'b0), .pcpi_ready(1'b0),
        .irq(32'b0), .eoi(), .trace_valid(), .trace_data()
    );

    logic [31:0] ram [0:65535];
    initial begin
        for (int i = 0; i < 65536; i++) ram[i] = 32'd0;
        $readmemh("fw.hex", ram);
    end

    logic [63:0] mtime = 0;
    always_ff @(posedge clk) mtime <= mtime + 1;

    logic [13:0] avs_address;
    logic        avs_read, avs_write, avs_readdatavalid, avs_waitrequest;
    logic [31:0] avs_writedata, avs_readdata;
    npu_avmm #(.N(N), .DEPTH(64)) u_npu (
        .clk, .reset_n(resetn), .avs_address, .avs_read, .avs_write, .avs_writedata,
        .avs_readdata, .avs_readdatavalid, .avs_waitrequest
    );

    wire npu_sel = mem_valid && mem_addr[31:16] == 16'h2000;
    wire is_wr   = |mem_wstrb;
    logic ph;
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
                if (mem_addr < 32'h0004_0000) begin
                    mem_rdata <= ram[mem_addr[17:2]];
                    if (mem_wstrb[0]) ram[mem_addr[17:2]][7:0]   <= mem_wdata[7:0];
                    if (mem_wstrb[1]) ram[mem_addr[17:2]][15:8]  <= mem_wdata[15:8];
                    if (mem_wstrb[2]) ram[mem_addr[17:2]][23:16] <= mem_wdata[23:16];
                    if (mem_wstrb[3]) ram[mem_addr[17:2]][31:24] <= mem_wdata[31:24];
                    mem_ready <= 1;
                end else if (npu_sel) begin
                    if (is_wr) mem_ready <= 1;
                    else if (!ph) ph <= 1;
                    else if (avs_readdatavalid) begin mem_rdata <= avs_readdata; mem_ready <= 1; ph <= 0; end
                end else begin
                    mem_ready <= 1;
                    mem_rdata <= '0;
                    case (mem_addr)
                        32'h2002_0000: mem_rdata <= mtime[31:0];
                        32'h2002_0004: mem_rdata <= mtime[63:32];
                        32'h2002_0040: if (is_wr) $write("%c", mem_wdata[7:0]);
                        32'h2002_0044: mem_rdata <= 32'h0400_0000;   // WSPACE = 1024
                        32'h2002_0050: if (is_wr) begin
                            $display("[tb] LED PIO = 0x%02x", mem_wdata[7:0]);
                            if (mem_wdata[2]) begin
                                $display("[tb] firmware finished: %s", mem_wdata[3] ? "PASS" : "FAIL");
                                $finish;
                            end
                        end
                        default: ;
                    endcase
                end
            end
        end
    end
    always @(posedge clk) if (resetn && trap) begin $display("[tb] CPU TRAP at pc ~0x%08x", mem_addr); $finish; end
endmodule
