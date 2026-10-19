# 第三步：工程基础与首条 Ruby／TS 差分链

状态：**批次 A、B、支线 C 均已实现并在本机与 CI 上验证；等待用户安排的独立复核（未合并到 `main`）**（工作分支 `step3/foundation`，起点 `a77b6af` = 第二步收尾 `step2-closed` + 两个文档提交）。执行方案全文在工作区 `.handoff/step3-plan.md`（不在 git 里）；当前进度在 `.handoff/STATUS.md`。本文件只记范围、基线、关键决策、遗留分流和验证入口，随推进更新，不重复方案全文。

## 范围

交付：可重复构建、持续集成（CI）、严格 TS 与依赖边界、最小内容编译管线、本地化入口、版本化存档基础、日志、必要的遗留修复，以及一条真实的 Ruby／TS 对照链（成长曲线）。
不做：完整新玩法、完整双打 UI、全量数据库、完整 PBS 导入器、正式美术 Demo、签名公证、Windows/Intel、正式性能预算。第二步已有能力必须保持。

分批：**A 工程化底座**（基线、CI、TS 小样、逐模块迁移、回归）→ **B 内容、本地化、存档**（最小内容管线、文本 key、版本化存档与 `appliedBattles` 策略、整合回归）；**支线 C**（隔离参考观察 + 成长差分链）由独立会话在工作区的 `observation-growth/`（不在任何仓库里）进行，只通过按固定 schema 生成并自检过的行为数据交付包与实现端交接。

## 基线（A0）

`baseline.json` 记录迁移起点：提交、标签、外部版本身份、快速自检的套件与测试数（10 个套件 68 个测试，起点全部通过）、行为对照物（矩阵指纹文件及其哈希、冻结协议哈希、引擎契约测试、2.2 黄金文件）以及第二步证据中哪些在迁移后必须重做。
迁移期间的规则：**行为不变**。矩阵指纹、冻结协议、68 个测试和引擎契约保持原样通过；指纹变化必须映射到具体原因和结构化断言，业务变化不得伪装成构建变化。第二步的包内/流程/性能证据描述的是 CJS 原型，迁移后必须由含迁移的提交重新生成。

## 关键决策（已定，来自用户或本方案）

- 源码风格：业务 TS 模块一律 `import`；`require` 只允许出现在白名单里的宿主／Showdown 加载适配入口、必要的工具脚本和构建产物。产物形态（单文件 CJS 引擎、由插件用第二步相同的 `require` 方式加载，Node 测试与 NW.js 加载同一份产物并记录哈希）在 A2 小样里用实测确认或改用备选；Showdown 在 NW.js 里能否用 `import()` 加载由实测记录，不凭推断。
- 战斗内以 Showdown 为准；战斗数据复用已固定验证的 Showdown，框架独有数据（成长、基础经验、EV、捕获率、进化、升级学招等）单独核对来源；作者格式 JSON + schema；仓库是公开的，数据和素材的来源与使用条件先记录再使用。
- CI 通过是合并条件（所需检查在精确候选提交上全部成功；失败、未运行、读不到都不放行；本地合并后在最终 `main` 上再核验）。
- 参考观察的隔离、交付包的 schema 与“检查前移”：见 `experiments/step3/reference/`（落库后）与工作区方案。

## 遗留项分流（来自 `docs/step2/review-followups.md`）

| 项 | 归属 | 一句理由 |
|---|---|---|
| 28 正式插件使用测试夹具（合成学习表、起始队伍） | **第三步** | 内容管线的目标之一：运行入口能用管线小样，夹具保留且身份明确 |
| 28 `appliedBattles` 无上限增长 | **第三步（B3）** | 存档基础；先证明保留/压缩策略不破坏防重复保证 |
| 28 `dex.seen` 把没派出的训练家成员也记为见过 | **按规格判断** | 先对照规格；规格明确则当 bug 修，否则属第四步产品取舍 |
| 28 金钱为负时静默钳到 0 | **按规格判断** | 同上，不以“工程整理”为名改业务语义 |
| 32 `process.mainModule`（已弃用） | **第三步** | 迁移时一并替换 |
| 6(b) 精灵球“队伍与盒子全满”守卫 | **第四步** | 依赖仓库/接收策略，属可玩闭环 |
| 29 单敌人双打创建崩溃 | **双打批次** | 双打不在首版范围，测试用两只敌人规避 |
| 30 超级进化/极巨化先于 RPG 道具 | **长尾批次** | 做超级进化时处理（`deviations.md` #8） |
| 31 SDK 版 NW.js 自带开发者工具 | **第七步（发布）** | 发布阶段换 normal 版本或关闭 DevTools |
| 逃跑结算时机（双打） | **双打批次** | 已决定保持回合内结算，双打界面设计时复核 |

## 批次 A 结果（工程化底座）

