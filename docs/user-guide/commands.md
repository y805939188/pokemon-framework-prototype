# RPG Maker MZ 插件命令

在 MZ 的事件页选择「插件命令」，再选插件和命令。插件必须按[安装顺序](integration.md)启用。使用独立的 MZ 结果变量；新尝试前清掉旧值，等解释器完成后再判断。传入的成员 ID 是框架成员的稳定 ID，不是菜单行号或 MZ 角色号。

## 队伍、遭遇与训练家

| 命令 | 参数与行为 |
|---|---|
| `PS_BattleFlow → ClaimGrant` | `grant` 指向作者内容的领取记录。首次成功返回 1，重复领取返回 2，拒绝返回 0；成员、道具、金钱与领取凭证作为一次写入，不可用同一幂等领取模拟反复交易。 |
| `HealParty` / `ShowParty` | 前者只治疗队伍，后者打开队伍界面。存档不可用或战斗中不能借这些入口伪造新状态。 |
| `StartBattle` | 指定野生或训练家类型以及对手。1 胜、2 捕获、3 逃跑、4 败/平；0 表示未开战或正常中止。需要真实对战内容及可战斗成员。 |
| `StartTrainerBattle` | 用训练家 ID 和版本定位作者记录；只在本次返回 1 时发章。坏参数、宿主错误、拒绝与战败不可解释为胜利。 |
| `PlayTrainerIntro` / `SetNextBattleMusic` | 显式触发训练家提示或配置下一次战斗使用的音乐；音频资源由工程提供。 |
| `PS_Management → ReceiveGift` / `RecoverAll` | 礼物由应用处理队伍或盒子接收、命名及凭证；治疗全部的范围还受存入治疗设置影响。 |
| `ShowStorage` / `ShowPC` / `ShowSummary` | 进入仓库、PC 或成员摘要。只在合法操作结束后继续事件。 |

败北时 `canLose` 与家配置决定正常继续还是回程。真实回程由 `PS_World` 读取地图与位置，不要只设置一个胜负变量模拟回程。地图遭遇、旅行、伙伴、快捷与显式重试见[地图作者说明](world.md)。

## 背包、商店与徽章

`PS_Inventory` 提供 `ShowBag`、`SelectItem`、`OpenShop`、`UseItemOnMember`、`GiveItems`、`RemoveItems` 和 `ChangeMoney`。道具 ID 来自作者目录，不是显示名。收费、赠送和扣除需要检查实际返回，不能因 UI 关闭就推断已经写入。`SetBadge` 操作徽章，`QueryBadge` 的索引留空时返回数量；指定索引时写布尔值，门禁只认本次布尔 `true`。

## 学习、进化、交易与图鉴

| 插件／入口 | 参数与结果 | 等待、取消及失败 |
| --- | --- | --- |
| `PS_Progression:TeachMove` | `memberId` 稳定ID、`moveId` 登记招式ID、`source` 为 `tutor`（缺省）或 `generic` | 解释器 `psProgression` 等到本次屏幕完成；已会、无候选、最后一招等显示可退出消息；满槽用4＋新招选择。正常放弃零招式写入；技术错误可 `ResumeLearning` 恢复本代 pending |
| `PS_Progression:RelearnMove` / `ForgetMove` | `memberId`；前者仅展示可信首招／等级／前驱候选，后者不允许忘掉最后一招 | 重学三层取消不误作用药取消；独立遗忘允许HM，学新招替换HM被拒。不能把整个物种蛋招表伪装成个体历史 |
| `PS_Progression:ResumeLearning` | 无；只恢复本代既有学习事务 | 无pending时可退出诊断；partial不假装回滚。换档／新游戏退休旧回调 |
| `PS_Inventory:ShowBag`、队伍 Item→Use、`UseItemOnMember` | 后者 `itemId`、可选 `memberId`、`quantity`；省略成员进入正式选择器 | TM/HM不耗、TR按成功来源消费；稀有糖果每次1，经验糖果数量选择。普通糖果先完成成长写集再演出；满级糖果／石头在成功身体提交或正常取消的已批消费规则下结算，技术零写终止不扣。unknown／invalid／无资格零消费、不进动画。恢复界面区分已提交主写和后续失败 |
| `PS_Evolution:EventEvolution` | `event` 非负安全整数、可选 `memberId`；缺省按合法队伍检查。编号匹配不等于已进化 | `psEvolution` 等到本次演出／Info／学习完成；普通等级／事件进化按资格允许BACK取消；石头／交换进化不可取消。最后一帧与成功后输入分别处理 |
| `PS_Evolution:ShowEvolution` | 无；恢复已有本代进化／道具续接 | Retry重试安装或反馈；Terminate仅在before／next可证明时结束，partial保留保存屏障并读最后完整档。ACK后只释放本次已死亡父owner，不碰successor |
| `PS_Evolution:ScriptTrade` | `requestId`、`intent` JSON，例如 `{"outgoingId":"M1","incoming":{"species":"pidgey"},"foreignOwner":{"name":"NPC"}}`；省略 `outgoingId` 进入合格成员选择 | `psTrade` 等到私有草稿的演出／图鉴／学习结束，最后一次替换；仅选择／要约可普通取消。`requestId`标识一次操作，不能当永久领取凭证；本代pending用`ShowTrade`恢复 |
| `PS_Evolution:ShowTrade` | 无；本代pending恢复 | 同一解释器可在下一事件分支读 `this._psTradeOutcome?.status`。未启动／忙／新尝试／clear／terminate会退休旧receipt；不要用上次 `committed` 判断本次成功。`_psEvolutionOutcome`为对应通用别名，非存档字段 |
| `PS_Pokedex:SetPokedex` | `enabled: "true"`／`"false"` | 授予资格不等于解锁所有地区；所有权冲突、安装失败有诊断，不伪装成功 |
| `PS_Pokedex:UnlockRegion` | `region` 数字、`enabled` 字符串；`-1`为全国、`0..N-1`为作者地区 | 显式地区身份依编译布局；不存在的地区拒绝。作者重排数字地区不是自动迁移 |
| `PS_Pokedex:ShowPokedex`／标准菜单 Pokédex | 无；无资格／无可访问条目显示可退出状态 | `psPokedex` 仅等待本次请求。六序、十参数、双属性、37档及两哨兵、Info／Area／Forms；搜索目录可选且必须有来源核验，缺少不妨碍普通浏览／返回 |
| 摘要 Info／Memo／Skills 的 USE→View Pokédex | 非蛋且合格成员；完整单条三页／Forms，保持同一父窗口及暂持 | 单条与简略Info的编号合同有意不同；单条不改列表模式／索引。父销毁、换代、外部转场只清本次子owner，已安装recent不回滚 |
| `PSManagement.selectMember(qualifier, callback)` | `qualifier(member副本)`；返回 `{id,index}` 或 `null` | 格式是稳定ID＋当前队伍位置，不返回成员引用。可战斗选择传 `m=>!m.egg && m.hp>0`，单纯非蛋选择可接受HP0；取消由事件自己写`-1`／空字符串，框架不替作者猜变量号 |

