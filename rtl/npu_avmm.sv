// Wrapper giữa CPU và sa_top: cửa sổ Avalon-MM 64 KiB, N PE mỗi chiều, DEPTH hàng.
// Địa chỉ cổng là word; bảng offset byte và quyền truy cập ở ngay bên dưới.
// Read được ghi vào thanh ghi cùng readdatavalid ở cạnh kế tiếp; waitrequest luôn bằng 0.
// Reset xóa điều khiển và weight, không khởi tạo các buffer dữ liệu.
// Kiểm tra: make soc N=8 FW=selftest (N là kích thước mảng, FW chọn bài kiểm tra).
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
// Quy ước driver: mọi offset ở trên là BYTE; avs_address = offset >> 2.
// CTRL không lưu START như một trạng thái: bit0 tạo yêu cầu chạy ở chu kỳ sau.
// Bit1 chỉ xóa done/err, không xóa CBUF/QBUF; bit2/3 được chốt khi ghi START.
// STATUS chỉ đọc: busy=đang xử lý, done=kết thúc giữ tới CLEAR/START, err=M sai.
// M đọc/ghi 16 bit thấp, chỉ cho đổi khi idle; giá trị 0 hoặc >DEPTH không chạy.
// CYCLES đếm các cạnh trong busy, gồm feed, drain và post-processing nếu có.
// INFO ghép DEPTH ở [31:16], N ở [15:0], giúp kiểm tra cấu hình firmware/RTL.
// QMULT chỉ lấy [15:0] theo signed two's complement; QSHIFT chỉ lấy [4:0].
// ACT chỉ lấy [1:0]; bias[j] là signed INT32 cùng scale với tích A*W.
// Các thanh ghi quant/bias là write-only; đọc địa chỉ không hỗ trợ trả về 0.
// WEIGHT/ABUF chỉ ghi khi !busy; CBUF/QBUF chỉ đọc qua bus, ghi bởi sequencer.
// Mỗi word A/W/Q chứa bốn byte little-endian: byte thấp là chỉ số nhỏ nhất.
// CBUF khác QBUF: mỗi phần tử chiếm cả word INT32, chưa cộng bias hay activation.
// Firmware phải chờ done trước đọc kết quả và trước đổi cấu hình cho lần kế tiếp.
// Không có byteenable: driver phải ghi đủ word, không dùng store byte vào NPU.
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

    // N chia hết cho 4 để N/4 word chứa đủ một hàng, không có word cuối thiếu byte.
    // AW dùng DEPTH+1 để sent/recv biểu diễn cả giá trị DEPTH sau hàng cuối.
    // LOGN được khai báo nhưng decode hiện dùng phép chia/modulo theo hằng N.
    localparam LOGN = $clog2(N);
    localparam WPR  = N / 4;                 // words per activation row
    localparam AW   = $clog2(DEPTH + 1);

    // Không backpressure trên bus không có nghĩa mọi write đều có hiệu lực:
    // write W/A trong busy bị bỏ qua. Host chịu trách nhiệm tuần tự hóa giao dịch.
    assign avs_waitrequest = 1'b0;

    // avs_address[13:12] chọn từng vùng 16 KiB; idx là offset word trong vùng.
    // Trong vùng 0, idx[11:10] phân biệt register và QBUF tại byte offset 0x1000.
    wire [1:0]  region  = avs_address[13:12];
    wire [11:0] idx     = avs_address[11:0];
    wire        reg_sel = region == 2'd0 && idx[11:10] == 2'd0;
    wire        q_sel   = region == 2'd0 && idx[11:10] == 2'd1;

    // m_cnt là số hàng M của một lượt A[M,N]*W[N,N], không phải chiều K toàn lớp.
    // accum_f/quant_f áp dụng cho cả lượt; q_mult/q_shift/q_act không có bản shadow.
    // Do đó không ghi CTRL/quant/bias giữa một lượt đang busy, kể cả START bị bỏ qua.
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

    // WEIGHT ở region=1 tương ứng byte 0x4000; idx là số word của tile N*N.
    // Chỉ lấy các bit cần cho N*N/4 word; địa chỉ cao hơn có thể alias weight cũ.
    // Driver chỉ dùng đúng phạm vi tile, không dựa vào việc kiểm tra địa chỉ phần cứng.
    assign w_we  = avs_write && region == 2'd1 && !busy;
    assign w_widx = idx[$clog2(N*N/4)-1:0];

    sa_top #(.N(N)) u_sa (
        .clk, .rst_n(reset_n),
        .w_we, .w_widx, .w_wdata(avs_writedata),
        .in_valid, .a_in, .out_valid, .c_out
    );

    // ---------------- buffers ----------------
    // amem/cmem/qmem lưu lần lượt input, tổng chưa quant và output đã quant.
    // Không reset ba mảng này để tránh buộc mọi bit dữ liệu vào mạng reset lớn.
    // Lần chạy đầu phải nạp đủ A/W và để ACCUM=0 trước khi dùng tổng trong CBUF.
    // QBUF chỉ có dữ liệu mới sau lượt QUANT=1; lượt không QUANT giữ QBUF cũ.
    logic [N*8-1:0]  amem [DEPTH];
    logic [N*32-1:0] cmem [DEPTH];
    logic [N*8-1:0]  qmem [DEPTH];

    // Chia offset word cho WPR lấy hàng; phần dư chọn nhóm 4 byte trong hàng A.
    // CBUF chia cho N vì mỗi cột là một INT32; QBUF lại chia WPR như ABUF.
    // qw=idx[9:0] bỏ phần chọn cửa sổ 0x1000, giữ offset word nội bộ QBUF.
    // Các cast 12'/10' cố định độ rộng decode; guard <DEPTH chặn hàng vượt buffer.
    wire [11:0] a_row = 12'(idx / WPR);
    wire [11:0] a_sub = 12'(idx % WPR);
    wire [11:0] c_row = 12'(idx / N);
    wire [11:0] c_col = 12'(idx % N);
    wire [9:0]  qw    = idx[9:0];
    wire [9:0]  q_row = 10'(qw / WPR);
    wire [9:0]  q_sub = 10'(qw % WPR);

    // Ghi activation không reset và không tự zero-pad: mỗi row phải nạp đủ WPR word.
    // Slice [32*a_sub +:32] chọn đúng nhóm bốn INT8, không đổi thứ tự byte.
    always_ff @(posedge clk) begin
        if (avs_write && region == 2'd2 && !busy && a_row < DEPTH)
            amem[a_row][32*a_sub +: 32] <= avs_writedata;
    end

    // ---------------- post-processing (requant + activation) ----------------
    // pr là tích signed 48 bit; cộng 2^(shift-1) trước dịch số học khi shift > 0.
    // Cách làm tròn này hướng nửa bước về +vô cực, kể cả số âm; shift=0 không cộng.
    // Clamp [-128,127] trước activation tránh wrap; LUT dùng byte two's complement.
    function automatic logic [7:0] post(input logic signed [47:0] pr, input logic [4:0] sh, input logic [1:0] act);
        logic signed [63:0] p, y;
        logic [7:0] b;
        // Mở rộng pr signed 48 bit lên 64 bit trước cộng rounding để giữ dấu và headroom.
        // Với sh=1: pr=1 cho 1, pr=-1 cho 0; hai điểm giữa cùng hướng về +vô cực.
        // Dịch >>> giữ dấu; lấy y[7:0] chỉ sau clamp nên không làm mất giá trị hợp lệ.
        p = 64'(pr) + ((sh == 0) ? 64'sd0 : (64'sd1 <<< (sh - 1)));
        y = p >>> sh;
        if (y > 64'sd127)       b = 8'sd127;
        else if (y < -64'sd128) b = -8'sd128;
        else                    b = y[7:0];
        // ReLU kiểm tra b[7] vì b là byte two's complement, bit7=1 nghĩa là âm.
        // LUT nhận byte thô: -1 thành index 255, -128 thành 128; không cộng offset 128.
        // LUT giải mã q=index nếu <128, ngược lại q=index-256, rồi tính x=q/16.
        // Sigmoid cho round(128*sigmoid(x)) clamp [0,127]; tanh clamp [-127,127].
        // Các bảng chung RTL/C do gen_lut.py sinh; scale output LUT là 1/128.
        case (act)
            2'd1:    post = b[7] ? 8'd0 : b;
            2'd2:    post = lut_sig(b);
            2'd3:    post = lut_tanh(b);
            default: post = b;
        endcase
    endfunction

    // Không có enum FSM: idle chờ start_req; M ngoài 1..DEPTH đặt err và không chạy.
    // Khi busy, sent phát từng hàng qua thanh ghi đọc; recv ghi kết quả sa_top vào CBUF.
    // ACCUM cộng CBUF cũ cho các K-chunk sau; chunk đầu ghi đè, chunk cuối bật QUANT.
    // QUANT đăng ký (sum+bias)*mult vào prod, va ghi QBUF ở chu kỳ sau;
    // done chỉ bật sau hàng cuối, kể cả chu kỳ post-processing. Reset xóa cờ và bộ đếm.
    // ---------------- sequencer ----------------
    // Các pha logic (không mã hóa bằng enum) có thể chồng lấp nhờ pipeline:
    // IDLE: busy=0; do_start hợp lệ đưa sang FEED và xóa bộ đếm lượt trước.
    // FEED: sent<M đọc một row amem vào a_q, rd_v báo row đó ở cạnh kế tiếp.
    // DRAIN: sent=M nên rd_v=0, nhưng vẫn chờ đủ M out_valid từ sa_top.
    // STORE: mỗi out_valid ghi sum_row vào cmem[recv], rồi tăng recv.
    // POST: nếu QUANT, prod giữ tích của row vừa nhận và va báo tích hợp lệ.
    // Cạnh sau POST ghi qmem[arow]; va/arow giữ đúng row khi recv đã tăng.
    // Lượt không quant kết thúc ở STORE cuối; có quant kết thúc ở POST cuối.
    // Không dùng recv==M để kết thúc sớm vì QBUF cuối còn đang ở pipeline.
    logic [AW-1:0]   sent, recv, arow;
    logic            rd_v, va;
    logic [N*8-1:0]  a_q;
    logic signed [47:0] prod [N];
    logic [N*32-1:0] sum_row;
    logic [N*8-1:0]  q_row_data;

    assign in_valid = rd_v;
    assign a_in     = a_q;

    // Mỗi lane 32 bit của c_out là một cột; sum_row cộng tổng cũ chỉ khi ACCUM.
    // Không saturate accumulator: phép cộng 32 bit giữ các bit thấp khi tràn.
    always_comb begin
        for (int j = 0; j < N; j++) begin
            sum_row[32*j +: 32] = (accum_f ? cmem[recv][32*j +: 32] : 32'd0) + c_out[32*j +: 32];
            q_row_data[8*j +: 8] = post(prod[j], q_shift, q_act);
        end
    end

    // start_req là pulse một clock do write CTRL; do_start chỉ nhận pulse khi idle.
    // M sai đặt err nhưng không đặt done/busy; không có hàng nào được phát đi.
    // recv16/arow16 mở rộng chỉ số để so hàng cuối với m_cnt 16 bit cùng độ rộng.
    wire do_start = start_req && !busy;
    wire m_ok     = m_cnt != 0 && m_cnt <= DEPTH;
    wire [15:0] recv16 = 16'(recv);
    wire [15:0] arow16 = 16'(arow);

    always_ff @(posedge clk or negedge reset_n) begin
        // Reset active-low bất đồng bộ xóa trạng thái bus, pipeline và cấu hình quant.
        // Bias/mult mặc định 0: muốn có output hữu ích cần cấu hình lại sau reset.
        // sa_top cũng reset weight và PE; amem/cmem/qmem vẫn không được khởi tạo.
        if (!reset_n) begin
            busy <= 0; done <= 0; err <= 0; m_cnt <= 0; cycles <= 0;
            sent <= 0; recv <= 0; arow <= 0; rd_v <= 0; va <= 0; a_q <= '0; start_req <= 0;
            accum_f <= 0; quant_f <= 0; q_mult <= 0; q_shift <= 0; q_act <= 0;
            for (int j = 0; j < N; j++) begin bias[j] <= 0; prod[j] <= 0; end
        end else begin
            // Giá trị mặc định mỗi chu kỳ làm START thành pulse, không tự lặp lượt chạy.
            // Decode bias idx[9:4]==1 là word 16..31, tức byte 0x40..0x7C.
            // idx[3:0] chọn j=0..15; driver chỉ ghi j<N, N hỗ trợ ở flow là 4/8/16.
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

            // START hợp lệ xóa done/err và cycles, nhưng giữ nội dung buffer cho K-chunk.
            // Không reset arow/a_q ở đây: va/rd_v=0 ngăn dữ liệu lượt cũ được coi là valid.
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
                // Nonblocking assignment tạo một stage đọc: core thấy rd_v/a_q của cạnh trước.
                // Sau lần đọc row M-1, sent=M; rd_v chỉ hạ ở cạnh tiếp theo, không mất row cuối.
                rd_v   <= sent < m_cnt;
                va     <= 0;
                if (sent < m_cnt) begin
                    a_q  <= amem[sent[AW-1:0]];
                    sent <= sent + 1'b1;
                end
                // out_valid đảm bảo mọi cột c_out cùng một hàng sau de-skew trong sa_top.
                // ACCUM=0 khởi tạo C bằng tile đầu; ACCUM=1 cộng tile sau với đúng cmem[recv].
                // Bias chỉ đi vào nhánh prod, không ghi ngược CBUF nên không bị cộng lặp theo K.
                if (out_valid) begin
                    cmem[recv[AW-1:0]] <= sum_row;
                    recv <= recv + 1'b1;
                    if (quant_f) begin
                        va <= 1; arow <= recv;
                        // Slice [32*j +:32] vốn là packed unsigned, cần $signed để tổng âm giữ dấu.
                        // Cast sang 48 bit và q_mult signed cho tích INT32 x INT16 đủ 48 bit.
                        // Host phải chọn scale/K/bias để tổng không vượt miền accumulator dự kiến.
                        for (int j = 0; j < N; j++)
                            prod[j] <= 48'($signed(sum_row[32*j +: 32]) + bias[j]) * 48'(q_mult);
                    end else if (recv16 + 16'd1 == m_cnt) begin
                        busy <= 0; done <= 1;
                    end
                end
                // va ở đây là giá trị trước cạnh clock: q_row_data ứng với prod của row trước.
                // Có thể vừa nhận row mới vừa ghi QBUF row cũ; arow tách khỏi recv vì lý do đó.
                if (va) begin
                    qmem[arow[AW-1:0]] <= q_row_data;
                    if (arow16 + 16'd1 == m_cnt) begin
                        busy <= 0; done <= 1;
                    end
                end
            end
        end
    end

    // Read được đăng ký: avs_read tại cạnh clock tạo readdatavalid và dữ liệu sau cạnh đó.
    // Word QBUF chứa bốn INT8; CBUF trả một accumulator 32 bit mỗi địa chỉ.
    // Độ trễ read 1 xuất phát từ always_ff: không có đường đọc combinational về CPU.
    // Thanh ghi readdata cắt đường decode/mux buffer, còn readdatavalid chỉ đúng response.
    // Bridge phải phát một request rồi đợi valid, không lấy readdata cũ ngay khi avs_read.
    // Khi không đọc, readdata giữ nguyên còn valid hạ; reset đặt cả hai về 0.
    // ---------------- read path (latency 1) ----------------
    always_ff @(posedge clk or negedge reset_n) begin
        if (!reset_n) begin
            avs_readdata <= '0; avs_readdatavalid <= 0;
        end else begin
            avs_readdatavalid <= avs_read;
            if (avs_read) begin
                if (reg_sel) begin
                    // So sánh idx đầy đủ với nibble thấp để chỉ nhận register word 0..15.
                    // Các word bias và khoảng trống không alias STATUS/M/CYCLES/INFO khi đọc.
                    // Nhánh default và hàng Q/C ngoài DEPTH đều trả 0, vẫn phát readdatavalid.
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
