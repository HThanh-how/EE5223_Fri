// Visualisation wrapper around the UNMODIFIED sa_top.
// Instantiates sa_top and exposes, through hierarchical references only,
// the internal state the browser animation needs. No project RTL is edited.
module viz_top #(
    parameter N = 4
) (
    input  logic                     clk,
    input  logic                     rst_n,
    // same ports as sa_top (driven by the C++ harness)
    input  logic                     w_we,
    input  logic [$clog2(N*N/4)-1:0] w_widx,
    input  logic [31:0]              w_wdata,
    input  logic                     in_valid,
    input  logic [N*8-1:0]           a_in,
    output logic                     out_valid,
    output logic [N*32-1:0]          c_out,
    // ---- debug bus ----
    output logic signed [7:0]  dbg_w     [N][N],   // stationary weight of PE[i][j]
    output logic signed [7:0]  dbg_a     [N][N],   // activation arriving at PE[i][j] this cycle
    output logic signed [31:0] dbg_psin  [N][N],   // partial sum arriving at PE[i][j] from above
    output logic signed [31:0] dbg_ps    [N][N],   // PE[i][j] psum register (output, goes down)
    output logic signed [7:0]  dbg_askew [N],      // skewed activation entering row i (= a_bus[i][0])
    output logic signed [31:0] dbg_south [N]       // raw psum leaving the bottom of column j (before de-skew)
);
    sa_top #(.N(N)) u_sa (.*);

    for (genvar i = 0; i < N; i++) begin : g_i
        assign dbg_askew[i] = u_sa.a_bus[i][0];
        for (genvar j = 0; j < N; j++) begin : g_j
            assign dbg_w[i][j]    = u_sa.w[i][j];
            assign dbg_a[i][j]    = u_sa.a_bus[i][j];
            assign dbg_psin[i][j] = u_sa.ps_bus[i][j];
            assign dbg_ps[i][j]   = u_sa.ps_bus[i+1][j];
        end
    end
    for (genvar j = 0; j < N; j++) begin : g_s
        assign dbg_south[j] = u_sa.ps_bus[N][j];
    end
endmodule
