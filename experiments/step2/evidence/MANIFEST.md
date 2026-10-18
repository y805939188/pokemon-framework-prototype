# 证据清单（每个文件是什么、怎么产生的、对应哪个构建）

读法：这些是第二步各结论的原始证据。包内报告的 `env.packageInfo`（`app.nw/package-info.json` 在打包时写入）记录产生时的代码状态：`gitHead`、`diffSha256`（未提交的代码改动的哈希，**不含 `docs/` 与 `experiments/step2/evidence/`**，因为它们在测试过程中会变；空输入的哈希 `e3b0c442…` 表示相对 `gitHead` 没有代码改动）、`signing`（`adhoc` / `adhoc+hardened-runtime` / `identity:…+hardened-runtime`）、`builtAt`。开发树里跑的流程测试没有 `packageInfo`（为 `null`），它对应的代码状态在下表里写明。

## 当前证据（第三步候选，2026-10-18）

`package/`、`flow/` 下的报告、截图与 `package/perf*` 现在是**第三步候选**（迁移成严格 TS、内容管线、本地化、存档版本之后）的证据，由提交 **`2f5b808`**（代码与 `dabe03a` 相同，仅多一个文档提交）的**已提交**代码产生：打包时 `diffSha256` 为空输入哈希、`signing` 为 `adhoc+hardened-runtime`、两次构建的 `builtAt` 分别为 18:08:03Z（第 1 次，流程测试）和 18:08:57Z（第 2 次：重启读档、场景矩阵、存档位置）。第二步最终证据（`e666bba`/`0556a68`，CJS 原型）仍在 git 历史里（提交 `f8f47cd`），已被它取代。

| 文件 | 内容 | 产生方式 |
|---|---|---|
| `package/ps-flow-report.json`、`ps-flow-verify-save.json`、`ps-saveloc.json` | 包内游戏内流程 T1–T10（含第二语言 T8、旧存档/不可用存档 T9、失效引用 T10）、重启读档 V1、默认存档位置 SL1 | `PF_PACKAGE_ARGS=--harden scripts/run-package-tests-mac.sh` |
| `package/ps-matrix-package.json`、`ps-matrix-node.json` | 场景矩阵 S1–S10 在包内与普通 Node 22 的指纹（逐项相同，也等于入库基线），**并记录两个宿主各自加载的引擎包哈希（相同：`0f5c76de…`，140,710 字节）** | 同上 |
| `package/perf-summary.json`、`package/perf/run{1,2,3}.json` | 3 次冷启动的性能与内存（第二次测量；第一次的动作延迟相同量级） | `scripts/run-package-perf-mac.sh 3`（同一个包） |
| `flow/*` | 同一批流程在**开发树**里的报告与截图（`contentIdentity` 记录用的是内容管线样本，`logTail` 是脱敏的会话日志尾部） | `scripts/run-flow-test-mac.sh` |
| `memory-100/after|before/` | 100 场战斗、强制 GC 的内存曲线（修复开/关）。**来自提交 `e666bba` 的包（第二步修复后），第三步没有重做**；第三步包的 24 场内存为 1,230–1,238 MB，与之一致 | 见第二步 |

性能与 C2 对照（本机、3 次启动中位数；原始数据 `history/c2-perf-*.json`）：冷启动到插件 769 ms（C2 821）、到地图 1,796 ms（1,850）；首场战斗到菜单 550 ms（550）、后续 133 ms（133）；战斗场景帧 p50/p95 16.7/18.6 ms（相同）；24 场后 RSS 1,230 MB（C2 修复前 1,371）。**唯一变化：** 引擎动作延迟中位数 move/item/ball/run 约 3.4/3.4/2.4/1.8 ms → 4.7–5.6/5.7/3.1–4.2/2.5 ms（+1.5–2 ms，重复测量可复现）。已排除引擎与日志：在 NW.js 自己的 Node 环境里，旧 CJS 引擎、新 TS 引擎、带/不带日志同一批动作都是 0.2–0.4 ms；在完整应用里增加的部分没有隔离出原因（候选：同一场景回合里的界面侧改动）；对帧时间和到菜单的时间没有影响，绝对值仍在一帧以内，不阻塞，但**没有解释到底**。

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
