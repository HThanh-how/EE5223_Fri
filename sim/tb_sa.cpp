// Testbench Verilator nạp weight, phát hàng A và so sánh C với GEMM số nguyên.
// N_ phải khớp tham số N của RTL; kiểm tra cả input liên tiếp, khoảng trống và biên INT8.
// Chạy: make test N=8 (N là kích thước mảng); make wave N=8 ghi VCD.
// Verilator testbench for sa_top: compares RTL against a C++ golden GEMM.
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <vector>
#include "Vsa_top.h"
#include "verilated.h"
#include "verilated_vcd_c.h"

// N_ là cấu hình compile-time -DN_=N từ Makefile, phải bằng RTL -GN=N.
// Cách pack a_in qua uint64_t trong testbench này phục vụ N=4/8 (tối đa 8 byte).
// Không suy ra testbench hiện hỗ trợ mọi N mà module sa_top có thể elaboration.
#ifndef N_
#define N_ 4
#endif

static Vsa_top* top;
static VerilatedVcdC* tfp;
// t là timestamp của trace, tăng mỗi nửa chu kỳ chỉ khi tfp được bật.
// Không dùng t làm cycle counter cho timeout; run_test có cycles riêng.
static uint64_t t = 0;

// Đánh giá cả hai mức clock; nếu bật trace thì ghi cả hai nửa chu kỳ.
static void tick() {
    top->clk = 0; top->eval(); if (tfp) tfp->dump(t++);
    top->clk = 1; top->eval(); if (tfp) tfp->dump(t++);
}

using Mat8 = std::vector<std::vector<int8_t>>;

// Nạp từng word bốn weight; gap_every tạo bubble nhưng vẫn giữ thứ tự kết quả.
// Sau khi drain pipeline, so từng phần tử với tích vô hướng INT8 tích lũy int32.
static int run_test(const char* name, const Mat8& A, const Mat8& W, int gap_every) {
    const int M = (int)A.size();
    // Tile W row-major: word i*(N_/4)+q đưa byte b tới W[i][4*q+b].
    // (uint8_t) giữ đúng 8 bit của weight âm trước khi mở rộng/shift lên word.
    // Weight nạp từng cạnh trước stream; w_we hạ rồi mới bắt đầu gửi A.
    for (int i = 0; i < N_; i++)
        for (int q = 0; q < N_ / 4; q++) {
            uint32_t word = 0;
            for (int b = 0; b < 4; b++) word |= (uint32_t)(uint8_t)W[i][4 * q + b] << (8 * b);
            top->w_we = 1; top->w_widx = i * (N_ / 4) + q; top->w_wdata = word;
            tick();
        }
    top->w_we = 0;

    // got lưu thứ tự row theo out_valid, không đòi dữ liệu hợp lệ ở mọi chu kỳ.
    // Một tick vừa clock PE vừa cập nhật valid nên lấy c_out ngay sau tick.
    // Timeout 100000 cycle bắt thiếu output hoặc valid không bao giờ tới.
    std::vector<std::vector<int32_t>> got;
    int sent = 0, cycles = 0;
    while ((int)got.size() < M && cycles < 100000) {
        // gap_every=0 gửi liên tục; giá trị g>0 bỏ mỗi chu kỳ thứ g tạo một bubble.
        // Chỉ tăng sent khi send=true, nên bubble không làm bỏ hàng hay đổi golden.
        // Trong bubble a=0 nhưng correctness dựa vào out_valid, không dựa giá trị bus.
        bool send = sent < M && !(gap_every && (cycles % gap_every == gap_every - 1));
        top->in_valid = send;
        uint64_t a = 0;
        if (send) {
            for (int k = 0; k < N_; k++) a |= (uint64_t)(uint8_t)A[sent][k] << (8 * k);
            sent++;
        }
        top->a_in = a;
        tick();
        cycles++;
        // Mỗi lane c_out[j] là 32 bit của cột j; cast int32_t khôi phục dấu.
        // De-skew trong RTL bảo đảm mọi lane cùng hàng; sai alignment sẽ lệch golden.
        if (top->out_valid) {
            std::vector<int32_t> row(N_);
            for (int j = 0; j < N_; j++) row[j] = (int32_t)top->c_out[j];
            got.push_back(row);
        }
    }
    top->in_valid = 0;
    // Drain dài hơn latency 2*N_-1 để valid cũ rời pipeline trước thay W test sau.
    // Không reset giữa các run: kiểm cả khả năng nạp weight mới sau lượt cũ.
    for (int k = 0; k < 2 * N_ + 2; k++) tick();

    // Golden tính dot A[m,k]*W[k,j] signed với accumulator int32_t cho từng phần tử.
    // Chỉ in tối đa 5 MISMATCH để log ngắn, nhưng err vẫn đếm mọi phần tử sai.
    // Kiểm got.size()==M bổ sung phát hiện thiếu hàng, kể cả các hàng nhận được đều đúng.
    int err = 0;
    for (int m = 0; m < (int)got.size(); m++)
        for (int j = 0; j < N_; j++) {
            int32_t ref = 0;
            for (int k = 0; k < N_; k++) ref += (int32_t)A[m][k] * (int32_t)W[k][j];
            if (got[m][j] != ref) {
                if (err < 5) printf("  MISMATCH %s m=%d j=%d got=%d ref=%d\n", name, m, j, got[m][j], ref);
                err++;
            }
        }
    if ((int)got.size() != M) { printf("  %s: got %zu rows, expected %d\n", name, got.size(), M); err++; }
    printf("[%s] M=%d gap=%d : %s\n", name, M, gap_every, err ? "FAIL" : "PASS");
    return err;
}

