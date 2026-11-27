# 地图、遭遇与旅行

本文说明内容作者如何配置地图、遭遇、旅行和事件伙伴，并给出[作者源纯数据示例](examples/world/manifest.json)。示例以现有 `content/sample` 为底，不覆盖工程地图或玩家档。



| 作者操作 | 制作入口 | 使用边界 |
| --- | --- | --- |
| 领取补给、治疗、显示背包 | `PS_BattleFlow.ClaimGrant` / `HealParty`，`PS_Inventory.ShowBag` 插件命令 | 在插件管理器中启用后使用 |
| 地图天气、正式遭遇、地区点和连接 | 内容 JSON + `PS_World` 配置 | 由正式内容编译和运行时采集消费，须在工程中配置真实地图及资源 |
| Fly / Dig / Teleport / 标准框架转移 | `PSFlow.runWorldTravel` 及同一 App | 是异步集成 API；没有同名编辑器插件命令 |
| 道具快捷登记、队伍场外招式和快捷菜单 | `PS_Inventory.ShowBag` 的登记/取消登记，队伍成员菜单，`PS_Management.ShowFieldShortcuts` | 已安装生产入口；快捷命令在当前事件自然结束后开窗，不新增全局按键 |
| 最近中心、洞穴进出记录 | `PS_World.RecordRecentCenter` / `RecordCaveEntrance` / `ClearCaveEscapePoint` | 三条零参数同步作者命令，位置只取真实当前玩家；记录与治疗分开 |
| 伙伴注册、解除、失败回程显式重试 | `PS_World.RegisterEventCompanion` / `RemoveEventCompanions` / `RetryBlackoutReturn` | 已安装生产 357 命令，由 App 管理身份、等待、取消与恢复 |



## 1. 内容源与安装顺序

在 RPG Maker MZ 的插件管理器中保留项目的 Reactor/运行时基础插件，启用 `PS_SaveState`、`PS_BattleFlow`、`PS_Management`、`PS_Inventory`、`PS_World`；`PS_Inventory` 位于 BattleFlow 和 Management 后，`PS_World` 位于 BattleFlow 和 Inventory 后。插件源码的 `.meta.txt` 会在构建时成为编辑器命令及参数说明，不能只复制 TS 文件来安装。

作者内容目录必有 `manifest.json`、`sources.json`、`species.json`、`overlays.json`；使用作者 schema 2。世界文件为可选的 `map-metadata.json`、`encounters.json`、`region-maps.json`、`map-connections.json`，规则配置放 `settings.json`。每份带 `source` 的数据须引用 `sources.json` 中可使用的来源 ID。示例沿用 `author-placeholder`，数值用于制作和验证流程，发布前须替换成有来源的数据。

[示例 manifest](examples/world/manifest.json) 是覆盖操作说明，**不是**交给内容 CLI 的 `manifest.json`。在一个新作者源目录复制现有 `content/sample`，按 manifest 的 `copyToContentSource` 复制五份 JSON 到该目录根；将 `grants.append.json` 的条目按唯一 `id` 合入已有 `grants.json`。保留原物种、来源、地区图鉴和训练家文件，不覆盖已有 `starter` 领取包。`items.json` 缺省时使用当前兼容道具目录；若项目自建此文件，它是完整目录，必须同时保留原领取包及训练家引用的道具。

已有受支持构建和固定 Showdown 暂存的工程可用正式 CLI 检查新目录：

```sh
node js/engine/build/content-cli.cjs build --src=/absolute/new-content-source --out=/absolute/private-output/content.json
node js/engine/build/content-cli.cjs check --src=/absolute/new-content-source --out=/absolute/private-output/content.json
```

这两个命令以工程的内容编译器和 Dex 装配检查为准。编译失败会使指定的旧输出失效，输出应指向可重建的私有路径；编译成功也不能证明地图可通行、图像可加载或 UI 已接线。正式产物应从作者源构建，不手改 `data/framework/content.json`。

这些 JSON 是作者源，须经过正式编译及 Dex 装配规范化后使用，不能直接当作 Session 成员或编译内容。不要从测试夹具复制内部 `ruleSpecies`、未规范化的性别或其它运行期字段来代替作者源。

## 2. 地图、地形与普通遭遇

