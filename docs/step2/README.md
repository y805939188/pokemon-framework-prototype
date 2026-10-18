# 第二步总结与导航：验证战斗接入，确定路线和首版范围

状态：**已完成并经用户决定（C2，2026-10-18）**。结论：Showdown 可以在 MZ/RPGReactor（NW.js 0.117）里运行；RPG 行动、成长、写回用一层薄而有测试的桥接即可实现，Showdown 源码零补丁；继续这条路线，首版先做单打。规则与背景见 `../PROJECT-GUIDE.md`，当前进度见工作区 `.handoff/STATUS.md`。

## 做了什么（按阶段，标签指向各阶段结束时的提交）

| 阶段 | 标签 | 结果 | 详细 |
|---|---|---|---|
| 2.1 环境与加载 | `step2.1-accepted` | 模板导入；固定 Reactor 0.98.8@`2dc2e10e`、Showdown `7244fe8`；异步网关；Node 无头、NW.js、MZ Playtest 通过。MZ 部署会弄坏 Mac 包（用户决定：用户需按我们的方式更新本地 MZ，自己打包） | 本文「2.1 发现」 |
| 2.2 RPG 行动 | `step2.2-feasibility` | 自定义格式 + 引擎事件动作路线；道具/状态/能力道具、精灵球、逃跑；捕获与逃跑数学对照规格向量；战中升级探针 | `2.2-report.md` |
| 2.3 成长与写回 | `step2.3-c1` | 经验/EV/升级/学招、稳定身份写回、背包台账、原子存档、双打关键组合；杀进程测试；提交 C1 | `2.3-report.md` |
| 2.4 MZ 流程 | `step2.4-mz-flow` | 战斗插件、占位文字界面、测试地图、真实按键驱动测试；用户手动试玩发现的问题已修 | `2.4-report.md` |
| 独立评审后的修订 | （`step2-review-baseline` 之后的提交） | 修了成长 HP 校验、台账、捕获/逃跑规则与菜单守卫、协议冻结与矩阵基线、脚本安全与证据；未决事项列表 | `review-followups.md` |
| 2.5 打包与 C2 | `step2.5-c2` | 自己的打包命令；S1–S10 在包内与 Node 指纹一致；测量；协议 v1 冻结；提交 C2 | `2.5-report.md` |
| C2 后运行时问题 | `step2.runtime-pass` | 内存泄漏修复、存档放包外、硬化运行时用临时签名跑通、测试可失焦且静音 | `runtime-issues.md`、`signing-plan.md` |

## 文档导航

| 文件 | 内容 |
|---|---|
| `c2-decision.md` | 用户的 C2 决定（继续、单打先行、平台范围） |
| `deviations.md` | 与原版行为的 4 项已决定的有意差异，以及尚未决定的差异清单 |
| `review-followups.md` | 独立评审（Opus 5.5）的发现：哪些已修、哪些延后、哪些需要用户决定 |
| `protocol-v1.md` + `protocol-v1.frozen.json` | 冻结的战斗协议（所有者、同步点、消息、结果结构、持久性声明）；契约测试 `experiments/step2/s5/test-protocol-freeze.cjs` |
| `runtime-issues.md` | 内存泄漏诊断与修复证据、存档位置、失焦/静音、遗留问题 |
| `signing-plan.md` | 签名与公证：现状、已验证/未验证、有账号后的步骤 |
| `2.2`–`2.5-report.md` | 各阶段的契约提取、对比、结果、限制 |
| `baseline.json` | 机器可读的版本与身份基线（模板、Reactor、Showdown、工具链、夹具、包、协议、签名） |
| `../../experiments/step2/evidence/MANIFEST.md` | 每个证据文件由什么命令、在哪个构建上产生 |

## 关键发现（需要后续工作者记住）

