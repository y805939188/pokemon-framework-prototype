# C 当前无窗口整合候选

本文描述实现与验收边界，不是通过回执。精确最终 HEAD、current binding、执行统计和未覆盖项由隔离验证目录给出。

- 普通完成步、钓鱼、Sweet Scent 在物种/等级选择后共用完整野生创建阶段；事件新增 `PSFlow.openGeneratedWildBattle({battleId,seq,species,level}, presentation?, fieldChoices?)`，只做 WP36 §6 个体生成，不再套普通机会、驱虫、表选择或表等级修正。事件自身 interpreter running、普通遇敌关闭不阻止显式事件战。
- `PSFlow.openGivenWildBattle` 接收经过正式校验的完整个体，零生成 RNG；物种/形态/PID/IV/性别性格/闪光/招式/持物/属主均不重新生成。正常战斗与接收补丁仍按既有合同。旧 `StartBattle` 历史 species+level 创建保留，空白天气 none；三种入口不能混为已统一升级。新 generated/given 默认 none，可显式 inherit；非法输入拒绝。
- 持物池按规范 ID、长度及逐位重复值相等判断；相同多元素池保证持物并仅按第一池长度抽取；不同顺序/重复数保留 tier 门，不用集合去重。所有候选的持久映射在生成 RNG 前验证。
- B 创建形态、A 动态读取及简单冻结按正式时机执行；A/B 登记保存当刻原貌并经 App 当前 owner/source/generation/Content 安全边界一次提交。后续开战失败不撤回合法登记；失代生成不写新状态。有限合法 A fallback 贯穿捕获与持久化，B 精确资格和未知形态拒绝保留。
- SHINY_WILD_POKEMON_SWITCH 默认31：原有随机重试、lead、A 登记之后再强闪；FATEFUL_ENCOUNTER_SWITCH 默认32：新建时传入既有 fateful 上下文。0 显式禁用；合法稀疏槽未设置为 false，源整体不可用/非法则在生成 RNG 前拒绝。given 和旧 StartBattle 保原输入/历史语义。世界 hour 是业务时段权威；同一锁存 origin now 派生本地月份，不重复读时钟推翻 hour。
- 等级模式黑笛提高、白笛降低1–4是经父统筹授权的项目设计选择，未证明参考等价。rate 模式仍黑降频、白升频。每次仅设置目标旗，保留其余三旗；双真按现 lower 优先。使用与查询零生成 RNG，后续 selector 仍基础等级→适用特性→单个效果 draw(4)+1，钳制边界不省应有抽取。

原C固定截面的正式专项选八套完整业务 suite 加一套支持契约；当时regular明确列382套，保 C1 白名单及旧排除。wild-generation-completion 已登记，不重复添加。支持预备一次、consumer preload 只核验；四个 IIFE 字节复制，生产引擎使用 exact hash 绑定 alias 指向正式物理模块，共享 Node 缓存/私有 registry。正式 facade 的 chunks 和 Showdown stage 由当前分发 manifest 保护，不另捆绑内核或默认重建。

P5 当前映射与旧2M分开记录：原触发/选择 kernel 文件保持，创建 kernel 有形态/持物资格和可选强闪变化，不能以旧整体 hash 或历史2M代签。计划 current 有限原始随机带重放与完整 tier/CuteCharm 小域检查，以及47动作真实 App 生命周期链；读取实际 PASS/PARTIAL 状态。若独审认为仍需受影响边际统计，保原 N/m/α/seed/阈值另记首轮，不能刷 seed。该C固定截面的当时待验项由后继具名记录给出；当前整改的支持独审、专项/完整regular/P5实际终态另见G当前交付索引，不把历史382当作当前全量。NW、T20、声音、实体键盘、真实失焦及整体5.5没有因此验收。

当前默认生成开关31/32、作者 settings.json 的0关闭方法及正版本含v0的Area真实消费者，另见[C兼容与升级提醒](C-compatibility-note.zh.md)。其中版本枚举是保留的参考兼容技术行为，不是本次新修复；旧c08静态范围和7c后继接线证据分列，归档README不改写。
