# 项目总览与协作规则（所有 AI 接手前必读）

本文件是这个项目的"唯一入口"。`CLAUDE.md` / `AGENTS.md` 只指向这里。动手前读完本文件，再读交接记录 `../../.handoff/STATUS.md`（工作区顶层的 `.handoff/STATUS.md`，不在任何 git 仓库里），最后用 `git status` 核对实际状态。

## 1. 项目目标与路线

用 TypeScript 和现代开发工具，从零实现**直接供 RPG Maker MZ 使用的宝可梦游戏开发框架**。以 Pokémon Essentials v21.1 的行为为规格依据，追求职责清晰、易维护、便于 AI 理解、性能可测量。战斗模拟使用 Pokémon Showdown，通过适配和受控扩展完成单机 RPG 的协作行为。框架负责精灵、队伍、仓库、背包、经济、成长、培育、进化、图鉴、遭遇、世界与事件流程、训练家 AI、界面、存档和作者工具。

"完整覆盖"指所有决定保留的行为最终都有实现和验收证据。暂缓、未验证、未实现不算完成。与原版有意不同的行为、首版范围和长尾取舍必须由用户决定，不能因为实现困难悄悄砍功能。

七步路线（详见规格库 `pokemon-framework-reference/planning/framework-roadmap/`）：

| 步 | 内容 | 状态 |
|---|---|---|
| 1 | 提取并整改行为规格，建立去向清单 | 已完成（规格库 `dae6776`） |
| 2 | 验证战斗接入，确定路线和首版范围 | **已完成并经用户决定（C2）**，补充修复已于 2026-10-19 收口（标签 `step2-closeout`），见 `docs/step2/README.md`、`docs/step2/closeout-addendum.md` |
| 3 | 工程与测试基础：模块边界、构建/CI、内容数据、本地化、存档基础、第一条 Ruby/TS 对照测试链 | **已收口（2026-10-19，标签 `step3-closed`）**：独立验收先不通过、整改后有条件通过，见 `docs/step3/closure.md`；性能尚无同条件基线。第四步前短架构批次（含复核修复）已于 2026-10-20 经 PR #1 合入 `main`，见 `docs/step3/architecture-batch-closure.md` |
| 4 | 最小可玩闭环（获得精灵→遭遇→战斗/捕获→成长→治疗→存档读档） | **已完成（2026-10-21）**：批次 A/B/C 与两轮复核整改经 PR #2 合入 `main`（合并提交 `3e3e655`），收口记录 `docs/step4/closure.md`；见 `docs/step4/README.md`、`acceptance.md`、`commands.md` |
| 5 | 按功能族扩展，每批交付规则、接口、UI、事件入口、测试和示例 | **进行中**：计划 r3 经用户批准（工作区 `.handoff/step5-plan.zh.md`，7 批）。**5.0 基础整固已完成（2026-10-22）**：经 PR #3 合入 `main`（合并提交 `5dc86f6`），收口记录 `docs/step5/5.0-closure.md`。非阻塞遗留：包内 T24 首轮超时一次，根因未证实；最终候选没有新的计时和 100 场测量，沿用历史 WARN 与内存记录。5.1 已经双审、精确候选与 main 双层 CI 及用户条件合并授权后经 PR #4 常规合入 `c5c51a6`。5.2已按批准范围有条件收尾，经PR #5合入9a93b5c，F02 FAIL/OPEN+条件DEFERRED、UI-MEM与未测项保留。5.3 B–F及E有限事务已分批合入，M1经PR #19在b977ed7正式中间接收；G1经PR20/a289086、G2a经PR21/c70d441接收；G2b＋AR01经PR22/main34fecd8接收，G2c与AR01后续经PR23/main04a2f47正式接收（105套1816）；H1经PR24/main d53311f接收，H2经PR25/main fcd6c57接收（112套1912）；I整合验证进行中，J及完整5.3未签收，小画布空结果提示P3仍待当前I候选独立复核。Ruby等价证据与功能验证分列，5.3新增Ruby差分仍0、补齐方案待批。见 `docs/step5/README.md` |
| 6 | 作者工具与 Demo（用户会自制符合 MZ 规格的美术资源） | 未开始 |
| 7 | 平台、存档、性能、分发验收，发布可用版本 | 未开始 |

