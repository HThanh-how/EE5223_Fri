// Plain-Verilog top equal to sa_top.sv with N=2. Differences vs real sa_top: weights are input ports (stationary),
// instead of the w_we/w_widx write port + weight register file; delay chains are explicit chains of delay1.
module sa2(input clk, input rst_n, input in_valid,
  input signed [7:0] a0,
  input signed [7:0] a1,
  input signed [7:0] w00,
  input signed [7:0] w01,
  input signed [7:0] w10,
  input signed [7:0] w11,
  output signed [31:0] c0,
  output signed [31:0] c1,
  output out_valid);
  wire signed [7:0] ab0_0 = a0;
  wire signed [7:0] sk1_0; delay1 #(.W(8)) usk1_0(.clk(clk),.rst_n(rst_n),.din(a1),.dout(sk1_0));
  wire signed [7:0] ab1_0 = sk1_0;
  wire signed [31:0] ps0_0 = 32'sd0;
  wire signed [31:0] ps0_1 = 32'sd0;
  wire signed [31:0] ps1_0;
  wire signed [31:0] ps1_1;
  wire signed [31:0] ps2_0;
  wire signed [31:0] ps2_1;
  wire signed [7:0] ab0_1;
  wire signed [7:0] ab0_2;
  wire signed [7:0] ab1_1;
  wire signed [7:0] ab1_2;
  pe u_pe00(.clk(clk),.rst_n(rst_n),.w(w00),.a_in(ab0_0),.psum_in(ps0_0),.a_out(ab0_1),.psum_out(ps1_0));
  pe u_pe01(.clk(clk),.rst_n(rst_n),.w(w01),.a_in(ab0_1),.psum_in(ps0_1),.a_out(ab0_2),.psum_out(ps1_1));
  pe u_pe10(.clk(clk),.rst_n(rst_n),.w(w10),.a_in(ab1_0),.psum_in(ps1_0),.a_out(ab1_1),.psum_out(ps2_0));
  pe u_pe11(.clk(clk),.rst_n(rst_n),.w(w11),.a_in(ab1_1),.psum_in(ps1_1),.a_out(ab1_2),.psum_out(ps2_1));
  wire signed [31:0] ds0_0; delay1 #(.W(32)) uds0_0(.clk(clk),.rst_n(rst_n),.din(ps2_0),.dout(ds0_0));
  assign c0 = ds0_0;
  assign c1 = ps2_1;
  wire v0; delay1 #(.W(1)) uv0(.clk(clk),.rst_n(rst_n),.din(in_valid),.dout(v0));
  wire v1; delay1 #(.W(1)) uv1(.clk(clk),.rst_n(rst_n),.din(v0),.dout(v1));
  wire v2; delay1 #(.W(1)) uv2(.clk(clk),.rst_n(rst_n),.din(v1),.dout(v2));
  assign out_valid = v2;
endmodule
