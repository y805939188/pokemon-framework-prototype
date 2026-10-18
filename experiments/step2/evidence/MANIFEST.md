# 证据清单（每个文件是什么、怎么产生的、对应哪个构建）

读法：这些是第二步各结论的原始证据。包内报告的 `env.packageInfo`（`app.nw/package-info.json` 在打包时写入）记录产生时的代码状态：`gitHead`、`diffSha256`（未提交的代码改动的哈希，**不含 `docs/` 与 `experiments/step2/evidence/`**，因为它们在测试过程中会变；空输入的哈希 `e3b0c442…` 表示相对 `gitHead` 没有代码改动）、`signing`（`adhoc` / `adhoc+hardened-runtime` / `identity:…+hardened-runtime`）、`builtAt`。开发树里跑的流程测试没有 `packageInfo`（为 `null`），它对应的代码状态在下表里写明。

## 最终证据（独立评审后重新生成，2026-10-18）

全部由提交 **`e666bba`** 的代码产生（`diffSha256` 为空输入哈希：打包时除文档外没有任何未提交改动）。这与 C2 时不同：C2 的证据来自 `482ea3d` 加未提交改动。

| 文件 | 内容 | 产生方式 | 构建 |
|---|---|---|---|
| `package/ps-flow-report.json` | 包内游戏内流程 T1–T7（真实按键/事件/MZ 存档） | `PF_PACKAGE_ARGS=--harden scripts/run-package-tests-mac.sh` | 第 1 次构建（`builtAt` 14:42:21Z），`adhoc+hardened-runtime` |
| `package/ps-flow-verify-save.json`、`ps-matrix-package.json`、`ps-saveloc.json`、`ps-matrix-node.json` | 应用被**替换**为新构建后：重启读档校验 V1、场景矩阵 S1–S10（包内）、默认存档位置 SL1、同一矩阵在普通 Node 22 下的指纹 | 同上 | 第 2 次构建（`builtAt` 14:42:58Z）；脚本会检查四份报告来自预期的两次构建；包内与 Node 的指纹逐项相同，且都等于入库基线 `js/engine/fixtures/matrix-fingerprints.json`（已逐项核对） |
| `package/perf-summary.json`、`package/perf/run{1,2,3}.json` | 3 次冷启动的性能与内存汇总及原始数据 | `scripts/run-package-perf-mac.sh 3`（同一个包，因此是**硬化运行时**临时签名；C2 的性能数据是普通临时签名） | 同第 2 次构建 |
| `memory-100/after/`、`memory-100/before/` | 100 场战斗（25 轮 × 4 种）、强制 GC 的内存曲线：修复后 / 关闭两处修复（`--ps-fix=no-texture,no-batcher`）；结果：关闭修复 RSS 1,141→1,538 MB（线性增长），开启修复 1,135→1,229 MB（平台）；渲染进程 JS 堆两次都是 28 MB（见 `runtime-issues.md`） | `PF_PERF_ARGS="--ps-perf-rounds=25 --js-flags=--expose-gc [--ps-fix=…]" scripts/run-package-perf-mac.sh 1 <目录>` | 同第 2 次构建 |
| `package/01-…07-*.png`、`package/ps-flow-expected.json` | 包内流程截图与期望状态快照 | 同第一行 | 第 1 次构建 |
| `flow/*` | 同一批流程在**开发树**（NW.js 直接启动项目，`--ps-save-dir` 指向证据目录）里的报告与截图 | `scripts/run-flow-test-mac.sh` | 提交 `e666bba` 的工作树（文档与证据是当时唯一未提交的改动）；无 `packageInfo` |

关于截图：`flow/` 与 `package/` 的 05–07 号截图逐字节相同，因为两个宿主在同一尺寸（816×624）下渲染同一个确定的占位界面，得到相同的像素；每次运行都会先删除再重写图片。开发树那次运行的 01–04 号截图是 2 倍尺寸（1632×1248），原因未查。

## 历史证据（`history/`，对应各阶段标签；已被上面的新运行取代）

| 文件 | 阶段与用途 |
|---|---|
| `c2-perf-summary.json`、`c2-perf-run{1,2,3}.json` | C2（2.5 报告表格所描述的状态）的性能与内存原始数据，取自提交 `0ac24d4`；构建 = `482ea3d` + 19 处未提交改动，普通临时签名。2.5 报告的数字（冷启动 821 ms、RSS 1,207→1,371 MB 等）对应这些文件 |
| `post-review-perf-attempt1-summary.json`、`…-run{1,2,3}.json` | 评审修复后**第一次**性能运行（同一个包）：三次启动中第 1 次有一个脚本动作超时（`potion+run#2: timeout waiting for mode bag`，该次有约 2,000 帧窗口未聚焦），第 2、3 次干净。保留作为一次失败记录；`package/perf*` 是第二次运行（3 次均无错误）。两次共 6 次启动里有 1 次失败：性能脚本的稳定性不能说已证明 |
| `mz-playtest.json` | 2.1：用户在 MZ 编辑器里 Playtest 的冒烟结果（4 项检查通过） |
| `deployed-package-repaired-shell.json` | 2.1：MZ 部署出的 `app.nw` 放进修复后的外壳，用 `open` 启动的冒烟结果 |
| `nwjs-direct-dev.json` | 2.1：NW.js 直接启动开发树的冒烟结果 |
| `nwjs-direct-copy-proxy.json` | 2.1：把裁剪后的项目副本放到别的目录运行（路径无关性代理，不是部署包） |
| `nwjs-direct-2.2.json`、`nwjs-direct-2.3.json`、`nwjs-direct-2.4-smoke.json` | 2.2 / 2.3 / 2.4 阶段当时的冒烟检查（5 / 6 / 6 项） |

## 已知的证据局限

- 没有 CI 记录；所有结果来自本机手动/脚本运行。
- 黄金文件（`js/engine/fixtures/golden-*.json`）与指纹由被测代码自己生成：只能证明稳定性与环境一致性，不能证明与原版行为一致。矩阵指纹基线是回归守护（行为变化会让测试失败，需有意更新），不是正确性证明。
- 性能数据来自一台机器（Apple M1 Max, 32 GB）、快速脚本路径（无消息节奏）；窗口在运行期间可能失焦（驱动已覆盖暂停与节流），个别冷启动在新打包后的首次启动明显更慢，已在报告里单独说明。
- **没有存证据**（仅作者陈述，工具还在，需要时可重做）：堆快照的对象计数（`runtime-issues.md` §1）、"另一个应用每 2 秒抢一次焦点时 28 项检查通过"、"10 次包内运行失败 4 次"。
- 评审问题的回答：最终证据当时是否用 `--harden`、35 处未提交改动具体是什么，旧证据无法证明；新证据把签名方式和代码状态记录在 `packageInfo` 里（见 `docs/step2/review-followups.md`）。
