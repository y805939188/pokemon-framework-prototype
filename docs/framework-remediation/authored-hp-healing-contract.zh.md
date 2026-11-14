# 作者主动 HP 治疗量统一（2026-11-14 F1 后继）

本批承接 `7539d3f`。此前仅增加编译 warning，没有消除 F1；该方案及原验收记录保留。本次按用户继续整改的要求，将现有战斗可用主动 HP 道具的合法作者 `hp` 参数真正接入战斗与训练家 AI。

## 行为与范围

场外、战斗和 AI 共用 `active-hp-recovery.ts` 的参数解析：配置真选择 `amount`，假选择 `oldAmount ?? amount`；`fraction` 按使用时最大 HP 向下取整；`full:true` 补满；实际回复封顶。只处理 `battleUse=member`、可消耗且属于已有 `HEAL_ITEMS` 的战斗身份，不增加新战斗道具或扩展 PP、复活、持有触发等家族。作者 ID 与 battleId 不同也按 battleId 接入引擎，AI 仍返回作者 ID。

默认 Super Potion 60/50 等表值保持；默认 Max Potion 补满、Sitrus 1/4 保持；AI 对固定量使用相同数值，对比例／补满保留 WP51 的 1／999 估量，不把估量当实际回复量。Full Restore 的补满、状态／混乱清除与复活 half/full 行为不改。被动持有回复也不受本批主动参数控制。

合法 `hp` 自定义不再产生“只在场外生效”的旧 warning。显式把 HP 战斗 ID 绑定到场外另一效果家族，或把 Full Restore 显式绑定为部分 HP 家族，继续允许作者的上下文差异，但输出 `battle-healing-family-mismatch`；这些跨家族定义不在本次 HP 参数统一范围内，不能把 warning 当成已统一。合法比例参数的常用分母和补满均已测；不声称任意跨家族／极端参数组合全覆盖。

## 所有权与快照

Session 将已解析、与默认值不同的量经可选 `GatewayOptions.activeHpRecovery` 传入 Gateway；Gateway 严格验证并复制仅含 amount／fraction／full 的正整数或 true 条目，未知身份、额外字段、无效类型均拒绝。引擎 `rpg.activeHpRecovery` 拥有本场量并随 JSON／检查点恢复。恢复选项不重绑它。

默认等值不新增表，旧快照缺表时沿用快照已有治疗配置与旧固定表；更老快照连配置字段也缺时仍按默认真。既有 battle.rpg.rebalancedHealingItemAmounts 不变。没有玩家存档字段／迁移、compiled schema 或结果协议变更；战中存档仍不开放。

## 验证与风险

新增行为测试先在旧运行时得到 14 pass／8 fail，随后实装通过。首轮九文件定向 334/334，零量修正后 335/335，含现有道具、AI、复活、引擎 staging 契约、F4 文本和 Transform 学招／Scene；完整类型检查与 build 通过。固定 Showdown 源码 7244fe8 在本任务 APFS 独立副本重建，未改其它会话缓存；离线 build-deps 缺包的初次失败保留，随后按固定依赖与 integrity 正常完成。

F4 去重另收窄为最近一次同目标、同最终 HP 的道具结果，保留明确其它来源及较早的回血；新增双回血事件批测试。这是防止过宽抑制的保护，不冒称已经复现新玩家缺陷。

完整 regular、NW 与最终固定身份以本轮外部 `build/f1-healing-consistency/REPORT.zh.md` 为准，未终态不得预填绿。此前 488dade 的 295/5356 和七模式 NW 只属于旧候选，不代替本轮。另一个 AI 对本轮代码的独立签收需父协调安排；本执行者的编码与只读自检不冒称第三方独审。

作者只读审视另复现合法 fraction 分母大于当前最大 HP、请求向下取整为 0 时仍扣物品。后继修正在 Session 登记前、AI 候选构造和引擎执行期检查零量；新增回归验证场外／战内均拒绝、HP／库存／回合不变且 AI 不列此项。先前 3f3641d 的完整 regular／NW 虽通过，仍只保留为中间记录，不作为该修正的验收。

## 最终本地验收回执

产品／测试固定 `d47c0927826dac0f19f062cadb8ddcc00bb1a4ea`，src tree `65172be95dca6fe5a27aa3d90d5ba7fd93de7f85`。完整typecheck／build、335定向通过；PF_NO_SKIP=1 regular **295套／5368项全过，失败／取消／跳过0、exit0**，runId `93402bd6-1e7e-4f2e-9fc2-7856bf671e38`，绑定前／build／后dirty=false、末尾及另行verify通过；冻结回放EXCLUDED NOT RUN，不算通过，无新CI。

最终正常速度两配置80/90的field App、玩家与NPC回合实际一致，快照绑定正确，各胜利后一次提交；均为隔离合成状态与CDP可信键盘输入，field部分为实际App服务调用，非实体输入。正式NW七模式all64/64、verify-save4/4、step5-*各1/1、held11/11、held-continue6/6、battle-entry10/10全rc0且无超时。所有自有NW结束，最终进程检查0行。先前中间3f3641d虽全绿但零量缺陷未闭，原结果保留，不作为最终资格。

