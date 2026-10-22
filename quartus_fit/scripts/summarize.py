#!/usr/bin/env python3
"""Summarise Quartus reports in quartus_fit/reports into a markdown table."""
import re, glob, os, sys
d = os.path.join(os.path.dirname(__file__), '..', 'reports')
rows = []
for f in sorted(glob.glob(d + '/*_npu.fit.summary')):
    tag = os.path.basename(f)[:-len('_npu.fit.summary')]
    s = open(f).read()
    g = lambda pat: (re.search(pat, s).group(1) if re.search(pat, s) else '?')
    alm = g(r'Logic utilization \(in ALMs\) : ([\d,]+)')
    reg = g(r'Total registers : (\d+)')
    dsp = g(r'Total DSP Blocks : (\d+)')
    m10k = g(r'Total RAM Blocks : (\d+)')
    bits = g(r'Total block memory bits : ([\d,]+)')
    sta = open(f.replace('fit.summary', 'sta.rpt')).read() if os.path.exists(f.replace('fit.summary', 'sta.rpt')) else ''
    m = re.search(r'Slow 1100mV 100C Model Fmax Summary.*?;\s*([\d.]+) MHz\s*;\s*([\d.]+) MHz', sta, re.S)
    fmax = f'{m.group(1)}' if m else '?'
    rows.append((tag, alm, reg, dsp, m10k, bits, fmax))
print('| run | ALMs | regs | DSP | M10K | mem bits | Fmax slow 100C (I7 worst) (MHz) |')
print('|---|---|---|---|---|---|---|')
for r in rows: print('| ' + ' | '.join(r) + ' |')
