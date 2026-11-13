# 存档迁移向量地图

迁移只处理作者合成输入和当前公开 schema；原版结果、玩家文件、私有证据均不作为本批输入。实际入口是 [save-schema.ts](../../src/framework/rules/save-schema.ts) 的 `migrateGame`，纯函数先验证原文档，再逐步复制迁移、执行当前内容／布局检查，失败不改原输入。安装／保存使用当前完整校验，不能因“可迁移”而把旧 schema 直接写回。

| 边界 | 迁移承诺和负向向量 | 现有可执行向量 |
|---|---|---|
| 1→2 | 持久毒伤归 plain poison；计数补齐，旧睡眠未知时保留未知语义 | [test-save.cjs](../../experiments/step3/test-save.cjs) |
| 2→3 | 建空 claims，不推断历史领取 | [test-schema3.cjs](../../experiments/step4/test-schema3.cjs) |
| 3→4 | Showdown 名映射内容 ID＋form；缺 mapping／未知物种整次拒绝；stats/steps 从零开始 | [test-migration5.cjs](../../experiments/step5/test-migration5.cjs) |
| 4→5 | 个体兼容元数据、固定 40×30 storage；确定性旧 PID，未知获得事实不伪造；容量超限拒绝 | [test-migration-storage.cjs](../../experiments/step5/1/test-migration-storage.cjs) |
| 5→6 | 有序库存成为唯一权威；badge／计算性格／PP 元数据；未知 item／move 与冲突失败保持原文 | [test-migration6.cjs](../../experiments/step5/2/test-migration6.cjs)、[test-M1-remediation.cjs](../../experiments/step5/2/test-M1-remediation.cjs) |
| 6→7 | readiness、cannotTrade、完整 dex 历史与布局；旧 seen／owned 独立，未知 form／count 不补事实 | [test-migration7.cjs](../../experiments/step5/3/test-migration7.cjs) |
| 7→8 | 建空 stable trainer defeat record，不从旧 result hash 推断训练家胜利 | [test-trainer-m1.cjs](../../experiments/step5/4/test-trainer-m1.cjs) |
| 8→9 | 保留旧 raw-only ledger，不为旧记录合成 required paired proof；坏 settlement 字段拒绝 | [test-held-app.cjs](../../experiments/step5/4/test-held-app.cjs)：HF-11 |
| 当前→当前布局变更 | 只接受一条明确 one-hop transition；缺失、重复 from、过期 target、坏 old layout／hash 拒绝 | [test-migration7.cjs](../../experiments/step5/3/test-migration7.cjs) |
| 当前保存／载入门 | 未来 schema、非自有字段、accessor、损坏元数据、内容不匹配拒绝；不调用 getter 修复原文 | [test-save-gates7.cjs](../../experiments/step5/3/test-save-gates7.cjs) |

friendship 的 256→255 是单独显式维护操作，历史合法值 256 不因普通 schema 迁移自动修正。其纯计划、选择路径、原始字节保留、opaque preview 与持久化不确定状态分别见 [test-migration.cjs](../../experiments/friendship-standard-domain/test-migration.cjs)、[test-app-integration.cjs](../../experiments/friendship-standard-domain/test-app-integration.cjs)、[集成合同](../testing/friendship-save-integration.zh.md)。

新向量应放作者合成 fixture，至少同时声明 from/to、内容映射／layout 前提、期望结果或错误码、原文不变和重复执行语义。新例子通过 `newGame` 和公开编译器取得当前版本；有意测试历史 schema 的例子才写明历史版本。编译内容 schema 与存档 schema 独立，升级编译语义时不机械重写旧迁移 fixture 或冻结协议 golden。

本批先建立上述现有向量地图，不把这些历史套件计为新测试或已重跑。共享跨层向量的首例是 [field-potion-vectors.json](../../experiments/framework-remediation/contracts/field-potion-vectors.json)：作者合成期望，只服务场外 Potion 纯规划／App 安装一致性，不是迁移或原版等价证据。

