// Plain-Verilog copy of rtl/pe.sv (always_ff->always, logic->reg/wire, 32'(a*w) -> signed context extension).
// Functionally identical to the SystemVerilog original (async active-low reset, same registers).
module pe (
    input  clk,
    input  rst_n,
    input  signed [7:0]  w,
    input  signed [7:0]  a_in,
    input  signed [31:0] psum_in,
    output reg signed [7:0]  a_out,
    output reg signed [31:0] psum_out
);
    wire signed [15:0] prod = a_in * w;   // 8x8 signed multiplier
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            a_out    <= 8'sd0;
            psum_out <= 32'sd0;
        end else begin
            a_out    <= a_in;
            psum_out <= psum_in + prod;   // sign-extended to 32 bits
        end
    end
endmodule
