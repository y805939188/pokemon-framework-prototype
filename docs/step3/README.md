# 第三步：工程基础与首条 Ruby／TS 差分链

状态：**已收口（2026-10-19，标签 `step3-closed`，记录见 `docs/step3/closure.md`）**。批次 A、B、支线 C 均已实现；首次独立验收 `step3-candidate-2` 不通过、限定整改 R1–R4 后 `step3-candidate-3` 有条件通过并已合并到 `main`。性能尚无同条件基线，未证明无退化。以下是收口前的工作记录。（工作分支 `step3/foundation`，起点 `a77b6af`）。执行方案全文在工作区 `.handoff/step3-plan.md`（不在 git 里）。

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

本地 Node 套件合计 **117 个测试**（第二步 68 + 边界 14 + 内容 8 + 本地化 7 + 存档 12 + 整合 4 + 差分 4）——这是候选 `89988b2` 时的数字；并入 F1–F3 与第二步收尾后为 **20 套件 147 项**（新增套件/用例：`test-move-requests` 8、`test-pp-sync` 5、`test-session-operations` 11、`test-session-failure` 6，见 `docs/step3/review-fixes.md`、`docs/step2/closeout-addendum.md`）。**没有声明的**：Windows/Intel；Developer ID 签名与公证；窗口测试在 CI；框架独有内容数据的来源（仍是占位）；成长以外模块的原版运行证据；MZ 存档文件本身的原子性（MZ 的）。

## 验证入口

- 无宿主快速自检：`scripts/test-quick.sh`（类型检查 + Node 套件）。
- 需要窗口、只能在本机跑：`scripts/run-flow-test-mac.sh`、`scripts/run-package-tests-mac.sh`、`scripts/run-package-perf-mac.sh`（见 `docs/PROJECT-GUIDE.md` 第 8 节）。
- CI 与 TS 迁移的进展见下方各节（随推进补充）。

- 第二步补充收尾（回滚失败封闭会话、守卫测试、F2 支持范围的文字化）：已收口并入本分支（标签 `step2-closeout`），见 `docs/step2/closeout-addendum.md`；不改变上面的第三步验收状态。

## 边界债务与去向（第三步收口报告的固定栏目）

这些是**限定偏差**，不是第三步 9 项验收的新增门槛；用户已决定（2026-10-19）它们放进第四步开工前的短架构批次关闭，批次不并入第三步收口。**例外：** 独立验收（Codex，`e0a6be5`）指出其中“战斗内部对象穿透”和“模板插值漏检”违反第三步**原有**要求（A3：内部耦合集中在适配层且由工具强制），不能整体豁免，已在下面的“第三步限定整改”里关闭；表中标注“已关闭”的行不再是债务，只保留后续批次要接着做的部分。

| 债务 | 现状（实证） | 去向 |
|---|---|---|
| 战斗内部对象穿透（v1.0 §八“业务不持有引擎内部对象”） | **已关闭（R2）**：`flow/session.ts` 不再调用 `_debugBattle()`，也不碰 `_env/_queue/_seq/_closed`；网关提供值查询、受控操作和不透明检查点；检查器按标识符禁止在 battle/tools 之外使用。`ShowdownBattle` 仍为 `any`，只在 battle 层与 tools 内可达 | **短批次已做**：`BattleDriver`/`BattleDriverFactory` 类型缝 + 脚本化驱动假适配器；不重复整改 |
| 领域依赖 Node | **已关闭（短批次）**：`rules/sha256.ts` 可移植同步 SHA-256，旧账本与内容哈希金样一致；核心 `types: []` 独立编译，裸 `vm` 里运行 | 见 `docs/step3/architecture-batch.md` |
| 检查器盲区 | **模板插值部分已关闭（R3）**：改用 Vite 自带的解析器读语法树，`${}` 里的 `require`、宿主引用受检查，字符串/注释/正则文字不再误报；固定的 `typescript@7.0.2` 没有 JS 编译器 API。尚未做：`process.*` 等 Node 全局的进一步限制、核心无 Node 编译 | 批次：超出原白名单的增强规则与 `types: []` 核心编译 | **（短批次：Node 全局名、核心/应用层 `any`、应用层规则已补）**
| 插件 `any` | `PS_BattleFlow.ts` 约 46 行；插件直接读 `s.gw.readState` 两处 | 批次/第六步：类型化应用门面 |
| 保存阶段 | `PS_SaveState.beforeSave` 不检查战斗中（靠场景约束） | 第四步保存用例加守卫与场景 |
| 性能 | 冷启动比候选记录慢约 190–200 ms、引擎动作延迟 +1.5–2 ms 的差异：**短批次建立了第一份同条件对照**（基线两遍/新版两遍交叉，`experiments/step3/evidence/batch/perf-compare.md`），差异没有出现在同条件对照里，原因未再追究；**仍不是无退化的证明**（3 次启动/遍、一台机器、无阈值） | 第四步闭环后再定预算 |
| 范围 | 首版单打；双打、长尾后置；Windows/Intel 暂缓（用户决定） | 第四步后重估；平台见 `PROJECT-GUIDE.md` |

