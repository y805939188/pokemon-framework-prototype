# 第四步前短架构批次（核心独立入口、应用层、假适配器、同契约验证）

**状态：已实现并自测，待针对本批的独立复核**（分支 `step3/arch-batch`，基于已收口的 `main` = `step3-closed`，`4ce31e1`；被测代码提交 `cd0fc0b`）。它不是第四步：没有新玩法，没有 monorepo 迁移。

## 短清单与结果

| # | 目标 | 做了什么 | 证明 |
|---|---|---|---|
| 1 | 不依赖 MZ、Showdown 内部类型或 Node 环境的领域公共入口 | `rules/index.ts`（growth、rules、state、save-schema、digest、types）；`framework/tsconfig.core.json` 以 `lib: ES2022`、`types: []` 独立编译；`js/engine/build/core.cjs` 由它构建 | 探针副本里 `process`、`Buffer`、`console`、`TextEncoder`、`require`、`setTimeout` 全部编译失败；core 包不含 `require`/`process`/`node:`，在没有这些名字的 `vm` 上下文里加载并复现 engine 的金样与成长曲线（`test-core-independent.cjs`）；检查器禁止 rules/content/i18n/flow/app 使用任何 Node 内建模块、Node 全局名，rules/app 禁止显式 `any` |
| 2 | 摘要的环境依赖 | `rules/sha256.ts`：可移植、同步的 SHA-256（UTF-8，未配对代理项 → U+FFFD，与平台一致）；`resultHash` 与内容 `inputsHash` 改用它 | 用**原 `node:crypto` 实现**生成的金样（`experiments/step3/fixtures/result-hash-golden.json`：4 个真实结果 + unicode/星号字符/转义/键序/长文档）逐个复现；`inputsHash` `c322d830…` 不变；NIST 向量、长度 0..200、400 个随机串与 `node:crypto` 逐位一致；旧账本条目 `{hash}` 仍识别为 already-applied、同 id 不同内容仍冲突；`custom-formats.cjs` 哈希不变；同步调用形状不变 |
| 3 | Game Application 应用层 | `app/`：`GameApplication`（`startBattle`、`commitResult`、`finishBattle`、`abortBattle`）+ 端口（状态、会话工厂、内容、投影）；规则留在 core（调用 `applyBattleResult`）；Showdown 与 MZ 在各自接入层；`composition.ts` 是唯一把 Showdown 会话接到应用端口的地方；复用 R2 的窄查询与不透明检查点；新增 `BattleDriver`/`BattleDriverFactory`（只含类型）作为会话与引擎之间的缝 | 应用层只依赖 rules/content/flow/i18n（检查器强制，且禁用网关内部名）；`test-application.cjs`（13） |
| 4 | 假适配器与真实 MZ 验证同一应用契约 | 内存端口（`tools/fakes.ts`）；**脚本化战斗驱动**（`tools/scripted-driver.ts`，无战斗规则，可注入失败）；MZ 插件的 `begin/finish/abort/commit` 现在是应用层的薄包装，MZ 端口 = `$gameSystem._psGame` + 结果变量 | 同一契约的四种形态：内存端口（成功、重复、冲突、违约、未完成/封闭会话、投影失败、状态不可读/拒写、悬空内容）、真实 Showdown 会话（Node）、脚本化驱动（**Showdown 不会被加载**，`test-scripted-driver.cjs` 6）、真实 MZ 窗口（T1–T12，含新场景 T12 投影失败：已提交、已报告、不重复、重试只通知宿主）；变异（投影失败撤销提交 / 提交错误不捕获 / 应用写入所读状态）全部被抓到 |
| 5 | 收紧本批涉及的类型与机器边界约束；同条件性能基线 | 检查器：`app` 层规则、Node 全局名、核心与应用禁用 `any`、核心无 Node 内建；插件里触及的代码用类型化的应用视图；`typecheck:framework` 同时跑核心编译 | 检查器测试 25 项（含对每条新规则的违规树与“文字不误报”）；性能见下 |

