# R2 作者物种类型：统一合同、实现与保留边界

状态：**用户在能力调查后批准继续完整A；Gen8标准类型产品修复候选与最终定向414项作者测试通过，等待独立复核。Stellar等Future类型跨层一致性明确OPEN**。调查基线为 `7ff11c917db9e605f245de370b0764ebad8b3243`，tree `c7380748e89758a7a231051baf33c33b20f8a31f`。下文基线调查与其原始限制作为历史事实保留，不冒充新产品仍未实施。

## 用户决定与产品候选

能力调查后，用户明确批准：继续统一Gen8标准作者类型，含AI域与checkpoint；不截断类型、不改持久存档；重复类型按身份去重；显式JSON `[]`规范化为Normal；升级compiled内容语义并要求重建缓存；Stellar输入保持既有接受、不截断、不新增拒绝，但其跨层一致性仍OPEN。本候选据此实施，未改作者schema版本、作者JSON源或玩家档。

- compiled内容schema为4，旧compiled3及更旧缓存要求重建。原作者输入hash不重写，`compiledSemantics`和强内容身份相应变化。语义变更不自动迁移或修改玩家Member；Member仍没有types字段。
- 继承、overlay完成后，对显式类型列表按身份去重、空列表归Normal；assembly再解析规范名称。省略类型继续取固定Gen8数据。三／四／十八种唯一类型完整保留。
- 静态个体摘要从已装配Content读取类型，与图鉴和进化统一。战斗中摘要仍显示静态个体类型；当前临时战斗类型归引擎及公开AI投影，不回写静态个体。
- Session把静态目录作为现有gateway创建选项传入。`battle/species-types.ts`只为与原生不同的标准记录创建本场species视图，不改共享Dex、原生源码或PokemonSet格式；无差异时不增加battle字段或视图。
- 只有差异目录存入battle snapshot的`rpgSpeciesTypes`。native恢复后，按native Species引用重解到本场目录，包含队列中的物种引用；不重新设current types、addedType、Transform复制、招式或状态。原有来源／恢复权限与driver通道不变。
- AI按公开物种名查询本场species视图，再沿已有original／base／added事件投影；不读取玩家私有types。DTO的类型数量上限由注册目录加`???`哨兵推导，并继续验证唯一性与已知身份。
- 含Future类型的整条物种记录保持原生战斗处理，不把列表中的Stellar删掉，也不只投影其余标准元素。assembly返回显式`future-type-battle-unification-open` warning，静态内容完整接受；该域不计入本次一致性通过。

先行正式合同9项在基线实际0/9通过，原始`contract-before.tap`保留。批次1新归一合同2/2，既有内容三套最终40/40；其首轮39/40的失败是漏更新egg测试中`compiledSemantics=3`的旧断言，按本次明确版本决定修正为4，原日志未改。批次2正式合同11/11，AI／公开类型／Transform／stance／learning邻近11套341/341。之后追加Illusion、正式STAB／免疫、去掉恶属性、Stellar边界、Mimicry及默认生产AI十八类型合同；最初9项红测与后来8项增补分列，不宣称17项都在旧产品上跑过红测。

最终稳定运行时下，明确16个文件合计 **414/414通过，fail/cancel/skip/todo均0，exit0**：正式产品合同17项、能力诊断16项、既有内容40项、邻近341项，拆分只作范围说明，不重复计数。命令为支持的Node `22.21.1`直接`--test`这些明确文件；未使用完整headless入口。本地原始TAP与精确参数：`build/r2-author-types/product-final.tap`、`product-final-command.json`，源码／产物／日志哈希见同目录`PRODUCT-PROVENANCE.json`。根协调者另外完成本树engine与内容构建、stage custom同步、完整类型检查及AST边界，均exit0；其原始集成日志由根协调者保存。

