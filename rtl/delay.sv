// Đường trễ W bit, D chu kỳ; D=0 nối thẳng, D>0 dùng thanh ghi.
// Reset rst_n bất đồng bộ xóa pipeline; sa_top dùng để skew, de-skew và valid.
// Kiểm tra: make test N=8 (N là số PE mỗi chiều).
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
    // D là tham số elaboration, không phải số chu kỳ chờ thay đổi khi chạy.
    // Nhánh D=0 tránh khai báo mảng sr[0] và tránh thêm stage ngoài ý muốn.
    // Đây là trường hợp row 0 không skew hoặc cột N-1 không de-skew.
    // Nối thẳng không tự xóa dout khi reset; nhánh pipeline mới có trạng thái reset.
    if (D == 0) begin : g_wire
        assign dout = din;
    end else begin : g_pipe
        // Sau cạnh thứ 1 sr[0] giữ din; sau cạnh thứ D mẫu đó tới sr[D-1].
        // Mọi phần tử lấy giá trị stage trước từ trước cạnh nên không bị xuyên pipeline.
        // Không có enable: bubble cũng dịch như dữ liệu; dùng cùng delay cho valid.
        // W=8 cho activation, W=32 cho cột tổng, W=1 cho valid trong sa_top.
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
endmodule
