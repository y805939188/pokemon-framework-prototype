# 第二步补充验收记录（技术原型范围的最后修复）

**状态：已收口（2026-10-19，用户决定）。** 本轮新增改动（§3）由作者（Claude Code）自己写、自己测，随后按用户在聊天中的说明，由**另一个 Codex agent** 做了只针对新增差异的独立复核，用户据此决定收口。**作者没有看到该复核报告，报告位置未记录**；本记录只引用用户的这一说明，不替该报告转述结论，也不含其细节。收口只对“第二步技术原型范围及其后续补充修复”成立，**不代表整个第三步验收通过**，更不代表框架功能齐全。

## 1. 版本与历史（不改旧证据）

| 项 | SHA | 说明 |
|---|---|---|
| `step2-closed`（保留不动） | `76cee14ab55820fd2117db2b3fb26b72f41c07cb` | 第二步原始收口，不含后续修复 |
| `main` | `a77b6af498e25f62b550f4cf45baae0e76a13cb3` | 未动 |
| 第三步原候选 `step3-candidate` | `89988b21edf75c9a9ab1056a428ecdda40e02a3e` | 继承了第二步的三项桥接缺陷 |
| F1 / F2 / F3（Codex 的修复，已独立复审并宿主验证） | `92276c7` / `cb3c045` / `7abce72` | 见 `docs/step3/review-fixes.md` |
| 并入后的 `step3/foundation` | `a761c0ae9eae9a187d9124e9332411e701117590` | CI Run 14 成功 |
| 本轮新增（分支 `fix/step2-closeout-recovery`，已并入 `step3/foundation`） | 见 §3；标签 `step2-closeout`（新增，旧标签不动） | 已收口（用户决定，Codex 独立复核，报告未见） |

## 2. 问题处置一览

| 问题 | 处置 | 证据 |
|---|---|---|
| F1 特殊招式请求被菜单/AI 当成无可用招式 | 已修（`92276c7`），独立复审接受 | `test-move-requests.cjs`；真实 NW.js T1 间接覆盖 |
| F2 持久 PP 上限未传入引擎 | 已修（`cb3c045`），独立复审接受；**支持范围见 §4** | `test-pp-sync.cjs`；变异实验 |
| F3 并发道具留下未结算预留 | 已修（`7abce72`），独立复审接受 | `test-session-operations.cjs`；24 场景故障注入 |
| **F3 边界：回滚本身失败时放行损坏会话（原 P2）** | **本轮已修**：会话置为终止状态，保留双错误 | `test-session-failure.cjs`（6）、真实窗口 T11 |
| `isSelectableMove` 的 `disabled` 分支无回归 | 本轮补 | `test-move-requests.cjs` 新增 3 项，含真实 Choice 锁招 |
| 失败重试后 `seq`/消息序列无回归 | 本轮补；此前存活的变异体现在被杀 | `test-session-operations.cjs` 新增 1 项 |
| `tools/harness.ts` 演示 AI 仍是旧 `pp>0` | 本轮修：复用运行时谓词；无可选招式时显式抛错 | `test-move-requests.cjs`；冻结金样/矩阵未变 |

## 3. 本轮新增改动（作者自测；之后经 Codex 独立复核，见顶部状态）

提交（相对 `a761c0a`，逻辑上可单独回退）：
1. `4c14deb` 回滚失败即封闭会话：`SessionBrokenError`（保留 `original`、`restoreError`）；`_exclusive` 在回滚失败时置 `_broken` 并记录一次 `session.broken` 日志；`_exclusive`/`_action`/`take()`/`result()` 之后一律抛同一个错误。回滚成功时行为不变（仍可重试，`broken` 为 `null`）。不涉及协议 v1（不是新的协议原因码，是异常）。
2. `82615db` `disabled` 分支与 `seq` 连续性回归；`harness.ts` 的 `decide()` 复用 `isSelectableMove`。
3. `4c4b62b` 用测试固定 F2 的支持范围（§4）。
4. `8f74769` 真实窗口场景 T11（失败 + 回滚失败 → 终止、双错误、零提交）。
5. `d48e43d` 归档 `docs/step3/second-review-report.md`（纯文档）。

复核范围为 `git diff a761c0a..d48e43d -- src experiments scripts`（9 个文件中的运行时代码只有 `session.ts`、`harness.ts`，其余为测试与场景）。重点：
- 回滚失败后是否所有写入口都被拒绝（含 `cancel`、`decideLearn`、`commitTurn`、`chooseDoubles`、`result()`、`take()`），没有新的扣减/退款；宿主 `finish → result()` 因此无法提交不可信结果；
- 错误是否保留两条（`message`、`original`、`restoreError`、日志），没有让回滚错误覆盖原错误；
- 没有靠永久挂锁（`_operation` 仍在 `finally` 释放；封闭靠 `_broken` 状态）；
- 已有恢复成功后重试的用例仍通过；
- 冻结协议与矩阵基线未改（`protocol-v1.frozen.json`、`matrix-fingerprints.json` 不在 diff 里）。

## 4. F2 的支持范围（如实，不等于完整 Essentials PP 语义）

