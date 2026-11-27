# 作者类型、战斗视图和训练家决策

- 编译语义变化时，重新编译作者源，而不是重写个体或旧缓存。成员没有独立持久的 types 字段。
- 继承、overlay完成后，对显式类型列表按身份去重、空列表归Normal；assembly再解析规范名称。省略类型继续取固定Gen8数据。三／四／十八种唯一类型完整保留。
- 静态个体摘要从已装配Content读取类型，与图鉴和进化统一。战斗中摘要仍显示静态个体类型；当前临时战斗类型归引擎及公开AI投影，不回写静态个体。
- Session把静态目录作为现有gateway创建选项传入。`battle/species-types.ts`只为与原生不同的标准记录创建本场species视图，不改共享Dex、原生源码或PokemonSet格式；无差异时不增加battle字段或视图。
- 只有差异目录存入battle snapshot的`rpgSpeciesTypes`。native恢复后，按native Species引用重解到本场目录，包含队列中的物种引用；不重新设current types、addedType、Transform复制、招式或状态。原有来源／恢复权限与driver通道不变。
- AI按公开物种名查询本场species视图，再沿已有original／base／added事件投影；不读取玩家私有types。DTO的类型数量上限由注册目录加`???`哨兵推导，并验证唯一性与已知身份。
- 含Future类型的整条物种记录保持原生战斗处理，不把列表中的Stellar删掉，也不只投影其余标准元素。assembly返回显式`future-type-battle-unification-open` warning，静态内容完整接受；该域不能据此假设在引擎中等价。

## 对公开属性表估算伤害倍率

固定引擎将免疫和属性指数分开处理：`dist/sim/battle-actions.js` 的 `getDamage` 先检查免疫；`dist/sim/pokemon.js` 的 `runEffectiveness` 汇总当前全部类型并执行 Effectiveness 事件；`modifyDamage` 在伤害计算中把最终指数限制到 `[-6, 6]`，再按二的幂应用。因此，逐类型原始表乘积、有效属性伤害系数、AI 的公开基础表代理是三个不同概念。

`publicTypeMultiplier` 仍是 **公开基础属性表代理**，不是引擎最终伤害预测：

1. 只使用合法目录中的攻击属性、目标全部已公开当前类型；`???` 作为中性防御类型。不得截断作者列表或读取玩家私有类型。
2. 任一表格免疫使代理为 `0/1`。其余每项转为 `-1 / 0 / +1` 指数，先完整累计，最后限制到 `[-6, 6]`，生成约分后的 `1/64 … 64`。不能逐项限幅，否则晚出现的抵抗／弱点无法正确抵消。
3. 采集、快照重算、默认招式评分及强制替补招式优劣评估使用同一内部纯函数。计算不依赖 Node、Showdown 或宿主；指数累计避免合法非约分目录在十八项乘积中溢出。
4. STAB、命中、基础威力沿原评分合同分别计算。招式特例、动态 Effectiveness 事件、特性、场地、实际伤害的舍入／最低伤害等仍不在这个属性表代理中。例如 Flying Press、Freeze-Dry、Delta Stream 并未因此成为完整伤害预测。现有 omitted 诊断保持。
5. Ratio 仍为 `{numerator, denominator}`，普通整数校验上限由伤害指数域推导为 64；保留旧的等价非约分比例。目录单格保持原 `0..16 / 1..16` 且商仅为 `0 / 0.5 / 1 / 2` 的接受域，不扩大或收紧作者类型。

| 向量 | 原始表乘积 | AI 基础代理 / 原生普通伤害的属性系数 |
| --- | --- | --- |
| Fighting → Normal / Ice / Rock / Dark / Steel | 32 | 32 |
| Grass → Fire / Grass / Poison / Flying / Bug | 1/32 | 1/32 |
| Grass → Bug / Dragon / Fire / Flying / Grass / Poison | 1/64 | 1/64 |
| Grass → 上行再加 Steel | 1/128 | 1/64 |
| Fighting → 五弱点再加 Ghost | 0 | 0（普通攻击免疫） |
| 四项 Fire / Poison / Flying / Bug，再由 Forest's Curse 加 Grass | 1/32 | 1/32 |

固定标准十八属性表的单攻击属性正向最高为五弱点（Fighting、Ground），无法通过标准作者列表构造正六／七级；这些边界只用明确标记的合成公共目录测试，不冒充真实标准配置。负七级可以由标准 Grass 或 Bug 抵抗组合到达。它们的免疫和动态规则仍归真实引擎。

公开 DTO `trainer-ai-public-v1` 不读取对手私有状态；非法快照拒绝且不消耗随机数。