**后续决定（用户，2026-10-19，聊天）**：Windows/Intel Mac 暂不作为首个发布版本的条件，先把本机 macOS 做好再考虑跨平台；先实现单打，双打和长尾功能等框架基础稳定后迭代加入；第四步前的“短架构批次”（核心独立入口、战斗适配内部封装、应用+假适配器测试、真实 MZ 同契约验证）**不纳入第三步收口**，作为第四步开工前的独立批次；第二步补充修复经另一个 Codex agent 审核后收口。

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
5. **诚实汇报**：状态只用 通过 / 失败 / 阻塞 / 未执行；事实与推断分开；构建成功不等于运行成功，类型声明存在不等于运行兼容；没有 CI 就不能说"CI 通过"；规格向量是"从规格推导的期望"，不是原版 Ruby 实际运行结果；现有成长3504为有来源的冻结原版运行回放，5.3新增Ruby执行差分仍0，详见`docs/step3/differential-growth.md`与当前第五步总览。

## 4. 协作协议（Claude 与 Codex 可互换，用户人为串行切换）

- 唯一交接记录：`/Users/dingshinn/Desktop/pokemon-framework/.handoff/STATUS.md`。接手先读它，再核对 git 状态；完成一段工作、暂停或交接时更新**同一份**文件（不为每次小改新建报告）。内容只写：当前做什么/在哪/谁/何时；分支、提交、未提交改动；已完成及实际跑过的关键命令与结论；阻塞和未验证项；已作决定及是否经用户批准；下一位 AI 的具体接手动作。
- 同一时间只有一方写同一目录。目录标记只是沟通，不是锁。
- **独立复核**：检查固定的提交，重跑与关键结论相关的测试；作者自检不能标成"另一位 AI 独立通过"。用户最终确认后才推进下一步。
- 详细测试输出放仓库的证据目录，交接记录只链接。

## 5. 成本与子 agent

直接读文件、脚本聚合、复用已验证结果优先；不让模型逐行吞大日志；不强制每步新会话。**子 agent 默认不用**，只在明确节省总成本或必须独立时使用，且只能用 **Sonnet 5.5**（除非用户明确指定 Opus）：写代码默认 Sonnet 5.5 High，review 用比写代码更高的一档推理强度（`xhigh`，必要时 `max`；以工具里可选的档位为准），不使用快速模式；简单任务可用更便宜的模型。

## 6. 架构一页纸

六类职责：内容数据、游戏规则、游戏流程、战斗接入、MZ 适配呈现、工具测试。引擎内部耦合集中在桥接层；使用薄的、异步的、可序列化的接口，UI/业务不直接持有战斗对象；用稳定身份（字符串 id）而不是战斗槽位；战斗状态、持久状态、UI 状态各有所有者和同步点。

**战斗接入路线（第二步已验证）**：Showdown 以固定提交（`scripts/showdown.env`）构建并裁剪后放在 `js/engine/showdown/`（git 忽略）。RPG 行为不改 Showdown 源码，而是用它支持的扩展点：