[地图元数据示例](examples/world/content/map-metadata.json) 以地图 ID 字符串为键。地图 5 为室外草地及 Teleport 治疗点；地图 6 为黑暗洞穴，跨图进入时有 HeavyRain 100% 天气。

| 字段 | 作者填写内容 |
| --- | --- |
| `region` | 已登记的地区图鉴 ID；与城镇地图的 `mapPosition.regionId` 用途不同 |
| `outdoor` / `darkMap` / `alwaysBicycle` | 布尔业务标记；洞穴捕获条件使用 `environment:"cave"`，不是“有 Cave 遭遇表” |
| `environment` | 合法战斗环境 ID，如 `grass`、`cave`、`stillwater` |
| `weather` | `{ "type": "HeavyRain", "chance": 100 }`；chance 为非负安全整数，100 及以上均保证抽取成功 |
| `mapPosition` | `{ "regionId":0, "x":13, "y":12 }`，地区图上的格子，不是 MZ 玩家坐标 |
| `mapSize` | 可选 `{ "width":2, "shape":"1101" }`，供地区投影；不改变原生地图尺寸 |
| `healingSpot` | `{ "mapId":5, "x":10, "y":8 }`，正式进图记录的 Teleport 返回点 |

元数据编译不打开原生 `MapNNN.json` 检查目标通行；坐标还须落在真实地图中，具备有效通行、资源和可接纳的场景。

地形编号没有内置的宝可梦含义。在图块集编辑器给实际地面/水面设置 terrain tag，再在 `PS_World.TerrainTags` 配置含义。[插件参数示例](examples/world/native/PS_World.parameters.json) 的值是插件管理器保存的字符串；编辑器多行框应填相应 JSON 字符串内容。

| 示例 tag | `landAllowed` | `fishable` | `canSurf` | 含义 |
| --- | --- | --- | --- | --- |
| 0 | false | false | false | 无普通草地遭遇、不可钓鱼、不可 Surf |
| 1 | true | false | false | 草地 |
| 2 | false | true | true | 可钓且可 Surf 水面 |
| 3 | false | false | true | 可 Surf、不可钓 |
| 4 | false | true | false | 可钓、不可 Surf |
| 5 | false | false | false | `ice:true` 的冰面 |

`fishable` 与 `canSurf` 独立。Surf 还需要 `SurfPassage` 为 `boat` 或 `ship`、真实原生通行，以及已加载的 `SurfCharacter` 图像；这不会把玩家改成 MZ 原生船只。示例使用现有 `Actor1`/0 作为显示占位，制作时替换为项目自己的有效角色图。缺配置或加载失败会拒绝能力，不猜默认图像。TerrainTags 为空仍可普通移动，但依赖这些事实的遭遇/钓鱼会诊断缺失。

[正式遭遇表示例](examples/world/content/encounters.json) 使用 `{source,tables}`，每表含 `mapId`、有符号整数 `version` 和 `types`。每个类型有 `stepChance` 及有序 `slots`；槽位的 `species` 是已登记基础物种内容 ID，`weight` 为正整数，等级为 1–100 且 `minLevel <= maxLevel`。本例有 Land/Cave、三鱼竿及 RockSmash；鱼竿表的 stepChance 为 0，实际钓鱼走主动入口。

同一地图不得同时放正式表与旧 `<PSEncounter:…>` 备注，两者冲突会诊断并拒绝。模式由实际数据决定：有正式表为 framework；仅有旧备注为 legacy-note；两者都无且 MZ 原生 encounterList 非空为 mz-native；列表为空为 none。没有另设 `<PSEncounterMode>` 备注。MZ“更改遇敌”控制适用的普通随机遭遇，作者显式事件战另行调用。

普通遭遇只在实际完成步之后检查；原地转向、撞墙、伙伴移动、普通传送和读档不会额外计普通步或遇敌。框架自动采集完成身份，事件作者不要再调用 `recordSteps` 或手动追加遭遇。切换版本的当前入口是 `PSFlow.app().setEncounterVersion(version)`，它返回结构化结果；没有同名编辑器命令。未有该版本时按正式版本 0 回退规则查表，不复制新表冒充新版本。

cycling 事实保留现有合法 `isOnBicycle()` 查询；无该方法时，读取一致的原生布尔别名或已证明的未声明状态。非法、矛盾或不可用事实不会伪装成 false。移动开始距离统计只支持其可保护的原生布尔槽，函数查询本身不授予该权限；这不表示已实现骑行/冰滑物理或兼容任意骑车插件，作者无需建立另一套 mode 状态。

