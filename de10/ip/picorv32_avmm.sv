// PicoRV32 (third_party/picorv32, ISC licence) with an Avalon-MM master port, for the
// licence-free fallback system (system_pico). Same CPU configuration as the verified
// simulation SoC (proj/soc/soc_top.sv). Native-to-Avalon bridge: one outstanding
// transfer, waits for waitrequest low, then (reads) for readdatavalid.
// A 64-bit cycle counter is decoded locally at MTIME_ADDR (+0 low, +4 high), so the
// firmware's rdcycle/mtime read works exactly as on the Nios V system (timer at 0x2002_0000).
module picorv32_avmm #(
    parameter logic [31:0] MTIME_ADDR = 32'h2002_0000
) (
    input  logic        clk,
    input  logic        reset_n,
    output logic [31:0] avm_address,
    output logic [3:0]  avm_byteenable,
    output logic        avm_read,
    output logic        avm_write,
    output logic [31:0] avm_writedata,
    input  logic [31:0] avm_readdata,
    input  logic        avm_readdatavalid,
    input  logic        avm_waitrequest,
    output logic        cpu_trap
);
    logic        mem_valid, mem_instr, mem_ready;
    logic [31:0] mem_addr, mem_wdata, mem_rdata;
    logic [3:0]  mem_wstrb;

    picorv32 #(
        .ENABLE_COUNTERS(1), .ENABLE_COUNTERS64(1),
        .ENABLE_FAST_MUL(1), .ENABLE_DIV(1),
        .COMPRESSED_ISA(0), .BARREL_SHIFTER(1),
        .PROGADDR_RESET(32'h0), .STACKADDR(32'h0004_0000)
    ) u_cpu (
        .clk, .resetn(reset_n), .trap(cpu_trap),
        .mem_valid, .mem_instr, .mem_ready, .mem_addr, .mem_wdata, .mem_wstrb, .mem_rdata,
        .mem_la_read(), .mem_la_write(), .mem_la_addr(), .mem_la_wdata(), .mem_la_wstrb(),
        .pcpi_valid(), .pcpi_insn(), .pcpi_rs1(), .pcpi_rs2(),
        .pcpi_wr(1'b0), .pcpi_rd(32'b0), .pcpi_wait(1'b0), .pcpi_ready(1'b0),
        .irq(32'b0), .eoi(), .trace_valid(), .trace_data()
    );

    logic [63:0] mtime;
    always_ff @(posedge clk or negedge reset_n)
        if (!reset_n) mtime <= '0; else mtime <= mtime + 64'd1;

    typedef enum logic [1:0] {S_IDLE, S_CMD, S_RD} state_t;
    state_t st;

    always_ff @(posedge clk or negedge reset_n) begin
        if (!reset_n) begin
            st <= S_IDLE; mem_ready <= 1'b0; mem_rdata <= '0;
            avm_address <= '0; avm_byteenable <= '0; avm_read <= 1'b0; avm_write <= 1'b0; avm_writedata <= '0;
        end else begin
            mem_ready <= 1'b0;
            case (st)
                S_IDLE: if (mem_valid && !mem_ready) begin
                    if (mem_addr[31:3] == MTIME_ADDR[31:3] && mem_wstrb == 4'b0000) begin
                        mem_rdata <= mem_addr[2] ? mtime[63:32] : mtime[31:0];
                        mem_ready <= 1'b1;
                    end else begin
                        avm_address    <= {mem_addr[31:2], 2'b00};
                        avm_byteenable <= (|mem_wstrb) ? mem_wstrb : 4'b1111;
                        avm_write      <= |mem_wstrb;
                        avm_read       <= ~|mem_wstrb;
                        avm_writedata  <= mem_wdata;
                        st             <= S_CMD;
                    end
                end
                S_CMD: if (!avm_waitrequest) begin
                    avm_read  <= 1'b0;
                    avm_write <= 1'b0;
                    if (avm_write) begin
                        mem_ready <= 1'b1;
                        st        <= S_IDLE;
                    end else begin
                        st        <= S_RD;
                    end
                end
                S_RD: if (avm_readdatavalid) begin
                    mem_rdata <= avm_readdata;
                    mem_ready <= 1'b1;
                    st        <= S_IDLE;
                end
                default: st <= S_IDLE;
            endcase
        end
    end
endmodule