- `src/framework/battle/custom-formats.ts`（构建成自包含的 `js/engine/build/custom-formats.cjs`）经 `build-showdown.sh` 放进 `dist/config/custom-formats.js`，定义 `[Gen 8] RPG Custom Game`（单打/双打）及事件 `RpgAction`。
- 道具、精灵球、逃跑作为引擎队列里的 `event` 动作（优先级 99：换人之后、招式之前）在回合内结算；载荷放在会被快照序列化的 `battle.rpg.pending`；随机数一律走战斗随机入口。
- 游戏规则层负责成长（曲线、经验、EV、升级、学招）、背包台账、持久状态与写回；引擎只被告知结果，并与游戏规则交叉校验。
- **第三步起源码在 `src/framework/`（严格 TS，业务模块之间一律 `import`）**，分层：`rules/`（纯规则与状态/存档 schema）、`content/`（内容 schema 与编译）、`battle/`（Showdown 适配；`showdown-loader.ts` 是**唯一**允许 `require` 的文件，因为 NW.js 里 Showdown 只能 `require`，`import()` 实测失败）、`flow/`（BattleSession、文字描述、日志、内容组装）、`i18n/`（文本 key 与翻译）、`tools/`（夹具、矩阵、harness、存档存储、内容 CLI）。依赖方向由 `scripts/check-boundaries.cjs` 强制（31 个测试证明规则会拒绝违规树，并检查文字/普通属性不误报）；它用 Vite 自带的解析器读语法树（所以要先 `pnpm --dir src install`），**网关的内部状态（`_debugBattle`、`_env`、`_queue`、`_seq`、`_closed` 等）只允许 battle 层和 tools 使用**，flow 只用网关的值查询、受控操作和不透明检查点。Vite 把它们构建成 `js/engine/build/engine.cjs`（API）、`custom-formats.cjs`（运行在 Showdown 里，由 `build-showdown.sh` 暂存）和 `content-cli.cjs`；`js/engine/**/*.cjs` 现在只是兼容门面，**不要往里加逻辑**。
- **第四步前短架构批次后的分层（`docs/step3/architecture-batch.md`）：** `rules/` 是**核心**，公共入口 `rules/index.ts`（构建为 `js/engine/build/core.cjs`），无 Node、无 DOM、无 Showdown、无显式 `any`，用 `framework/tsconfig.core.json`（`types: []`）单独编译；摘要用 `rules/sha256.ts`（可移植、同步）。`app/` 是应用层：`GameApplication` 只依赖自己拥有的端口（状态、会话工厂、内容、投影），规则调用核心，引擎在 `battle/`、MZ 在插件里。`composition.ts`（entry 层）是把 Showdown 会话接到端口的唯一位置。`battle/driver.ts` 定义 `BattleDriver`/`BattleDriverFactory`（会话与引擎之间的类型缝），`tools/scripted-driver.ts` 与 `tools/fakes.ts` 是测试用的假适配器。插件的 `PSFlow.begin/finish/abort/commit` 是 `GameApplication` 的薄包装；应用初始化失败时，插件仍独立投影中止结果并释放事件等待。应用在持久状态提交前验证 outcome，宿主投影失败不撤销提交。检查器只允许 app 从 flow 引用 `content-runtime.ts`，该服务只依赖 rules/content，根入口限 `index.ts` / `composition.ts`，动态导入必须用可检查的字面量。复核后修复与新证据见 `docs/step3/batch-review-fixes.md`。

- **第四步新增（`docs/step4/README.md`）：** 核心 `rules/` 加了个体生成 `member-factory.ts`（物种+等级→成员，注入 `random(n)`）、`grants.ts`（一次性领取）、`heal.ts`、`encounter.ts`（WP36 §5.1 抽选）、`defeat.ts`（WP42 §6.1 + WP61 §7.2）、`limits.ts`（阶段容量：队伍 6、盒子 1200 扁平、背包每种 999、金钱 999999）、`items.ts`；持久状态 **schema 3**（`claims` 凭证账本，迁移 1→2→3）。应用层 `GameApplication` 加 `startNewGame`/`claimGrant`/`healParty`/`prepareEncounter`/`describeParty`，并负责**创建野生对手**（`composition.ts` 不再引用夹具）、开战守卫（可战斗成员、满队满盒 `noBall`）和**战败结算与结果同一次替换**。`app/` 也用 `tsconfig.app.json`（lib ES2022、`types: []`，含传递导入）单独编译。内容管线加可选 `grants.json`；`DexLookup` 加性扩展（特性、性别比例、招式 id/PP，读 **Gen 8** 数据）。插件：正式新游戏（`setupNewGame` 不再用夹具，`PSFlow.game()` 不伪造状态）、`ClaimGrant`/`HealParty`/`ShowParty` 命令、地图备注 `<PSEncounter:…>` 覆盖 `executeEncounter`、统一开战入口 `PSFlow.openBattle`、保存屏蔽（战斗进行时 `Game_System.isSaveEnabled` 额外返回 false，从不改写游戏自己的保存开关；战斗中直接保存也拒绝）、战败回家（可重试，不再结算；结束发起战斗的整条事件调用链，含逐层公共事件；提交后的宿主消息故障记在 `lastOutcome.hostErrors`，不改已提交结果）。内容、凭证、账本字典按自有键读写（`rules/own.ts`）；领取的物种登记图鉴；从开战创建会话起到这场战斗结束或中止，应用层拒绝领取、治疗（`battle-active`）和第二场战斗，中止后迟到的会话不被使用。切片地图 `Map005` 是新游戏起点。