正式17项通过的实际范围包括：三／四／十八类型的Content、图鉴条目、静态摘要、进化、真实引擎与双方AI；空／重复／省略及继承overlay；真实typeadd替换、Soak、换人和checkpoint；Transform复制附加类型及恢复原基础；Forecast形态及自然期限；Illusion伪装类型／揭露／附加／恢复与禁止私读；Mimicry结束恢复；正式STAB／免疫与AI倍率；两个内容场次隔离；原生恶属性覆写为非恶；raw gateway快照恢复；默认生产AI实际十八类型普通行动；Stellar整记录兼容warning。作者静态／临时域分离及持久成员未新增types也有断言。

旧AI测试中把四种合法类型当非法的own/public两例已移除该错误期望，由新增三／四／十八项正式正例及默认生产AI替代；空快照、重复快照与未知类型的拒绝仍保留。以上均为作者自测，不代表独立通过或完整宿主验收。

## 已有合同

正式净化规格 `pokemon-framework-reference/deliverables/final-specification-set/pokemon-rules/wp19-attributes-ability-and-stats.md` §3.1 明确：

- 个体类型来自物种／形态记录，形态在编译时继承或覆盖，读取返回副本。
- 常见数据为 1–2 项，但数据／读取层没有两项硬上限；返回完整列表，类型成员判定覆盖全部列表。
- 战斗临时类型改变不写回该静态字段。

WP31 §3 的 `LevelDarkInParty` 读取队伍中非蛋成员的恶属性。WP66-A §5 的 INFO 页消费个体类型。WP39 §6 区分场上战斗副本、全量刷新与持久个体；Transform 复制战斗类型等数据。

本仓库正式作者入口已经提供 `SpeciesSource.types`、overlay `set.types` 和 PBS `Types`；这不是私有夹具才有的入口。现有 `test-content7.cjs` 的 B21/B22/B23 明确验证三种静态类型完整经过 assembly；B04/B07/B24 验证显式 JSON `[]` 不继承。故不能在本轮自行把它改成最多两项、悄悄截断或拒绝与 Showdown 不同的合法输入。

当前输入域比常见物种还宽：JSON 接受空列表、重复项和四项以上的已知类型；assembly 规范化每个名称，但没有去重。PBS 要求至少一个合法符号，不能用空文本表达 JSON `[]`。这属于兼容与规范化问题，须和作者覆盖决定一起明确，不在诊断中擅自收窄。

## 基线真实数据流

| 入口／消费者 | 基线权威 | 证据路径 |
|---|---|---|
| JSON／overlay | 保留作者 `types` | `src/framework/content/schema.ts`、`progression-input.ts`、`compile.ts` |
| PBS Types | 进入相同作者字段 | `src/framework/content/pbs-import.ts` |
| 形态继承 | 先继承基础物种，再应用 overlay；显式 `[]` 保留 | `src/framework/content/progression-input.ts` `inheritSpecies` |
| runtime assembly | 指定作者值则使用作者值，省略则回退固定 Gen8 Dex | `src/framework/flow/content-runtime.ts` `assembleContent` |
| 图鉴列表、条目、属性搜索 | `Content.species` 中当前形态的作者类型 | `src/framework/rules/pokedex-query.ts` |
| 非战斗摘要 | 经内容键找到 Showdown 名后重新查询 Dex；类型使用原生值 | `src/framework/app/management-query.ts` `individualView` |
| LevelDarkInParty | `speciesDataOf(content, member).types` | `src/framework/rules/evolution.ts` |
| 开战物种身份 | 内容 id＋form 转成 Showdown 名；没有独立类型字段 | `src/framework/rules/species-key.ts` `battleView` |
| Session → gateway | `toSet` 无 types；gateway 使用 `Teams.pack` | `src/framework/flow/session.ts`、`src/framework/battle/gateway.ts` |
| 战斗计算 | 固定 Gen8 物种类型与引擎临时状态 | 固定 staged Showdown `dist/sim/pokemon.js` |
| NPC 自己的类型 | 真实 NPC 引擎 `getTypes()` | `src/framework/battle/trainer-ai-source.ts` |
| NPC 看见对手的类型 | 公开 switch／forme 物种先从原生 Gen8 Dex 推导，再跟随公开临时事件 | 同上 `collectPublicTypes` |
| 战斗中摘要 | 实时端口提供 HP／状态／PP／stats 等，未提供 types；最终仍调用原生 `individualView` | `flow/battle-summary.ts`、`src/plugins/PS_BattleFlow.ts` `showPartySummary` |

