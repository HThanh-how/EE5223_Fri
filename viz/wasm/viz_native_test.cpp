// Native Verilator check of the visualisation harness: compares the recorded
// trace of sa_top against the GEMM golden and against the structural invariants
// the animation relies on (stationary weights, skew, PE chaining, latency 2N-1).
#include "viz_core.h"
#include <cstdio>
#include <cstdlib>
using namespace viz;
static int err = 0;
#define CHECK(c, ...) do { if (!(c)) { if (err < 20) { printf("FAIL: " __VA_ARGS__); printf("\n"); } err++; } } while (0)

static void test(int M, int lo, int hi, int seed) {
    srand(seed);
    std::vector<int> A(M * N), W(N * N);
    for (auto& v : A) v = lo + rand() % (hi - lo + 1);
    for (auto& v : W) v = lo + rand() % (hi - lo + 1);
    Sim s; s.run(A, M, W);
    for (int m = 0; m < M; m++)
        for (int j = 0; j < N; j++) {
            int ref = 0; for (int k = 0; k < N; k++) ref += A[m * N + k] * W[k * N + j];
            CHECK(s.result[m * N + j] == ref, "C[%d][%d]=%d ref=%d", m, j, s.result[m * N + j], ref);
        }
    int T = (int)s.trace.size();
    int s0 = N * N / 4;  // first stream cycle
    CHECK(T == s0 + M - 1 + 2 * N - 1 + 1, "trace length %d", T);
    for (auto& c : s.trace) {
        if (c.cycle >= s0) for (int i = 0; i < N; i++) for (int j = 0; j < N; j++)
            CHECK(c.w[i * N + j] == W[i * N + j], "weight cyc %d", c.cycle);
        for (int i = 0; i < N; i++) for (int j = 0; j < N; j++) {
            // activation at PE[i][j] in cycle t is A[t-s0-i-j][i]
            int m = c.cycle - s0 - i - j;
            int exp = (m >= 0 && m < M) ? A[m * N + i] : 0;
            CHECK(c.a[i * N + j] == exp, "a[%d][%d] cyc %d got %d exp %d", i, j, c.cycle, c.a[i * N + j], exp);
            // psum register = partial dot product over rows k<=i, one cycle after the activation arrived
            int mp = c.cycle - 1 - s0 - i - j;
            int pe = 0;
            if (mp >= 0 && mp < M) for (int k = 0; k <= i; k++) pe += A[mp * N + k] * W[k * N + j];
            CHECK(c.ps[i * N + j] == pe, "ps[%d][%d] cyc %d got %d exp %d", i, j, c.cycle, c.ps[i * N + j], pe);
        }
        int mo = c.cycle - s0 - (2 * N - 1);
        CHECK(c.outValid == (mo >= 0 && mo < M), "outValid cyc %d", c.cycle);
        if (c.outValid) for (int j = 0; j < N; j++) {
            int ref = 0; for (int k = 0; k < N; k++) ref += A[mo * N + k] * W[k * N + j];
            CHECK(c.cOut[j] == ref, "cOut row %d col %d", mo, j);
        }
    }
    printf("[M=%d range %d..%d] cycles=%d errors so far=%d\n", M, lo, hi, T, err);
}

// "dump" mode: print the trace of the default demo example (compared by tests/node_check.mjs against the WASM build)
static int dump() {
    const int Wm[16] = {1, 0, 2, -1, 3, 1, 0, 2, -2, 4, 1, 0, 0, 1, -1, 3};
    const int Am[16] = {1, 2, 3, 4, 5, 6, 7, 8, -1, 0, 1, 2, 2, -3, 4, -5};
    std::vector<int> A(Am, Am + 16), W(Wm, Wm + 16);
    Sim s; s.run(A, 4, W);
    for (auto& c : s.trace) {
        printf("%d %d %d %d %d %d %d", c.cycle, c.phase, c.wWe, c.wIdx, c.inValid, c.inRow, c.outValid);
        printf(" %d", c.outRow);
        for (auto* v : {&c.aIn, &c.aSkew, &c.cOut, &c.south, &c.w, &c.a, &c.psIn, &c.ps})
            for (int x : *v) printf(" %d", x);
        printf("\n");
    }
    return 0;
}

int main(int argc, char** argv) {
    if (argc > 1) return dump();
    test(4, -9, 9, 1); test(1, -128, 127, 2); test(7, -128, 127, 3); test(16, -128, 127, 4);
    printf(err ? "NATIVE TEST FAILED (%d)\n" : "NATIVE TEST PASSED\n", err);
    return err != 0;
}