## 缺失、null 与整数蓝本

跨语言适配器应先保留 JSON 值和字段存在性，再按目标领域 API 校验。不要先以 `null`、零、空字符串或空列表填平差异；也不要以“能够计算 hash”替代 schema／业务校验。

| 值或字段 | 当前合同 | 向量应明确的边界 |
|---|---|---|
| absent（属性不存在） | 与显式 `null` 不同；某字段是否允许缺失由该版本 schema 决定 | `money` 是可省略的 v1 结果字段，但显式 `null`／`undefined` 非合法 money。一般值 `{}` 和 `{optional:null}` 指纹不同。 |
| 显式 `null` | 仅在字段明确允许时表示未知／无覆盖 | 当前 `origin.map` 等获得事实的 `null` 是未知；`statNature:null` 是无计算性格覆盖。缺失这些必需字段不是同义写法。nickname 等其他字段按自身合同处理，不能套用一个全局 null 规则。 |
| `undefined`、数组 hole | 不属于 JSON 值；不要通过先 stringify／parse 把不合法原输入变成合法输入 | semantic intent 拒绝 `undefined` 值及 hole；v1 原始形状门拒绝显式 undefined 字段、稀疏数组等，先于 hash／已应用重放。 |
| 有限整数 | 领域字段通常要求精确整数及字段范围；JS 安全整数界限为 −9007199254740991 到 9007199254740991 | 结果 money／bag delta 可为有符号安全整数；存档 money 非负。level、uint32 PID、EV、数量等仍有更窄范围。运行时金额 cap 与结构校验分开，不能机械把所有旧超 cap 合法存档截断。 |
| 小数／NaN／Infinity／超安全范围数 | generic intent 指纹只要求 number 有限；领域整数门要求 `isSafeInteger` 和具体范围 | 有限 `1.5` 或 `9007199254740992` 可以被 generic fingerprint 编码，却不能成为合法整数 money。NaN／Infinity 不得经 raw JSON 的 null 转换绕过领域门。 |
| `-0` | JS JSON 编码为 `0`，两种指纹不保留其符号 | 不能用 −0 作为独立 nonce、顺序号或身份；领域若允许整数零，仍应按该字段合同处理。 |
| `nextMemberOrdinal` | 正规范十进制字符串，正则 `[1-9][0-9]*`；分配器使用 BigInt，允许精确表达超过 2^53−1 的顺序值，并检查生成 ID 的命名空间长度 | `"9007199254740993"` 保持精确；拒绝数字类型、`"01"`、`"+1"`、`"1.0"`、`"1e3"`、空白、零和负数，不通过浮点或 Number 中转。 |
| 相关 ID／nonce 字符串 | battleId、requestId、token 等按各自格式作为身份字符串；不能推断其数值含义 | 通用向量中的 `nonce:"0007"` 与 `nonce:7` 不同；这里的 nonce 是值示例，不新增名为 nonce 的产品存档字段。opaque owner／ticket 不能从这类字符串合成。 |

当前整数和存在性门见 [battle-result-validation.ts](../../src/framework/rules/battle-result-validation.ts)、[save-schema.ts](../../src/framework/rules/save-schema.ts)、[member-identity.ts](../../src/framework/rules/member-identity.ts)。`applyBattleResult` 与 App 的结果入口先检查收到的原始形状，再计算 raw hash 或查询 ledger；即使给不合法数值预置一个相同低层 hash 的 ledger，也必须拒绝。来源、内容、模板与持久化校验仍分别执行，hash 不授予来源权限。

## JSON canonicalization 与两类指纹

