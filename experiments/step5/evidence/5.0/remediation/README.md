# 5.0 整改的第四步对照基线

`foreground-baseline/` 是本次 Codex 编码接手实跑的第四步 `c789620` 前台基线，不是独立 review。`baseline/` 保留先前失焦运行，仅作历史证据；最终候选获得前台焦点后，重新按相同前台条件测量，没有混用两组数据。

- 干净 detached 临时工作树；`package-info.json` 记录精确 SHA、ad-hoc 签名和 17 个产物。
- `perf-run1..3.json` / `perf-summary.json`：3 次进程启动，24 场轮次战斗＋6 场地图遭遇。
- `memory100-run1.json` / `memory100-summary.json`：25 轮×4 场，强制 GC；内存点在后续额外遭遇之前取样。
- DPR 2；前台基线各次都有战斗与地图帧样本、未失焦跳过帧、没有 blur 事件。历史失焦组帧采样数为 0，不能据旧脚本的零 blur 事件声称聚焦。5.0 测量代码已修正初始及末尾失焦区间。预算采用前台组；缺失基线仍由报告器单列，不以 0 替代。
- 候选最终 SHA 和全部实跑/复用/未验证证据在工作区 `.handoff/step5-0-candidate-report.zh.md`，原始输出在 `.verify/step5-5.0/`；不将旧头测试当作最终头实跑。
