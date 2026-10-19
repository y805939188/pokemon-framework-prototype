# 第三步三项缺陷修复：复审与宿主验证报告（供二次 review）

日期：2026-10-19 · 仓库：`y805939188/pokemon-framework-prototype`（公开）· 分支 `step3/foundation`

本报告自成一体，可不读聊天记录。它回答：你（对第二步做过 review 并提出三项缺陷的一方）之前报告的 F1/F2/F3，现在是否被正确修复；修复由谁做、谁复审、做过哪些验证、哪些没验证。

**请注意三点资格说明：**
1. 三个修复的作者是 Codex（ChatGPT 侧），不是我。
2. 我（Claude Code，Sonnet 5.5）是**第三步候选的原作者**，对这三项修复做了独立复审与宿主验证；我不是与整个第三步无关的第三方。
3. 本报告只对这三项修复及其受影响范围下结论，**不是第三步整体的验收**。第三步整体的独立复核由用户另行安排，尚未有结果；`main` 与标签 `step3-closed` 都没有动。

## 1. 精确版本

| 项 | SHA |
|---|---|
| 第三步候选（标签 `step3-candidate`） | `89988b21edf75c9a9ab1056a428ecdda40e02a3e` |
| F1 特殊招式请求 | `92276c7156eadce529fd5d46eaf6be41d993f059` |
| F2 PP/maxpp 同步 | `cb3c04572a84a58497d4fbbe57dacc50a44ccaee` |
| F3 会话操作互斥与恢复 | `7abce72fde75e679cda8513d0e623f34816647bc` |
| 当前 `step3/foundation` 头（F1–F3 + 复审/宿主证据文档） | `a761c0ae9eae9a187d9124e9332411e701117590` |
| `main` | `a77b6af498e25f62b550f4cf45baae0e76a13cb3`（未动） |

`step3/foundation` 是把修复分支 `fix/step3-review-three-defects` 用 `--ff-only` 并入的，历史未改写。GitHub Actions：对 `a761c0a` 的 Run 14 为 `completed successfully`（读公开 Actions 页面：`scripts/ci-status.sh step3/foundation`，无凭据）。CI 只跑无窗口的两层（Node 套件 + 插件类型检查/构建），**不含 NW.js 窗口测试**。

固定依赖：Showdown `7244fe8e28fa8bc4d0809ae30d183c608b62bb2b`；RPGReactor 0.98.8 @ `2dc2e10e`；NW.js 0.117.0 arm64（Chromium 154，内置 Node 26.7.0）；开发 Node 22.21.1、pnpm 10.20.0、TypeScript 7.0.2。

## 2. 原缺陷与修复（逐项）

### F1 · 合法特殊招式请求被菜单/默认 AI 当成“无可用招式”
- **原因：** 菜单和默认 AI 把 `pp > 0` 当通用资格；固定 Showdown 在 Struggle、锁招（如 Fly 第二段）、Recharge 的请求里省略 `pp/maxpp`。
- **修复：** 新增共享谓词 `isSelectableMove`（`src/framework/battle/move-requests.ts`）：`!disabled && (pp 缺省 || pp > 0)`；菜单、单打 AI、双打 AI 共用；无可选招式时 AI 显式抛错而不是生成 `move 0`；缺省 PP 时菜单不再显示 `undefined`。
- **边界：** 非法选择仍被引擎拒绝；没有静默自动选招。

### F2 · 持久 PP 上限没进引擎，合法回复写回 `{pp:8, maxpp:5}`
- **原因：** Showdown 默认按三次 PP-Up 计算上限；旧导入只设当前 PP；Leppa 回复能把引擎 PP 推到 8，而持久上限是 5。
- **修复：** `BattleGateway.seedState` 先校验所有成员/招式（当前 PP 为整数且 ≤ 上限；上限必须对应固定模拟器的 0–3 次 PP-Up），**全部通过后才写**；然后同时设置 `baseMoveSlots`、`moveSlots` 与 `ppUps`；学招替换/追加把新槽的 PP-Up 计数设为 0。这是在导入边界解决，不是写回时截断，也没有放松存档校验（`save-schema.ts` 未改）。
- **副作用（更严格）：** 敌方/我方成员记录缺 `pp` 时，旧代码会静默写入 `NaN`，现在在建战斗时抛错。
- **边界：** 不修复此前已损坏的旧存档；Transform/Mimic/Sketch 等改写槽位的招式未覆盖。

### F3 · 并发道具调用留下未结算预留
- **原因：** 两个 async 公共调用可在第一个 `await` 处交错；后者替换引擎选择，却留下前者的账目预留。
- **修复：** 所有会话写操作共享互斥区（`_exclusive`/`_action`，检查与置位在首次让出之前同步完成）。并发行动返回已有协议原因 `choice-rejected`；并发 `cancel`/`decideLearn` 拒绝 promise。操作入口保存内存检查点（引擎 JSON、网关队列/seq/closed、会话账目/背包/队伍/待发消息/成长队列/暂存标志），异常时恢复后释放互斥，可重试。AI 拒绝或抛错显式失败；替补同理。
- **边界：** 仍是协议 v1，没有请求 ID；并发拒绝不等于跨网络重发去重；内存检查点不是战中存档，也不承诺 MZ 存档文件原子性；日志和调用者自定义 AI 的外部副作用不回滚。

