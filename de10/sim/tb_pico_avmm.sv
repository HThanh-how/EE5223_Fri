// Check of the PicoRV32 fallback CPU wrapper (ip/picorv32_avmm.sv) as an Avalon-MM master:
// simple Avalon fabric with RANDOM waitrequest on every slave and variable read latency
// (RAM: readdatavalid 1..3 cycles after acceptance), npu_avmm attached as in Platform Designer,
// JTAG UART / LED PIO register models at the DE10 addresses. Ends when the LED PIO DONE bit is set.
`timescale 1ns/1ps
module tb_pico_avmm;
    parameter N = 8;
    logic clk = 0, rst_n = 0;
    always #10 clk = ~clk;
    initial begin repeat (20) @(posedge clk); rst_n = 1; end

    logic [31:0] a, wd, rd;
    logic [3:0]  be;
    logic        r, w, rdv, wr_req, trap;
    logic        wt;
    picorv32_avmm u_cpu (
        .clk, .reset_n(rst_n), .avm_address(a), .avm_byteenable(be), .avm_read(r), .avm_write(w),
        .avm_writedata(wd), .avm_readdata(rd), .avm_readdatavalid(rdv), .avm_waitrequest(wt), .cpu_trap(trap)
    );

    logic [31:0] ram [0:65535];
    initial begin
        for (int i = 0; i < 65536; i++) ram[i] = 32'd0;
        $readmemh("fw.hex", ram);
    end

    // NPU slave (no waitrequest, readdatavalid 1 cycle later)
    wire npu_sel = a[31:16] == 16'h2000;
    logic [31:0] npu_rd; logic npu_rdv, npu_wt;
    npu_avmm #(.N(N), .DEPTH(64)) u_npu (
        .clk, .reset_n(rst_n), .avs_address(a[15:2]), .avs_read(r && npu_sel), .avs_write(w && npu_sel),
        .avs_writedata(wd), .avs_readdata(npu_rd), .avs_readdatavalid(npu_rdv), .avs_waitrequest(npu_wt)
    );

    // random waitrequest for non-NPU slaves, random read latency
    logic [31:0] lfsr = 32'hACE1_2468;
    always_ff @(posedge clk) lfsr <= {lfsr[30:0], lfsr[31] ^ lfsr[21] ^ lfsr[1] ^ lfsr[0]};
    assign wt = npu_sel ? npu_wt : lfsr[3];

    logic [1:0]  lat;
    logic        pend;
    logic [31:0] pend_data;
    always_ff @(posedge clk) begin
        if (!rst_n) begin pend <= 0; lat <= 0; end
        else begin
            if ((r || w) && !wt && !npu_sel) begin
                if (a < 32'h0004_0000) begin
                    if (w) begin
                        for (int b = 0; b < 4; b++) if (be[b]) ram[a[17:2]][8*b +: 8] <= wd[8*b +: 8];
                    end else begin
                        pend <= 1; lat <= lfsr[9:8]; pend_data <= ram[a[17:2]];
                    end
                end else begin
                    if (w && a == 32'h2002_0040) $write("%c", wd[7:0]);
                    if (w && a == 32'h2002_0050) begin
                        $display("[tb] LED PIO = 0x%02x", wd[7:0]);
                        if (wd[2]) begin $display("[tb] firmware finished: %s", wd[3] ? "PASS" : "FAIL"); $finish; end
                    end
                    if (r) begin
                        pend <= 1; lat <= 0;
                        pend_data <= (a == 32'h2002_0044) ? 32'h0400_0000 : 32'h0;
                    end
                end
            end else if (pend) begin
                if (lat == 0) pend <= 0; else lat <= lat - 1'b1;
            end
        end
    end
    assign rdv = npu_rdv | (pend && lat == 0);
    assign rd  = npu_rdv ? npu_rd : pend_data;

    always @(posedge clk) if (rst_n && trap) begin $display("[tb] PicoRV32 TRAP"); $finish; end
endmodule
