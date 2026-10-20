# 第四步前短架构批次：收尾记录

**状态：已合入 `main`（2026-10-20）。** 这是第四步开工前的独立批次，不并入第三步收口（`step3-closed` 不变），也不是第四步：没有新玩法。下一步由用户决定。

## 合并了什么

| 部分 | 提交 | 说明 |
|---|---|---|
| 架构批次 | `e80d860`…`cd0fc0b`（7 个代码提交）+ `4f4e51c`、`47523be`（文档/证据） | 核心独立入口与可移植 SHA-256、应用层与组合根、`BattleDriver` 缝与脚本化驱动、插件接入应用层、检查器收紧。见 [architecture-batch.md](architecture-batch.md)。候选标签 `step3-batch-candidate` = `47523bedba8010507832fc7dbbd7b10c5c49036c` |
| 复核修复 | `440902e6baa5a79b19bd9b3da4bfce60a5a78180`、`2bdbc8d46c599286d90278838a1b24dee4a31a97`、`5d8f7e717f830b96fa1cb388232b53c2b12af24e`（被测代码）、`6d0842f6715b2bc5218d69a934b6f881aa6a8af4`（文档/证据） | 初始化失败归零并释放等待；无效 outcome 提交前拒绝；检查器补强；文档更正。见 [batch-review-fixes.md](batch-review-fixes.md) |
| 合并 | **`56561509b4b0e85d04c0794c33b878a98d83fd63`**（`--no-ff`，父 `4ce31e1` 与 `6d0842f`） | [PR #1](https://github.com/y805939188/pokemon-framework-prototype/pull/1)。合并树 `ab559069…` 与 `6d0842f` 的树、PR 测试合并引用 `c1a420b` 的树完全相同 |

## 验收依据

- 原批次复核（Claude Opus 5.5）：有条件通过，六项发现。
- 修复独立复审（Codex，非修复作者）：PASS。
- 修复限定复核（Claude Opus 5.5，原发现提出者）：通过，六项关闭，无 P0–P3。复核内容：quick 26 套件 212/212、完整构建通过、15/15 变异被杀；重建 engine `ed52a870fadf3cfec95072c7c9ce4d208dea8ed99443013a125fdc60cdc809a1`、`PS_BattleFlow.js` `5e700e8a…`、`PS_BattleFlowTest.js` `825d611a…` 与宿主证据一致。
- 宿主证据（已有实跑，绑定干净的 `5d8f7e7`，在 `experiments/step3/evidence/batch-review-fixes/`）：开发树 T1–T14 + V1；包内 T1–T14 + V1 + S1–S10；矩阵包内/Node/冻结基线 10/10；签名封印有效。复核没有重开窗口。
- CI：
  - PR：[Run 20](https://github.com/y805939188/pokemon-framework-prototype/actions/runs/39441206530)，`pull_request` 事件，`headless` 与 `plugins` 都成功。被测 SHA 是 GitHub 的测试合并引用 `c1a420ba3b5ea4f45d08acc4cce3c72b9e710f45`（父 `4ce31e1` 与 PR head `6d0842f`，树与 head 相同；checkout 日志确认）。
  - 合并后的 `main`（`5656150`）：[Run 21](https://github.com/y805939188/pokemon-framework-prototype/actions/runs/39441616235)，`push` 事件，`headless` 与 `plugins` 都成功。本文件所在的纯文档提交是之后的最终 `main`，它的 CI 记录在共享交接 `.handoff/STATUS.md`。
  - CI 注释（不影响结论）：GitHub 提示 `actions/checkout`、`actions/setup-node` 的 Node.js 20 已弃用（被强制跑在 Node.js 24），以及 `ubuntu-latest` 正在迁移到 Ubuntu 26。

复核报告不在 git 里，放在工作区：`.independent-reviews/step3-batch-opus-20261019/`、`.independent-reviews/step3-batch-fixes-20261020/`、`.independent-reviews/step3-batch-fixes-opus-20261020/`。宿主原始输出在 `.verify/step3-batch-fixes-20261020/`（截图/存档等，约 64 MB）。

## 没有验证的

- SL1（默认保存位置）、替换包、LaunchServices 启动、性能与内存，都没有在新代码上重跑。**不宣称完整包内套件已通过**；原批次的性能对照只是小样本的旧基线，不是无退化证明。
- 窗口测试不在 CI 里。Windows/Intel、公证、双打与长尾按用户决定后置。

## 后续待办（P4，不阻塞）

| 项 | 复现来源 | 影响 | 建议时点 |
|---|---|---|---|
| 非核心纯层（app/content/i18n/flow content-runtime）的宿主名仍是黑名单：`performance`、`crypto`、`localStorage`、`navigator`、`self`、`requestAnimationFrame` 等会被检查器放行 | `.independent-reviews/step3-batch-fixes-opus-20261020/` 探针 N5–N9（`probes/probe-boundaries.sh`） | 只影响机器约束的覆盖面，现有代码没有使用。核心有 `types: []` 编译兜底，不受影响 | 第四步动 app 层时：把这些层也用 `types: []` 编译，比继续加黑名单更彻底 |
| 检查器的保守误报：同名枚举成员（`enum E { fetch }`）、导出别名（`export { f as fetch }`）、同名局部绑定会被拒 | 同上，探针 N11–N13 | 只影响写法，现有代码没有碰到；不会放过违规 | 与上一项一起处理，或碰到时再改 |
| 缺 `winner` 的结果已被拒绝（符合类型与冻结协议），但没有固化回归用例；放行 `undefined` 的变异会存活 | 同上，`probes/outcome-contract.cjs` | 测试缺口，不是行为缺陷 | 第四步改结果/投影契约时，在 `test-application.cjs` 的无效 outcome 列表里加 `{ kind: 'caught' }` |
| CI action 的 Node.js 20 弃用与 runner 镜像迁移提示 | PR Run 20 的注释 | 现在仍成功；将来可能被平台强制变化 | 下次动 CI 时升级到支持 Node.js 24 的固定版本 |

原批次已登记的后置项不变：`flow` 默认仍 import Showdown 工厂；flow/插件里其余的 `any`；保存阶段守卫、奖励凭证、背包容量、治疗等第四步用例。见 [architecture-batch.md](architecture-batch.md) 的“剩余与后置”和 [README.md](README.md) 的边界债务表。

## 回退

用正常 revert，不 reset、不改写历史：整体回退用 `git revert -m 1 56561509b4b0e85d04c0794c33b878a98d83fd63`；只撤修复时，在新分支上逆序 revert `6d0842f` → `5d8f7e7` → `2bdbc8d` → `440902e`。旧标签（`step2-closed`、`step3-closed`、`step3-batch-candidate` 等）都没有移动。
