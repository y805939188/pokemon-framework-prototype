# 项目总览与协作规则（所有 AI 接手前必读）

本文件是这个项目的"唯一入口"。`CLAUDE.md` / `AGENTS.md` 只指向这里。动手前读完本文件，再读交接记录 `../../.handoff/STATUS.md`（工作区顶层的 `.handoff/STATUS.md`，不在任何 git 仓库里），最后用 `git status` 核对实际状态。

## 1. 项目目标与路线

用 TypeScript 和现代开发工具，从零实现**直接供 RPG Maker MZ 使用的宝可梦游戏开发框架**。以 Pokémon Essentials v21.1 的行为为规格依据，追求职责清晰、易维护、便于 AI 理解、性能可测量。战斗模拟使用 Pokémon Showdown，通过适配和受控扩展完成单机 RPG 的协作行为。框架负责精灵、队伍、仓库、背包、经济、成长、培育、进化、图鉴、遭遇、世界与事件流程、训练家 AI、界面、存档和作者工具。

"完整覆盖"指所有决定保留的行为最终都有实现和验收证据。暂缓、未验证、未实现不算完成。与原版有意不同的行为、首版范围和长尾取舍必须由用户决定，不能因为实现困难悄悄砍功能。

七步路线（详见规格库 `pokemon-framework-reference/planning/framework-roadmap/`）：

| 步 | 内容 | 状态 |
|---|---|---|
| 1 | 提取并整改行为规格，建立去向清单 | 已完成（规格库 `dae6776`） |
| 2 | 验证战斗接入，确定路线和首版范围 | **已完成并经用户决定（C2）**，见 `docs/step2/README.md` |
| 3 | 工程与测试基础：模块边界、构建/CI、内容数据、本地化、存档基础、第一条 Ruby/TS 对照测试链 | 未开始 |
| 4 | 最小可玩闭环（获得精灵→遭遇→战斗/捕获→成长→治疗→存档读档） | 未开始 |
| 5 | 按功能族扩展，每批交付规则、接口、UI、事件入口、测试和示例 | 未开始 |
| 6 | 作者工具与 Demo（用户会自制符合 MZ 规格的美术资源） | 未开始 |
| 7 | 平台、存档、性能、分发验收，发布可用版本 | 未开始 |

**C2 决定（用户，2026-10-18）**：继续 Showdown-in-MZ/Reactor 路线；首版只做单打；双打界面和长尾功能（Safari、抢夺、暗影、录像、战中存档、超级进化等）后做，每个先做规格核对；Windows 和 Intel Mac 暂缓，目前只验证 macOS Apple Silicon。用户的其他决定见 `docs/step2/c2-decision.md` 和 `docs/step2/deviations.md`。

## 2. 工作区与仓库

工作区：`/Users/dingshinn/Desktop/pokemon-framework`（本身**不是** git 仓库，不要初始化、合并历史或引入 submodule）。

| 目录 | 角色 | 规则 |
|---|---|---|
| `pokemon-framework-prototype` | **主工作仓库**（本仓库）。也是一个可直接用 MZ 打开的工程（`game.rmmzproject`） | 远端 `github.com/y805939188/pokemon-framework-prototype`，`main` 是唯一长期分支 |
| `pokemon-framework-reference` | clean-room 规格与证据（131 份正式规格、87 个 WP、去向清单 736 单元） | **只读使用**。规格在 `deliverables/final-specification-set/`，推导期望在其 `test-catalog/`，去向清单在 `planning/implementation-routing/r8-20261017/` |
| `rpg-maker-mz-initialize` | 通用 MZ+Reactor+TS 工程模板（`b6fa1df`），本仓库由它起步 | 已不再需要修改；不要把通用模板改成实验工程 |

仓库外但必需的依赖（不在 git 里，换机器要重新准备，见第 9 节）：RPGReactor 源码检出 `/Users/dingshinn/Desktop/RPGReactor`（固定 0.98.8 @ `2dc2e10e`）、已安装的 RPG Maker MZ（Steam 版）、Showdown 源码缓存 `~/Library/Caches/pokemon-framework/showdown-src`。

