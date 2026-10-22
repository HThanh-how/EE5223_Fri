// bindings.cpp - Emscripten/embind glue: NpuSim.run(A, M, W) -> { n, m, states[], result[] }
#include "viz_core.h"
#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <string>
using emscripten::val;

static val vec(const std::vector<int>& v) {
    val a = val::array();
    for (size_t i = 0; i < v.size(); i++) a.set(i, v[i]);
    return a;
}

class NpuSim {
    viz::Sim sim_;
public:
    int getN() const { return viz::N; }
    // A: flat row-major M x N, W: flat row-major N x N (int8 values)
    val run(const val& Aflat, int M, const val& Wflat) {
        std::vector<int> A, W;
        for (int i = 0; i < M * viz::N; i++) A.push_back(Aflat[i].as<int>());
        for (int i = 0; i < viz::N * viz::N; i++) W.push_back(Wflat[i].as<int>());
        sim_.run(A, M, W);
        val states = val::array();
        static const char* ph[] = {"LOAD", "STREAM", "DRAIN", "DONE"};
        for (size_t k = 0; k < sim_.trace.size(); k++) {
            const viz::Cycle& c = sim_.trace[k];
            val s = val::object();
            s.set("cycle", c.cycle);
            s.set("phase", std::string(ph[c.phase]));
            s.set("wWe", c.wWe != 0);
            s.set("wIdx", c.wIdx);
            s.set("inValid", c.inValid != 0);
            s.set("inRow", c.inRow);
            s.set("outValid", c.outValid != 0);
            s.set("outRow", c.outRow);
            s.set("aIn", vec(c.aIn));
            s.set("aSkew", vec(c.aSkew));
            s.set("cOut", vec(c.cOut));
            s.set("south", vec(c.south));
            s.set("w", vec(c.w));
            s.set("a", vec(c.a));
            s.set("psIn", vec(c.psIn));
            s.set("ps", vec(c.ps));
            states.set(k, s);
        }
        val out = val::object();
        out.set("n", viz::N);
        out.set("m", M);
        out.set("states", states);
        out.set("result", vec(sim_.result));
        return out;
    }
};

EMSCRIPTEN_BINDINGS(npu_viz) {
    emscripten::class_<NpuSim>("NpuSim")
        .constructor<>()
        .function("getN", &NpuSim::getN)
        .function("run", &NpuSim::run);
}