- **第五步 5.0（`docs/step5/5.0.md`）：** 持久物种键改为**内容 ID＋形态号**（决定 D5-3；`Member.species` = 内容 ID，`Member.form` = 形态号）。战斗层与冻结协议 v1 仍用 Showdown 名：应用层开战时给会话“战斗视图”（`rules/species-key.ts` `battleView`），提交时经内容映射（`Content.forms` / `Content.speciesKeys`）写回，账本哈希按收到的原始结果计算。持久状态 **schema 4**（成员 `form`、图鉴记内容 ID、`stats` 74 字段、`steps`）；3→4 迁移需要内容映射，缺内容（`needs-content`）或有名字映射不到（`unmapped-species`）时整次拒绝、原档不动。新增 `rules/stats.ts`（WP06 统计与 2³¹ 回绕步数）、`rules/config.ts`（WP02 子集，内容可选 `settings.json`）、`content/pbs-import.ts`（作者 PBS 导入子集，`content-cli import-pbs`）；`sources.json` 的 `usageCheck` 是使用前核对门。`GameApplication.recordSteps`、`stateReplacedByHost`（读档或新游戏时释放战斗操作，旧会话结束时不提交）。

所有权：引擎拥有 HP、持久状态异常、PP 和全部战斗临时状态；`BattleSession` 拥有背包台账、参战者、成长与学招、捕获记录；**持久游戏状态在战斗期间不被改动**，只通过 `BattleResult`（协议 v1）一次性、幂等地提交（`applyBattleResult`，按 `battleId`）。写集：`level, exp, hp, status, statusCount, moves, evs, friendship`（+背包/图鉴/金钱）。持久状态文档有自己的版本（schema 4；`docs/step3/save-and-ledger.md`，第四步加 `claims`，5.0 加形态、统计、步数并改持久键，见 `docs/step5/5.0.md`），与协议版本无关。框架状态是队伍/盒子/背包/金钱/图鉴/凭证/账本的唯一权威；MZ 的 `$gameParty` 金币与物品不参与。协议 v1 已冻结（范围见 `docs/step2/protocol-v1.md`，由 `protocol-v1.frozen.json` 和契约测试守护）。

MZ 侧：`src/plugins/PS_BattleFlow.ts`（插件命令 `StartBattle`、解释器等待、占位文字战斗场景；游戏状态放在 MZ 存档 `$gameSystem._psGame` 里）、`PS_RuntimeFixes.ts`（修 RPGReactor 在 PixiJS 8 上的两个内存泄漏）、`PS_SaveLocation.ts`（打包后存档放包外）、`PS_SaveState.ts`（MZ 存档里的状态版本：载入迁移/诊断，存前校验）、`PS_BattleSmoke/PS_BattleFlowTest.ts`（冒烟与自动化测试驱动，无参数时不工作）。

## 7. 仓库地图

