// 1-cycle delay (what delay.sv #(D=1) becomes). W is a parameter.
module delay1 #(parameter W = 8) (
    input clk, input rst_n, input [W-1:0] din, output reg [W-1:0] dout);
    always @(posedge clk or negedge rst_n)
        if (!rst_n) dout <= 0; else dout <= din;
endmodule
