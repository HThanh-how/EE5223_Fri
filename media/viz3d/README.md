# 3D view of the systolic array - media

Rendered from the real-RTL trace of `sa_top` (4x4, INT8) by the "3D view" tab (viz/web), 1920x1080,
headless Chrome driven by `viz/tests/shots3d.mjs` and `viz/tests/render3d_video.mjs` (deterministic cycle clock).
Rendered on the local Windows GPU (the LXC became unreachable: Tailscale SSH re-auth required).

## video/
- `viz3d_systolic_array.mp4` - 72.2 s, H.264 yuv420p, 1920x1080, 30 fps, cinematic camera, no control bar.
  0-5 s establishing shot; 5-15 s weights load; 15-57 s feed / multiply-add / results; then bars turn green + "Matches the reference" badge; last 8 s orbit around the result.

## screenshots/ (1920x1080)
01_array_empty_before_weights - empty array, cycle 0 (weights not yet loaded)
02_weights_loading - amber gems drop into the blocks as weight rows are written
03_weights_loaded_close - weights loaded (cyan gem + "w = x"), close camera
04_skewed_entry_iso - rows of A entering, one beat apart (input skew)
05_wavefront_cinematic - diagonal wavefront, cinematic camera
06_mid_wavefront_low_angle - mid wavefront, low angle
07_partial_sums_side_view - partial sums (bar height) from the side
08_partial_sums_top_view - top view: heat-map of running totals
09_results_emerging_iso - results leave the de-skew boxes through the tray
10_results_to_chart_cinematic - result rows fly into the 3D bar chart of C
11_last_row_out - last result row
12_final_badge_iso - bars green + "Matches the reference" badge
13_final_badge_cinematic - same, cinematic, presentation mode
14_wavefront_close - close-up of the wavefront, presentation mode
