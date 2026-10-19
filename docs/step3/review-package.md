# 第三步独立复核包（给复核者）

候选：分支 `step3/foundation` 上**标签 `step3-candidate` 所指的提交**（复核者先 `git rev-parse step3-candidate^{commit}` 核对，并用 `git diff dabe03a..step3-candidate --stat` 确认证据对应的代码与候选之间只有文档/证据差异）。复核者必须是**非作者的独立会话或另一位 AI**；作者不得自评，也不得用子 agent 凑数。范围是第三步的全部交付，**不重审第八轮历史，也不需要重跑第二步已经验证过的所有东西**。

## 更新（2026-10-19）：被复核的是并入 F1–F3 与第二步收尾之后的版本

候选标签 `step3-candidate`（`89988b2`）仍保留，但**复核请以新标签 `step3-candidate-2` 所指的提交为准**（`git rev-parse step3-candidate-2^{commit}`；它也是 `step3/foundation` 的头，`main` 未动）。相对 `89988b2` 多了：
- F1/F2/F3 三项桥接缺陷修复（`92276c7`/`cb3c045`/`7abce72`，已独立复审并宿主验证，见 `docs/step3/review-fixes.md`）；
- 第二步收尾（`SessionBrokenError`、`disabled`/`seq` 回归、`harness.ts` 谓词、F2 范围测试、窗口场景 T11；已由另一个 Codex agent 复核并收口，见 `docs/step2/closeout-addendum.md`，标签 `step2-closeout`）；
- 本地 Node 套件现为 **20 套件 147 项**；真实窗口场景现为 **T1–T11 + V1**。

对下表的影响：
- 第 1、2、9 项在**新的精确提交**上重核（CI 用 `scripts/ci-status.sh step3/foundation`，读到的精确 SHA 与 `step3-candidate-2` 对齐才算）。
- 第 3 项：包内/开发树证据以 `experiments/step3/evidence/closeout/`（`d48e43d`，引擎包哈希 `22842be4…`）和 `…/review-fixes/host/`（`7abce72`）为准；`experiments/step2/evidence/` 是候选 `89988b2` 的旧证据，只作历史。
- 第 8 项：性能仍有**未解释**的差异（见 `docs/step3/README.md` “边界债务与去向”），不得写成无退化。
- 复核者不负责短架构批次（核心独立入口、战斗适配封装、假适配器、检查器增强）；它们是用户已决定的第四步前批次，只核对“债务登记是否诚实”。

## 先读（按顺序，约 20 分钟）
1. `docs/step3/README.md`（范围、基线、决策、批次结果、遗留处置）
2. `docs/step3/save-and-ledger.md`、`docs/step3/differential-growth.md`
3. `.handoff/step3-plan.md`（执行方案：授权、暂停条件、验收标准；不在 git 里，在工作区）
4. `experiments/step2/evidence/MANIFEST.md`（每个证据文件对应哪个提交）