因此可以通过正式作者内容产生同一成员在图鉴／进化为恶属性、摘要／战斗／AI为原生属性的分裂。是否允许这种产品行为不是类型系统能替用户决定的问题。

## 为什么不能只增加 toSet.types

允许静态阅读的 staged Showdown `SOURCE_SHA` 是 `7244fe8e28fa8bc4d0809ae30d183c608b62bb2b`；本轮未读取原版 Ruby、私有 O/A、原始对照输出、玩家档或历史运行副本。

固定 `Teams.pack` 没有编码任意 `types` 字段，构造 Pokemon 时从 `baseSpecies.types` 初始化。即使 `toSet` 添加该属性，gateway 的 pack 边界仍会丢弃它。

此外，单次上场赋值不能覆盖整个生命周期：

- `clearVolatile` 在换人等清理中恢复物种数据；需要重新取得本场绑定的静态类型。
- `setSpecies`／`formeChange` 从当前形态记录重设类型；必须决定作者定义形态、引擎临时形态及缺少作者形态的回退合同。
- Transform 从目标当前战斗类型复制，并复制附加类型；后续恢复必须还原原成员静态类型，不能把静态覆盖误当每次查询的强制覆盖。
- Soak、Reflect Type、Mimicry、Burn Up、Roost、Forest's Curse／Trick-or-Treat 等会替换、移除或附加战斗类型；不应因读摘要、成长刷新或重新绑定而被覆盖。
- AI 对手投影只使用公开信息。覆盖后的公开外观（包括 Illusion）必须能推导正确类型，不能改成读玩家私有 `getTypes()`。现有 original／base／added 分层及公开事件顺序要保留。
- AI DTO 目前只允许 1–3 个唯一类型；合法静态三项再附加一种、静态四项或空列表，都不能靠截断解决。数据接受域和战斗／AI域的关系需要明确。
- checkpoint 同时保存引擎 JSON 和 AI original／base／added；恢复不重放 `onBegin`。新权威必须随本场绑定恢复，不能从后来被替换的全局内容重新推导，不能污染其他同时存在的场次或全局 Dex。

上述结论来自静态代码阅读；未据此宣称所有运行组合已验证。

## 最初提出的产品方案

| 方案 | 产品行为 | 兼容后果与工作量 |
|---|---|---|
| **A（推荐）：作者类型统一生效** | 作者物种／形态类型供图鉴、摘要、进化与开战静态数据统一使用；战斗期间由引擎拥有临时类型 | 保留既有正式作者能力，最符合 WP19；会修正旧覆盖内容的战斗结果。须完整处理形态、换人、Transform、公开 AI、checkpoint、任意长度／空／重复域。无需在 Member 或冻结协议里持久化临时类型，但内容语义／缓存兼容须显式登记。 |
| B：明确静态与战斗两域 | 图鉴、静态摘要、进化统一作者类型；战斗和 AI维持固定 Gen8类型，作者界面清楚标出两者 | 旧战斗结果最稳定，但同一成员仍有两套类型。这是持续有意差异，须用户批准并说明进化与战斗的含义；不能把现状包装为全合同一致。 |
| C：固定 Gen8 统一权威 | 所有消费者使用原生类型；作者 types 被明确移除、废弃或限制为一致值 | 会破坏现有合法覆盖及三项类型能力，并可能改变图鉴搜索／进化结果。必须有作者版本、迁移或诊断方案和用户批准；不能作为普通缺陷修复悄悄拒绝。 |

