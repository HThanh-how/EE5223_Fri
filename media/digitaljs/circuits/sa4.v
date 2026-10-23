// Plain-Verilog top equal to sa_top.sv with N=4. Differences vs real sa_top: weights are input ports (stationary),
// instead of the w_we/w_widx write port + weight register file; delay chains are explicit chains of delay1.
module sa4(input clk, input rst_n, input in_valid,
  input signed [7:0] a0,
  input signed [7:0] a1,
  input signed [7:0] a2,
  input signed [7:0] a3,
  input signed [7:0] w00,
  input signed [7:0] w01,
  input signed [7:0] w02,
  input signed [7:0] w03,
  input signed [7:0] w10,
  input signed [7:0] w11,
  input signed [7:0] w12,
  input signed [7:0] w13,
  input signed [7:0] w20,
  input signed [7:0] w21,
  input signed [7:0] w22,
  input signed [7:0] w23,
  input signed [7:0] w30,
  input signed [7:0] w31,
  input signed [7:0] w32,
  input signed [7:0] w33,
  output signed [31:0] c0,
  output signed [31:0] c1,
  output signed [31:0] c2,
  output signed [31:0] c3,
  output out_valid);
  wire signed [7:0] ab0_0 = a0;
  wire signed [7:0] sk1_0; delay1 #(.W(8)) usk1_0(.clk(clk),.rst_n(rst_n),.din(a1),.dout(sk1_0));
  wire signed [7:0] ab1_0 = sk1_0;
  wire signed [7:0] sk2_0; delay1 #(.W(8)) usk2_0(.clk(clk),.rst_n(rst_n),.din(a2),.dout(sk2_0));
  wire signed [7:0] sk2_1; delay1 #(.W(8)) usk2_1(.clk(clk),.rst_n(rst_n),.din(sk2_0),.dout(sk2_1));
  wire signed [7:0] ab2_0 = sk2_1;
  wire signed [7:0] sk3_0; delay1 #(.W(8)) usk3_0(.clk(clk),.rst_n(rst_n),.din(a3),.dout(sk3_0));
  wire signed [7:0] sk3_1; delay1 #(.W(8)) usk3_1(.clk(clk),.rst_n(rst_n),.din(sk3_0),.dout(sk3_1));
  wire signed [7:0] sk3_2; delay1 #(.W(8)) usk3_2(.clk(clk),.rst_n(rst_n),.din(sk3_1),.dout(sk3_2));
  wire signed [7:0] ab3_0 = sk3_2;
  wire signed [31:0] ps0_0 = 32'sd0;
  wire signed [31:0] ps0_1 = 32'sd0;
  wire signed [31:0] ps0_2 = 32'sd0;
  wire signed [31:0] ps0_3 = 32'sd0;
  wire signed [31:0] ps1_0;
  wire signed [31:0] ps1_1;
  wire signed [31:0] ps1_2;
  wire signed [31:0] ps1_3;
  wire signed [31:0] ps2_0;
  wire signed [31:0] ps2_1;
  wire signed [31:0] ps2_2;
  wire signed [31:0] ps2_3;
  wire signed [31:0] ps3_0;
  wire signed [31:0] ps3_1;
  wire signed [31:0] ps3_2;
  wire signed [31:0] ps3_3;
  wire signed [31:0] ps4_0;
  wire signed [31:0] ps4_1;
  wire signed [31:0] ps4_2;
  wire signed [31:0] ps4_3;
  wire signed [7:0] ab0_1;
  wire signed [7:0] ab0_2;
  wire signed [7:0] ab0_3;
  wire signed [7:0] ab0_4;
  wire signed [7:0] ab1_1;
  wire signed [7:0] ab1_2;
  wire signed [7:0] ab1_3;
  wire signed [7:0] ab1_4;
  wire signed [7:0] ab2_1;
  wire signed [7:0] ab2_2;
  wire signed [7:0] ab2_3;
  wire signed [7:0] ab2_4;
  wire signed [7:0] ab3_1;
  wire signed [7:0] ab3_2;
  wire signed [7:0] ab3_3;
  wire signed [7:0] ab3_4;
  pe u_pe00(.clk(clk),.rst_n(rst_n),.w(w00),.a_in(ab0_0),.psum_in(ps0_0),.a_out(ab0_1),.psum_out(ps1_0));
  pe u_pe01(.clk(clk),.rst_n(rst_n),.w(w01),.a_in(ab0_1),.psum_in(ps0_1),.a_out(ab0_2),.psum_out(ps1_1));
  pe u_pe02(.clk(clk),.rst_n(rst_n),.w(w02),.a_in(ab0_2),.psum_in(ps0_2),.a_out(ab0_3),.psum_out(ps1_2));
  pe u_pe03(.clk(clk),.rst_n(rst_n),.w(w03),.a_in(ab0_3),.psum_in(ps0_3),.a_out(ab0_4),.psum_out(ps1_3));
  pe u_pe10(.clk(clk),.rst_n(rst_n),.w(w10),.a_in(ab1_0),.psum_in(ps1_0),.a_out(ab1_1),.psum_out(ps2_0));
  pe u_pe11(.clk(clk),.rst_n(rst_n),.w(w11),.a_in(ab1_1),.psum_in(ps1_1),.a_out(ab1_2),.psum_out(ps2_1));
  pe u_pe12(.clk(clk),.rst_n(rst_n),.w(w12),.a_in(ab1_2),.psum_in(ps1_2),.a_out(ab1_3),.psum_out(ps2_2));
  pe u_pe13(.clk(clk),.rst_n(rst_n),.w(w13),.a_in(ab1_3),.psum_in(ps1_3),.a_out(ab1_4),.psum_out(ps2_3));
  pe u_pe20(.clk(clk),.rst_n(rst_n),.w(w20),.a_in(ab2_0),.psum_in(ps2_0),.a_out(ab2_1),.psum_out(ps3_0));
  pe u_pe21(.clk(clk),.rst_n(rst_n),.w(w21),.a_in(ab2_1),.psum_in(ps2_1),.a_out(ab2_2),.psum_out(ps3_1));
  pe u_pe22(.clk(clk),.rst_n(rst_n),.w(w22),.a_in(ab2_2),.psum_in(ps2_2),.a_out(ab2_3),.psum_out(ps3_2));
  pe u_pe23(.clk(clk),.rst_n(rst_n),.w(w23),.a_in(ab2_3),.psum_in(ps2_3),.a_out(ab2_4),.psum_out(ps3_3));
  pe u_pe30(.clk(clk),.rst_n(rst_n),.w(w30),.a_in(ab3_0),.psum_in(ps3_0),.a_out(ab3_1),.psum_out(ps4_0));
  pe u_pe31(.clk(clk),.rst_n(rst_n),.w(w31),.a_in(ab3_1),.psum_in(ps3_1),.a_out(ab3_2),.psum_out(ps4_1));
  pe u_pe32(.clk(clk),.rst_n(rst_n),.w(w32),.a_in(ab3_2),.psum_in(ps3_2),.a_out(ab3_3),.psum_out(ps4_2));
  pe u_pe33(.clk(clk),.rst_n(rst_n),.w(w33),.a_in(ab3_3),.psum_in(ps3_3),.a_out(ab3_4),.psum_out(ps4_3));
  wire signed [31:0] ds0_0; delay1 #(.W(32)) uds0_0(.clk(clk),.rst_n(rst_n),.din(ps4_0),.dout(ds0_0));
  wire signed [31:0] ds0_1; delay1 #(.W(32)) uds0_1(.clk(clk),.rst_n(rst_n),.din(ds0_0),.dout(ds0_1));
  wire signed [31:0] ds0_2; delay1 #(.W(32)) uds0_2(.clk(clk),.rst_n(rst_n),.din(ds0_1),.dout(ds0_2));
  assign c0 = ds0_2;
  wire signed [31:0] ds1_0; delay1 #(.W(32)) uds1_0(.clk(clk),.rst_n(rst_n),.din(ps4_1),.dout(ds1_0));
  wire signed [31:0] ds1_1; delay1 #(.W(32)) uds1_1(.clk(clk),.rst_n(rst_n),.din(ds1_0),.dout(ds1_1));
  assign c1 = ds1_1;
  wire signed [31:0] ds2_0; delay1 #(.W(32)) uds2_0(.clk(clk),.rst_n(rst_n),.din(ps4_2),.dout(ds2_0));
  assign c2 = ds2_0;
  assign c3 = ps4_3;
  wire v0; delay1 #(.W(1)) uv0(.clk(clk),.rst_n(rst_n),.din(in_valid),.dout(v0));
  wire v1; delay1 #(.W(1)) uv1(.clk(clk),.rst_n(rst_n),.din(v0),.dout(v1));
  wire v2; delay1 #(.W(1)) uv2(.clk(clk),.rst_n(rst_n),.din(v1),.dout(v2));
  wire v3; delay1 #(.W(1)) uv3(.clk(clk),.rst_n(rst_n),.din(v2),.dout(v3));
  wire v4; delay1 #(.W(1)) uv4(.clk(clk),.rst_n(rst_n),.din(v3),.dout(v4));
  wire v5; delay1 #(.W(1)) uv5(.clk(clk),.rst_n(rst_n),.din(v4),.dout(v5));
  wire v6; delay1 #(.W(1)) uv6(.clk(clk),.rst_n(rst_n),.din(v5),.dout(v6));
  assign out_valid = v6;
endmodule