## 应用契约（语义）

- **未提交 / 已提交 / 已提交过 / 已提交但宿主未通知** 是四种可区分的结果：`BattleOutcome.commit` ∈ `applied | already-applied | none`，`aborted`，`projection` ∈ `ok | failed`。
- `finishBattle` 不抛：读不到结果（未完成、会话因回滚失败已封闭）或提交被拒（违约、同 id 不同内容）→ 中止、持久状态不变；提交后的投影失败只记录在结果上，不撤销也不重复提交，重试 `finishBattle` 得到 `already-applied` 并重新通知宿主。
- 状态归属：持久状态只有一份，由端口的拥有者保管（MZ：`$gameSystem._psGame`）；应用只 `read()` 并在规则产出新状态后 `replace()` 一次，从不原地修改；战斗会话的工作副本不是第二份持久状态；Showdown 内的 HP/PP 在规定同步点才进入结果。

## 性能（同条件，非证明）

`experiments/step3/evidence/batch/perf-compare.md`：同一台机器、同一脚本、先基线后新版交叉各两遍（每遍 3 次冷启动）。批次的各指标没有越出两遍基线之间的波动；冷启动行噪声最大（一遍新版 941 ms，另一遍 769 ms，基线两遍 816/782 ms）。**这是第一份同条件基线，不是“无退化”的证明**：只有 3 次启动/遍、一台机器、没有预算阈值。此前“冷启动 +190–200 ms、动作 +1.5–2 ms”相对旧文档记录的差异没有出现在同条件对照里，说明那是跨会话（机器状态）差异；原因未再追究。

## 验证（精确提交）

- 本地 `scripts/test-quick.sh`：25 套件 **201 项**通过（含冻结协议、矩阵、F1–F3、失败封闭、R1–R4 回归）；日志 `experiments/step3/evidence/batch/test-quick.txt`。
- 真实宿主与打包（NW.js 0.117.0 / Node 26.7.0，ad hoc 签名）在 `cd0fc0b`（`workingTreeChanges: 0`）上：开发树 T1–T12 + V1 通过；包内 T1–T12 + V1 + S1–S10 + SL1 通过，签名封印有效，S1–S10 指纹与 Node 及冻结基线逐个相同；**引擎包哈希 `2a66c938e4ce97a2a4e9a9a078f43bb88dc6b86c5812a45434f2e27fde543076`**（包内 = Node 加载）。证据：`experiments/step3/evidence/batch/`。旧引擎 `3e2267c3…`（`d9a9779`）的宿主证据不适用于本批。
- CI：见 `.handoff/STATUS.md` 与 `scripts/ci-status.sh step3/arch-batch`。

## 提交（可单独回退）

`e80d860` 可移植摘要 · `4eb6fa8` 核心入口/独立编译/裸上下文包/检查器规则 · `d67dd28` BattleDriver 缝 · `48c2975` 应用层与组合根 · `9b284ca` 脚本化驱动与契约测试 · `e6f799d` 插件接入应用层与 T12 · `cd0fc0b` 保持 session-create 度量可比；其后只有文档与证据。回退用 `git revert`（逆序），不要 reset。

## 剩余与后置

- `flow` 仍把 `showdownDriverFactory` 作为默认引擎（直接 import 网关）；是否改成必须注入留给第四步需要时。
- 脚本化驱动只支持单打、无属性模型，仅用于证明接缝；Showdown 的行为由契约/矩阵/整合套件和真实窗口覆盖。
- `Req = Record<string, any>` 等 flow 内的 `any`、插件里其余 `any`、`GatewayMessage.request` 的形状、Showdown 的 `ShowdownBattle` 仍是 `any`（只在 battle 层与 tools 内可达）。
- 保存阶段守卫（`beforeSave` 战斗中拒绝）、奖励凭证、背包容量、治疗等第四步用例未做。
- 性能只有这份同条件对照，没有预算与阈值；Windows/Intel、公证、双打与长尾按用户决定后置。
