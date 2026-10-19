# 三项桥接缺陷修复（待 Claude 独立复审）

基线：`step3-candidate` = `89988b21edf75c9a9ab1056a428ecdda40e02a3e`。
本地分支 `fix/step3-review-three-defects`，独立 worktree 位于工作区 `.worktrees/step3-review-three-defects`。
只做用户要求的三项修复；不改原工作树、`main`、候选标签，不推送、不合并、不宣称独立验收。

## F1：特殊招式请求

- 根因：UI/默认 AI 将 `pp > 0` 当成通用资格；固定 Showdown 的锁招、Recharge 和 Struggle 请求省略 PP。
- 修复：共享请求语义 `battle/move-requests.ts`；PP 缺省的、未禁用的引擎请求可选，普通 0 PP/禁用仍不可选。菜单不再显示 `undefined` PP；默认 AI 不产生 `move 0` 或读负下标。
- 回归：`node --test experiments/step3/test-move-requests.cjs`，5 通过。含普通/非法 index、Struggle 菜单与实际执行、Fly 第二段、真实 Recharge、双打 AI 的 PP 缺省槽。菜单测试在无 DOM 的 VM 中调用实际 TS 插件源码，不等于真实 MZ 窗口验证。
- 先红后绿：同一份最终测试在固定基线的独立归档中 1 通过/4 失败，修复后 5 通过。测试开发中修正过 Hyper Beam 的夹具（旧 helper 不提供其 PP）及双打等级（避免暴击先 KO 导致合法强制换人）；保存的 before/after 均使用修正后的相同夹具。
- 插件/框架类型检查、导入边界通过；矩阵与协议契约结果见 `experiments/step3/evidence/review-fixes/`。

## F2：PP 与最大 PP 同步

- 根因：Showdown 初始化默认三次 PP 提升，旧导入只设当前 PP；持久上限仍是原值。Leppa 回复可导致引擎 8 PP、持久上限 5；学招替换/追加还未更新引擎 PP-Up 计数。
- 修复：导入先核对全部招式当前 PP、上限与固定模拟器的 0–3 次 PP 提升映射，再同时设置 `baseMoveSlots`、`moveSlots`、`ppUps`。不能表示的上限或越界 PP 给出诊断，失败前不修改 HP/PP。低层 gateway 调用未提供 maxpp 时保留该引擎槽的既有上限。学招的新槽计数设为 0。不是在写回时截掉超额 PP。
- `maxpp` 沿用持久记录的字段，没有新增存档字段或改变冻结协议。此修复防止新坏状态；不猜测修复此前已损坏的存档。
- 先红后绿：`node --test experiments/step3/test-pp-sync.cjs`：修复前 0 通过/4 失败，修复后 4 通过。覆盖四档提升、导入/消耗/换人、Leppa 回复后结果提交/文件重载/校验与幂等、学招替换清计数、无效导入不产生部分写入。
- 相关成长、写回、协议冻结、矩阵、F1 回归共 32 项通过；框架类型/边界检查通过。**矩阵基线和冻结 JSON 未改**，测试记录在 `experiments/step3/evidence/review-fixes/f2-*`。

F3（会话重入）将在独立提交中处理。
