#!/bin/bash
# on LXC 190: copy rpt/summary of all finished runs to /root/ee5223/fit/reports
cd /root/ee5223/fit
mkdir -p reports; rm -f reports/*
for d in run_*; do t=${d#run_}; [ -f $d/npu.sta.summary ] || continue
  for f in $d/*.rpt $d/*.summary $d/compile.log; do cp $f reports/${t}_$(basename $f); done; done
