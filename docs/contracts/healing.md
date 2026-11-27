# 主动治疗、估值和引擎快照

| 现支持道具 | 配置真（默认） | 配置假 |
| --- | ---: | ---: |
| Super Potion | 60 | 50 |
| Hyper Potion | 120 | 200 |
| Fresh Water | 30 | 50 |
| Soda Pop | 50 | 60 |
| Lemonade | 70 | 80 |

Potion、Berry Juice、Sweet Heart 恒 20，Moomoo Milk 恒 100，Oran Berry 恒 10。Max Potion 实际补满，AI 估量保留 999；Sitrus Berry 实际请求 `floor(使用时最大 HP / 4)`，AI 估量保留 1。这些估量不代替实际治疗请求，实际恢复仍封顶到使用时缺少的 HP。

最小接线为：已校验内容配置 → `BattleSession.create` → `GatewayOptions.rebalancedHealingItemAmounts` → 引擎拥有的 `battle.rpg` 上下文 → 回合内道具执行。固定量选择由 `healAmount` 共用；训练家目录从相同内容配置建立估量。场外处理器的职责及可由作者配置的效果参数保持原合同，没有统一或重写两套物品定义。

## 行为与范围

场外、战斗和 AI 共用 `active-hp-recovery.ts` 的参数解析：配置真选择 `amount`，假选择 `oldAmount ?? amount`；`fraction` 按使用时最大 HP 向下取整；`full:true` 补满；实际回复封顶。只处理 `battleUse=member`、属于已有 `HEAL_ITEMS` 的战斗身份，不增加新战斗道具或扩展 PP、复活、持有触发等家族。作者 ID 与 battleId 不同也按 battleId 接入引擎，AI 仍返回作者 ID。

默认 Super Potion 60/50 等表值保持；默认 Max Potion 补满、Sitrus 1/4 保持；AI 对固定量使用相同数值，对比例／补满保留 1／999 估量，不把估量当实际回复量。Full Restore 的补满、状态／混乱清除与复活 half/full 行为不改。被动持有回复也不受主动参数控制。

合法 `hp` 自定义不再产生“只在场外生效”的旧 warning。显式把 HP 战斗 ID 绑定到场外另一效果家族，或把 Full Restore 显式绑定为部分 HP 家族，继续允许作者的上下文差异，但输出 `battle-healing-family-mismatch`；这些跨家族定义须分上下文处理，不能把 warning 当成已统一。合法比例参数的常用分母和补满均已测；不声称任意跨家族／极端参数组合全覆盖。

## 所有权与快照

Session 将已解析、与默认值不同的量经可选 `GatewayOptions.activeHpRecovery` 传入 Gateway；Gateway 严格验证并复制仅含 amount／fraction／full 的正整数或 true 条目，未知身份、额外字段、无效类型均拒绝。引擎 `rpg.activeHpRecovery` 拥有本场量并随 JSON／检查点恢复。恢复选项不重绑它。

默认等值不新增表，旧快照缺表时沿用快照已有治疗配置与旧固定表；更老快照连配置字段也缺时仍按默认真。既有 battle.rpg.rebalancedHealingItemAmounts 不变。没有玩家存档字段／迁移、compiled schema 或结果协议变更；战中存档仍不开放。

## 可重复使用和边界

已知HEAL_ITEMS身份与Full Restore，且battleUse:member的作者consumable:false道具，现在战中成功使用后保留拥有的一件，并可在下一回合再次使用。hp参数不再因非消耗被排除，amount／oldAmount、比例、补满、实际封顶与AI估量保持同一合同；Full Restore继续补满并清状态／混乱。

Session拥有玩家台账，AI拥有独立训练家资源。登记仍先检查实际拥有一件，再借出一件；成功将该条目标记retained并归还，取消／登记拒绝／无效果／未执行结束走原有一次退款。重复事件不会再次加库存。借用期间不改持久Inventory，战果只提交差额0；技术中止不提交治疗或库存变化。AI返回自有资源时推进资源revision，旧ticket失效；检查点携带借用标记和状态，异常回滚与重放保持库存、HP、随机流一致。

不增加玩家存档字段、战果或引擎协议，不开放战中存档。Session既有内部恢复保存台账；新Gateway快照保存已存在的HP profile，旧缺表快照继续原固定表回退。可消耗道具的预留／消耗路径保持。移除已过时的nonconsumable-battle-healing-unsupported警告；显式跨效果家族仍有family-mismatch诊断，并不擅自统一这种作者上下文差异。复活、PP、球、强化、脱离、持有触发等其它家族没有扩展非消耗语义。

`-enditem [eat]` 明确表述吃掉树果；`-item [from] ability: Frisk` 表述察觉到原有持物；原生无来源 Air Balloon 的开场／结束表述浮空／破裂。Trick 转移仍表述获得，Knock Off 仍表述打落，`[silent]` 先行保持静默。英文所有权撇号统一 ASCII。不改变协议、持物状态或台账。Frisk、Balloon、Sitrus 均有真实 Gateway 生产事件断言，英中测试断言具体语句，不只断言非空。

Full Restore 只消除状态且回复0时只显示使用，不显示“恢复0”；有正回复时保留准确数字。日志按本场编译内容的作者 nameKey／name 查询显示名，缺失时回退已有翻译或原生显示文本。五种常用药补标准英文回退词，以避免 Fullrestore 等拼接ID；这不是全道具／全语言本地化。真实编译 Scene 测试覆盖作者自定义名、翻译key和 Full Restore。