## 3. 世界时间、天气与旧事件兼容

世界时间默认取机器当前本地日历小时，不是存档中的游戏时钟。晨为 5–9、昼为 5–19、午为 14–16、暮为 17–19、夜为 20–23/0–4；这些谓词会重叠。`TIME_SHADING` 控制视觉用途，不将业务时间冻结。黄昏球使用开战时锁存的实际时段/洞穴事实，诱饵球使用实际钓鱼来源；`battleTime` 只是背景时段参数。

世界天气可用 ID 为 `None`、`Rain`、`Storm`、`Snow`、`Blizzard`、`Sandstorm`、`HeavyRain`、`Sun`、`Fog`。真实跨图进入按新图元数据判定；同图转移及正常读档重建不重新掷天气。业务天气先变，屏幕可继续淡出，不能读取淡出中的显示类型来决定捕获或进化。HeavyRain 属 Rain 类别，映射普通战斗 rain；Storm/Fog 的派生地形受 `OVERWORLD_WEATHER_SETS_BATTLE_TERRAIN` 控制。

继续使用 MZ 原生“更改天气”（236）制作显示：非战斗调用保留 type/power/duration/wait，业务意图由适配器同步；战斗中原生命令跳过天气和等待。不要直接修改 `$gameScreen` 的私有天气字段。地图元数据和事件天气都由框架持有业务值，宿主单向显示。

`PS_BattleFlow.StartBattle` / `StartTrainerBattle` 的 `defaultWeather`、`defaultTerrain`、`battleEnvironment` 分别接受空白、`none`、`inherit` 或该字段的具体合法值。**旧事件留空仍是 none**，显式 `none` 覆盖世界；显式 `inherit` 使用本次操作锁存的业务世界值，非法值拒绝。真实 357 入口在原字段规范化之前取得只读锁存，经过正式开战接纳再交给 Scene/Session。天气映射和背景时段各自独立，即使三个字段空白/none，捕获仍锁存真实业务时间与洞穴事实，不能用 `battleTime` 或视觉着色替代。

手写 357 JSON 时按命令元数据填写字符串参数：`battleEffects` 为 `"on"`、`"off"` 或默认 `"inherit"`，`battleStyle` 为 `"switch"`、`"set"` 或默认 `"inherit"`。不要把直接 API 的布尔 `battleEffects:true` 或字符串 `"true"` 传入插件命令；该入口会拒绝。完整载荷显式保留两个 `"inherit"` 字段。`StartBattle` 的 `canLose:"false"` 失败后进入框架回程并结束原事件调用链；`canLose:"true"` 让事件收到结果 4 后继续，结算仍由应用层处理。玩家的新游戏使用原生标题入口；普通构件不开放合成队伍的测试命令。

## 4. 地区点、访问记录与 Fly

[地区点示例](examples/world/content/region-maps.json) 的 `regions[].id` 是城镇地图区域；从当前地图 `mapPosition.regionId` 选择，缺定位回退 0，最终区域未登记会报 `current-region-not-registered`。不把它与地区图鉴编号混写。

每个点的 `x/y` 为地区格，`healingSpot` 为真实落地的地图/x/y。Fly 列表依次检查：当前区域、同格第一条记录、完整落点、该落点地图已被正式进入、开关可见性。缺 `switchId` 可见；`switchId <= 0` 隐藏；正开关必须打开。首条隐藏或缺治疗点时，不继续找同格后条。访问当前地图不等于无条件可飞；本例第二点还要求实际访问地图 6 和开关 7 为 ON。

访问由正式进图/读档通知补记，不编造历史访问，不写独立 `unlockedFly` 列表，也不直接改 `visitedMaps`。正常读档只补当前地图。Fly 与图鉴消费同一地区源的不同投影；不要复制两份地区真相。

集成代码可调用 `PSFlow.worldFlyDestinations()` 取得当前构件，用选中的原条目作为 `selection` 调用 `PSFlow.runWorldTravel(requestId, {kind:"fly", memberId, selection})`。真正执行会重验访问、开关、内容及场景；UI 列表不是许可证。Fly 还需户外、徽章及合格成员，且不能有事件伙伴。取消选择用 null，不预写目的地。此 API 返回 Promise，宿主须接住结果并维护自身等待；普通 MZ“脚本”事件不会自动等待 Promise。完整地区地图编辑器不在本期。