| 名称 | 身份对象与用途 | 不承担的职责 |
|---|---|---|
| `resultHash`／ledger 中 raw hash | [state.ts](../../src/framework/rules/state.ts) 对收到的 frozen-v1 BattleResult 原值计算稳定 hash。先按字典键顺序规范 JSON，再对 UTF-8 字节做 SHA-256；在物种映射／写回之前取值，保留历史 ledger 的身份。 | 函数本身是旧 JSON serializer，不是形状门：单独调用时，object 的 undefined 被省略，NaN／Infinity 被 JSON 编成 null，还可能执行 JSON hooks。生产入口必须先做原始形状校验。不要为了新语义修改已有 raw hash 或冻结 golden。 |
| `semanticFingerprint` | [semantic.ts](../../src/framework/rules/semantic.ts) 的普通数据 intent／内容／资源快照身份。先检查可处理值、plain prototype、accessor 与 cycle，再规范 JSON 并 SHA-256。 | 它不是所有领域 schema 的共同验证器：finite number 不等于合法整数，未知字段、身份归属、数量范围仍由对应领域门决定。指纹相同不建立 owner／generation／来源权限。 |

对于两者都接受的普通 JSON，编码规则一致，hash 可以相同；区别是所代表的对象、进入前的领域准入和对非 JSON JS 值的处理。不是两套可互换的业务身份，也不能仅因为算法相同把 content／intent hash 填到 raw result ledger。

规范字节蓝本如下；这是当前 ECMAScript 行为的合同，不宣称符合另一套通用 JSON canonicalization 标准：

1. 对象使用自己的可枚举字符串键。一般字符串键调用 JS 默认 `.sort()`，按 **UTF-16 code unit** 比较；随后 `Object.fromEntries` 与 JSON 序列化仍遵守 JS 的 array-index 属性枚举：规范十进制的 0 到 2^32−2 键先按数值升序，`"2"` 在 `"10"` 前，`"01"` 和 `"4294967295"` 是一般字符串键。不能在其他语言中只使用默认 Unicode code point 排序或全键字典排序替代。
2. 数组保持原序；`[1,2]` 与 `[2,1]` 不同，字典录入顺序不同不改变指纹。不能排序队伍、moves、seen/owned、事件或接收决定数组来“稳定” hash。
3. U+10000 的 UTF-16 首码元 D800 小于 U+E000，所以两个一般键按 U+10000、U+E000 排序；若比较 UTF-8 字节，则顺序相反。**排序单位是 UTF-16，最终 SHA 输入是 UTF-8**。
4. 字符串保留原字符，无 NFC／NFD 归一化；`é` 与 `e`＋组合重音不同。JSON 字符串转义、有限 number 表示、−0→0 等遵守当前 JS `JSON.stringify`。合法 JSON 文本中的非配对 surrogate 被编码成转义文本，例如 `"\ud800"`；它不同于直接把一个非配对 surrogate 交给底层 UTF-8 SHA helper（后者按 U+FFFD 编码）。
5. 跨语言实现先对固定 canonical 字符串核 UTF-8 bytes 和 SHA-256，再验证自己生成同一串；不要将本项目 canonicalizer 复制为测试 oracle，也不要在测试运行时重算并覆盖 golden。

[value-semantics-vectors.json](../../experiments/framework-remediation/contracts/value-semantics-vectors.json) 固定 12 组作者手写 canonical 字符串、UTF-8 hex 和离线 Python hashlib SHA-256，包括 numeric keys、UTF-16／UTF-8 顺序差异、absent/null、数组顺序、NFC/NFD、非配对 surrogate、安全整数及 ordinal 字符串和一份合成 v1 result。[test-value-semantics-contract.cjs](../../experiments/framework-remediation/test-value-semantics-contract.cjs) 用 Node 标准 crypto 与 Python hashlib 独立检查固定字节，再调用实际 semantic／result API；Python 检查不重新实现排序或遍历。额外向量证明不合法数值不能借相同 hash 重放，以及 nullable 字段和超安全范围 ordinal 的精确字符串合同。

## 错误与阶段分类蓝本

