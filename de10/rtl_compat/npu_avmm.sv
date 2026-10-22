// Avalon-MM slave wrapper: systolic array + buffers + accumulate / requant / activation post-processing.
// Same interface is used by PicoRV32 (simulation) and Nios V (DE10-Nano).
// Slave is word-addressed (14-bit word address = 64 KiB byte space), readLatency = 1, no waitrequest.
//
// Byte offsets:
//   0x0000 CTRL    (W) bit0 start, bit1 clear done/err, bit2 ACCUM (add into CBUF instead of overwrite),
//                      bit3 QUANT (after accumulation run bias+requant+activation into QBUF)
//   0x0004 STATUS  (R) bit0 busy, bit1 done, bit2 err
//   0x0008 M       (RW) number of input rows (1..DEPTH)
//   0x000C CYCLES  (R) busy cycles of the last run
//   0x0010 INFO    (R) {DEPTH[15:0], N[15:0]}
//   0x0014 QMULT   (W) signed 16-bit multiplier
//   0x0018 QSHIFT  (W) right shift 0..31
//   0x001C ACT     (W) 0 none, 1 ReLU, 2 sigmoid LUT, 3 tanh LUT
//   0x0040 BIAS[j] (W) int32, 0x0040 + 4*j
//   0x1000 QBUF    (R) int8 results, row m byte j at 0x1000 + 4*m*(N/4) + j
//   0x4000 WEIGHT  (W) word i*(N/4)+q at 0x4000 + 4*(i*(N/4)+q) = W[i][4q..4q+3] (byte b -> column 4q+b)
//   0x8000 ABUF    (W) row m byte k at 0x8000 + 4*m*(N/4) + k
//   0xC000 CBUF    (R) int32 accumulators, C[m][j] at 0xC000 + 4*(m*N+j)
// requant: y = clamp8((acc + bias[j]) * QMULT + (1 << (QSHIFT-1))  >>> QSHIFT), then ACT.
module npu_avmm #(
    parameter N     = 4,
    parameter DEPTH = 64
) (
    input  logic        clk,
    input  logic        reset_n,
    input  logic [13:0] avs_address,
    input  logic        avs_read,
    input  logic        avs_write,
    input  logic [31:0] avs_writedata,
    output logic [31:0] avs_readdata,
    output logic        avs_readdatavalid,
    output logic        avs_waitrequest
);
    `include "lut_tables.svh"

    localparam LOGN = $clog2(N);
    localparam WPR  = N / 4;                 // words per activation row
    localparam AW   = $clog2(DEPTH + 1);

    assign avs_waitrequest = 1'b0;

    wire [1:0]  region  = avs_address[13:12];
    wire [11:0] idx     = avs_address[11:0];
    wire        reg_sel = region == 2'd0 && idx[11:10] == 2'd0;
    wire        q_sel   = region == 2'd0 && idx[11:10] == 2'd1;

    logic busy, done, err;
    logic [15:0] m_cnt;
    logic [31:0] cycles;
    logic start_req, accum_f, quant_f;
    logic signed [15:0] q_mult;
    logic [4:0]         q_shift;
    logic [1:0]         q_act;
    logic signed [31:0] bias [N];

    // ---------------- systolic core ----------------
    logic                 w_we, in_valid, out_valid;
    logic [$clog2(N*N/4)-1:0] w_widx;
    logic [N*8-1:0]       a_in;
    logic [N*32-1:0]      c_out;

    assign w_we  = avs_write && region == 2'd1 && !busy;
    assign w_widx = idx[$clog2(N*N/4)-1:0];

    sa_top #(.N(N)) u_sa (
        .clk, .rst_n(reset_n),
        .w_we, .w_widx, .w_wdata(avs_writedata),
        .in_valid, .a_in, .out_valid, .c_out
    );

    // ---------------- buffers ----------------
    logic [N*8-1:0]  amem [DEPTH];
    logic [N*32-1:0] cmem [DEPTH];
    logic [N*8-1:0]  qmem [DEPTH];

    wire [11:0] a_row = 12'(idx / WPR);
    wire [11:0] a_sub = 12'(idx % WPR);
    wire [11:0] c_row = 12'(idx / N);
    wire [11:0] c_col = 12'(idx % N);
    wire [9:0]  qw    = idx[9:0];
    wire [9:0]  q_row = 10'(qw / WPR);
    wire [9:0]  q_sub = 10'(qw % WPR);

    always_ff @(posedge clk) begin
        if (avs_write && region == 2'd2 && !busy && a_row < DEPTH)
            amem[a_row][32*a_sub +: 32] <= avs_writedata;
    end

    // ---------------- post-processing (requant + activation) ----------------
    function automatic logic [7:0] post(input logic signed [47:0] pr, input logic [4:0] sh, input logic [1:0] act);
        logic signed [63:0] p, y;
        logic [7:0] b;
        p = 64'(pr) + ((sh == 0) ? 64'sd0 : (64'sd1 <<< (sh - 1)));
        y = p >>> sh;
        if (y > 64'sd127)       b = 8'sd127;
        else if (y < -64'sd128) b = -8'sd128;
        else                    b = y[7:0];
        case (act)
            2'd1:    post = b[7] ? 8'd0 : b;
            2'd2:    post = lut_sig(b);
            2'd3:    post = lut_tanh(b);
            default: post = b;
        endcase
    endfunction

    // ---------------- sequencer ----------------
    logic [AW-1:0]   sent, recv, arow;
    logic            rd_v, va;
    logic [N*8-1:0]  a_q;
    logic signed [47:0] prod [N];
    logic [N*32-1:0] sum_row;
    logic [N*8-1:0]  q_row_data;

    assign in_valid = rd_v;
    assign a_in     = a_q;

    always_comb begin
        for (int j = 0; j < N; j++) begin
            sum_row[32*j +: 32] = (accum_f ? cmem[recv][32*j +: 32] : 32'd0) + c_out[32*j +: 32];
            q_row_data[8*j +: 8] = post(prod[j], q_shift, q_act);
        end
    end

    wire do_start = start_req && !busy;
    wire m_ok     = m_cnt != 0 && m_cnt <= DEPTH;
    wire [15:0] recv16 = 16'(recv);
    wire [15:0] arow16 = 16'(arow);

    always_ff @(posedge clk or negedge reset_n) begin
        if (!reset_n) begin
            busy <= 0; done <= 0; err <= 0; m_cnt <= 0; cycles <= 0;
            sent <= 0; recv <= 0; arow <= 0; rd_v <= 0; va <= 0; a_q <= '0; start_req <= 0;
            accum_f <= 0; quant_f <= 0; q_mult <= 0; q_shift <= 0; q_act <= 0;
            for (int j = 0; j < N; j++) begin bias[j] <= 0; prod[j] <= 0; end
        end else begin
            start_req <= 0;
            if (avs_write && reg_sel) begin
                if (idx[9:4] == 6'd1) begin
                    bias[idx[3:0]] <= avs_writedata;      // byte 0x40 + 4*j
                end else if (idx[9:4] == 6'd0) begin
                    case (idx[3:0])
                        4'd0: begin
                            if (avs_writedata[0]) begin
                                start_req <= 1; accum_f <= avs_writedata[2]; quant_f <= avs_writedata[3];
                            end
                            if (avs_writedata[1]) begin done <= 0; err <= 0; end
                        end
                        4'd2: if (!busy) m_cnt <= avs_writedata[15:0];
                        4'd5: q_mult  <= avs_writedata[15:0];
                        4'd6: q_shift <= avs_writedata[4:0];
                        4'd7: q_act   <= avs_writedata[1:0];
                        default: ;
                    endcase
                end
            end

            if (do_start) begin
                if (m_ok) begin
                    busy <= 1; done <= 0; err <= 0; cycles <= 0;
                    sent <= 0; recv <= 0; rd_v <= 0; va <= 0;
                end else begin
                    err <= 1;
                end
            end

            if (busy) begin
                cycles <= cycles + 1;
                rd_v   <= sent < m_cnt;
                va     <= 0;
                if (sent < m_cnt) begin
                    a_q  <= amem[sent[AW-1:0]];
                    sent <= sent + 1'b1;
                end
                if (out_valid) begin
                    cmem[recv[AW-1:0]] <= sum_row;
                    recv <= recv + 1'b1;
                    if (quant_f) begin
                        va <= 1; arow <= recv;
                        for (int j = 0; j < N; j++)
                            prod[j] <= 48'($signed(sum_row[32*j +: 32]) + bias[j]) * 48'(q_mult);
                    end else if (recv16 + 16'd1 == m_cnt) begin
                        busy <= 0; done <= 1;
                    end
                end
                if (va) begin
                    qmem[arow[AW-1:0]] <= q_row_data;
                    if (arow16 + 16'd1 == m_cnt) begin
                        busy <= 0; done <= 1;
                    end
                end
            end
        end
    end

    // ---------------- read path (latency 1) ----------------
    always_ff @(posedge clk or negedge reset_n) begin
        if (!reset_n) begin
            avs_readdata <= '0; avs_readdatavalid <= 0;
        end else begin
            avs_readdatavalid <= avs_read;
            if (avs_read) begin
                if (reg_sel) begin
                    case (idx[9:0] == {6'd0, idx[3:0]} ? idx[3:0] : 4'd15)
                        4'd1:    avs_readdata <= {29'd0, err, done, busy};
                        4'd2:    avs_readdata <= {16'd0, m_cnt};
                        4'd3:    avs_readdata <= cycles;
                        4'd4:    avs_readdata <= {16'(DEPTH), 16'(N)};
                        default: avs_readdata <= '0;
                    endcase
                end else if (q_sel) begin
                    avs_readdata <= (q_row < DEPTH) ? qmem[q_row[AW-1:0]][32*q_sub +: 32] : 32'd0;
                end else if (region == 2'd3) begin
                    avs_readdata <= (c_row < DEPTH) ? cmem[c_row[AW-1:0]][32*c_col +: 32] : 32'd0;
                end else begin
                    avs_readdata <= '0;
                end
            end
        end
    end
endmodule
