# pokemon-framework-prototype

用 TypeScript 为 **RPG Maker MZ** 实现的宝可梦游戏开发框架的主工作仓库（同时是一个可直接用 MZ 打开的工程：`game.rmmzproject`）。运行时用 RPGReactor（PixiJS 8），战斗用 Pokémon Showdown（固定提交，通过受支持的扩展点接入，不改其源码）。行为依据是 clean-room 规格库，不移植原版 Ruby 代码。

起点是 [rpg-maker-mz-initialize](https://github.com/y805939188/rpg-maker-mz-initialize) 模板（`b6fa1df`）。当前已接收最小可玩闭环、5.0–5.3 的批准范围和五步框架整改；第五步功能扩展仍在进行，尚不是完整框架发布版本。

## 当前进度

状态核对日期：**2026-10-29**。本页核对的实现基线为 [PR #32](https://github.com/y805939188/pokemon-framework-prototype/pull/32) 合并提交 `d6aae8c`；后续文档提交不算新增功能或运行验收。

| 阶段 | 已接收范围与证据 |
|---|---|
| 第二步：战斗接入 | 固定 Showdown + Reactor 路线、单打优先范围及有意差异，见[第二步总结](docs/step2/README.md) |
| 第三、四步：工程底座与最小闭环 | 模块/内容/存档与测试基础；获得精灵→遭遇→战斗/捕获→成长→治疗→保存恢复。见[第三步收口](docs/step3/closure.md)、[第四步收口](docs/step4/closure.md) |
| 5.0 / 5.1 | 内容身份与迁移基础；个体、队伍/摘要、40×30 仓库和接收流程。见[5.0 收口](docs/step5/5.0-closure.md)、[5.1 实施合同](docs/step5/5.1.md)、[PR #4](https://github.com/y805939188/pokemon-framework-prototype/pull/4) |
| 5.2：背包、道具与经济 | 批准范围有条件收尾，包含背包/用药/商店及事务 UI；延期与内存警告保留。见 [PR #5](https://github.com/y805939188/pokemon-framework-prototype/pull/5) |
| 5.3：成长、进化与图鉴 | 批准范围的规则、事务、学习/进化/交换和图鉴 UI，以及 I/J 限定整合验收已接收。见 [PR #26](https://github.com/y805939188/pokemon-framework-prototype/pull/26)、[I/J 技术收尾与风险](docs/step5/5.3-IJ-closeout.md)；不表示所有参考向量或原版等价已验证 |
| 五步框架整改 | 公共 API/CJS 消费、import 边界、查询/获得职责窄拆分、有限性能诊断与优化、组合宿主/新包恢复验收。见下表 |
| 5.4：训练家、基础 AI 与正式战斗界面 | **方案已修订，复审中，尚未编码**；M0 证据探针、持物写回及开门、正式场景测量和最终验收仍待完成 |
| 5.5 / 5.6、作者工具与最终发布 | 世界/遭遇、完整标题菜单流程、作者工具/Demo 及最终平台/分发验收尚未完成 |

五步框架整改均按各自限定合同接收，不等于性能和内存问题全部解决：

| 步骤 | 合并与说明 |
|---|---|
| 1：公共 API 与外部消费 | [PR #27](https://github.com/y805939188/pokemon-framework-prototype/pull/27)，[CJS API/SDK 合同](docs/framework-remediation/step1-api.zh.md) |
| 2：import 迁移与解析边界 | [PR #29](https://github.com/y805939188/pokemon-framework-prototype/pull/29) |
| 3：GameApplication 职责窄拆分 | [PR #30](https://github.com/y805939188/pokemon-framework-prototype/pull/30)；保留 facade 的代次、所有权及事务边界 |
| 4：有限性能/内存诊断与图鉴键窄修 | [PR #31](https://github.com/y805939188/pokemon-framework-prototype/pull/31)；另有前置性能写入窄修 [PR #28](https://github.com/y805939188/pokemon-framework-prototype/pull/28)，总体风险仍开放 |
| 5：组合验收 | [PR #32](https://github.com/y805939188/pokemon-framework-prototype/pull/32)，[验收范围与稳定命令](docs/framework-remediation/step5-integration.zh.md) |

[PR32 的主线 CI164](https://github.com/y805939188/pokemon-framework-prototype/actions/runs/40757500704) 在 `d6aae8c` 上通过 headless/plugins 两层检查，其中 headless 为 **119 套 / 1975 项**。这是该实现基线的历史精确 CI，不能当作本次 README 文档候选已运行测试，也不是功能覆盖百分比。宿主、离线包、程序化输入和实体输入的证据分别记录；阶段文档保留当时的候选/未接收措辞，当前合并状态以上述对应 PR 为准。

## 当前限制与下一步

- 5.4 尚未开始实现，正常持物战斗的来源/入战双门仍关闭；不能把已存在的实验接口当作战后持物写回已完成。
- 总体同步性能、五项计时 WARN、Renderer/summary-dex 内存归因仍开放；app RSS 为 UNKNOWN，CPU profile/未插桩对照等仍缺证，不宣称无泄漏或长期稳定。
- 5.2 的 F02 条件延期与 UI-MEM 警告、其它历史限制保留；实体键鼠及适用原生 IME 等最终输入验收未完成。
- Ruby 新增执行差分仍为 **0**；成长 3504 例是历史原版运行结果的冻结回放，不是每次 CI 的实时 Ruby/TS 双端验证。
- 下一步先完成 5.4 方案复审和 M0 前置证据，按批次验收推进；5.5/5.6、正式素材与最终分发另行接续。

## 先读什么

1. [`docs/PROJECT-GUIDE.md`](docs/PROJECT-GUIDE.md) —— 目标、路线、铁律与授权边界、协作协议、架构、仓库地图、环境准备、常用命令、已知坑、文档地图。**所有人和 AI 动手前必读。**
2. [第五步导航](docs/step5/README.md)、[作者命令](docs/step5/commands.md)、[分发清单](docs/step5/distribution.md) —— 功能批次与接点；历史状态结合本页的接收记录阅读。
3. [第三步](docs/step3/README.md)、[第四步](docs/step4/README.md)、[第二步](docs/step2/README.md) —— 工程、闭环及战斗接入的背景与证据。
4. [用户 C2 决定](docs/step2/c2-decision.md)、[有意差异](docs/step2/deviations.md)、[冻结协议 v1](docs/step2/protocol-v1.md) —— 实施边界。

本地协作者还须读取工作区 `.handoff/STATUS.md`；它是仓库外的协调记录，GitHub 读者可通过上面的仓库内文档与公开 PR 查看已交付范围。

默认 MZ 界面位于宿主适配层，后续按正式端口逐步完善可替换能力。当前交付不等于完整无头 UI 平台或任意浏览器宿主已支持；战斗/持久状态与事务仍有明确的权威所有者。

## 最短上手

本机验收平台为 **macOS Apple Silicon**，Windows/Intel 暂缓。需已安装 RPG Maker MZ、Node（已验版本 22.21.1；Showdown 要求 ≥22.18）、pnpm 10.20.0，以及 [固定版本](scripts/versions.env)的 RPGReactor 源码检出。前提、路径覆盖和引导脚本说明见[项目指南第 9 节](docs/PROJECT-GUIDE.md#9-环境准备从零)。

在仓库根目录依次准备；将 `REACTOR_SOURCE` 换为本机实际检出路径：

```bash
REACTOR_SOURCE=/path/to/RPGReactor ./scripts/setup-reactor.sh --install
./scripts/setup-mz-assets-mac.sh --install
pnpm --dir src install --frozen-lockfile
pnpm --dir src build:engine
./scripts/build-showdown.sh
pnpm --dir src build
./scripts/test-quick.sh        # 类型/边界检查、构建和 Node 套件，无窗口
```

先构建引擎包再暂存固定 Showdown，最后构建内容/插件；这些是当前脚本的依赖顺序，本次文档更新没有重新运行整套安装或产品验收。`bootstrap-mac.sh` 默认也不会替换全局 MZ/NW.js；`--install-nwjs` 才会修改已安装的 MZ，不属于上述操作。

**不要使用 MZ 的“部署”打包**（会破坏本项目 NW.js 包结构），使用 [`scripts/package-mac.sh`](scripts/package-mac.sh)。离线包、窗口流程和性能测试不会由 Node CI 代跑；打包/运行及签名范围见[分发清单](docs/step5/distribution.md)和[项目指南](docs/PROJECT-GUIDE.md)。

## 目录

| 路径 | 内容 |
|---|---|
| `src/framework/` | TS 框架源码：纯规则、内容、应用/事务、流程、战斗适配、本地化及工具；公共入口与兼容范围见 API 合同 |
| `src/plugins/` | 默认 MZ 界面、事件与保存适配的 TypeScript 源码 |
| `content/sample/` | 默认示例的作者内容源；编译至 `data/framework/content.json` |
| `js/engine/` | 历史兼容门面、测试夹具及被忽略的运行构建；不在兼容门面中新增业务逻辑 |
| `scripts/` | 引导、构建、打包、签名、测试、诊断脚本 |
| `experiments/` | 各阶段测试、探针与相应证据；历史记录不代表当前候选重新通过 |
| `docs/` | 项目指南、阶段合同/验收与框架整改文档 |
| `.github/workflows/ci.yml` | headless 与 plugins 两层 CI，不包含真实窗口/性能验收 |
| `data/` `img/` `audio/` … | MZ 工程内容（模板数据；MZ 素材由引导脚本从本机 MZ 复制，不提交） |