## 3. 铁律

1. **clean-room 边界**：实现只读正式规格、行为测试向量、数值/状态/事件证据，**不得阅读或移植原版 Ruby 实现**。原版源码历史位置 `/Users/dingshinn/Desktop/pokemon-essentials` 和发行包 `~/Downloads/Pokemon Essentials v21.1 …`，除非用户另行授权的"参考观察流程"，不要打开。规格有缺口时记录精确问题，不要在实现里猜。
2. **授权边界**：
   - 可自主做：读文件、在本仓库内编辑/新增、本地提交、创建实验分支、运行测试、在被授权的仓库里按用户要求推送/合并。
   - **必须先问用户**：推送或合并到 `main`（除非用户已明确授权那一次操作）、强制推送、永久删除不可恢复的数据、修改全局系统/MZ 安装/NW.js、使用或索取任何凭据、对外发布、改变首版范围或与原版的有意差异。
   - 不要 force 覆盖历史；保留用户已有修改；发现陌生的未提交改动先沟通，不覆盖、不 stash、不 reset。
3. **不修改全局环境**：不修改用户安装的 MZ/NW.js（`bootstrap` 默认不动全局 NW.js；只有显式 `--install-nwjs` 才会替换），不改系统设置，不输入真实凭据。
4. **本机测试进程要收拾干净**：结束自己启动的 NW.js/测试进程，或在交接记录里写明 PID、用途和停止方法。
5. **诚实汇报**：状态只用 通过 / 失败 / 阻塞 / 未执行；事实与推断分开；构建成功不等于运行成功，类型声明存在不等于运行兼容；没有 CI 就不能说"CI 通过"；规格向量是"从规格推导的期望"，不是原版 Ruby 实际运行结果（本项目至今没有运行过原版 Ruby 参考程序）。

## 4. 协作协议（Claude 与 Codex 可互换，用户人为串行切换）

- 唯一交接记录：`/Users/dingshinn/Desktop/pokemon-framework/.handoff/STATUS.md`。接手先读它，再核对 git 状态；完成一段工作、暂停或交接时更新**同一份**文件（不为每次小改新建报告）。内容只写：当前做什么/在哪/谁/何时；分支、提交、未提交改动；已完成及实际跑过的关键命令与结论；阻塞和未验证项；已作决定及是否经用户批准；下一位 AI 的具体接手动作。
- 同一时间只有一方写同一目录。目录标记只是沟通，不是锁。
- **独立复核**：检查固定的提交，重跑与关键结论相关的测试；作者自检不能标成"另一位 AI 独立通过"。用户最终确认后才推进下一步。
- 详细测试输出放仓库的证据目录，交接记录只链接。

## 5. 成本与子 agent

直接读文件、脚本聚合、复用已验证结果优先；不让模型逐行吞大日志；不强制每步新会话。**子 agent 默认不用**，只在明确节省总成本或必须独立时使用，且只能用 **Sonnet 5.5**（除非用户明确指定 Opus）：写代码默认 Sonnet 5.5 High，review 用更高一级（Extra），不使用快速模式；简单任务可用更便宜的模型。

## 6. 架构一页纸

六类职责：内容数据、游戏规则、游戏流程、战斗接入、MZ 适配呈现、工具测试。引擎内部耦合集中在桥接层；使用薄的、异步的、可序列化的接口，UI/业务不直接持有战斗对象；用稳定身份（字符串 id）而不是战斗槽位；战斗状态、持久状态、UI 状态各有所有者和同步点。

**战斗接入路线（第二步已验证）**：Showdown 以固定提交（`scripts/showdown.env`）构建并裁剪后放在 `js/engine/showdown/`（git 忽略）。RPG 行为不改 Showdown 源码，而是用它支持的扩展点：

