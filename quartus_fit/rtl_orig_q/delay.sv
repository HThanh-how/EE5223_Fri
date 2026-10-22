// D-cycle delay line (D=0 is a wire)
module delay #(
    parameter W = 8,
    parameter D = 1
) (
    input  logic         clk,
    input  logic         rst_n,
    input  logic [W-1:0] din,
    output logic [W-1:0] dout
);
    generate
    if (D == 0) begin : g_wire
        assign dout = din;
    end else begin : g_pipe
        logic [W-1:0] sr [D];
        always_ff @(posedge clk or negedge rst_n) begin
            if (!rst_n) begin
                for (int k = 0; k < D; k++) sr[k] <= '0;
            end else begin
                sr[0] <= din;
                for (int k = 1; k < D; k++) sr[k] <= sr[k-1];
            end
        end
        assign dout = sr[D-1];
    end
    endgenerate
endmodule
