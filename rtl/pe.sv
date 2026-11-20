// PE weight-stationary: nhận w, a_in và psum_in; chuyển activation sang phải, tổng xuống dưới.
// Mỗi cạnh clock tính một tích INT8 có dấu [-128,127] cộng vào tổng 32 bit;
// reset rst_n bất đồng bộ xóa hai đầu ra. Kiểm tra: make test N=8 (N là kích thước mảng).
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
    // w giữ cố định trong sa_top; a_in và psum_in phải đến cùng chu kỳ.
    // Tích signed 8 x 8 được mở rộng vào tổng 32 bit; không có saturation tại PE.
    // Đầu vào đều signed: -128* -128=16384, cần 16 bit có dấu, không vừa INT8.
    // Cast 32' mở rộng tích có dấu trước cộng; nếu dùng unsigned, số âm sẽ sai.
    // Bound một tile là N*16384; N=8 cần tối đa 131072, còn xa giới hạn INT32.
    // INT32 chỉ an toàn khi tổng toán học nằm trong [-2^31,2^31-1]; không clamp.
    // psum_in chứa các tích ở hàng 0..i-1 của cùng row A, không phải row trước.
    // a_out giữ một stage để A đi ngang đúng một cột mỗi cạnh, psum đi dọc một hàng.
    // Nonblocking đọc a_in/psum_in cũ đồng thời, tránh truyền xuyên nhiều PE trong cạnh.
    // Không có valid cục bộ: reset xóa dữ liệu, valid chung tại sa_top lọc bubble.
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
