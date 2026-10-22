// Avalon-MM slave wrapper: systolic array + buffers + accumulate / requant / activation post-processing.
// Same interface is used by PicoRV32 (simulation) and Nios V (DE10-Nano).
// Slave is word-addressed (14-bit word address = 64 KiB byte space), readLatency = 1, no waitrequest.
//
// FPGA-oriented variant: amem/cmem/qmem are inferred M10K RAM banks and the accumulate / requant
// stages are pipelined (a few extra cycles of latency, so CYCLES differs from the reference RTL;
// register map, results and STATUS/done semantics are unchanged).
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

// Simple dual-port sync-read RAM, inferred as M10K (read enable holds the output register).
module npu_ram #(
    parameter W  = 32,
    parameter D  = 64,
    parameter AW = $clog2(D)
) (
    input  logic          clk,
    input  logic          we,
    input  logic [AW-1:0] waddr,
    input  logic [W-1:0]  wdata,
    input  logic          re,
    input  logic [AW-1:0] raddr,
    output logic [W-1:0]  rdata
);
    (* ramstyle = "M10K, no_rw_check" *) logic [W-1:0] mem [D];
    always_ff @(posedge clk) begin
        if (we) mem[waddr] <= wdata;
        if (re) rdata <= mem[raddr];
    end