1. 引擎接入用 Showdown 支持的 `custom-formats` 扩展点；非招式行动是队列里的 `event` 动作（优先级 99），不改 Showdown 源码。"结算前改状态再 pass"和"占位招式"已被比较或推理淘汰（见 2.2 报告）。
2. 成长（经验、等级、学招）由游戏规则层负责，引擎只被告知结果，并与游戏规则的能力值交叉校验（随机 400 组与 Showdown 一致）。
3. 持久状态在战斗中不被修改，只通过幂等的 `BattleResult` 提交；单文件"写临时文件再重命名"的存档在 5 个故障点（模拟抛错与真实 SIGKILL）下只会得到旧状态或新状态且重试只生效一次。**这条原子性只针对 headless `SaveStore`；MZ 存档的原子性是 MZ 自己的，没有检查。**
4. 稳定 id 受 Showdown 昵称限制（≤20 字符，我们限 ≤18 个安全字符）。
5. RPGReactor 在 PixiJS 8 上有两处内存泄漏（初始占位纹理、未清理的批处理器）；`PS_RuntimeFixes` 绕开，应当反馈上游。
6. MZ 的 Deploy 不能用于 Apple Silicon 上的新 NW.js；用 `scripts/package-mac.sh`；存档放包外（`PS_SaveLocation`）。
7. 只有一个中等程度的性能事实：冷启动约 0.8 s 到插件加载、1.85 s 到地图就绪；首场战斗约 550 ms 到首个菜单，之后约 133 ms；单次引擎回合 2–10 ms（本机，快速脚本路径，不是通用性能结论）。

## 第二步测试一览（命令 → 覆盖 → 代价）

| 命令 | 覆盖 | 代价 |
|---|---|---|
| `scripts/test-quick.sh` | 类型检查 + 10 个 Node 套件共 66 个测试：无头流程、道具/捕获/逃跑、成长、写回/故障边界、双打、文字描述、场景矩阵（对照入库的指纹基线）、协议冻结（从多场景观察）、引擎契约（拷贝一致 + Showdown 内部接口存在性）、Reactor 安装 | 约 10 秒（本机实测 7 s），无窗口 |
| `node experiments/step2/s2/probe-*.cjs`、`s3/probe-midturn-growth.cjs` | 战中升级、回复道具、路线对比、回合内成长的可行性探针 | 秒级 |
| `scripts/run-flow-test-mac.sh` | 游戏内流程 T1–T7 + 重启校验（NW.js 直接启动，真实按键/事件/存档） | 几分钟，弹窗口 |
| `scripts/run-package-tests-mac.sh` | 同一批场景在**打包后的应用**里 + 场景矩阵 S1–S10（与 Node 指纹对比）+ 默认存档位置 + 包签名封印 | 几分钟，弹窗口 |
| `scripts/run-package-perf-mac.sh` | 3 次冷启动的性能与内存（100 场战斗内存检查：`PF_PERF_ARGS="--ps-perf-rounds=25 --js-flags=--expose-gc [--ps-fix=no-texture,no-batcher]"`） | 几分钟，弹窗口 |

局限（不要在汇报中当作已完成）：没有运行过原版 Ruby；规格向量是推导的期望；黄金文件和指纹由同一套代码生成，证明"两个环境结果一致"，不证明"结果正确"；双打只测了关键组合且无界面；没有 Windows/Intel；没有 Developer ID 签名与公证；首次启动新包很慢（6–28 s，未诊断）；没有 CI。

## 未决与待办（用户决定权在用户）

- 首版范围已定（单打）；双打界面和长尾功能的阶段安排待后续确认。
- 4 项与原版的有意差异已决定（`deviations.md`），"升级复活濒死成员"在做道具使用功能族时再确认；持有物还原策略待持有物批次。
- 签名/公证需要 Apple Developer 账号（凭据由用户自己保管，步骤见 `signing-plan.md`）。
- 两处 Reactor 泄漏是否反馈上游由用户决定。
- 下一步是路线图第 3 步（工程与测试基础），**尚未启动**。

## 2.1 发现（该阶段无独立报告，摘要如下）

- 已核实环境：Apple Silicon、macOS 26.6、Node 22.21.1、pnpm 10.20.0；MZ 1.10.0 的 NW.js 已是 0.117.0 SDK（Chromium 154.0.8037.58）。
- 候选的 Reactor 0.98.7 没有类型包，模板类型检查需要 0.98.8@`2dc2e10e`（用户已接受，`baseline.json`）。
- 未修改的 MZ 自带 NW.js 是 Node v14.12.0（Windows 包里的 node.dll），而 Showdown 要求 Node ≥ 22.18，所以引擎不能在原版 MZ 的 NW.js 里运行——用户决定"用户必须按我们的方式更新本地 MZ"。
- MZ Deploy 的输出打不开：框架包里的符号链接被拆成真实文件并丢失签名，`codesign` 报"embedded framework contains modified or invalid version"。后来由 `scripts/package-mac.sh` 取代。
- 2.1 的证据在 `experiments/step2/evidence/history/`（`mz-playtest.json` 是用户的 Playtest 结果）。