```
docs/PROJECT-GUIDE.md        本文件
docs/step2/ docs/step3/      第二、三步的全部结论（入口 docs/step2/README.md、docs/step3/README.md）
src/framework/               引擎与规则源码（严格 TS；rules content battle flow i18n tools，见第 6 节）
src/plugins/                 MZ 插件源码（Vite 构建到 js/plugins/，输出被忽略）
src/vite*.mts                插件与引擎包的构建配置
content/sample/              内容作者源（JSON）；编译产物 data/framework/content.json（git 忽略）
js/engine/                   运行时：build/（构建产物，忽略）、*.cjs 兼容门面、fixtures/（JSON 夹具与基线）、showdown/（构建产物，忽略）
scripts/                     引导、构建、打包、签名、CI 辅助、测试、诊断脚本
experiments/step2/ step3/    测试、探针、证据（evidence/ 见其 MANIFEST.md；step3/reference/ 是参考观察交付包）
.github/workflows/ci.yml     CI（headless + plugins 两层；窗口测试不在 CI）
data/ img/ audio/ ...        MZ 工程内容（模板数据 + 本地复制的 MZ 素材，素材被本地排除，不提交）
```

## 8. 常用命令

| 目的 | 命令 | 代价 |
|---|---|---|
| 快速自检（插件类型检查 + 框架类型检查 + 导入边界 + 构建引擎包 + 全部 Node 测试，无窗口） | `scripts/test-quick.sh`（无 Reactor 类型包时用 `scripts/test-headless.sh`，CI 第 1 层就是它） | 便宜（本机实测 7 s），评审和日常首选；任何一个套件失败都会点名 |
| 构建一切（引擎包、内容、插件） | `pnpm --dir src build`（只构建引擎包：`build:engine`；内容：`content:build`/`content:check`/`content:inventory`；类型检查：`typecheck`） | 便宜 |
| 构建/裁剪 Showdown（并暂存 RPG 扩展） | `pnpm --dir src build:engine` 之后 `scripts/build-showdown.sh` | 首次约 1–2 分钟（下载依赖） |
| 读取 CI 结果（无凭据，读公开页面） | `scripts/ci-status.sh <分支>` | 读不到就是未验证，不是通过 |
| 游戏内流程测试（开 NW.js 窗口，真实按键/事件/存档；T1–T26 + 重启 V1–V3） | `scripts/run-flow-test-mac.sh <证据目录>` | 约 4–5 分钟，弹窗口 |
| 打包（不用 MZ 部署） | `scripts/package-mac.sh [--with-tests] [--harden] [--identity ID]` | 约半分钟，约 545 MiB（557,964 KB） |
| 包内完整测试（流程 + 场景矩阵 + 存档位置 + 签名封印） | `scripts/run-package-tests-mac.sh`（`PF_PACKAGE_ARGS=--harden` 用硬化运行时；只结束自己启动的实例，按精确 PID） | 几分钟，弹窗口 |
| 包内性能与内存测量 | `scripts/run-package-perf-mac.sh [次数]` | 几分钟，弹窗口 |

测试脚本运行时窗口失焦、静音都不影响结果（见 `docs/step2/runtime-issues.md`）；脚本从不写玩家的存档槽（包内存档位置检查只用一个空闲的高位槽并还原；流程测试用 `--ps-save-dir`），也不会杀掉不是自己启动的进程（若已有打包应用在运行会拒绝启动）。

改了 `src/framework/**` 之后必须重新 `pnpm --dir src build:engine`；改了 `battle/custom-formats.ts` 或 `rules/rules.ts` 还要重新 `scripts/build-showdown.sh`（Showdown 里用的是暂存的拷贝，`test-engine-contract.cjs` 会在拷贝与构建产物不同时报错）。故意改变行为后：`node experiments/step2/s5/update-matrix-baseline.cjs`（矩阵指纹基线）与 `node experiments/step2/s5/protocol-freeze.cjs --update`（协议冻结文件）只在有意为之时运行，并在提交里说明。升级 Showdown 固定提交时先跑 `test-engine-contract.cjs`。

## 9. 环境准备（从零）