- `js/engine/rpg/custom-formats.cjs` 经 `build-showdown.sh` 放进 `dist/config/custom-formats.js`，定义 `[Gen 8] RPG Custom Game`（单打/双打）及事件 `RpgAction`。
- 道具、精灵球、逃跑作为引擎队列里的 `event` 动作（优先级 99：换人之后、招式之前）在回合内结算；载荷放在会被快照序列化的 `battle.rpg.pending`；随机数一律走战斗随机入口。
- 游戏规则层（`js/engine/game/`）负责成长（曲线、经验、EV、升级、学招）、背包台账、持久状态与写回；引擎只被告知结果，并与游戏规则交叉校验。

所有权：引擎拥有 HP、持久状态异常、PP 和全部战斗临时状态；`BattleSession` 拥有背包台账、参战者、成长与学招、捕获记录；**持久游戏状态在战斗期间不被改动**，只通过 `BattleResult`（协议 v1）一次性、幂等地提交（`applyBattleResult`，按 `battleId`）。写集：`level, exp, hp, status, moves, evs, friendship`（+背包/图鉴/金钱）。协议 v1 已冻结（范围见 `docs/step2/protocol-v1.md`，由 `protocol-v1.frozen.json` 和契约测试守护）。

MZ 侧：`src/plugins/PS_BattleFlow.ts`（插件命令 `StartBattle`、解释器等待、占位文字战斗场景；游戏状态放在 MZ 存档 `$gameSystem._psGame` 里）、`PS_RuntimeFixes.ts`（修 RPGReactor 在 PixiJS 8 上的两个内存泄漏）、`PS_SaveLocation.ts`（打包后存档放包外）、`PS_BattleSmoke/PS_BattleFlowTest.ts`（冒烟与自动化测试驱动，无参数时不工作）。

## 7. 仓库地图

```
docs/PROJECT-GUIDE.md        本文件
docs/step2/                  第二步的全部结论（入口 docs/step2/README.md）
js/engine/                   运行时代码（CommonJS，打进游戏包）
  gateway.cjs                Showdown 的薄异步网关（JSON 进出）
  harness.cjs, matrix.cjs    Node 与包内共用的冒烟/场景矩阵（S1–S10）
  game/                      成长规则、状态与写回契约、原子存档、BattleSession、文字描述
  rpg/                       RPG 扩展（custom-formats、规则数值）
  fixtures/                  测试夹具与黄金基线
  showdown/                  构建产物（git 忽略，build-showdown.sh 生成）
src/plugins/                 TypeScript 插件源码（Vite 构建到 js/plugins/，输出被忽略）
scripts/                     引导、构建、打包、签名、测试、诊断脚本
experiments/step2/           第二步的测试、探针、证据（evidence/ 见其 MANIFEST.md）
data/ img/ audio/ ...        MZ 工程内容（模板数据 + 本地复制的 MZ 素材，素材被本地排除，不提交）
```

## 8. 常用命令

| 目的 | 命令 | 代价 |
|---|---|---|
| 快速自检（类型检查 + 全部 Node 测试，约 1 分钟，无窗口） | `scripts/test-quick.sh` | 便宜，评审和日常首选 |
| 构建插件 | `pnpm --dir src build`（类型检查：`pnpm --dir src typecheck`） | 便宜 |
| 构建/裁剪引擎 | `scripts/build-showdown.sh` | 首次约 1–2 分钟（下载依赖） |
| 游戏内流程测试（开 NW.js 窗口，真实按键/事件/存档） | `scripts/run-flow-test-mac.sh` | 几分钟，弹窗口 |
| 打包（不用 MZ 部署） | `scripts/package-mac.sh [--with-tests] [--harden]` | 约半分钟，550 MB |
| 包内完整测试（流程 + 场景矩阵 + 存档位置 + 签名封印） | `scripts/run-package-tests-mac.sh`（`PF_PACKAGE_ARGS=--harden` 用硬化运行时） | 几分钟，弹窗口 |
| 包内性能与内存测量 | `scripts/run-package-perf-mac.sh [次数]` | 几分钟，弹窗口 |

测试脚本运行时窗口失焦、静音都不影响结果（见 `docs/step2/runtime-issues.md`）。