## 5. 道具、钓鱼、快捷和场外招式

合入 `world-kit` 领取包后，用 `PS_BattleFlow → ClaimGrant`，`grant=world-kit`、`message=true`、`resultVariable=0` 领取一次。用 `PS_Inventory → ShowBag` 在地图外场选择 Repel/鱼竿/Honey/逃脱绳；它们通过背包真实 ticket 移交到地图执行。地图目标无效、无水面或能力不就绪时会拒绝，不以扣除道具代表效果完成。无目标道具不填假的成员 ID。

三鱼竿分别使用 OldRod/GoodRod/SuperRod 表；水面要有 `fishable:true`。钓鱼计时用可暂停的单调经过时间，真实失焦暂停，不改系统焦点；聚焦时的卡顿仍计入经过时间。`FISHING_AUTO_HOOK` 默认为 false，示例前后公共事件 -1 表示不配置。

普通背包和 357 快捷的“不能在这里钓鱼／无法离开当前位置”资格拒绝使用当前语言的普通消息，仍返回拒绝，不打开错误恢复窗。其它失败仍保留诊断和适用恢复。默认咬钩、钓上、逃脱、无咬钩四条消息随当前 locale；自定义钓鱼表现端口继续负责自身消息，默认 host 中有效的 BEGIN/END 公共事件优先于内置 pattern 序列回退。默认钓鱼行走图已提供有界的图片租约及 reader 恢复接口；按[默认钓鱼行走图资源](fishing-assets.md)配置四帧能力和作者素材。当前项目尚未配置最终素材，真实图片与 NW 验收另行完成。

快捷包括已登记道具和当前队伍可用招式：道具登记持久，有序且去重；丢失道具后不列可执行项；场外招式按当前队伍/徽章/地形派生，每次选择重验，不存招式缓存。可用族是 Cut、Rock Smash、Strength、Surf、Flash、Fly、Dig、Teleport、Sweet Scent。Headbutt、Dive、Waterfall 延期，底层名称目录中出现它们不代表支持。

当前 App 的道具登记用法供宿主集成：

```js
const app = PSFlow.app();
const token = app.beginInventoryOperation();
let result;
try {
  result = app.inventoryRequest(token, "author:register-oldrod:1", {
    kind: "register-item", itemId: "oldrod", registered: true
  });
} finally {
  app.endInventoryOperation(token);
}
```

用 `registered:false` 解除登记；先处理 `result.status`，不要直接改 `inventory.registeredItems`。登记只记录身份，不保证当前有数量或可使用。相同 requestId 重试必须是同一请求；新操作使用新 ID。

玩家可在普通 `PS_Inventory.ShowBag` 的道具菜单选择“登记”或“取消登记”；有当前场外处理器的道具才显示新增登记，已登记项可解除。过滤选择背包、父操作中的背包和商店不提供登记。登记是 App 的 token/requestId 写入，背包 ticket 用于重验选中行，不应伪造 ticket 作为登记许可。

在 MZ 事件中使用 `PS_Management → ShowFieldShortcuts` 打开快捷菜单：请求会等当前事件自然结束后在地图开窗，命令本身不等待菜单，也不修改键位。队伍成员菜单中的“场外招式”已接入同一正式选择链，Fly 使用地区目的地窗，Dig/Teleport 保留转移确认。不要在尚未结束的事件中等待此菜单关闭，否则菜单没有机会打开。失败旅行可用 `PS_Management.ShowFieldRecovery` 请求恢复窗。

自定义宿主可使用 `fieldShortcutQueries()` 获取只读投影，再以 `prepareFieldShortcutSelection(entry, selection, memberId?)` → 真实菜单交接 → `executeFieldShortcut(request)` 执行；选中 DTO 或快照不携带权限。取消/失败恢复仍用对应 App API。上面的登记代码是宿主集成例，玩家使用已安装的背包入口。

局部能力的异步集成入口是 `app.runFieldMove(requestId, action)`，如[数据示例](examples/world/api/field-move.json)。将 memberId 替换为当前真实成员 ID，成员须非蛋并持有该招式，HP 和 PP 不参与这一成员筛选。队伍/快捷入口不能用仓库成员或旧列表绕过当前资格。默认按徽章数量检查：Cut 1、Flash 2、Rock Smash 3、Surf 4、Fly 5、Strength 6；`FIELD_MOVES_COUNT_BADGES:false` 时改按配置索引检查，负数要求豁免，索引 0 仍表示第一个徽章。

