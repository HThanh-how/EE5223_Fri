// NxN INT8 weight-stationary systolic array, C[m][:] = A[m][:] * W
// - one row vector of A per cycle on a_in (element k -> bits [8k+7:8k])
// - input skew and output de-skew are inside; out_valid aligns with a full row of c_out
// - latency from in_valid to out_valid: 2N-1 cycles
module sa_top #(
    parameter N = 4
) (
    input  logic                   clk,
    input  logic                   rst_n,
    // weight write port: word w_widx = row*(N/4) + q carries W[row][4q .. 4q+3] (byte b -> col 4q+b)
    input  logic                   w_we,
    input  logic [$clog2(N*N/4)-1:0] w_widx,
    input  logic [31:0]            w_wdata,
    // activation stream
    input  logic                   in_valid,
    input  logic [N*8-1:0]         a_in,
    // result stream (element j -> bits [32j+31:32j])
    output logic                   out_valid,
    output logic [N*32-1:0]        c_out
);
    logic signed [7:0] w [N][N];

    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            for (int i = 0; i < N; i++)
                for (int j = 0; j < N; j++) w[i][j] <= '0;
        end else if (w_we) begin
            for (int b = 0; b < 4; b++)
                w[int'(w_widx) / (N/4)][(int'(w_widx) % (N/4)) * 4 + b] <= w_wdata[8*b +: 8];
        end
    end

    // buses between PEs
    logic signed [7:0]  a_bus  [N][N+1];
    logic signed [31:0] ps_bus [N+1][N];

    genvar i, j;
    generate
    // input skew: row i delayed by i cycles
    for (i = 0; i < N; i++) begin : g_skew
        logic [7:0] a_sk;
        delay #(.W(8), .D(i)) u_d (.clk, .rst_n, .din(a_in[8*i +: 8]), .dout(a_sk));
        assign a_bus[i][0] = a_sk;
    end

    for (j = 0; j < N; j++) begin : g_top
        assign ps_bus[0][j] = '0;
    end

    for (i = 0; i < N; i++) begin : g_row
        for (j = 0; j < N; j++) begin : g_col
            pe u_pe (
                .clk, .rst_n,
                .w       (w[i][j]),
                .a_in    (a_bus[i][j]),
                .psum_in (ps_bus[i][j]),
                .a_out   (a_bus[i][j+1]),
                .psum_out(ps_bus[i+1][j])
            );
        end
    end

    // output de-skew: column j delayed by N-1-j cycles
    for (j = 0; j < N; j++) begin : g_deskew
        logic [31:0] c_d;
        delay #(.W(32), .D(N-1-j)) u_d (.clk, .rst_n, .din(ps_bus[N][j]), .dout(c_d));
        assign c_out[32*j +: 32] = c_d;
    end

    delay #(.W(1), .D(2*N-1)) u_v (.clk, .rst_n, .din(in_valid), .dout(out_valid));
    endgenerate
endmodule
