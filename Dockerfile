# Reproducible open-source toolchain + repository for the INT8 systolic-array NPU.
#   docker run --rm ghcr.io/<owner>/<repo>:latest                 # full preflight
#   docker run --rm ghcr.io/<owner>/<repo>:latest make soc N=8 FW=cnn
FROM debian:trixie-slim

LABEL org.opencontainers.image.source="https://github.com/HThanh-how/EE5223_Fri"
LABEL org.opencontainers.image.description="INT8 systolic-array NPU: open-source simulation toolchain and regression"

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
        verilator gcc-riscv64-unknown-elf make g++ python3 python3-numpy ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/npu
COPY rtl rtl
COPY sim sim
COPY soc soc
COPY fw fw
COPY scripts scripts
COPY third_party third_party
COPY results results
COPY Makefile .

CMD ["bash", "scripts/preflight.sh", "--quick"]