## 9. 环境准备（从零）

前提：Apple Silicon Mac；Node ≥ 22（开发用 22.21.1，Showdown 要求 ≥ 22.18）；pnpm 10.20.0；git；已安装 RPG Maker MZ（Steam 版，其 NW.js 已是 0.117.0 SDK arm64——`scripts/doctor.sh` 会检查）；RPGReactor 源码检出在 `/Users/dingshinn/Desktop/RPGReactor`，必须是带类型声明的 `2dc2e10e`（0.98.8；0.98.7 标签没有类型包）。

```bash
cd pokemon-framework-prototype
REACTOR_SOURCE=/Users/dingshinn/Desktop/RPGReactor ./scripts/bootstrap-mac.sh   # Reactor 运行时、MZ 素材、依赖、类型检查、构建、doctor（20 项应全过）
./scripts/build-showdown.sh                                                                 # 固定提交的 Showdown → js/engine/showdown
pnpm --dir src build                                                                        # 插件
./scripts/test-quick.sh                                                                     # 自检
```

生成物/忽略项（不提交、可重建）：`js/engine/showdown/`、`js/plugins/PS_*.js`、`RR_*.js`、`js/libs`、`js/reactor_*.js`、`index.html`、`src/node_modules`、`src/vendor/rpgreactor`、`.reactor-source`、`save/`、`build/`，以及本地复制的 MZ 素材（`.git/info/exclude`）。Showdown 源码缓存放在仓库外（`SHOWDOWN_SRC` 可覆盖），因为 MZ 部署会复制整个项目根目录。

## 10. 已知坑

- Showdown 把昵称（我们的稳定 id）截成 20 个字符并清理分隔符，所以 id 限 1–18 个安全字符（`BattleSession.create` 会拒绝其他 id）。
- Vite 插件里裸 `require(...)` 会被改写成浏览器占位，插件从 `globalThis.require` 取 NW.js 的 Node `require`。
- `pixi_compat` 会包装场景类，类的静态属性在包装后读不到；场景用实例标记，共享状态放 `window.PSFlow`。
- **MZ 的"部署"在 Apple Silicon 上会弄坏 NW.js 包**（拆掉符号链接、丢签名），一律用 `scripts/package-mac.sh`；`scripts/repair-deployed-app-mac.sh` 只是旧的补救脚本。
- 打包后存档在 `~/Library/Application Support/<包名>/save/`，与 NW.js 浏览器数据同在一个父目录。
- 失焦的游戏窗口默认暂停（MZ 的 `isGameActive`）；只有测试驱动覆盖了这一点。
- macOS 自带 bash 3.2：`set -u` 下空数组展开会报错；`sed -i` 需要 `-i ''`。
- 内存、泄漏相关改动依赖 PixiJS 内部实现，升级 Pixi/Reactor 后要重跑 100 场战斗内存检查（`docs/step2/runtime-issues.md`）。

## 11. 文档地图（建议阅读顺序）

1. 本文件 → `../../.handoff/STATUS.md`（现在做到哪、下一步）
2. `docs/step2/README.md`（第二步总结与文档导航）
3. `docs/step2/c2-decision.md`、`deviations.md`（用户的决定与有意差异）
4. `docs/step2/protocol-v1.md`（冻结的协议）、`runtime-issues.md`、`signing-plan.md`
5. 阶段报告 `docs/step2/2.2-report.md` … `2.5-report.md`（推导过程与证据，按需读）
6. `experiments/step2/evidence/MANIFEST.md`（每个证据文件的来源与对应的构建）

## 12. 分支、标签与提交约定

- `main` 是唯一长期分支；新工作开短期分支，合并后删除。远端与本地保持一致。
- 阶段里程碑用标签保留：`step2.1-accepted`、`step2.2-feasibility`、`step2.3-c1`、`step2.4-mz-flow`、`step2.5-c2`、`step2.runtime-pass`；评审基线标签见 `docs/step2/README.md`。
- 提交信息写清做了什么和为什么；AI 协作提交按所用工具要求添加署名行。