三个修复在运行时代码上相互独立；相对 `89988b2` 共 22 个文件（运行时代码只有 5 处）。**冻结协议 JSON 与矩阵指纹基线未改。**

## 3. 独立复审（Node 层，本轮实跑）

在修复工作树（只读）及其无 `.git` 的拷贝里，用 Node 22.21.1：

| 检查 | 结果 |
|---|---|
| `scripts/test-quick.sh`（类型检查 + 导入边界 + 19 个套件） | 通过；新增测试 F1 5 项、F2 4 项、F3 10 项 |
| `pnpm --dir src build`（完整构建，在拷贝里） | 通过 |
| 变异实验 18 个（只在拷贝里，每次还原） | 被杀 13；存活 5：3 个是等价变异（F2：两处槽位通常是同一对象），2 个是测试缺口 |
| 随机故障注入：24 个战斗场景（单打 12/双打 12），在“登记前/登记后/引擎执行后”三个位置抛错，失败后重试，与干净运行对比 | 每条返回消息（含 `seq`）、`BattleResult`、背包、账目逐位相同，重复 9 轮；唯一偶发差异是 Showdown 日志里的墙钟 `|t:|` 时间戳跨秒，不是缺陷 |
| 其他探针 | 暂存道具后失败的恢复、野外 `noBall/noRun` 标志恢复、`decideLearn` 失败恢复、Choice 锁招的真实 `disabled` 请求、F3 检查点开销 |
| F3 检查点开销（Node，基线 vs 修复） | 单步行动 p50 约 0.45 → 0.78 ms；检查点约 0.25 ms（引擎快照约 27 KB）；恢复约 0.5 ms，仅失败时发生 |

要点结论：
- F1：真实引擎请求（Struggle、Fly 第二段、Recharge、Choice 锁招）下谓词正确；去掉旧判断的变异被杀。
- F2：对照固定 Showdown 源码（`calculatePP`、`ppUps`）映射一致；“只钳制当前 PP、不设 maxpp/ppUps”的变异被杀；四档 PP-Up、回复、换人、学招、存档重载均有断言。
- F3：互斥在首次让出前同步完成（把检查挪到 `await` 之后的变异被杀）；暂存路径恢复后，引擎待处理载荷、预留与 `_staged` 一致。

## 4. 宿主验证（真实 NW.js，由独立会话执行）

被测为已提交代码（`7abce72`，ad hoc 签名，`workingTreeChanges: 0`），NW.js 0.117.0 / Chromium 154 / Node 26.7.0：

| 项 | 结果 |
|---|---|
| 开发树 NW.js 游戏内流程 | 通过：T1–T10、V1（重启读档） |
| 打包套件 `run-package-tests-mac.sh` | 通过：包内 T1–T10、V1、S1–S10、SL1（存档位置）全部 pass；签名封印有效；S1–S10 指纹与 Node 22.21.1 逐个相同 |
| 引擎包哈希 | 包内 `engineBundleSha256` = 开发树 `js/engine/build/engine.cjs` = Node 加载 = `94afa975d088564e5d222772609998657720d50d3bc790194380ae027bcc90d6`（145,537 字节），脚本核对了“同一个包” |
| 包内性能（修复分支，3 次冷启动，0 错误） | 到菜单 534 ms；后续菜单 133 ms；动作延迟 p50 move/run/item/ball 4.8/3.2/5.1/3.8 ms；帧 p50 16.7 ms；24 场后 RSS 1235 MB |

我独立抽查了这些结果 JSON：开发树与包内流程报告各 10 项 + 读档 1 项，非 pass 为 0；存档位置 1 项 pass。

**如实说明——早先两次宿主尝试为什么失败：** 修复工作树及其拷贝缺少被 git 忽略的 MZ 运行时文件（`index.html`、`audio/css/effects/fonts/icon/img/movies`、`js/libs`、`js/reactor_*.js`）。`package.json` 的 `main` 指向 `index.html`，NW.js 打开了 `ERR_FILE_NOT_FOUND` 错误页，插件从未加载，脚本等到超时。这是测试环境问题，不是修复问题；补齐这些文件后同一路径下立刻通过。用拷贝做宿主测试还需要 `.git`（`package-mac.sh` 要 git 身份）。

## 5. 没有验证的 / 不能下的结论

- **不能说“无性能退化”。** 同条件基线性能没测成（基线对照脚本两次因游戏窗口不在前台而失败，推断，未用调试端口证实）。与候选 MANIFEST 记录对照：到菜单、帧时间、动作延迟、内存同量级；**冷启动到插件/地图慢约 190–200 ms，原因未判定**（修复没改启动路径，但没有同条件数据区分）。上一轮候选里“引擎动作延迟 +1.5–2 ms 原因未完全查明”的遗留仍在，F3 检查点（Node 约 +0.25 ms）淹没在其中。
- F1/F2/F3 **没有专门的宿主场景**；真实窗口里 F1 菜单只由 T1（真实按键走完战斗菜单）间接覆盖，其余由 Node 测试覆盖。
- 没有 Intel/Windows、没有 `--harden` 硬化变体、没有公证、没有内存同 DPI 严格对照。
- Node 级基准不等于 NW.js 里的实际延迟。

