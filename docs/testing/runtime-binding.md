# 验证执行的构建与受测内容

常规套件按显式清单选取，不以动态发现替代。每套都应绑定实际执行的源码、运行时、插件、编译内容及必要夹具；不拿另一检出或过期待测输出抵作当前候选。

先确认固定依赖和源码身份，再构建引擎、插件、作者输入与必要扩展；记录构建前、运行前和运行后的身份及退出状态。并行任务使用各自构建目录；构建或前置检查失败不使用已有产物。套件数与用例数分别统计，漏项、重复、失败、取消、跳过均需可辨；[冻结回放](reference-replay.md)与人工宿主测试另列。受控宿主不证明物理输入、实际显示和系统权限。见[维护者指南](../PROJECT-GUIDE.md)。

## 可选诊断

以下命令均从已构建引擎并暂存固定 Showdown 的工程根目录运行，不在常规用例计数内。

| 用途 | 命令 |
|---|---|
| 治疗动作预留、撤销和恢复后结果一致 | `node tests/opt-in/battle/healing-checkpoint.cjs` |
| 升级后可见能力、新请求与后续回合 | `node tests/opt-in/battle/levelup-stat-bridge.cjs` |
| 比较回合中和回合后升级对较慢行动的影响（引擎层） | `node tests/opt-in/battle/midturn-growth.cjs` |
| 连续战斗的 Node 堆和 RSS 抽样；没有自动通过阈值 | `node --expose-gc tests/opt-in/performance/battle-memory.cjs 100` |
| 冲浪跨图是否同时计入该步的冲浪距离 | `node --test tests/opt-in/world/surf-connection-distance.cjs` |

跨图诊断还需要本检出正式常规运行生成并保留的绑定文件（由 `PF_HEADLESS_REGRESSION_BINDING` 明确指向）及其配套冷构建输出；没有这些输入就停止，不退回替身。它保留比常规抵达用例更严格的距离断言，不可用单独的移动分类测试代替。引擎层对照不代表游戏支持完整双打；手动或可选检查未运行时须明确标注。