// Tạo ma trận test trong miền đóng [lo, hi], seed được đặt ở main.
static Mat8 rnd(int r, int c, int lo, int hi) {
    Mat8 m(r, std::vector<int8_t>(c));
    for (auto& row : m) for (auto& v : row) v = (int8_t)(lo + rand() % (hi - lo + 1));
    return m;
}

int main(int argc, char** argv) {
    Verilated::commandArgs(argc, argv);
    top = new Vsa_top;
    // make wave đặt NPU_DUMP=1; trace ghi sa_top.vcd trong cwd chạy executable.
    // Nếu không có biến này, không tạo VCD và tránh chi phí dump mỗi nửa clock.
    if (getenv("NPU_DUMP")) {
        Verilated::traceEverOn(true);
        tfp = new VerilatedVcdC;
        top->trace(tfp, 99);
        tfp->open("sa_top.vcd");
    }
    // Seed cố định tái lập cả ma trận và lịch bubble; 4 tick reset xóa weight/PE/valid.
    // Sau reset có thêm một tick idle trước test đầu để giao diện ổn định.
    srand(12345);
    top->rst_n = 0; top->clk = 0; top->w_we = 0; top->in_valid = 0; top->a_in = 0;
    for (int i = 0; i < 4; i++) tick();
    top->rst_n = 1; tick();

    int err = 0, ntest = 0;
    auto run = [&](const char* n, const Mat8& A, const Mat8& W, int gap) { err += run_test(n, A, W, gap); ntest++; };

    // Identity bắt lỗi thứ tự lane; single-row bắt lỗi fill/drain khi M nhỏ.
    // Back-to-back kiểm throughput một row/cycle; random-gaps kiểm valid qua bubble.
    // Extreme-neg kiểm -128*-128; extreme-mix kiểm signed multiply và tổng âm.
    Mat8 I(N_, std::vector<int8_t>(N_, 0));
    for (int i = 0; i < N_; i++) I[i][i] = 1;
    run("identity", rnd(8, N_, -128, 127), I, 0);
    run("single-row", rnd(1, N_, -128, 127), rnd(N_, N_, -128, 127), 0);
    run("random-back2back", rnd(32, N_, -128, 127), rnd(N_, N_, -128, 127), 0);
    run("random-gaps", rnd(32, N_, -128, 127), rnd(N_, N_, -128, 127), 3);
    Mat8 neg(N_, std::vector<int8_t>(N_, -128));
    run("extreme-neg", Mat8(16, std::vector<int8_t>(N_, -128)), neg, 0);
    run("extreme-mix", rnd(16, N_, -128, -127), rnd(N_, N_, 126, 127), 0);
    // 6 test đặt tên cộng 20 sweep = 26 test; sweep thay M=1..40 và gap=0/2/3.
    // gap=1 sẽ bỏ mọi chu kỳ nên đổi về 0 để không tạo trường hợp không gửi gì.
    for (int r = 0; r < 20; r++) {
        int g = rand() % 4;
        if (g == 1) g = 0;  // gap_every=1 would never send
        run("random-sweep", rnd(1 + rand() % 40, N_, -128, 127), rnd(N_, N_, -128, 127), g);
    }

    // Mỗi run in tên/M/gap và PASS/FAIL; dòng cuối ALL PASS chỉ khi tổng err=0.
    // Return 1 khi có lỗi giúp make test thất bại, khác $finish của SoC testbench.
    printf("N=%d : %d tests, %s\n", N_, ntest, err ? "FAILED" : "ALL PASS");
    if (tfp) { tfp->close(); }
    delete top;
    return err ? 1 : 0;
}