## 6. 复审发现（均为低严重度，未修，已记录）

1. **检查点恢复本身失败时会吞掉原错误并释放锁，留下悬空预留**（`src/framework/flow/session.ts` `_exclusive`；强制 `restore` 抛错可复现：`lock false, bag 2, ledger ["reserved"]`，引擎里仍有待处理选择）。预期：把会话置为不可用，或把两个错误一起带出。需要“恢复也失败”（引擎/内存级故障）才触发。
2. **回归缺口：** (a) `isSelectableMove` 的 `!disabled` 分支没有任何用例守护（去掉它，全部测试仍通过；真实引擎里该分支行为是对的）；(b) 失败重试后 gateway `seq` 连续性没有断言（真实代码正确，故障注入对比覆盖了 `seq`）。
3. **`src/framework/tools/harness.ts:38` 的演示 AI 仍是旧的 `!m.disabled && m.pp > 0`**，与已修复的运行时不一致；只影响测试工具在“全部 0 PP/锁招”时可能停滞。

另有两条观察：失败的替换会丢弃之前暂存的选择（新选择被拒后旧选择已退款清除，作者记录的语义，自洽）；检查点恢复会换成新的 `BattleGateway` 与 `party/bag` 对象，宿主若缓存了旧引用会过期（`PS_BattleFlow` 每次重新读取，当前无影响）。

## 7. 请二次复审重点

1. **F2 的映射是否真的等价于原版 Essentials 的 PP 语义**：这里的“0–3 次 PP-Up、`total_pp = base*(5+ups)/5`”是按固定 Showdown 的行为实现的；`noPPBoosts` 与 `trumpcard` 特例只对应 Showdown。请核对规格库对 PP-Up 与最大 PP 的描述是否与此一致（实现侧不读原版 Ruby，这一核对需在规格侧做）。
2. **F3 的语义取舍：** 并发拒绝返回 `choice-rejected`（没有新原因码、没有请求 ID）；失败后回滚到操作前的检查点并允许重试；已发出的日志不回滚。请判断这是否符合你之前提出的“明确串行/拒绝重入/去重策略”的要求，还是应在协议里加请求 ID。
3. **宿主证据的资格：** 开发树流程与包内套件是同一机器上单次运行；构建身份用 `gitHead` + `diffSha256`（为空）+ 引擎包哈希；包内逐文件 manifest 仍未做（你上一轮提到过）。
4. **性能结论的措辞**是否足够保守（见 §5）。
5. 是否同意把 §6 的三项作为后续低优先级整改，而不阻塞接受。

## 8. 复现与证据位置

- 在公开仓库里：
  - 复审与宿主结果说明：`docs/step3/review-fixes.md`（末尾“独立复审与宿主验证”一节）。
  - 宿主原始 JSON：`experiments/step3/evidence/review-fixes/host/`。
  - Node 层红/绿 TAP、类型检查与构建日志：`experiments/step3/evidence/review-fixes/`。
  - 新测试：`experiments/step3/test-move-requests.cjs`、`test-pp-sync.cjs`、`test-session-operations.cjs`。
- 本机、不在仓库里（可按需提供）：
  - 完整复审报告：`.independent-reviews/step3-fixes-20261019/REPORT.zh.md`；宿主验证总结：`HOST-VERIFY.zh.md`。
  - 探针与变异清单：同目录 `probes/`（含 `mutate.py`、故障注入 `p2.cjs`、基准 `p3.cjs`）。
  - 宿主原始证据（含截图与性能原始数据）：工作区 `.verify/fixes-evidence/`。
- 复现命令（Node 22.21.1，仓库根）：

```bash
export PATH=/Users/dingshinn/.nvm/versions/node/v22.21.1/bin:$PATH
scripts/test-quick.sh          # 类型检查 + 边界 + 19 套件，约 12 秒，无窗口
pnpm --dir src build           # 完整构建
```

宿主测试（`scripts/run-flow-test-mac.sh <绝对路径>`、`scripts/run-package-tests-mac.sh <绝对路径>`）需要 NW.js 窗口，在 Claude 的 shell 沙箱里无法启动；运行时项目目录必须含上文 §4 所列的被忽略运行时文件。

## 9. 当前状态与下一步

- 三项修复已并入 `step3/foundation`（`a761c0a`，CI Run 14 成功）。**未合并到 `main`，未打 `step3-closed`**。
- 用户已授权：宿主测试无问题后可推送、合并、整理仓库。第三步整体的独立复核还没有结果，所以 `main` 保持不动，等该结果出来、并确认合并后的 `main` 的 CI 为绿，再合并、打标签、清理分支和工作树。
- 若你不接受这三项修复：倒序 `git revert 7abce72 cb3c045 92276c7`（保留历史），原候选 `89988b2` 无需改动。