规格（WP20 §5.4、WP28）：总 PP = 基础 PP + ⌊基础 PP × 提升计数 / 5⌋；PPUP/PPMAX 在总 PP ≤1 或计数已 3 时失败；**计数的直接赋值不钳位**（可为任意整数）。

当前桥接：
- **接受：** 持久 `maxpp` 恰等于某一招式在 0–3 次提升下的总 PP。对固定 Showdown 数据我核对过：除 3 个不可提升的招式外，所有招式基础 PP 都是 5 的倍数，Showdown 的 `pp×(5+ups)/5` 与规格的取整公式在 0–3 档完全一致（无不一致项）。
- **不可提升：** 固定数据里 `noPPBoosts` 的只有 `sketch`(1)、`revivalblessing`(1)、`struggle`(1)，与规格“总 PP ≤1 不可提升”一致，只接受 `maxpp = 基础 PP`。
- **拒绝（建战斗前报诊断，不写任何状态）：** 其它任何 `maxpp`——对应规格里“直接赋值”才能形成的 ≥4 或负的提升计数，以及 **Trump Card 的提升**（固定模拟器把它按 0 次提升处理，规格公式则允许；固定 Gen 8 数据里它是 Past 招式）。已用 `test-pp-sync.cjs` 固定这些行为（含 `trumpcard/maxpp=6` 被拒）。
- **未覆盖，后续承接：** 完整的直接赋值语义（含负计数下“写入调用本身失败”的边界）、总 PP ≤0 视为无限、Trump Card 的提升、Transform/Mimic/Sketch 等改写槽位的招式、已损坏旧存档的修复。规格与首版范围里没有查到对 Trump Card 的专门承诺；若产品需要，作为第四步/长尾项处理，**不改 clean-room 规格**。

## 5. 验证（精确提交，如实区分新旧证据）

| 范围 | 提交 | 结果 |
|---|---|---|
| `scripts/test-quick.sh`（类型检查、导入边界、20 套件共 147 项） | `d48e43d`（含 8f74769 的 T11 场景源码） | 通过；`experiments/step3/evidence/closeout/test-quick.log` |
| 新测试的先红后绿 | A：`test-session-failure.cjs` 在修复前 5 败 1 过（那 1 项过得过松，已收紧）；B：harness 用例修复前失败；seq 用例对“不恢复 seq/queue”的变异失败、对真实代码通过 | 作者本地运行；无保存的 TAP |
| 完整构建 | `d48e43d` 的验证拷贝 | `run-package-tests-mac.sh` 内部构建通过 |
| 真实 NW.js 开发树流程 | `d48e43d`（验证拷贝，无工作树改动） | 通过：T1–T11（含 T11）、V1 |
| 打包套件 | `d48e43d`，ad hoc 签名，`workingTreeChanges: 0` | 通过：包内 T1–T11、V1、S1–S10、SL1；签名封印有效；S1–S10 指纹与 Node 22.21.1 逐个相同；引擎包哈希 `22842be429eee721fcbb649b9c732b82043fa6a022b469907fef30b2faf58218`（包内 = Node 加载，146,851 字节） |
| CI（GitHub Actions） | 分支头 `2a68fbb`（代码最后一次改动是 `8f74769`，之后只增文档与证据） | Run 15 成功（`scripts/ci-status.sh step3/step2-closeout`）；并入 `step3/foundation` 后的最终提交的 CI 见 `.handoff/STATUS.md` |

**旧证据的资格：** `experiments/step3/evidence/review-fixes/host/` 属于 `7abce72`（引擎包哈希 `94afa975…`），只证明 F1–F3 本身；本轮代码（`session.ts`、`harness.ts`）不同，所以包内与流程结果在 `d48e43d` 上**重新跑过**，不沿用旧结果。冻结协议 JSON 与矩阵指纹基线没有改动，S1–S10 指纹与旧基线逐项相同。

## 6. 没有验证 / 不升级成本次门槛

同条件基线性能（上轮对照脚本因窗口未在前台失败，且冷启动比候选记录慢约 190–200 ms 原因未判定）；本轮也**没有测性能**，不能声称无性能退化。另有：逐文件包 manifest、同 DPI 内存对照、Intel/Windows、`--harden` 变体、公证、新场景之外的 F1–F3 专门宿主场景（除 T11 外）、跨网络重发去重（协议 v1 无请求 ID）。日志与调用者自定义 AI 的外部副作用不回滚；内存检查点不是战中存档。

## 7. 回退与后续

- 逐项回退（不要 reset）：`git revert 8f74769 4c4b62b 82615db 4c14deb`（按倒序；文档提交可不回退）。F1–F3 的回退见 `docs/step3/review-fixes.md`。
- 收口方式：`step3/foundation` 以 fast-forward 包含本轮提交，并打新标签 `step2-closeout`（旧 `step2-closed` 不动）。**不合并 `main`、不打 `step3-closed`**：F1–F3 与本轮修复建在第三步的 TypeScript 框架之上，无法脱离 `step3/foundation` 单独进入 `main`；第三步整体仍有自己的验收门槛。
- 待办分配：F2 的完整直接赋值/Trump Card、包 manifest、基线性能 → 第三步未决项清单（`docs/step3/README.md`）与第四步；其余沿用既有分流。