- **A1 CI**（`.github/workflows/ci.yml`，权限 `contents: read`，Action 固定到提交 SHA）：第 1 层 headless（Linux：固定版本 Node 与 pnpm、锁文件安装、构建引擎包、按固定 SHA 构建 Showdown、`scripts/test-headless.sh` = 框架严格类型检查 + 导入边界检查 + 全部 Node 套件）和第 2 层 plugins（Reactor 固定提交的下载模式取得类型包、插件类型检查与构建）。两层在 `20a3553` 之后的提交上都已在 GitHub 上跑绿（读取方式：`scripts/ci-status.sh`，从公开的 Actions 页面取，失败信息经 `scripts/ci-run.sh` 变成运行注解）。**第 3 层（真实 MZ/NW.js、包内测试、性能）不在 CI**，在本机跑（`scripts/run-*-mac.sh`）。CI 没读到结果 = 未验证，不写“通过”。
- **A2 小样与加载契约（NW.js 0.117.0 / Node 26.7.0 实测）**：`require` 加载构建产物可用；`require` 加载 Showdown 可用；`import()` 加载 Showdown 失败（`module is not defined`：按浏览器模块执行，没有 Node 上下文），`import()` 加载 `.cjs` 产物失败（取不到模块）。**结论：Showdown 必须经 `require` 加载**，因此 `require` 只允许出现在 `src/framework/battle/showdown-loader.ts`（由边界检查强制）；产物形态定为单文件 CJS 引擎包 + 独立的 Showdown 扩展包。
- **A3 迁移**：`js/engine/**/*.cjs` 实现已迁成严格 TS（`src/framework/{rules,battle,flow,tools}`），由 Vite 构建为 `js/engine/build/engine.cjs`（API）和 `custom-formats.cjs`（运行在 Showdown 内部、自包含，由 `scripts/build-showdown.sh` 暂存）。`js/engine/*.cjs` 现在是几行的兼容门面（`module.exports = require('./build/engine.cjs').<namespace>`），插件与全部测试保持原来的 `require` 路径，**测试未改一行**。导入边界检查（`scripts/check-boundaries.cjs`，13 个测试证明每条规则都会失败）强制：规则层不碰 battle/flow/宿主、只有 Showdown 适配层碰 Showdown、`require` 白名单、无宿主全局与外部包、无导入环。
- **A4 回归**：68 个原有测试 + 新增 13 个边界测试通过；矩阵指纹与第二步基线文件逐项相同；冻结协议未变；在含迁移的干净提交 `9d8bc62`（空差异哈希）上重跑包内全套（T1–T7、V1、S1–S10 指纹在包内、Node、基线三处一致、SL1、封印）和开发树流程，全部通过。引擎包的哈希现在记录进跨宿主证据（`engineArtifact`）并在两个宿主间比对。性能与内存的复测放在批次 B 之后统一做。

## 批次 B 结果（内容、本地化、存档）

- **B1 内容管线**（`content/sample/` → `src/framework/content/compile.ts` → `data/framework/content.json`）：JSON 作者源 + 最小 schema（版本 1），纯函数编译器，所有问题按“文件 + 路径”定位（缺字段、拼错字段、重复 id/文本 key、越界、未知来源、覆盖层指向不存在/冲突/无理由/改不允许的字段）；输出确定（键排序），`inputsHash` 覆盖全部输入；`check` 发现过期或缺失产物；**构建失败会删除旧产物**，过期产物不会掩盖坏输入。战斗数据（基础数值、显示名、招式名）运行时从固定的 Showdown 读取，不复制进框架内容（`flow/content-runtime.ts` 组装，带定位的组装错误）。来源登记（`sources.json`）明确：框架独有数值（成长/基础经验/EV/捕获率/升级学招）目前是 **author-placeholder**（作者自拟、不声称等同任何游戏、发布前必须换成有来源的数据），Showdown 数据 MIT 但不自动解决游戏数据的再分发。盘点（`docs/step3/content-inventory.json`）：字段级对比，不把数据一致当行为一致。夹具与样本身份分开（`content.meta.kind`），战斗插件默认用样本且**不静默回退**到夹具；样本组装结果与第二步夹具逐项相同，用两者各打一整场战斗结果相同。
- **B2 本地化与诊断**：`src/framework/i18n`——文本 key、参数替换、回退语言链、可见的 `[missing:key]` 标记与诊断、`checkLocale`（缺 key / 多余 key / 占位符错误）；英文基础表 + 中文小样（覆盖全部 key）；战斗文字与整个战斗界面（菜单、状态、背包、队伍、学招、结束、拒绝提示）都走 key，物种名来自内容的 `nameKey`，语言的字体套到窗口上。游戏内场景 T8 切到中文：文字、字体、无缺 key、每行都放得进窗口（它发现并促成修复了背包摘要行溢出）。唯一有意的英文文字改动：战斗日志里的 “Poke Ball” 统一成背包里本来就用的 “Poké Ball”。日志：`flow/log`——按战斗 id 关联的结构化条目（选择、拒绝、账本、请求、回合、成长、结束、引擎错误），写入时脱敏（家目录路径、超长字符串），有界环形缓冲，不写磁盘，日志出错不影响战斗；流程报告带尾部。
- **B3 存档版本与恢复**：见 `save-and-ledger.md`（schema 2、从 schema 1 迁移、诊断式拒绝、存储边界、MZ 存档入口 `PS_SaveState`、`appliedBattles` 策略：保留全部身份并测量增长，水位线压缩的前提未证明所以不采用）。
- **B4 整合**：`experiments/step3/test-integration.cjs` + 游戏内 T9/T10：旧存档过整场战斗、重放、恢复后重试、双语、缺失/失效引用（会话创建即报，插件开战前检查并中止、状态不动）。