## 地图消息与显示

- [ShowMessage：文字、速度与标签](messages.md)、[ShowChoices：独立选项和内嵌选择](choices.md)、[ShowNumber：逐位数量输入](number-input.md)、[ShowTextInput：键盘、自由文本与光标](text-input.md)。
- [RegisterHallOfFame：冠军剧情显式登记](hall-of-fame.md)；普通胜利不会代替冠军资格。
- `ShowOptions` 打开 MZ 的选项界面，`ShowControls` 打开操作帮助。暂停菜单可查看训练家卡，PC 查看已经登记的名人堂记录。调试命令和 fixture 来源不是普通游戏命令。

## 内容与来源

| 入口 | 用法 | 说明 |
|---|---|---|
| 形态记录 | `species.json` 的记录加 `"form": <1–999>` | 形态 0 是基础形态，每个 ID 必须有；（ID, 形态）唯一；overlay 用 `"target": "species/<id>/<form>"` |
| 来源使用前核对 | `sources.json` 条目加 `"usageCheck": {"checkedOn": "YYYY-MM-DD", "checkedBy": "...", "conditions": "...", "decision": "use-allowed" \| "internal-use" \| "not-allowed"}` | 物种或领取引用一个来源前必须先有核对记录；明确的作者占位（`kind: author-placeholder` + `status: placeholder`）未附核对记录时可使用；显式 `not-allowed` 仍拒绝，Showdown 依赖须唯一登记并通过核对。来源种类新增 `author-data`（作者自己提供的数据） |
| 规则配置 | 可选 `settings.json`，例如 `{"NUM_STORAGE_BOXES": 40, "MAX_PARTY_SIZE": 6}` | 例如可配置 `MECHANICS_GENERATION`（只能 8）、`MAX_MONEY`、`MAX_PARTY_SIZE`（1–6）、`NUM_STORAGE_BOXES`、`BAG_MAX_PER_SLOT`；未知键或越界在编译时定位报错 |
| PBS 导入 | `node js/engine/build/content-cli.cjs import-pbs --file=<pokemon.txt> --source=<来源ID> --src=<作者源> --report=<新报告路径>` | 来源必须已在 `sources.json` 并有允许使用的核对记录，否则什么都不写。只写报告文件（物种记录＋逐条记录的导入、忽略或缺省处理），由作者把记录并进 `species.json` |

空物种、无持物来源的内容可以正常编译、组装和用于配置／纯道具领取，不消费 Showdown；`inventory` 的 `showdownSha: null` 表示没有读取引擎来源。仍校验整个来源登记结构及实际引用的领取来源，畸形记录不会回退为空内容。非空物种在第一次 Dex 查询前检查 Showdown 来源；旧存档成员不在当前内容时，先报告物种缺失，不再查询该成员的外来招式数据。

来源没有许可不代表可对外分发。构建、安装和玩家包的区别见[安装说明](integration.md)及[分发说明](../sdk/distribution-notices.md)。
