# C：显式野生生成事件入口

`PSFlow.openGeneratedWildBattle({ battleId, seq, species, level }, presentation?, fieldChoices?)` 用于事件脚本（355）中的完整野生个体生成；对应 App API 为 `startGeneratedWildBattle`，宿主 Scene 交接使用 `latchGeneratedWildBattleContext` / `prepareGeneratedWildBattle` 私有发行链。该入口只执行 WP36 §6 个体创建，不执行普通机会、表物种选择、驱虫或表等级修正。事件自身正在运行、普通遇敌关闭及驱虫有效不阻止显式事件战。

默认天气、地形和战斗环境均为 none；第三参数可显式选择 inherit。非法或冲突字段拒绝。原 `StartBattle` 保留历史 species+level 创建及空白 none；`openGivenWildBattle` 保留完整给定个体及零生成 RNG，三者不能混称。

新完整生成与普通/钓鱼/Sweet Scent 已选物种后的同一创建函数共用：持物、闪光重试、适用 lead、B 创建形态、A 动态冻结、传奇 IV、地图 ScaleWildEncounterLevels。世界 hour 是时段权威；同一次 origin now 锁存派生月份。B/A 登记快照在实际形态提交时捕获，App 安全边界一次写入图鉴，合法登记不因随后开战失败回滚。

WP02 默认 SHINY_WILD_POKEMON_SWITCH=31，FATEFUL_ENCOUNTER_SWITCH=32；0 为显式禁用。原生稀疏未设置槽为 false，整个源缺失或非法值拒绝且不消耗生成 RNG。31 的强闪在 A 冻结后执行，保留此前随机前缀及登记原貌；32 在新建时传入既有 fateful 创建上下文。给定个体及历史 StartBattle 不套用这两个新创建源。

本文件是接口说明；执行结果、精确版本与未覆盖范围以阶段验证报告为准。无 NW、人工键盘/声音/真实失焦结论。