用户已选择 A；随后明确要求本轮先确认真实引擎支持。建议在以下能力结果基础上明确任意长度／空／重复的兼容语义、作者形态对临时形态的回退，再决定是否实施完整场次绑定。实现接口由后续设计确定，本调查没有修改 Showdown 源码、全局 Dex 或给 `toSet` 加未支持字段。

## 初始能力调查实际结果（产品修改前）

Node `22.21.1` 实跑：

```text
/Users/dingshinn/.nvm/versions/node/v22.21.1/bin/node --test experiments/framework-remediation/test-r2-author-types-diagnostics.cjs
15 tests, 15 pass, 0 fail/cancel/skip/todo, exit 0
```

本地完整 TAP：`build/r2-author-types/diagnostics-r4.tap`（ignored，不随源码提交）。同目录 `diagnostics-r2.tap` 为先前 12/12，`diagnostics-r3.tap` 为增补后 14/14；计数不相加。使用根协调者为本候选重建的 production/testing 包及 custom format，Showdown主体是从现存固定 stage 独立复制的运行时；**不是冷下载／上游冷构建证明**。本专项没有运行完整 headless、CI、NW、游戏、冻结成长回放、原版／O/A 或玩家档。

| 验证层 | 实际行为 | 判定范围 |
|---|---|---|
| 正式 JSON／overlay | 三、四、全部十八种唯一注册类型完整进入编译／assembly | 通过；没有截断 |
| 正式 PBS | 四种类型完整进入正常 assembly | 通过；不表示 Session 已传入引擎 |
| 形态继承／overlay | 形态先继承作者四项；之后基础物种 overlay 不追溯覆盖形态；显式形态 `[]` 保留 | 通过；与已有合同一致 |
| 正式 App／Session 组合 | 三／四／十八项在 Content、图鉴和恶属性进化条件生效；摘要、引擎、AI仍读原生类型 | **现状缺陷确认，R2未修复**；测试只输出一致性，不断言 split 永远正确 |
| 测试局部 species 视图＋真实引擎 | 三项＋Grass成为四项、四项＋Grass成为五项；后续 typeadd 替换、Soak、换出换回正常 | 通过这组能力 probe；不是正式作者支持证明 |
| 十八项真实引擎 | 类型保留，Soak后再换人恢复十八项；原已含Grass／Ghost时对应添加招式合法失败 | 通过这组能力 probe；不能把添加失败误称容量限制 |
| Transform | 原作者三项，复制目标四项；真实换人恢复原三项 | 通过测试局部入口 |
| Forecast | 真实 Sunny Day 将作者三项基础形态变为作者四项晴天形态；天气自然结束回作者三项 | 通过测试局部入口 |
| 战斗计算 | 第三位以后的 Ghost 实际产生 Normal 招式免疫；第四位 Steel 实际使 Flash Cannon 伤害从50变75 | 通过这两个固定种子场景；不是所有招式／特性／UI的完整机制证明 |
| 测试局部视图的 native checkpoint | 当前 Transform 四项被保存；`Battle.fromJSON`后换人却恢复原生Normal，species引用也回原生 | **明确恢复限制**；必须有场次配置重绑，不能只保存当前 `types` 数组 |
| 当前 AI在局部覆盖引擎上 | NPC own四项被真实策略拒绝 `trainer-ai-invalid-public-snapshot`；player引擎四项但公开投影仍为Normal | **明确接入限制**；须扩展受控DTO域并使公开物种推导理解场次内容，不得读取玩家私有类型 |
| 当前正式 Session checkpoint | 作者四项当前未进入引擎；真实Forest's Curse后的Normal/Grass及后续Soak，恢复前后公开快照与下一步续跑一致 | 通过现有临时状态恢复合同；不等于作者覆盖恢复通过 |
| 无覆盖对照 | 同一默认内容、同一种子三回合，测试局部视图和未包裹引擎的完整规范化state相同 | 通过有限兼容 probe；不是新产品实现的默认行为验收 |