Cut/Rock Smash 的菜单资格需要正前方普通事件名分别包含 `cuttree` / `smashrock`，Strength 互动目标的当前普通非跳跃事件名包含完整 `strengthboulder`（忽略大小写，允许前后字符）：默认已安装 OK／前方触碰激活入口，确认后本图置位；激活后方向移动或再次互动推动，继续复用严格双端通行与普通事件位移。仅标 `boulder` 不匹配。巨石自己的位移不计玩家步数；玩家后续真正完成普通移动才计步。忙时不排队旧输入，其它未匹配事件保留原生互动；Cut／Rock Smash 事件自身的直接互动仍须作者接线。Flash 要黑暗地图和有效遮罩，前置文字完成后才提交 `flashUsed`，非黑暗地图进入/恢复清除；缺事实不会当 false。Surf 上水为专用跳跃，不计普通步；真实完成落岸后，由正式完成步链计步一次、清理 Surf 并继续到达事件及适用遭遇，不再补造第二步。事件伙伴会阻止 Surf。直接工具、互动、队伍、快捷的检查集合不同，不能互换 entry 以省略许可。



### 默认音效、暗幕与 Flash 资源

当前生产安装为 Cut 使用 `audio/se/Slash1.ogg`、Rock Smash 使用 `Crash.ogg`、Strength 推动使用 `Push.ogg`；默认 DTO 均为 `volume:90`、`pitch:100`、`pan:0`，播放由原 `AudioManager.playSe` 完成。模块 DTO 校验范围为音量 0–100、音调 50–150、声像 -100–100；当前插件没有自定义这些音效的编辑器参数。声明资源清单缺项会得到 unavailable；这份清单不是运行时文件探测，打包仍须带上实际文件，不能把 DTO 存在当作已听到声音。

黑暗地图已有默认原生暗幕，按真实 `darkMap` 和已提交的 `flashUsed` 重建：初始半径 64 像素，展开后 176 像素，用 20 个更新帧展开并跟随当前玩家。半径/帧数是模块默认值，不是额外的插件参数。缺当前场景、Bitmap/Sprite 或有效暗幕时 Flash 拒绝，业务不把视觉资源当作授权。

编辑器参数 `PS_World.FlashAnimationId` 默认 `40`；空白也取 40，自定义值须为正安全整数且有真实 `$dataAnimations` 记录。本工程动画 40 为“闪光”，依赖 `effects/Flash.efkefc`，其自身音轨还引用 `Flash2` 和 `Sword1`；这些资源也须随工程打包。Flash 等实际原生动画结束、前置文字完成后才提交 `flashUsed` 和次数，再展开暗幕；ID 非法、缺动画记录或未实际启动会在提交前拒绝，展开时故障保留已提交结果。这不是对动画文件的磁盘预检，实际资源加载仍须验收。其它招式仍可走原来的文字演出回退，不为它们承诺 Flash 动画。


## 6. 地图连接与返回点

[连接示例](examples/world/content/map-connections.json) 将地图 5 东边 offset 8 和地图 6 西边 offset 8 对齐。anchor 为 N/S/E/W 或显式 `{x,y}`，offset 为安全整数。它是地图拓扑，不是原生事件 201 的列表；边界动作由真实宿主接纳目标地图、落点、通行和完成步，不能在两图各加一步。连接不制作复杂无缝拼接。

普通 MZ“场所移动”（201）仍走原生流程并保留框架 Surf。集成代码的 `{kind:"transfer", target:{mapId,x,y,direction}, preserveSurfing:boolean}` 则显式选择保留；方向仅 2/4/6/8。保留 Surf 仍要目标水面、姿态资源及通行全部有效。

返回点各有用途：

| 位置 | 来源和消费 |
| --- | --- |
| `healingSpot` | 地图元数据经正式进图记录，供 Teleport 优先使用；`HealParty` 只治疗，不登记最近中心 |
| CharacterHome / GlobalHome | `PS_World` 参数中的 JSON；Teleport 在无治疗点后按此顺序回退，战败回程在无最近中心后按此顺序回退 |
| `recentCenter` | `PS_World.RecordRecentCenter` 记录当前实际地图、玩家坐标及朝向，供战败回程优先使用；不治疗、不改 Teleport 点 |
| `escapePoint` | `PS_World.RecordCaveEntrance` 记录当前玩家身后一格及反向朝向，供 Dig/逃脱绳使用；`ClearCaveEscapePoint` 仅清除此点 |

