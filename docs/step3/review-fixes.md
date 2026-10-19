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

F2（PP/maxpp）及 F3（会话重入）将各自单独提交；完成状态以本文件后续段落为准。