分类用于宿主和迁移适配器理解具体 API 输出，不新增共同错误基类或抹平各 API 的类型。每个向量应记录：入口、原 generation／owner、返回 status/reason/error、主提交是否已安装、continuation 是否仍活动、端口写次数与最终 saveBlocked。

| 类别 | 常见表现 | 应保留的判断／动作 |
|---|---|---|
| 输入／版本／内容不合法 | `corrupt`、`unknown-version`、`invalid`、`needs-content`、`unmapped-species`，或边界抛出的 `invalid battle result …` | 不修补原值后重试，不清空档；保留原文和精确 path／code，补合法输入、映射或受支持版本。与“业务选择暂不可用”分列。 |
| `refused`／stale／不支持 | `operation-active`、`stale-operation`、`no-effect`、`not-ready`、source unknown/retired 等 | 本请求没有获准自己的写入，不表示别的已提交操作被撤销，也不表示已有 owner 的保存屏障被释放。未知来源不能自动转 legacy。 |
| `pending`／continuation | 等接收决定、学习、图鉴、进化、异步回答；或 `pending:true` 带 receiving token／continuation revision | pending 不等于零写：主结果可能已安装，后续呈现／进化仍待完成。用精确 token/revision 继续，不重新创建主操作或重复消耗。 |
| 已证实零写安装失败 | readback 等于 before；例如对应 API 返回待重试的 commit-failed／error view | 保留同一个 prepared plan／owner，允许该 API 的 retry 或其明确支持的技术退出。不能仅根据字符串 `commit-failed` 推断零写，必须依赖 readback 证明。 |
| 写后异常但安装可确认 | readback 等于完整 next；投影失败、rename 后异常等 | 确认已安装，精确重放返回 already-applied／duplicate，不重复主结果、费用、领取或统计。呈现失败与持久化失败分列。 |
| `indeterminate`／`reload-required` | readback 既不是 before 也不是完整 next，或持久化状态不可确认；可能表现为 pending view 的 `reloadRequired:true`、显式 reload-required 或仍被阻止的技术退出 | 保留 owner／保存屏障与错误事实；不盲重试覆盖、不假装取消，不释放后继到不明状态。只能沿具体 API 支持的恢复／完整宿主重载路径处理。 |

上述阶段分类已有 [test-battle-transactions7.cjs](../../experiments/step5/3/test-battle-transactions7.cjs)、[test-learning-operation.cjs](../../experiments/step5/3/test-learning-operation.cjs)、[test-trade-operation.cjs](../../experiments/step5/3/test-trade-operation.cjs)、[friendship App 集成](../../experiments/friendship-standard-domain/test-app-integration.cjs) 和本批 [App 操作合同](application-operation-contract.zh.md) 的映射；本次值语义增补不将它们计为新跑或新增覆盖。

2026-11-13，本轮值语义 18 项与将 `skipLibCheck` 关闭后的正式能力 5 项一起执行，首轮 23／23 通过，失败／取消／跳过均 0：

```bash
node --test experiments/framework-remediation/test-formal-battle-capabilities.cjs experiments/framework-remediation/test-value-semantics-contract.cjs
```

本轮没有产品机制修改或产品红测；固定字符串／hash 的跨语言自检不构成跨语言业务实现或原版差分。已有 Potion 六向量保持原样，本次未重跑。

## 第二宿主最小试点建议（未实施）

先在 Godot/C# 或 Unity/C# 的无画面适配器消费同一份 Potion JSON；状态读取、一次替换、请求收据和读档 generation 用内存端口表示。对每组输入比较完整候选、HP／物品差量及拒绝分类，再补重复确认、取消和加载后旧请求失效。随后才接一个最小按钮／文本 presenter，保持同一向量和用例入口。

第一轮不接完整战斗、不改存档格式、不导入全部默认 UI。C#／GDScript 先通过本页固定字节和整数向量，再处理业务状态；测试通过只说明所选第二宿主用例，不构成整个引擎迁移完成。本轮仅提供方案和 TS 侧共用向量，没有创建第二宿主工程。
