// Weight-stationary INT8 processing element.
// Weight is held outside (in sa_top); activation moves right, partial sum moves down.
module pe (
    input  logic               clk,
    input  logic               rst_n,
    input  logic signed [7:0]  w,
    input  logic signed [7:0]  a_in,
    input  logic signed [31:0] psum_in,
    output logic signed [7:0]  a_out,
    output logic signed [31:0] psum_out
);
    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            a_out    <= '0;
            psum_out <= '0;
        end else begin
            a_out    <= a_in;
            psum_out <= psum_in + 32'(a_in * w);
        end
    end
endmodule
