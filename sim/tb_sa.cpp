// Verilator testbench for sa_top: compares RTL against a C++ golden GEMM.
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <vector>
#include "Vsa_top.h"
#include "verilated.h"
#include "verilated_vcd_c.h"

#ifndef N_
#define N_ 4
#endif

static Vsa_top* top;
static VerilatedVcdC* tfp;
static uint64_t t = 0;

static void tick() {
    top->clk = 0; top->eval(); if (tfp) tfp->dump(t++);
    top->clk = 1; top->eval(); if (tfp) tfp->dump(t++);
}

using Mat8 = std::vector<std::vector<int8_t>>;

static int run_test(const char* name, const Mat8& A, const Mat8& W, int gap_every) {
    const int M = (int)A.size();
    for (int i = 0; i < N_; i++)
        for (int q = 0; q < N_ / 4; q++) {
            uint32_t word = 0;
            for (int b = 0; b < 4; b++) word |= (uint32_t)(uint8_t)W[i][4 * q + b] << (8 * b);
            top->w_we = 1; top->w_widx = i * (N_ / 4) + q; top->w_wdata = word;
            tick();
        }
    top->w_we = 0;

    std::vector<std::vector<int32_t>> got;
    int sent = 0, cycles = 0;
    while ((int)got.size() < M && cycles < 100000) {
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
        if (top->out_valid) {
            std::vector<int32_t> row(N_);
            for (int j = 0; j < N_; j++) row[j] = (int32_t)top->c_out[j];
            got.push_back(row);
        }
    }
    top->in_valid = 0;
    for (int k = 0; k < 2 * N_ + 2; k++) tick();

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

static Mat8 rnd(int r, int c, int lo, int hi) {
    Mat8 m(r, std::vector<int8_t>(c));
    for (auto& row : m) for (auto& v : row) v = (int8_t)(lo + rand() % (hi - lo + 1));
    return m;
}

int main(int argc, char** argv) {
    Verilated::commandArgs(argc, argv);
    top = new Vsa_top;
    if (getenv("NPU_DUMP")) {
        Verilated::traceEverOn(true);
        tfp = new VerilatedVcdC;
        top->trace(tfp, 99);
        tfp->open("sa_top.vcd");
    }
    srand(12345);
    top->rst_n = 0; top->clk = 0; top->w_we = 0; top->in_valid = 0; top->a_in = 0;
    for (int i = 0; i < 4; i++) tick();
    top->rst_n = 1; tick();

    int err = 0, ntest = 0;
    auto run = [&](const char* n, const Mat8& A, const Mat8& W, int gap) { err += run_test(n, A, W, gap); ntest++; };

    Mat8 I(N_, std::vector<int8_t>(N_, 0));
    for (int i = 0; i < N_; i++) I[i][i] = 1;
    run("identity", rnd(8, N_, -128, 127), I, 0);
    run("single-row", rnd(1, N_, -128, 127), rnd(N_, N_, -128, 127), 0);
    run("random-back2back", rnd(32, N_, -128, 127), rnd(N_, N_, -128, 127), 0);
    run("random-gaps", rnd(32, N_, -128, 127), rnd(N_, N_, -128, 127), 3);
    Mat8 neg(N_, std::vector<int8_t>(N_, -128));
    run("extreme-neg", Mat8(16, std::vector<int8_t>(N_, -128)), neg, 0);
    run("extreme-mix", rnd(16, N_, -128, -127), rnd(N_, N_, 126, 127), 0);
    for (int r = 0; r < 20; r++) {
        int g = rand() % 4;
        if (g == 1) g = 0;  // gap_every=1 would never send
        run("random-sweep", rnd(1 + rand() % 40, N_, -128, 127), rnd(N_, N_, -128, 127), g);
    }

    printf("N=%d : %d tests, %s\n", N_, ntest, err ? "FAILED" : "ALL PASS");
    if (tfp) { tfp->close(); }
    delete top;
    return err ? 1 : 0;
}
