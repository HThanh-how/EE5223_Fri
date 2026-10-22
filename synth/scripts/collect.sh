#!/bin/bash
# Prints summary tables from reports/ (run on LXC 180; REP defaults to /root/work_synth/reports)
REP=${REP:-/root/work_synth/reports}; cd $REP
echo "### generic (synth -flatten): cells / FFs"
for c in 4_64 8_64 8_32 4_32; do
  printf "%s cells=%s ff=%s\n" $c $(grep 'Number of cells' generic_$c.stat | tail -1 | awk '{print $4}') $(grep -E '^\s+\$_DFF' generic_$c.stat | awk '{s+=$2}END{print s}'); done
echo "### ecp5 yosys stat (flat)"
for c in 4_64 8_64 8_32 4_32 expA_4_64 expA_8_64; do
  printf "%s " $c; awk '/^ +(LUT4|TRELLIS_FF|MULT18X18D|DP16KD|TRELLIS_DPR16X4|CCU2C|PFUMX|L6MUX21) /{printf "%s=%s ",$1,$2}END{print ""}' ecp5_$c.stat 2>/dev/null || true; done
echo "### nextpnr"
for f in pnr*.log; do
  echo "$f: $(grep -h 'Total LUT4s' $f | tail -1 | sed 's/Info: *//') | $(grep -h 'Total DFFs' $f | tail -1 | sed 's/Info: *//') | $(grep -h 'DP16KD:' $f | tail -1 | sed 's/Info: *//') | $(grep -h 'MULT18X18D:' $f | tail -1 | sed 's/Info: *//') | $(grep -h 'Max frequency' $f | tail -1 | sed 's/.*clock //')"
done
echo "### intel_alm (estimate)"
for c in 4_64 8_64 8_32 4_32; do printf "%s " $c; awk '/^ +MISTRAL_/{printf "%s=%s ",$1,$2}END{print ""}' alm_$c.stat 2>/dev/null; done
