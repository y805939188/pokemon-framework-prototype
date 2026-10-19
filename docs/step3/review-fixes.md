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

## F3：会话操作互斥与故障恢复

- 根因：两个 async 公共调用可在第一个 await 处交错；后者替换引擎选择，却留下前者的预留。注册/AI/结算异常同样可能留下半个操作。
- 所有会话写操作共享互斥区。并发行动返回已有协议原因 `choice-rejected`；并发 cancel/学招决策拒绝 promise。已完成的阶段不再接受行动，重复 `commitTurn` 不替下一回合预选 AI。替换暂存选择前先撤销旧选择、退还旧预留。
- 操作入口保存内存检查点，异常时恢复会话、引擎选择、HP/PP、PRNG、待发消息与成长队列；随后释放互斥，可重试。AI 拒绝/无选择显式失败，替补也等待其 promise 并检查结果，避免忽略拒绝/异常。诊断日志和调用者自定义 AI 的外部副作用不回滚。
- 仍是协议 v1，没有请求 ID：并发拒绝不等于跨网络重发去重；一次成功结束后，在新请求上的顺序调用仍代表新的行动。内存恢复不是战中存档或 MZ 文件原子性承诺。
- 先红后绿：初始 9 个故障/并发回归全部失败；修复后这 9 个及追加的替补/部分成长恢复用例共 **10 项通过**。命令：`node --test experiments/step3/test-session-operations.cjs`。包括成功、注册拒绝、注册前/后/执行后异常、AI 抛错/拒绝、替补失败、取消两次、暂存重选、并发/重复提交及双打。

## 自测、复审与回退交接

按 **F1 → F2 → F3** 复审，三个运行时修复不依赖另一项的规则变化；共享测试入口和本交接文档按提交顺序累加，建议按序 cherry-pick，按倒序 revert。

1. F1：`92276c7156eadce529fd5d46eaf6be41d993f059`。
2. F2：`cb3c04572a84a58497d4fbbe57dacc50a44ccaee`。
3. F3：添加本节的提交（`git log -1 --format=%H -- src/framework/flow/session.ts` 可取完整 SHA；最终交付消息及共享交接记录也会给出）。

验证均在隔离 worktree，Node **22.21.1** / pnpm **10.20.0**，无新增依赖：

```bash
export PATH=/Users/dingshinn/.nvm/versions/node/v22.21.1/bin:$PATH
scripts/test-quick.sh
pnpm --dir src build
```

- 最终快速自检：插件/框架类型、导入边界、**19 套件共 136 个测试通过**（原 117 + 新 19）；`final-quick.txt`。
- 完整引擎/内容/插件构建通过；`final-build.txt`。最终 quick 在完整构建结束后再次顺序运行，避免生成物并行写入影响最终证据。
- 红/绿 TAP 与构建输出在 `experiments/step3/evidence/review-fixes/`。`f3-before.tap` 为保留全部测试状态的精简摘要；8719 行快照差异的完整原始日志保留在工作区 `.worktrees/step3-review-three-defects-evidence/f3-before.full.tap`，摘要中记录其 SHA256，避免将重复快照大日志入库。矩阵指纹和冻结协议 JSON 均未更新。Showdown 仅复用固定提交的隔离产物，重建本分支引擎包后暂存其 custom-formats；没有写上游缓存或安装目录。
- **未验证**：新代码的真实 MZ/NW.js 窗口、真实 package-mac、性能和内存；CI 未运行（未推送）。F1 菜单用 VM 检查实际插件源码，构建通过不当作窗口通过。F3 每个操作增加内存检查点，宿主动作延迟应由 Claude 复审时留意；无独立 PASS。
- 原工作树仍在 `step3/foundation` 的基线，`main` / `step3-candidate` 不变。用户若不接受修复，继续使用原候选即可，不必回写或重置它。若已将修复带入其他分支，用 `git revert <F3完整SHA> <F2完整SHA> <F1完整SHA>` 产生倒序撤销提交，保留历史；不要对 Claude 工作树运行 reset。
- 本地用于基线红测的 `.worktrees/step3-review-baseline` 是 `git archive` 导出的无 Git 目录，仅 F1 测试源码复制进去；不是额外分支或已验收产物。没有启动 NW.js/游戏进程。

## 独立复审与宿主验证（第三步修复，2026-10-19）

- 复审（非修复作者的独立会话）：F1/F2/F3 **接受，无阻塞项**。Node 级：19 套件、18 个变异（13 被杀，5 存活：3 个等价、2 个对应下面的测试缺口）、24 场景故障注入“失败后重试 = 干净运行”逐位一致、检查点约 0.25 ms/次。
- 宿主验证（NW.js 0.117.0 / Chromium 154 / Node 26.7.0，构建自已提交的 `7abce72`，ad hoc 签名）：开发树流程 T1–T10 + V1 通过；`run-package-tests-mac.sh` 通过（包内 T1–T10、V1、S1–S10 指纹与 Node 相同、SL1、签名封印有效）；引擎包哈希 `94afa975…`（包内 = 开发树 = Node 加载）。原始 JSON 在 `experiments/step3/evidence/review-fixes/host/`（截图和性能原始数据留在仓库外）。
- 性能：到菜单 534 ms、后续 133 ms、动作延迟 3–5 ms、帧 p50 16.7 ms、24 场后 RSS 1235 MB，与候选同量级；冷启动到插件/地图比候选记录慢约 190–200 ms，**没有同条件基线数据，原因未判定**；基线对照脚本两次因窗口未在前台而失败，未完成。**不能得出“无性能退化”。**
- 已知遗留（低，不阻塞）：(1) 检查点恢复本身失败时会吞掉原错误并释放锁、留下悬空预留（`session.ts` `_exclusive`）——应把会话置为不可用；(2) 回归缺口：`isSelectableMove` 的 `disabled` 分支、失败重试后 `seq` 连续性没有用例；(3) `src/framework/tools/harness.ts` 的演示 AI 仍是旧的 `pp > 0` 判断；(4) F1/F2/F3 没有专门的宿主场景（由 Node 测试覆盖）；(5) 同条件基线性能与 Transform/Mimic/Sketch 等改写槽位招式的 PP 同步不在范围。

### 更新（第二步收尾，待独立复核）

上面“已知遗留”的 (1)(2)(3) 已在分支 `fix/step2-closeout-recovery` 处理：回滚失败封闭会话、`disabled`/`seq` 回归、`harness.ts` 复用共享谓词；F2 的支持范围用测试固定。这些是作者自测，**待独立复核**，见 `docs/step2/closeout-addendum.md`。(4)(5) 仍按原样保留。
