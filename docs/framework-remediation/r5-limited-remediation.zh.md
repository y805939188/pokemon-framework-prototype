# R5 文案与可复用道具诊断整改

基线 `51b346c5a8e826da9b125595b8be512474f569dc`，前产品 `f37c5c87a338bbf72e7b3f4330a1e13a9398c82c`。本批限于 Claude R5 F-1／F-2 文案、D-1 作者平衡警告和 B-1 不支持复用的准确提示，用户保留玩家与 NPC 可复用治疗一致的决定。未改变 AI 策略、每场次数、库存台账或其它道具族实现。

- 抗性树果的第二条 `-enditem [weaken]` 不再生成“失去”句，真实 `[eat]` 和伤害保留；Frisk 英文以持有者起句，专名大小写不变。
- `trainer-reusable-healing` 定位类型和记录的资源项，复用运行时谓词，说明数量不是次数、可反复治疗以及平衡风险。
- `nonconsumable-battle-item-unsupported` 定位其它 `consumable:false` 战斗用途，区分玩家可用动作仍扣除、内建 NPC 不支持、未知身份不因此可用；不警告纯场外或仅持有用途。

[作者合同](authored-hp-healing-contract.zh.md)记录当前边界；新测试 `test-reusable-item-diagnostics.cjs` 与持物描述测试覆盖精确诊断路径、真实 CLI、编译数据不变和真实玩家／NPC 行为。新增测试在旧运行时 20 通过／14 失败；初轮整改测试的正则词序、CLI check 不输出 warning 的既有合同，以及合成对手 Splash 缺 PP 的夹具错误均保留在日志，不冒称产品缺陷。

证据目录为 `build/r5-limited-remediation/`，旧四轮作者证据 1018 项均哈希匹配。Claude R4／R5 原清单分别 220／172 个内容项匹配，仅自包含清单条目失败。新 `CLAUDE-R4-CONTENT-SHA256.txt` 和 `CLAUDE-R5-CONTENT-SHA256.txt` 排除原清单自身，逐项保留原期望哈希；原报告、清单和证据原位保留。

完整 regular 与独立 review 的固定候选、实绩和未测项将记录于本文件的验收回执及 `build/r5-limited-remediation/REPORT.zh.md`。本段不预签尚未结束的验证；未推送、合并 main 或新增 CI。
