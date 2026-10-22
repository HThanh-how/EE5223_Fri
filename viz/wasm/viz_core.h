// viz_core.h - drives the Verilated viz_top (which wraps OUR unmodified sa_top)
// and records one state snapshot per clock cycle. Pure C++ (no emscripten), so
// the same code runs natively (viz_native_test.cpp) and in WASM (bindings.cpp).
//
// Sampling convention ("the cycle as seen during cycle t"):
//   1. apply this cycle's inputs, clk=0, eval()  -> sample all signals
//   2. clk=1, eval()                              -> registers update
// So PE weight / psum are the register values at the START of the cycle, and
// the activation arriving at PE[i][j] is the value it will multiply this cycle.
#pragma once
#include "Vviz_top.h"
#include "verilated.h"
#include <cstdint>
#include <memory>
#include <vector>

#ifndef VIZ_N
#define VIZ_N 4
#endif

namespace viz {

constexpr int N = VIZ_N;
enum Phase { LOAD = 0, STREAM = 1, DRAIN = 2, DONE = 3 };

struct Cycle {
    int cycle, phase;
    int wWe, wIdx;              // weight write port this cycle
    int inValid, inRow;         // activation row being fed (inRow = -1 if none)
    int outValid, outRow;       // result row leaving (outRow = -1 if none)
    std::vector<int> aIn;       // [N]   raw a_in (before skew)
    std::vector<int> aSkew;     // [N]   a entering row i after input skew
    std::vector<int> cOut;      // [N]   c_out (after de-skew)
    std::vector<int> w, a, psIn, ps;  // [N*N] row-major, per PE
    std::vector<int> south;     // [N]   raw psum at bottom of each column
};

class Sim {
    std::unique_ptr<VerilatedContext> ctx_;
    std::unique_ptr<Vviz_top> top_;
    int cyc_ = 0;

    void tickRaw() { top_->clk = 0; top_->eval(); top_->clk = 1; top_->eval(); }

public:
    std::vector<Cycle> trace;
    std::vector<int> result;     // M*N, row-major, collected from out_valid/c_out
    int M = 0;

    Sim() : ctx_(new VerilatedContext), top_(new Vviz_top(ctx_.get(), "TOP")) {}
    ~Sim() { top_->final(); }

    Cycle sample(int phase, int inRow, int outRow, const std::vector<int>& aRaw) {
        Cycle c;
        c.cycle = cyc_; c.phase = phase;
        c.wWe = top_->w_we; c.wIdx = top_->w_widx;
        c.inValid = top_->in_valid; c.inRow = inRow;
        c.outValid = top_->out_valid; c.outRow = outRow;
        c.aIn = aRaw;
        for (int i = 0; i < N; i++) {
            c.aSkew.push_back((int8_t)top_->dbg_askew[i]);
            c.cOut.push_back((int32_t)top_->c_out[i]);
            c.south.push_back((int32_t)top_->dbg_south[i]);
        }
        for (int i = 0; i < N; i++)
            for (int j = 0; j < N; j++) {
                c.w.push_back((int8_t)top_->dbg_w[i][j]);
                c.a.push_back((int8_t)top_->dbg_a[i][j]);
                c.psIn.push_back((int32_t)top_->dbg_psin[i][j]);
                c.ps.push_back((int32_t)top_->dbg_ps[i][j]);
            }
        return c;
    }

    // A: M x N row-major int8 values, W: N x N row-major int8 values.
    // Resets the array, loads W, streams the M rows of A, waits for all results.
    void run(const std::vector<int>& A, int M_, const std::vector<int>& W) {
        trace.clear(); result.assign((size_t)M_ * N, 0); M = M_; cyc_ = 0;
        top_->clk = 0; top_->rst_n = 0; top_->w_we = 0; top_->w_widx = 0; top_->w_wdata = 0;
        top_->in_valid = 0; top_->a_in = 0;
        top_->eval();
        for (int k = 0; k < 3; k++) tickRaw();
        top_->rst_n = 1; tickRaw();

        std::vector<int> zero(N, 0);
        // ---- phase 1: load weights, one 32-bit word (4 weights) per cycle ----
        for (int word = 0; word < N * N / 4; word++) {
            int row = word / (N / 4), q = word % (N / 4);
            uint32_t d = 0;
            for (int b = 0; b < 4; b++) d |= (uint32_t)(uint8_t)W[row * N + 4 * q + b] << (8 * b);
            top_->w_we = 1; top_->w_widx = word; top_->w_wdata = d;
            top_->in_valid = 0; top_->a_in = 0;
            top_->clk = 0; top_->eval();
            trace.push_back(sample(LOAD, -1, -1, zero));
            top_->clk = 1; top_->eval(); cyc_++;
        }
        top_->w_we = 0;
        // ---- phase 2: stream rows of A, then flush until all rows came out ----
        int sent = 0, got = 0;
        while (got < M) {
            bool send = sent < M;
            std::vector<int> raw(N, 0);
            uint64_t a = 0;
            if (send)
                for (int k = 0; k < N; k++) {
                    raw[k] = (int8_t)A[sent * N + k];
                    a |= (uint64_t)(uint8_t)A[sent * N + k] << (8 * k);
                }
            top_->in_valid = send; top_->a_in = a;
            top_->clk = 0; top_->eval();
            int outRow = top_->out_valid ? got : -1;
            Cycle c = sample(sent < M ? STREAM : DRAIN, send ? sent : -1, outRow, raw);
            if (top_->out_valid) {
                for (int j = 0; j < N; j++) result[got * N + j] = (int32_t)top_->c_out[j];
                got++;
                if (got == M) c.phase = DONE;
            }
            trace.push_back(c);
            if (send) sent++;
            top_->clk = 1; top_->eval(); cyc_++;
            if (cyc_ > 100000) break;
        }
    }
};

}  // namespace viz