## 验收标准（方案第 8 节）逐条怎么核
| # | 要证明 | 核对方式（建议在**固定、干净的候选检出**里做） |
|---|---|---|
| 1 | 固定输入下可重复构建并跑自动测试 | 干净克隆 → 文档里的步骤 → `scripts/test-headless.sh`（需要 Node ≥ 22.18、`pnpm --dir src install --frozen-lockfile`、`pnpm --dir src build:engine`、`scripts/build-showdown.sh`）；CI 的同一流程见 `.github/workflows/ci.yml` |
| 2 | 严格 TS、导入边界、循环依赖检查**生效** | `node scripts/check-boundaries.cjs` 通过；`node --test scripts/tests/check-boundaries.test.cjs`（每条规则都有一个故意违规的树，必须被抓到）；自己在临时检出里加一条违规导入看它失败 |
| 3 | 冻结协议、矩阵、真实包关键能力未回退 | 68 个原有测试**未改一行**（`git diff step2-closed -- experiments/step2` 只应有 4 处有意改动：见下）；矩阵指纹对 `js/engine/fixtures/matrix-fingerprints.json`；包内证据 `experiments/step2/evidence/package/`、`flow/`（T1–T7、V1、S1–S10、SL1，指纹在包内/Node/基线三处一致，并比对引擎包哈希） |
| 4 | 内容小样可编译加载、错误可定位、来源与条件明确 | `experiments/step3/test-content.cjs`；`content/sample/sources.json`；`docs/step3/content-inventory.json` |
| 5 | 本地化解析/回退/参数/缺失 key 与第二语言小样 | `experiments/step3/test-i18n.cjs`；游戏内 T8（证据里的 `ps-flow-report.json`） |
| 6 | 存档版本、迁移、异常恢复、幂等 | `experiments/step3/test-save.cjs`（含真实 SIGKILL）；游戏内 T9、T10 |
| 7 | 第一条 Ruby／TS 差分链、证据类型与 clean-room 边界 | `experiments/step3/test-growth-differential.cjs`；**检查交付包里没有 Ruby 代码或源码翻译**（`experiments/step3/reference/`：只应有数字、结果种类、标识符；用 `validate-handoff.cjs` 并人工看 `decision-record.md`）；确认实现端从未读过观察端私有目录 |
| 8 | 遗留项处置透明、性能无未解释的退化 | README 的遗留处置；性能：`experiments/step2/evidence/package/perf-summary.json` 对 `history/c2-perf-summary.json` 与 `memory-100/` |
| 9 | CI 在精确候选提交上全部成功（合并条件） | 读 `scripts/ci-status.sh step3/foundation` 或在 GitHub Actions 页面核对**精确 SHA**；读不到不算通过 |

### 对第二步测试文件的有意改动（应当只有这些）
- `experiments/step2/s5/test-engine-contract.cjs`：暂存件对照构建产物（不再是源文件）。
- `experiments/step2/s4/test-describe.cjs`：日志里 “Poke Ball” → “Poké Ball”（与背包一致，唯一有意的文字改动）。
- `experiments/step2/s5/test-protocol-freeze.cjs`、`s5/update-matrix-baseline.cjs` 等在评审修复阶段已改（属第二步收尾，不属本步）。
- 其余第二步测试逐字未改，迁移后全部通过。

## 变异实验（补充证据，不能替代上面的回归）
在**临时检出**里做，不要污染候选。已做过且被抓到的：Erratic 表外公式改一位、去掉最大等级钳制、把 L1 经验改成 1（差分测试失败）；协议拒绝原因改名（冻结测试失败）；暂存件与构建产物不一致（契约测试失败）；`statusCount` 种子忽略、剧毒不清零、训练家球被拒（动作/写回/矩阵测试失败）。复核者可自选再试。

## 请重点怀疑
- 迁移是否真的“行为不变”：对比 `git show step2-closed:js/engine/game/session.cjs` 与 `src/framework/flow/session.ts` 的差异（只应是类型、日志、`_refuse`、悬空引用检查）。
- 差分是不是自证：观察端交付包是否真的只含行为数据；TS 端的 `growth.ts` 是否照规格写（而不是照结果凑）；唯一差异（`null` 经验）的处理。
- `check-boundaries` 的正则是否会漏（注释/字符串剥离的边界）。
- 存档：迁移是否可能丢字段、`appliedBattles` 的结论是否站得住（不压缩，理由是否充分）。
- CI 只覆盖无宿主层与插件类型检查；窗口测试只在本机，证据的构建身份是否与候选一致。

## 候选

- 分支 `step3/foundation`，标签 `step3-candidate`（精确 SHA 以 `git rev-parse step3-candidate^{commit}` 为准；CI 对该 SHA 的结果用 `scripts/ci-status.sh step3/foundation` 读取，读不到不算通过）。
- 证据（`experiments/step2/evidence/`）由提交 `2f5b808` 产生（代码与 `dabe03a` 相同，只多一个文档提交）；`MANIFEST.md` 写明每个文件对应哪个提交和构建。
- 工作区的执行方案：`.handoff/step3-plan.md`；观察端私有目录 `observation-growth/workspace/`（**复核者不应把它交给实现端，也不必读**；检查交付包即可）。