## 第三步限定整改（独立验收 `e0a6be5` 后，2026-10-19）

独立验收（Codex，报告 `.independent-reviews/step3-20261019/REPORT.zh.md`，在工作区、不在 git 里）结论“不通过”，4 项 P2，均是第三步**原有要求**的缺口（不是新增架构要求）。整改在分支 `step3/rework-r1-r4`，按提交逻辑拆开，可单独回退：

| 项 | 问题 | 整改 | 提交 | 回归 |
|---|---|---|---|---|
| R1 | 缺失 key `constructor`/`toString` 命中对象原型，`has` 为真，`t`/`tOr` 抛 `TypeError`（违反 B2/验收 #5） | 只认自有的字符串值；`has`、`t`、`tOr`、回退链、`font`、`checkLocale`、`translatorFor` 同一语义 | `7631c6a` | `test-i18n.cjs` +4：两语言的原型同名缺失 key、真实同名 key、非字符串值与语言名、`checkLocale` |
| R3 | 模板插值里的 `require` 同时通过边界检查和严格 TS（违反 A3/验收 #2） | 检查器用语法树识别可执行表达式，只清除字符串/模板文字/正则文字 | `9290648` | `check-boundaries.test.cjs` +5：模板 require、宿主引用、嵌套模板、文字不误报、类型/动态 import 与解析失败；旧检查器上 4 项失败 |
| R4 | overlay 把 `species/blastoise` 的 `nameKey` 改成 `species.charizard`，编译与组装成功，水箭龟显示成喷火龙（违反 B1） | 在**合并后**的记录上重验唯一性；错误定位到 `overlays.json [i].set.nameKey`，点名冲突实体及来源；互换 key、改到刚空出的 key 仍合法；失败仍删除旧产物 | `00b963c` | `test-content.cjs` +5（含 CLI 删除旧产物） |
| R2 | 生产 `flow/session.ts` 持有 Showdown 内部对象并读写网关内部状态（违反 A3“内部耦合集中在适配层”） | 网关新增 `activeId`、`awaitingChoice`（返回拷贝）、`drain/discardQueued`、`checkpoint/fromCheckpoint`（冻结、无字段的不透明令牌，无法由数据伪造）；会话保留互斥、双错误、封闭、PRNG/seq/消息顺序；检查器按标识符（含计算键、解构、模板）禁止在 battle/tools 之外使用网关内部 | `bef2474`、`d9a9779` | 新增 `test-gateway-boundary.cjs`（5）；检查器 +2；F3 与 fail-closed 用例原样通过；对真实 `session.ts` 的变异被拒 |

本地：`scripts/test-quick.sh` 21 套件 **168 项**通过（含冻结协议、矩阵、F1–F3、失败封闭）。宿主与打包验证在整改后的代码提交 `d9a9779` 上重做（NW.js 0.117.0、Node 26.7.0；包内 `gitHead` = `d9a9779`、工作树无改动、ad hoc 签名）：开发树 T1–T11 + V1 通过；包内 T1–T11、V1、S1–S10、SL1 通过，签名封印有效，S1–S10 指纹与 Node 及旧基线逐个相同；**引擎包哈希 `3e2267c3c43f96f7bc7d4274b5bd572b7d874a4193ce231849fa7ba583547acc`**（包内 = Node 加载）。`22842be4…` 是整改前的引擎，其宿主证据不适用于现在的运行时。证据：`experiments/step3/evidence/rework/`。性能仍然是：**没有同条件基线，未证明无退化**；冷启动 +190–200 ms、动作 +1.5–2 ms 的差异原因未判定，本次没有测性能。

- 第四步前短架构批次（核心独立入口、可移植摘要、应用层、脚本化驱动与同契约验证、检查器收紧、同条件性能对照）：分支 `step3/arch-batch`，**待针对本批的独立复核**，记录见 `docs/step3/architecture-batch.md`。
