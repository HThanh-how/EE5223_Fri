// Mảng N x N tính A[M,N] x W[N,N], nhận một hàng activation mỗi chu kỳ.
// w_we/w_widx nạp bốn byte weight mỗi word; in_valid/out_valid đánh dấu hàng hợp lệ.
// N cần chia hết cho 4 theo giao diện nạp weight; reset xóa weight và pipeline.
// Kiểm tra: make test N=8 (N là số PE mỗi chiều).
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
    // i là chiều K của dot product; j là cột output, m là row input theo thời gian.
    // Mỗi PE(i,j) giữ W[i][j] tại chỗ; chỉ activation và partial sum di chuyển.
    // Host nạp hết N*N/4 word trước phát in_valid, giữ W cố định tới khi drain xong.
    logic signed [7:0] w [N][N];

    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            for (int i = 0; i < N; i++)
                for (int j = 0; j < N; j++) w[i][j] <= '0;
        // w_widx/(N/4) lấy hàng i; phần dư lấy nhóm q gồm bốn cột liền nhau.
        // [8*b +:8] giữ nguyên mẫu bit signed của byte b trong word little-endian.
        // Ghi weight không stall PE; wrapper/driver bảo đảm không nạp trong lượt compute.
        end else if (w_we) begin
            for (int b = 0; b < 4; b++)
                w[int'(w_widx) / (N/4)][(int'(w_widx) % (N/4)) * 4 + b] <= w_wdata[8*b +: 8];
        end
    end

    // Không cần tích lũy theo thời gian trong từng PE: psum đi xuống cộng từng k.
    // ps_bus có N+1 hàng để biểu diễn biên 0 ở trên và kết quả sau hàng N-1.
    // a_bus có N+1 cột để nối đầu vào trái và activation đã đi qua PE cuối.
    // buses between PEs
    logic signed [7:0]  a_bus  [N][N+1];
    logic signed [31:0] ps_bus [N+1][N];

    // Hàng i trễ i chu kỳ để activation gặp đúng partial sum tại PE(i,j).
    // Mỗi PE đăng ký một chu kỳ; cột j đến đáy sau N+j chu kỳ.
    // De-skew thêm N-1-j chu kỳ nên mọi cột và valid cùng trễ 2N-1.
    // Ví dụ N=4, gọi cạnh nhận row A là cạnh 1 (weight đã nạp sẵn):
    // Cạnh 1: PE(0,0) tính A0*W00; skew giữ A1/A2/A3 chờ partial sum.
    // Cạnh 2: PE(1,0) cộng A1*W10; PE(0,1) bắt đầu dot product cột 1.
    // Cạnh 3: PE(2,0), PE(1,1), PE(0,2) xử lý cùng row theo đường chéo.
    // Cạnh 4: đáy cột 0 đủ bốn tích; cột 1/2/3 còn lần lượt 1/2/3 cạnh.
    // Cạnh 5,6,7: kết quả đáy cột 1,2,3 lần lượt xuất hiện.
    // De-skew giữ cột 0 thêm 3, cột 1 thêm 2, cột 2 thêm 1, cột 3 thêm 0.
    // Sau cạnh 7 mọi cột cùng row và out_valid=1: 7=2*N-1 stage thanh ghi.
    // Tổng quát PE(i,j) xử lý row ấy ở cạnh i+j+1; đáy là cạnh N+j.
    // input skew: row i delayed by i cycles
    for (genvar i = 0; i < N; i++) begin : g_skew
        logic [7:0] a_sk;
        delay #(.W(8), .D(i)) u_d (.clk, .rst_n, .din(a_in[8*i +: 8]), .dout(a_sk));
        assign a_bus[i][0] = a_sk;
    end

    // Biên ps_bus[0][j]=0 bắt đầu dot product mới cho mỗi row mỗi chu kỳ.
    // Không mang accumulator row trước sang row sau; cộng theo K-chunk ở wrapper.
    for (genvar j = 0; j < N; j++) begin : g_top
        assign ps_bus[0][j] = '0;
    end

    for (genvar i = 0; i < N; i++) begin : g_row
        for (genvar j = 0; j < N; j++) begin : g_col
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

    // N tích INT8 có |tích|<=16384 nên |dot|<=N*16384, N=16 chỉ tới 262144.
    // INT32 đủ cho tile ở N=4/8/16; K toàn lớp và bias vẫn phải giữ tổng trong INT32.
    // Các lane c_out[32*j +:32] là mẫu bit signed, caller cần diễn giải là int32.
    // output de-skew: column j delayed by N-1-j cycles
    for (genvar j = 0; j < N; j++) begin : g_deskew
        logic [31:0] c_d;
        delay #(.W(32), .D(N-1-j)) u_d (.clk, .rst_n, .din(ps_bus[N][j]), .dout(c_d));
        assign c_out[32*j +: 32] = c_d;
    end

    // in_valid không gate phép MAC: PE chạy mọi cạnh, kể cả bubble hoặc idle.
    // Delay valid giống độ trễ dữ liệu nên bubble chỉ tạo out_valid=0 tương ứng.
    // Không có out_ready/backpressure; consumer phải nhận mọi row có out_valid.
    // Reset xóa valid pipeline để các tổng đang dở không bị xuất như hàng hợp lệ.
    delay #(.W(1), .D(2*N-1)) u_v (.clk, .rst_n, .din(in_valid), .dout(out_valid));
endmodule
