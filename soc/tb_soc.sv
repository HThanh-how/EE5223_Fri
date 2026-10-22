`timescale 1ns/1ps
module tb_soc;
    logic clk = 0, resetn = 0;
    always #5 clk = ~clk;

    soc_top #(.N(`NPU_N), .DEPTH(64), .FW("fw.hex")) dut (.clk, .resetn);

    initial begin
        if ($test$plusargs("vcd")) begin
            $dumpfile("soc.vcd");
            $dumpvars(0, dut.u_npu);
        end
        repeat (10) @(posedge clk);
        resetn = 1;
        repeat (900_000_000) @(posedge clk);
        $display("[tb] TIMEOUT");
        $finish;
    end

    always @(posedge clk) if (resetn && dut.trap) begin
        $display("[tb] CPU TRAP");
        $finish;
    end
endmodule