前提：Apple Silicon Mac；Node ≥ 22（开发用 22.21.1，Showdown 要求 ≥ 22.18）；pnpm 10.20.0；git；已安装 RPG Maker MZ（Steam 版，其 NW.js 已是 0.117.0 SDK arm64——`scripts/doctor.sh` 会检查）；RPGReactor 源码检出在 `/Users/dingshinn/Desktop/RPGReactor`，必须是带类型声明的 `2dc2e10e`（0.98.8；0.98.7 标签没有类型包）——`scripts/versions.env` 已固定该提交，本地检出不是它时 `setup-reactor.sh`/`doctor.sh` 会报错（确认要用别的提交时设 `REACTOR_ALLOW_OTHER_COMMIT=1` 并同步改 versions.env 与文档）；下载模式没有为这个提交验证过。

```bash
cd pokemon-framework-prototype
REACTOR_SOURCE=/Users/dingshinn/Desktop/RPGReactor ./scripts/bootstrap-mac.sh   # Reactor 运行时、MZ 素材、依赖、类型检查、构建、doctor（20 项应全过）
pnpm --dir src build:engine                                                                  # 引擎包（Showdown 扩展由它暂存）
./scripts/build-showdown.sh                                                                 # 固定提交的 Showdown → js/engine/showdown
pnpm --dir src build                                                                        # 插件
./scripts/test-quick.sh                                                                     # 自检
```

生成物/忽略项（不提交、可重建）：`js/engine/showdown/`、`js/plugins/PS_*.js`、`RR_*.js`、`js/libs`、`js/reactor_*.js`、`index.html`、`src/node_modules`、`src/vendor/rpgreactor`、`.reactor-source`、`save/`、`build/`，以及本地复制的 MZ 素材（`.git/info/exclude`）。Showdown 源码缓存放在仓库外（`~/Library/Caches/pokemon-framework/showdown-src`，`SHOWDOWN_SRC` 可覆盖；首次 `build-showdown.sh` 时下载生成），因为 MZ 部署会复制整个项目根目录。已经 staged 的引擎不依赖缓存，只有重建才需要它。

## 10. 已知坑

- Showdown 把昵称（我们的稳定 id）截成 20 个字符并清理分隔符，所以 id 限 1–18 个安全字符（`BattleSession.create` 会拒绝其他 id）。
- Vite 插件里裸 `require(...)` 会被改写成浏览器占位，插件从 `globalThis.require` 取 NW.js 的 Node `require`。
- `pixi_compat` 会包装场景类，类的静态属性在包装后读不到；场景用实例标记，共享状态放 `window.PSFlow`。
- **MZ 的"部署"在 Apple Silicon 上会弄坏 NW.js 包**（拆掉符号链接、丢签名），一律用 `scripts/package-mac.sh`；`scripts/repair-deployed-app-mac.sh` 只是旧的补救脚本。
- 打包后存档在 `~/Library/Application Support/<包名>/save/`，与 NW.js 浏览器数据同在一个父目录。
- 失焦的游戏窗口默认暂停（MZ 的 `isGameActive`）；只有测试驱动覆盖了这一点。
- macOS 自带 bash 3.2：`set -u` 下空数组展开会报错；`sed -i` 需要 `-i ''`。
- 引擎使用 `js/engine/showdown/dist/config/` 里的规则拷贝，会话层使用 `js/engine/rpg/` 里的源文件；改了规则没重建会得到混合结果（`test-engine-contract.cjs` 会抓到）。
- 持久化的异常状态计数是 `statusCount`（睡眠=剩余回合；中毒 0 普通/1 剧毒标志）；战斗结束后中毒计数清零（剧毒按普通中毒存回），睡眠保留剩余回合；没有该字段的旧记录，睡眠会重新抽一个时长。
- `reason: win` 且 `winner` 不是 `Player` 表示战败（结果里有 `outcome.winner`）。败/平（结果码 4）由应用层在同一次提交里扣钱并治疗（D3），`StartBattle` 默认随后回家并结束发起它的整条事件调用链（`canLose` 可关）。
- Showdown 的 `Dex` 默认是最新世代；战斗格式是 Gen 8，生成成员用的数据要取 `Dex.forGen(8)`（例如 Rest/Roost 的 PP 两代不同，引擎会拒绝不符的 PP 上限）。
- 新游戏的框架状态在 `DataManager.setupNewGame` 钩子里建立；`PSFlow.game()` 在没有状态时抛错而不是造一个。测试要用夹具队伍必须显式 `PSFlow.resetGame()`。
- 物种有两种身份（5.0 起）：存档、图鉴、领取用内容 ID＋形态号（`charmander`/0），会话、引擎、结果用 Showdown 名（`Charmander`）。直接把存档对象交给 `BattleSession`，或把会话里的成员直接塞进存档，都是错的：经应用层，或用 `rules/species-key.ts` 的 `battleView`/`toPersistentMember`。测试夹具的内容 ID 就是 Showdown 名，用样例内容时要先 `F.savedFor(game, content)`。
- 第四步之后战斗对手由内容生成，测试要固定 `PSFlow.rng`（生成随机）和 `PSFlow.seed`（引擎种子）才可复现。
- zsh 里 `echo =====` 会被当成命令展开而报错；脚本用 bash。
- 内存、泄漏相关改动依赖 PixiJS 内部实现，升级 Pixi/Reactor 后要重跑 100 场战斗内存检查（`docs/step2/runtime-issues.md`）。
- 真实 MZ 测试驱动（`PS_BattleFlowTest`）只等场景对象出现就按键，按键可能早于 `scene.start`。5.0 新包首轮 T24 返回菜单超时一次，根因未证实（`docs/step5/5.0-closure.md`）。改驱动时要同步可交互状态，并记录输入帧，不要靠加长超时或重跑到通过。

