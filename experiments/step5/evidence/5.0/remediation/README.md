# 5.0 整改的第四步对照基线

`baseline/` 是本次 Codex 编码接手实跑的第四步 `c789620` 基线，不是独立 review。

- 干净 detached 临时工作树；`package-info.json` 记录精确 SHA、ad-hoc 签名和 17 个产物。
- `perf-run1..3.json` / `perf-summary.json`：3 次进程启动，24 场轮次战斗＋6 场地图遭遇。
- `memory100-run1.json` / `memory100-summary.json`：25 轮×4 场，强制 GC；内存点在后续额外遭遇之前取样。
- DPR 2，窗口未获得前台焦点，帧采样数为 0。第四步旧脚本缺初始失焦记录，其“全程聚焦”统计不能采信；新预算据原始帧采样将对应基线设为 null。5.0 的测量代码已经修正初始及末尾失焦区间。
- 候选最终 SHA 和全部实跑/复用/未验证证据在工作区 `.handoff/step5-0-candidate-report.zh.md`，原始输出在 `.verify/step5-5.0/`；不将旧头测试当作最终头实跑。
