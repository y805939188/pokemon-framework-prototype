# R5 文案与可复用道具诊断整改

基线 `51b346c5a8e826da9b125595b8be512474f569dc`，前产品 `f37c5c87a338bbf72e7b3f4330a1e13a9398c82c`。本批限于 Claude R5 F-1／F-2 文案、D-1 作者平衡警告和 B-1 不支持复用的准确提示，用户保留玩家与 NPC 可复用治疗一致的决定。未改变 AI 策略、每场次数、库存台账或其它道具族实现。

- 抗性树果的第二条 `-enditem [weaken]` 不再生成“失去”句，真实 `[eat]` 和伤害保留；Frisk 英文以持有者起句，专名大小写不变。
- `trainer-reusable-healing` 定位类型和记录的资源项，复用运行时谓词，说明数量不是次数、可反复治疗以及平衡风险。
- `nonconsumable-battle-item-unsupported` 定位其它 `consumable:false` 战斗用途，区分玩家可用动作仍扣除、内建 NPC 不支持、未知身份不因此可用；不警告纯场外或仅持有用途。

[作者合同](authored-hp-healing-contract.zh.md)记录当前边界；新测试 `test-reusable-item-diagnostics.cjs` 与持物描述测试覆盖精确诊断路径、真实 CLI、编译数据不变和真实玩家／NPC 行为。新增测试在旧运行时 20 通过／14 失败；初轮整改测试的正则词序、CLI check 不输出 warning 的既有合同，以及合成对手 Splash／Growl 缺 PP 的夹具错误均保留在日志，不冒称产品缺陷。

证据目录为 `build/r5-limited-remediation/`，旧四轮作者证据 1018 项均哈希匹配。Claude R4／R5 原清单分别 220／172 个内容项匹配，仅自包含清单条目失败。新 `CLAUDE-R4-CONTENT-SHA256.txt` 和 `CLAUDE-R5-CONTENT-SHA256.txt` 排除原清单自身，逐项保留原期望哈希；原报告、清单和证据原位保留。

## 最终验收回执

产品／测试候选 `7aed5154162d5a3e18d0fa970ba731c6056bddf4`，tree `2c4a5b662fbdfc631d1d3d61b9d93283707beaae`，src `98778d0d7c92308d970022c57153dcea503c081c`。产品实现141f918，7aed515仅修六个边界测试的合法对手PP夹具，未改写中间历史。新增21项回归（文案3＋诊断／行为边界18）。

最终显式Node22.21.1的 `PF_NO_SKIP=1 scripts/test-quick.sh` **通过：298唯一套／5432项，失败／取消／跳过0，exit0**，2026-11-14T17:41:24Z→17:52:23Z。含类型检查、架构边界和受控构建，正式列表逐序完全匹配；runId `3125defc-5d79-4fba-b4d4-00dcb8a89692`，before/build/after dirty=false，末尾及另行binding verify通过。冻结成长回放EXCLUDED NOT RUN，不计绿。早期完整build通过；作者90项定向通过但误用默认Node22.14，资格由上述完整重跑及独审补足。

首轮完整regular因默认Node22.14低于要求而**失败**：298套、5248通过／14失败（7套），exit1；包括版本守卫、直接TS加载和CLI JSON输出截断。改用已有Node22.21.1后这7套全部通过。原日志和初轮测试夹具／断言失败全部保留，未放宽断言、修改守卫或改全局版本。

独立review明确请求 **gpt-6-astra / ultra**，固定7aed515结论 **PASS_SCOPED**：六套122／122＋70组合诊断矩阵＋13治疗身份／高索引路径／编译字节一致通过，无本轮阻断。报告 [independent-review/REPORT.zh.md](../../build/r5-limited-remediation/independent-review/REPORT.zh.md)，SHA256 `e3e1caa1d1800b0f31c8f909ff9067e35f121708d06645f04426ee655c3f0cf5`；其自身夹具与路径解析两次失败另留，不伪装产品问题。

[完整执行报告](../../build/r5-limited-remediation/REPORT.zh.md) SHA256 `22120e3d478d215cc426e1e8fbfa464fa8538f8d116dfd3f3eabf40e8cd21ce4`。最终1468个受保护文件全匹配；新旧清单、原失败、两轮完整日志、固定绑定和FINAL-RECEIPT在同目录。旧Claude R5正常速／冷Continue仅属前产品证据，本轮没有NW、实体输入/IME、听感、跨平台、打包、性能百场、全机制或Ruby/OA／新CI验收。未启动NW；可选ps扫描被沙箱拒绝，故不宣称全局NW数量0。

模型披露：父线程声明按6 Astra/xhigh/fast提交本次编码，本执行会话无运行时自证接口；独审工具确认请求gpt-6-astra/ultra但不提供fast开关，**fast无法核验**。不把调度配置说成运行时自证。保持main03f7e54干净，未fetch/push/PR/merge；本回执不授权下一步或扩大首版范围。