家参数缺省表示无家；非法 JSON、地图/坐标/方向或 StartingOverSwitch 是配置错误，不当成无家继续。旧三字段家兼容方向 2；新数据写完整四字段。Teleport 总朝下，战败回程保留配置方向。`PS_BattleFlow` 的旧 homeMapId 等参数与本表的新共享家源不同，当前框架应填 `PS_World` 家配置。示例工程已设置 `CharacterHome={"mapId":5,"x":8,"y":9,"direction":2}`。若旧 `homeMapId>0` 且两个新家参数均为空，启动时输出 `legacy-home-configuration-not-migrated` 诊断；此诊断不回退读取旧家，也不改变无家分支。家配置不替代中心/逃脱点的作者记录，Dig/逃脱绳仍需实际有效的逃脱点。

三条地点命令都在编辑器插件 `PS_World` 下，参数对象必须为空；[三条独立 357 片段](examples/world/native/world-location-commands.json) 每项应放入各自适用事件，不能把三项连续粘成一个进洞流程。真实注册由 `PS_BattleFlow` 的安装器完成，因此仍须保留前述插件加载顺序。命令同步返回后解释器才继续作者演出，不额外申请等待；忙碌、待转移、旧代次或失效场景会拒绝。只读诊断 `this._psWorldAuthorOutcome` 给出 `committed`、`unchanged` 或 `refused`，事件应先处理拒绝再安排相应演出，不能把诊断当作运行权限。

`RecordCaveEntrance` 以命令执行时的玩家位置 `(x,y)` 计算：朝下 2 得 `(x,y-1,8)`；朝左 4 得 `(x+1,y,6)`；朝右 6 得 `(x-1,y,4)`；朝上 8 得 `(x,y+1,2)`。坐标保持有符号安全整数，不截为 0，也不保证身后格可通行；作者须把命令放在正确入口位置，并在记录后才做移动或洞穴演出。`ClearCaveEscapePoint` 在出口演出前清空逃脱点，保留最近中心和 Teleport 治疗点。

## 7. 事件伙伴：注册、解除与范围

伙伴是独立的有序事件链，不是 MZ 队伍跟随者。在原地图创建真实普通事件，保留稳定地图/eventId、有效页和图形。[来源事件示例](examples/world/native/companion-source-event.json) 供编辑器照填为地图 5 的新事件 10；若此 ID 已占用，使用新的 ID 并同步注册参数，不能覆盖原 PC/图鉴事件。

以下为正式注册的 `PS_World` 命令；编辑器参数为字符串：

| 插件 / 命令 | 参数（MZ 字符串） | 作用 |
| --- | --- | --- |
| `PS_World / RegisterEventCompanion` | `eventId:"10"`、`name:"guide"`，可选 `commonEventId` | 从当前实际地图来源注册，同一原地图/event 身份去重 |
| `PS_World / RemoveEventCompanions` | `mode:"origin"` + `originMapId:"5"` / `originEventId:"10"`；或 `mode:"name"` + `name`；或 `mode:"all"` | 解除对应来源、同名或全部伙伴 |
| `PS_World / RetryBlackoutReturn` | 无参数 | 由正式私有加载记录选择合法的失败回程重试路径 |

参数以[PS_World 元数据](../../src/plugins/PS_World.meta.txt) 为准。伙伴 handle、owner、generation、prepared source 和回执是运行期权限，作者不创建、不缓存到存档，也不从 `_psWorldAuthorOutcome` 复制权限。解释器等待与取消必须由正式安装器维护。

伙伴注册持久保存来源、显示数据与位置；重复注册不增第二条。正式安装链把玩家实际移动完成通知交给同一个 App，跟随本身不计玩家普通步；连接跨图使用保留的逻辑来源及当前地图渲染坐标，正式读档由新代次恢复原链，也处理空伙伴记录的原生显示清理。作者不另加“玩家移动后”并行事件或手动同步坐标。移除已经提交时，随后显示失败不回滚合法移除；由当前代次有界恢复投影，不靠再执行一次注册修复。原生 216 仍保留作者最新跟随者显示意图，伙伴解除不能擅自把作者隐藏的原生跟随者显示出来；217 gather 不等待事件伙伴。