## 11. 文档地图（建议阅读顺序）

1. 本文件 → `../../.handoff/STATUS.md`（现在做到哪、下一步）
2. `docs/step2/README.md`（第二步总结与文档导航）
3. `docs/step2/c2-decision.md`、`deviations.md`（用户的决定与有意差异）
4. `docs/step2/protocol-v1.md`（冻结的协议）、`runtime-issues.md`、`signing-plan.md`
5. 阶段报告 `docs/step2/2.2-report.md` … `2.5-report.md`（推导过程与证据，按需读）；独立评审后的修订与未决事项见 `docs/step2/review-followups.md`（先读它，再读报告里标 *(corrected)* 的地方）
6. `experiments/step2/evidence/MANIFEST.md`（每个证据文件的来源与对应的构建）

## 12. 分支、标签与提交约定

- `main` 是唯一长期分支；新工作开短期分支，合并后删除。远端与本地保持一致。
- 阶段里程碑用标签保留：`step2.1-accepted`、`step2.2-feasibility`、`step2.3-c1`、`step2.4-mz-flow`、`step2.5-c2`、`step2.runtime-pass`；独立评审的基线标签是 `step2-review-baseline`（指向 `2e5f2e5`，评审报告审查的就是它）；`step2-review-fixes` 是评审修复完成时的状态（`c2a3e29`，在用户决定 D1–D5 落地之前）；**`step2-closed` 是第二步收尾时的最终状态**；第三步在短期分支 `step3/foundation` 上做，**独立复核通过后**才合并并打 `step3-closed`。评审后的修复与决定见 `docs/step2/review-followups.md`。
- 提交信息写清做了什么和为什么；AI 协作提交按所用工具要求添加署名行。


## 2026-10-27 I/J技术门增补

5.3固定代码29791cb的Kimi/ultra技术门已有限通过，材料增补闭环与保留风险见[5.3 I/J技术收尾](step5/5.3-IJ-closeout.md)。本增补不预签精确CI、远端接收、完整5.3或原版等价；五项计时WARN、当前Renderer增长WARN_OPEN、Ruby新增执行0、FINAL-INPUT后置NOT RUN及原历史限制保持。前表为各阶段历史截面，具体新结论以上述版本化增补和实际发布回执为准。
