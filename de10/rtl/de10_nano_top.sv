// DE10-Nano top level: Nios V + INT8 systolic NPU (Platform Designer system "system").
// Pins (Terasic DE10-Nano golden top, see README): FPGA_CLK1_50=V11, KEY[0]=AH17,
// KEY[1]=AH16, LED[0..7]=W15,AA24,V16,V15,AF26,AE26,Y16,AA23 (all 3.3-V LVTTL).
//
//   KEY[0]  : reset (active low push-button) -> re-runs the program in on-chip RAM
//   LED[0]  : heartbeat (FPGA configured, clock running)
//   LED[1]  : firmware running          (PIO bit 1)
//   LED[2]  : firmware finished          (PIO bit 2)
//   LED[3]  : test PASS (main returned 0) (PIO bit 3)
//   LED[4]  : test FAIL                  (PIO bit 4)
//   LED[5]  : unexpected CPU trap        (PIO bit 5)
//   LED[7:6]: unused (PIO bits 7:6)
module de10_nano_top (
    input  logic       FPGA_CLK1_50,
    input  logic [1:0] KEY,
    output logic [7:0] LED
);
    logic clk;
    assign clk = FPGA_CLK1_50;

    // power-on reset + synchronised push-button reset (asserted ~1.3 ms after configuration)
    logic [1:0]  key_sync;
    logic [15:0] por_cnt = '0;
    logic        rst_n   = 1'b0;
    always_ff @(posedge clk) begin
        key_sync <= {key_sync[0], KEY[0]};
        if (!key_sync[1]) begin
            por_cnt <= '0;
            rst_n   <= 1'b0;
        end else if (!(&por_cnt)) begin
            por_cnt <= por_cnt + 1'b1;
            rst_n   <= 1'b0;
        end else begin
            rst_n   <= 1'b1;
        end
    end

    logic [7:0] pio;
    system u_sys (
        .clk_clk       (clk),
        .reset_reset_n (rst_n),
        .led_export    (pio)
    );

    logic [25:0] hb = '0;
    always_ff @(posedge clk) hb <= hb + 1'b1;

    assign LED = {pio[7:1], hb[25]};
endmodule