endmodule

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
    localparam RW   = $clog2(DEPTH);         // RAM row address width

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

    // ---------------- address decode ----------------
    wire [11:0] a_row = 12'(idx / WPR);
    wire [11:0] a_sub = 12'(idx % WPR);
    wire [11:0] c_row = 12'(idx / N);
    wire [11:0] c_col = 12'(idx % N);
    wire [9:0]  qw    = idx[9:0];
    wire [9:0]  q_row = 10'(qw / WPR);
    wire [9:0]  q_sub = 10'(qw % WPR);

    // ---------------- sequencer state ----------------
    logic [AW-1:0]   sent, recv;
    logic            rd_v;
    wire do_start = start_req && !busy;
    wire m_ok     = m_cnt != 0 && m_cnt <= DEPTH;
    wire [15:0] recv16 = 16'(recv);
    wire        sent_lt = 16'(sent) < m_cnt;

    // ---------------- amem: WPR banks of 32 bit, a full row is read in one cycle ----------------
    logic [N*8-1:0] a_q;
    genvar j, k;
    generate
    for (k = 0; k < WPR; k++) begin : g_amem
        npu_ram #(.W(32), .D(DEPTH)) u_ram (
            .clk,
            .we    (avs_write && region == 2'd2 && !busy && a_row < DEPTH && a_sub == 12'(k)),
            .waddr (a_row[RW-1:0]), .wdata(avs_writedata),
            .re    (busy && sent_lt), .raddr(sent[RW-1:0]),
            .rdata (a_q[32*k +: 32])
        );
    end
    endgenerate
    assign in_valid = rd_v;
    assign a_in     = a_q;

    // ---------------- result pipeline ----------------
    // c0: out_valid/c_out, cmem(A) read issued   c1: sum = cmem + c_out
    // c2: cmem write (+done if no quant), sum + bias   c3: * q_mult   c4: + rounding
    // c5: >>> shift and clamp   c6: activation   c7: qmem write (+done)
    logic [N*32-1:0] c_q, sum_r, a_rd;
    logic            v1, v2, v3, v4, v5, v6, v7;
    logic            l1, l2, l3, l4, l5, l6, l7;
    logic [RW-1:0]   r1, r2, r3, r4, r5, r6, r7;
    logic signed [31:0] sb   [N];
    logic signed [47:0] prod [N];
    logic signed [47:0] rr   [N];
    logic [7:0]         bq   [N];
    logic [N*8-1:0]     qd;

    wire ov0   = busy && out_valid;
    wire last0 = recv16 + 16'd1 == m_cnt;

    logic [31:0] c_rd_bank [N];
    generate
    for (j = 0; j < N; j++) begin : g_cmem
        npu_ram #(.W(32), .D(DEPTH)) u_a (       // read port used by accumulate
            .clk, .we(v2), .waddr(r2), .wdata(sum_r[32*j +: 32]),
            .re(ov0), .raddr(recv[RW-1:0]), .rdata(a_rd[32*j +: 32]));
        npu_ram #(.W(32), .D(DEPTH)) u_b (       // read port used by Avalon CBUF reads
            .clk, .we(v2), .waddr(r2), .wdata(sum_r[32*j +: 32]),
            .re(avs_read), .raddr(c_row[RW-1:0]), .rdata(c_rd_bank[j]));
    end

    endgenerate

    logic [31:0] q_rd_bank [WPR];
    generate
    for (k = 0; k < WPR; k++) begin : g_qmem
        npu_ram #(.W(32), .D(DEPTH)) u_ram (
            .clk, .we(v7), .waddr(r7), .wdata(qd[32*k +: 32]),
            .re(avs_read), .raddr(q_row[RW-1:0]), .rdata(q_rd_bank[k]));
    end

    endgenerate

    function automatic logic [47:0] rnd_add(input logic signed [47:0] pr, input logic [4:0] sh);
        rnd_add = pr + ((sh == 0) ? 48'sd0 : (48'sd1 <<< (sh - 1)));
    endfunction
    function automatic logic [7:0] shclamp(input logic signed [47:0] p, input logic [4:0] sh);
        logic signed [47:0] y;
        y = p >>> sh;
        if (y > 48'sd127)       shclamp = 8'sd127;
        else if (y < -48'sd128) shclamp = -8'sd128;
        else                    shclamp = y[7:0];
    endfunction
    function automatic logic [7:0] actf(input logic [7:0] b, input logic [1:0] act);
        case (act)
            2'd1:    actf = b[7] ? 8'd0 : b;
            2'd2:    actf = lut_sig(b);
            2'd3:    actf = lut_tanh(b);
            default: actf = b;
        endcase
    endfunction

    // data path (no reset needed: everything is qualified by the valid bits)
    always_ff @(posedge clk) begin
        c_q <= c_out;
        for (int j = 0; j < N; j++) begin
            sum_r[32*j +: 32] <= (accum_f ? a_rd[32*j +: 32] : 32'd0) + c_q[32*j +: 32];
            sb[j]   <= $signed(sum_r[32*j +: 32]) + bias[j];
            prod[j] <= sb[j] * q_mult;
            rr[j]   <= rnd_add(prod[j], q_shift);
            bq[j]   <= shclamp(rr[j], q_shift);
            qd[8*j +: 8] <= actf(bq[j], q_act);
        end
        r1 <= recv[RW-1:0]; r2 <= r1; r3 <= r2; r4 <= r3; r5 <= r4; r6 <= r5; r7 <= r6;
        l1 <= last0; l2 <= l1; l3 <= l2; l4 <= l3; l5 <= l4; l6 <= l5; l7 <= l6;
    end

    always_ff @(posedge clk or negedge reset_n) begin
        if (!reset_n) begin
            busy <= 0; done <= 0; err <= 0; m_cnt <= 0; cycles <= 0;
            sent <= 0; recv <= 0; rd_v <= 0; start_req <= 0;
            accum_f <= 0; quant_f <= 0; q_mult <= 0; q_shift <= 0; q_act <= 0;
            v1 <= 0; v2 <= 0; v3 <= 0; v4 <= 0; v5 <= 0; v6 <= 0; v7 <= 0;
            for (int j = 0; j < N; j++) bias[j] <= 0;
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
                    sent <= 0; recv <= 0; rd_v <= 0;
                end else begin
                    err <= 1;
                end
            end

            v1 <= ov0; v2 <= v1; v3 <= v2 && quant_f; v4 <= v3; v5 <= v4; v6 <= v5; v7 <= v6;
            if (busy) begin
                cycles <= cycles + 1;
                rd_v   <= sent_lt;
                if (sent_lt) sent <= sent + 1'b1;
                if (ov0)     recv <= recv + 1'b1;
                if (v2 && !quant_f && l2) begin busy <= 0; done <= 1; end
                if (v7 && l7)             begin busy <= 0; done <= 1; end
            end
        end
    end

    // ---------------- read path (latency 1) ----------------
    // Selects are registered at read time; RAM outputs (read-enable gated) hold until the next read.
    logic [31:0] reg_rd;
    logic [1:0]  rsel;           // 0 register/zero, 1 qmem, 2 cmem
    logic        r_inrange;
    logic [9:0]  r_sub;
    always_ff @(posedge clk or negedge reset_n) begin
        if (!reset_n) begin
            reg_rd <= '0; avs_readdatavalid <= 0; rsel <= 0; r_inrange <= 0; r_sub <= 0;
        end else begin
            avs_readdatavalid <= avs_read;
            if (avs_read) begin
                reg_rd <= '0; rsel <= 0; r_inrange <= 0; r_sub <= 0;
                if (reg_sel) begin
                    case (idx[9:0] == {6'd0, idx[3:0]} ? idx[3:0] : 4'd15)
                        4'd1:    reg_rd <= {29'd0, err, done, busy};
                        4'd2:    reg_rd <= {16'd0, m_cnt};
                        4'd3:    reg_rd <= cycles;
                        4'd4:    reg_rd <= {16'(DEPTH), 16'(N)};
                        default: reg_rd <= '0;
                    endcase
                end else if (q_sel) begin
                    rsel <= 1; r_inrange <= q_row < DEPTH; r_sub <= q_sub;
                end else if (region == 2'd3) begin
                    rsel <= 2; r_inrange <= c_row < DEPTH; r_sub <= 10'(c_col);
                end
            end
        end
    end
    always_comb begin
        avs_readdata = reg_rd;
        if (rsel == 2'd1 && r_inrange)      avs_readdata = q_rd_bank[r_sub % WPR];
        else if (rsel == 2'd2 && r_inrange) avs_readdata = c_rd_bank[r_sub % N];
    end
endmodule