已知真实冰滑状态为 true 时，伙伴帧更新会整姿并停在静止动画姿势，下一次非滑行更新恢复原动画设置；只有冰面 tag 而缺实际冰滑提供器时会诊断，不能把未知状态当 false。

`commonEventId` 现在仅是持久数据。生产 USE/伙伴互动、伙伴自身强制路线 forcedHandle 尚未安装，不能据此安排点击伙伴执行公共事件。复杂剧情跟随编排按批准合同延期；本指引也不增加病毒、Headbutt、Dive、Waterfall。

## 8. 战败回程、失败重试与保存

回程由战败或野外全灭的正式应用操作启动，选最近中心、角色家、全局家或无家分支；作者不直接写 持久检查点，也不再扣钱/治疗/统计。预定转移不代表抵达；进入目标、显示尾部和实际保存分别完成。

需要直接检查当前队伍时，宿主使用 `PSFlow.checkFieldBlackout(requestId)`；真实 MZ 事件脚本使用 `PSFlow.waitFieldBlackout(this, requestId)`，由正式 command355 的解释器等待桥等待自己的结果。请求只含新 ID，不传 owner、目标或许可；当前空队伍／全失能可进入，可战或不相关忙操作拒绝。不要直接等待另一操作、复制内部凭证或循环重试。

正在执行、等待选择、转移或恢复时正式保存会拒绝，直接调用 `DataManager.saveGame` 也须遵守保存屏障。失败后稳定的合法 checkpoint 才可通过正式保存入口保留；新进程读档恢复只执行未完成阶段。坏档、内容不匹配或迁移失败保留原档并诊断，不退回空的新游戏。存档 schema 与作者 schema 是不同版本，不靠改 JSON schema 号迁移。

显式 `PS_World.RetryBlackoutReturn` 已安装，由解释器等待正式异步结果。它没有目标、checkpoint、owner 等参数；loaded stable-failed 走真实加载 controller，live stable-failed 才走 App 回程恢复。不能把旧 `PSFlow.retryReturnHome()`（旧宿主回家重试）当成稳定检查点的读档恢复入口，也不能反复循环调用 raw `app.recoverBlackoutReturn()` 绕过加载控制。没有 checkpoint、正在恢复或来源已换代次时应处理拒绝/不适用结果，不新造一次结算。

野外全灭先显示两条当前语言的消息，再淡出 BGM/BGS 和画面；收到完成确认才治疗和记数。等待期间拒绝保存。取消或异常只能释放自己仍拥有的表现，不能重做已提交的完成步。

### 升级时保留独占生成开关

Gen8 默认规则已经使用下列开关；**升级已有剧情前请确认这两个ID的用途，选择项目独占ID或把对应配置设为0。** 样例 System 的31/32名称为空不证明无人使用；框架不会自动改名、清值或迁移玩家开关。

| settings.json 配置键 | 默认ID | 对应作用 |
| --- | --- | --- |
| `SHINY_WILD_POKEMON_SWITCH` | 31 | 完整生成在原随机前缀、首队修正和形态登记后强闪 |
| `FATEFUL_ENCOUNTER_SWITCH` | 32 | 完整生成记录 `origin.method=4` |

本提醒覆盖普通／钓鱼／Sweet Scent／canonical generated；given保作者完整个体，旧StartBattle保历史创建。作者内容源的 `settings.json` 是规则名到值的对象，例如合并 `{"SHINY_WILD_POKEMON_SWITCH":0,"FATEFUL_ENCOUNTER_SWITCH":0}` 可分别关闭两项，保留其它既有键；0须为数字。稀疏槽未设、null或undefined按false；非boolean（例如 `setValue(31,1)`）会在生成RNG前拒绝整次生成，不能借原生value()的truthy转换。开关源缺失/非法也不当作false。配置细节、枚举兼容和实际消费者见[野生生成与升级说明](wild-generation.md)。















数据结构见 [world-input](../../src/framework/content/world-input.ts) 和 [world-data](../../src/framework/rules/world-data.ts)，插件命令与参数见 [PS_World](../../src/plugins/PS_World.meta.txt)。