测试局部视图只克隆当前 Battle 的 Dex/species端口，保留真正 Species 原型，并从正式装配 Content取得类型；没有修改共享Dex、原生源码、全局format注册、Pokemon.types字段或手写期望快照。生命周期测试执行真实选择／招式／形态及原生state codec。AI接缝探针显式调用原生 `formeChange` 让真实引擎使用该测试视图，属于实验入口，不冒称当前正式游戏可达。

最初10项运行有9通过／1失败：测试错误地要求十八类型目标还能新增已有的Grass。固定原生招式会拒绝已有类型，这是正确招式行为。修正测试前提后12/12，再随独立增补形成14/14、15/15；这次夹具失败不计引擎容量缺陷，也不删除或改写其原始工具输出。

### 尚需明确的输入域与后续选择

两项额外实测边界不能由实现者悄悄决定：

- JSON `[]` 目前合法且静态保留空；原生 `getTypes()` 遇空会回退Normal。完整A需决定空列表是静态可空但战斗回退，还是在入口以明确版本规则规范化为某种语义；不能直接新增拒绝。
- JSON重复类型目前合法且assembly规范化名称后仍保留重复。原生引擎也保留重复，三个Dark会让Fighting的原生 `typeMod` 为3；AI当前要求唯一。正式WP19要求编译去重，若据此修复应明确缓存／既有内容语义变化，保持输入接受而不是截断。

这份初始调查未发现固定引擎对三／四／十八种唯一类型的统一硬容量障碍，但当时作者接入、公开AI域、checkpoint重绑不完整。此后用户批准本页顶部列出的完整接入与空／重复语义；原始调查结论不被删改成当时已支持。Stellar兼容边界继续保留，不擅自拒绝或删掉原接受输入。

## 可先独立提交的诊断与最终组合合同

`experiments/framework-remediation/test-r2-author-types-diagnostics.cjs` 保留能力探针，获批空／重复断言已随新合同更新，旧运行结果保留在原日志；不把split写成永久正确行为。正式产品行为由独立的 `test-r2-author-types-contract.cjs` 断言。完整headless清单由根协调者统一登记；本专项不触发CI，不运行冻结成长回放或窗口。

选定产品方向后，最终组合验收应由同一份合成作者内容贯穿以下场景，并把诊断的一致性结果升级为所选合同断言：

1. JSON base、overlay、PBS 与省略回退；大小写别名、单／双／三／四种类型、JSON空列表、重复、未知引用；基础／显式形态／缺形态回退。
2. 正式编译／assembly → 成员创建／接收 → 图鉴条目／两类型检索 → 非战斗摘要 → LevelDarkInParty → 正式 App／Session／真实 Gen8 开战。正反各一：原生非恶改恶、原生恶改非恶。
3. 自己和 NPC 均覆盖；换出换回；形态进入／退出及原始形态不同；已有作者类型不被成长刷新意外重置。
4. Transform 复制临时替换／附加类型，随后换人恢复原始静态类型；Reflect Type、Mimicry、Roost、Burn Up、连续不同 typeadd 覆盖与重置；三静态＋一附加及四静态纳入 AI 合同。
5. Illusion 假外观、揭露、公开 formechange、AI倍率／STAB；禁止读取对手私有类型仍得到同样公共快照。静态摘要与实时战斗类型显示合同分开说明。
6. 变化前／变化后 checkpoint 故障恢复并续跑；同源重放一致，异场内容互不污染；旧存档无新增临时字段；战斗中和结束后持久个体与内容未受临时变化污染。

当前产品改动及用户边界见页首；本子任务未改完整测试清单、README／PROJECT-GUIDE或共享交接记录，提交由根协调者处理。全部类型与全部机制的笛卡尔积、完整UI／原生宿主／性能／玩家档迁移仍未执行；不把有限定向验收自签为全参考机制或完整宿主通过。