## 支线 C 结果

见 `differential-growth.md`：隔离观察端对固定提交的原版 Ruby 实际运行，交付 3504 条成长曲线用例；TS 实现修掉一个 bug（`null` 经验）后逐条相同；规格 §12.2 的推导场景被原版证实。

## 遗留项处置（相对开工时的分流表）

- 夹具用于运行入口：已处理（插件默认用管线样本，夹具独立保留并带身份）。
- `appliedBattles` 增长：已处理（策略决定 + 测量 + 不变量测试；不压缩）。
- `process.mainModule`：已处理（`PS_SaveLocation` 改为用相对 index.html 解析的 `require.resolve("./js/plugins.js")` 推出项目目录；NW.js 页面里 `require.main` 是 undefined，所以没有用它；开发树与包内的存档位置检查 SL1 都覆盖这条路径）。
- `dex.seen`、负金钱钳制：**未改**，没有规格依据支持改动，仍按现有行为（`dex.seen` 记录整个对方队伍；金钱不低于 0），属第四步的产品核对。
- 其余项仍按分流表留给第四步/双打批次/长尾/第七步，不计作完成。

## 阶段验收（对照方案第 8 节）

| # | 要证明 | 状态 | 证据 |
|---|---|---|---|
| 1 | 固定输入下可重复构建并跑自动测试 | 通过 | 在干净克隆里按文档步骤（Showdown 从零构建、Reactor 下载模式、锁文件安装、类型检查、插件构建、全部 Node 套件）验证过；CI 两层在 GitHub 上对每次推送运行 |
| 2 | 严格 TS、导入边界、循环依赖检查生效 | 通过 | `scripts/check-boundaries.cjs` + 14 个测试（含每条规则的故意违规）；`tsc` 严格模式 |
| 3 | 冻结协议、矩阵、真实包关键能力未回退 | 通过 | 第二步 68 个测试逐字未改（仅 2 处有意改动，见复核包）；矩阵指纹包内/Node/基线三处一致且两宿主加载同一引擎包哈希；包内全套与开发树流程 T1–T10、V1、S1–S10、SL1 通过 |
| 4 | 内容小样可编译加载、错误可定位、来源与条件明确 | 通过（来源待定项如实标注） | `test-content.cjs`（8）、`sources.json`（框架独有数值为 author-placeholder，发布前必须替换） |
| 5 | 本地化解析/回退/参数/缺失 key 与第二语言小样 | 通过 | `test-i18n.cjs`（7）、游戏内 T8 |
| 6 | 存档版本、迁移、异常恢复、幂等 | 通过（边界按 `save-and-ledger.md` 声明） | `test-save.cjs`（12，含真实 SIGKILL）、游戏内 T9/T10、`test-integration.cjs`（4） |
| 7 | 第一条 Ruby／TS 差分链，边界清楚 | 通过（范围仅成长曲线） | `test-growth-differential.cjs`：3504 条原版实际运行用例逐条相同（修了一个 TS bug）；交付包只含行为数据 |
| 8 | 遗留项处置透明、性能无未解释的重大退化 | 部分：处置透明；性能有一处**未解释到底**的小变化 | 引擎动作延迟 +1.5–2 ms（已排除引擎与日志），帧时间/到菜单/内存无变化；见 `evidence/MANIFEST.md` |
| 9 | CI 针对精确候选提交成功（合并条件） | 见复核包“候选”一节（标签 `step3-candidate`）；读不到的结果不算通过 | `scripts/ci-status.sh` |

本地 Node 套件合计 **117 个测试**（第二步 68 + 边界 14 + 内容 8 + 本地化 7 + 存档 12 + 整合 4 + 差分 4）。**没有声明的**：Windows/Intel；Developer ID 签名与公证；窗口测试在 CI；框架独有内容数据的来源（仍是占位）；成长以外模块的原版运行证据；MZ 存档文件本身的原子性（MZ 的）。

## 验证入口

- 无宿主快速自检：`scripts/test-quick.sh`（类型检查 + Node 套件）。
- 需要窗口、只能在本机跑：`scripts/run-flow-test-mac.sh`、`scripts/run-package-tests-mac.sh`、`scripts/run-package-perf-mac.sh`（见 `docs/PROJECT-GUIDE.md` 第 8 节）。
- CI 与 TS 迁移的进展见下方各节（随推进补充）。

- 第二步补充收尾（回滚失败封闭会话、守卫测试、F2 支持范围的文字化）：分支 `fix/step2-closeout-recovery`，**待独立复核**，见 `docs/step2/closeout-addendum.md`；不改变上面的第三步验收状态。
