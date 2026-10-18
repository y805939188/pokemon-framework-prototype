# 证据清单（每个文件是什么、怎么产生的、对应哪个构建）

读法：这些是第二步各结论的原始证据。`packageInfo.gitHead` 与 `workingTreeChanges` 记录产生时的代码状态（打包时写入，位于报告 JSON 的 `env.packageInfo`）。**最终证据（`flow/`、`package/`）产生于 `0ac24d4` 加 35 处当时未提交的改动，这些改动随后原样提交为 `135cd7a`（标签 `step2.runtime-pass`）**；之后只改了文档、脚本说明和整理，没有改变被测代码的行为。更早阶段的证据对应各自阶段标签的代码，已被后来的包内测试取代，保留作为历史。

## 最终证据（对应当前代码）

| 文件 | 内容 | 产生方式 | 构建 |
|---|---|---|---|
| `package/ps-flow-report.json`、`ps-flow-verify-save.json`、`ps-saveloc.json` | 包内游戏内流程 T1–T7、重启后读档校验、默认存档位置 | `scripts/run-package-tests-mac.sh`（`PF_PACKAGE_ARGS=--harden`，即硬化运行时临时签名的包） | `0ac24d4`+未提交改动（= `135cd7a`），NW.js 0.117.0 / Node 26.7.0 |
| `package/ps-matrix-package.json`、`ps-matrix-node.json` | 场景矩阵 S1–S10 在包内与普通 Node 22 的指纹，二者逐项相同 | 同上 | 同上 |
| `package/perf-summary.json`、`package/perf/run{1,2,3}.json` | 3 次冷启动的性能与内存汇总及原始数据 | `scripts/run-package-perf-mac.sh 3`（普通临时签名的包） | `0ac24d4`+未提交改动 |
| `package/01-…07-*.png`、`package/ps-flow-expected.json` | 包内流程截图与期望状态快照（05–07 号截图来自较早一次同类运行） | 同第一行 | 同上（05–07 稍早） |
| `flow/*` | 同一批流程在**开发树**（NW.js 直接启动项目）里的报告与截图 | `scripts/run-flow-test-mac.sh` | 运行时问题处理期间，代码同上（05–07 号截图稍早） |

## 历史证据（`history/`，对应各阶段标签；已被上面的包内测试取代）

| 文件 | 阶段与用途 |
|---|---|
| `mz-playtest.json` | 2.1：用户在 MZ 编辑器里 Playtest 的冒烟结果（4 项检查通过） |
| `deployed-package-repaired-shell.json` | 2.1：MZ 部署出的 `app.nw` 放进修复后的外壳，用 `open` 启动的冒烟结果 |
| `nwjs-direct-dev.json` | 2.1：NW.js 直接启动开发树的冒烟结果 |
| `nwjs-direct-copy-proxy.json` | 2.1：把裁剪后的项目副本放到别的目录运行（路径无关性代理，不是部署包） |
| `nwjs-direct-2.2.json`、`nwjs-direct-2.3.json`、`nwjs-direct-2.4-smoke.json` | 2.2 / 2.3 / 2.4 阶段当时的冒烟检查（5 / 6 / 6 项） |

## 已知的证据局限

- 没有 CI 记录；所有结果来自本机手动/脚本运行。
- 黄金文件（`js/engine/fixtures/golden-*.json`）与指纹由被测代码自己生成：只能证明稳定性与环境一致性，不能证明与原版行为一致。
- 性能数据来自一台机器（Apple M1 Max, 32 GB）、快速脚本路径（无消息节奏）、窗口已聚焦的 3 次启动；个别冷启动在新打包后的首次启动明显更慢，已在报告里单独说明。