[完整本地报告](../../build/f1-healing-consistency/REPORT.zh.md) SHA256 `e6adc77f7efb6da69999178e26a89210ede51429a7b4f39acae10b2bfb06ffa6`；原日志、两个绑定、负例、正常速度截图、模式启动记录／保存哈希、补丁、FINAL-RECEIPT与EVIDENCE-SHA256在同目录，勿清理。此前338份证据封印全部复验未变。此节之后仅为文档提交，产品／测试字节仍为上述固定候选。另一AI对本轮的独立签收尚未执行，交父协调／Claude；本回执不冒称独立PASS，不推送或合并main。


## R4 非消耗主动治疗边界（2026-11-14）

合法作者 `consumable:false`＋`battleUse:member` 的已知道具目前仍按旧战斗台账扣除一件，并使用内建效果；场外则保留库存。这是已复现的行为差异，**没有由本次修复为可重复使用**。合成 Super Potion amount80 实测场外回复80、库存1；真实战斗回复60、胜利提交后持久库存0。

本次选择兼容诊断：编译仍成功、保留数据，在准确的 `.consumable` 路径发出 `nonconsumable-battle-healing-unsupported` warning，明确扣除与效果差异。作者可以设 `battleUse:none` 禁止战中使用，或设 `consumable:true` 进入已支持的主动治疗合同。完整的可重复使用战斗道具需要另行扩展台账与语义，本批未实现；这条诊断不能被称作行为已统一。复活／PP／其它家族不扩展。


## O-3 实际可重复使用语义后继（2026-11-14）

本节替代上节“仅warning”的当前行为；上节及原R4验收作为历史保留。已知HEAL_ITEMS身份与Full Restore，且battleUse:member的作者consumable:false道具，现在战中成功使用后保留拥有的一件，并可在下一回合再次使用。hp参数不再因非消耗被排除，amount／oldAmount、比例、补满、实际封顶与AI估量保持同一合同；Full Restore继续补满并清状态／混乱。

Session拥有玩家台账，AI拥有独立训练家资源。登记仍先检查实际拥有一件，再借出一件；成功将该条目标记retained并归还，取消／登记拒绝／无效果／未执行结束走原有一次退款。重复事件不会再次加库存。借用期间不改持久Inventory，战果只提交差额0；技术中止不提交治疗或库存变化。AI返回自有资源时推进资源revision，旧ticket失效；检查点携带借用标记和状态，异常回滚与重放保持库存、HP、随机流一致。

不增加玩家存档字段、战果或引擎协议，不开放战中存档。Session既有内部恢复保存台账；新Gateway快照保存已存在的HP profile，旧缺表快照继续原固定表回退。可消耗道具的预留／消耗路径保持。移除已过时的nonconsumable-battle-healing-unsupported警告；显式跨效果家族仍有family-mismatch诊断，并不擅自统一这种作者上下文差异。复活、PP、球、强化、脱离、持有触发等其它家族没有扩展非消耗语义。

新增23项覆盖单副本连续使用、作者ID别名、80/90、比例／补满／封顶、默认Potion、Full Restore、玩家及AI的库存所有权、拒绝／取消／无效果、重复事件、战果重复提交／中止、借用检查点／异常恢复、旧Gateway快照回退。原O3同一探针已从场外+80／战内+60且持久库存0，变为均+80且库存1。最终固定提交与完整regular／NW以build/o3-nonconsumable-healing/REPORT.zh.md为准，未完成不预签。


## O-3 最终本地验收回执

产品／测试 `f37c5c87a338bbf72e7b3f4330a1e13a9398c82c`，tree `9ce5cb3491a9053915bbef25f9480e54461e21c7`，src `06e9e0390518b3c41eb2ad5ca192cc4e94bf7887`。完整typecheck/fullbuild、239定向通过（新23项计在其中，最终另跑23/23）；PF_NO_SKIP=1 regular **297唯一套／5411项通过，失败／取消／跳过0、exit0**，runId `720474da-e212-4889-9d33-84c686b95981`，before/build/after dirty=false、正式列表逐序匹配，末尾及另行verify过。冻结参考回放EXCLUDED NOT RUN，不计绿，无新CI。

正常速NW80/90两配置共玩家4次／NPC4次成功使用，双方各从1件连续使用，第二次菜单仍x1；字段App也保留1，两场各胜利一次提交且持久库存1，Node/NW exit0、consoleErrors=[]。测试为合法合成内容，Snorlax100、玩家初始HP1、NPC用药前重置HP1是披露前提，未直接补库存；CDP可信键盘，非实体输入。正式七模式64/4/1/1/11/6/10全exit0、无超时，最终NW0。

[完整本地报告](../../build/o3-nonconsumable-healing/REPORT.zh.md) SHA256 `5ae1f316ccea1fef2eef1ce951762a8b9709466e560ced9d349242e56573cdd6`；原红例、测试夹具修正与全部最终记录保留，前3轮842份封印未变。FINAL-RECEIPT/EVIDENCE-SHA256同目录，勿覆盖重跑。只读作者复核不是另一AI独审；仓库限定Sonnet5.5而当前工具不提供，后继Claude待父协调。新nonconsumable FullRestore、中文与恢复只有headless/Scene/内部checkpoint证据，未做自定义false冷Continue NW；其它未测边界见报告。本后继只写文档，不改变受测产品与测试；main03f7e54干净，未fetch/push/PR/merge。
