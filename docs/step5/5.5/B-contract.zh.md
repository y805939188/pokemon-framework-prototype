# 5.5 B 实施合同（2026-11-15）

状态：实施授权有效。该阶段获准实施，可按依赖安排独立批次。固定 037e79e 的新本地基线已实际通过：Node 22.21.1、298 套／5432 项、失败／取消／跳过 0，完整构建 exit 0。基线证据见 [执行状态](execution.zh.md)。本合同记录该阶段的实施约定。

依据：docs/step5/5.5/A-contract.zh.md、README、独立方案审查摘要；正式净化规格 WP02/03/04/11/13/27/28/36/59/61/62/63 及 test-catalog；当前 TS/MZ 宿主。未读原版 Ruby、O/A 适配器或原始输出、真实玩家档、凭据或外盘清理作业。

当前固定读取候选 HEAD 为 037e79ece74a1abfd9ecdeb7420eb7f8fd8e712b，分支 step5/5-world-foundation-20261115。主树核对仅既有 docs/step5/README.md 修改和 docs/step5/5.5/ 未跟踪。已有档案原字节保留，执行合同另立。

## 1. B 交付与依赖

B 交付：正式内容及装配预检、一次持久 schema 升级、时间/天气业务事实、236 兼容、成功读档后一次地图进入通知、无成员目标道具分类和可交还地图的正式底座。复用现有库存、徽章、全局步数、统计、状态仓库、操作代次、票据及幂等安装。B 不实现未具备消费者的复杂场外能力，不把准备或 handoff 称为执行成功。

C 消费遭遇/野生生成和锁存世界投影；D 消费唯一完成步、四模式、136、驱虫/友好/毒伤；E1 消费钓鱼/快捷；E2/E3 消费能力/地区/连接/伙伴；F 消费独立回程地点及可恢复检查点。B 可以定义这些已批准消费者所需的严格字段，不能提前开放缺实现的动作或制造成功效果。

已核对现状：GAME_SCHEMA=9；作者 schema=2；compiled semantics=4。MapMetadata 目前只有 region/flags/darkMap。RegionalDex 是物种布局，不含城镇图点。Inventory 目前只有 pockets/lastPocket/indices。新增字段统一由 B 整合者落单次 schema10；author/compiled schema 是否加版本由明确的输入/语义变化决定，不能和存档版本混用。

## 2. 单一状态权威与持久字段

下列名称是本稿拟冻结的公共接口名；实施前父协调可统一重命名一次，后续作者按同一版本接线。静态 home、玩家实际地图位置和运行锁不复制进第二套可自由改写状态。

```ts
type WorldDirection = 2 | 4 | 6 | 8;
interface WorldPoint { mapId: number; x: number; y: number }
interface WorldLocation extends WorldPoint { direction: WorldDirection }
type WorldWeatherId = 'None' | 'Rain' | 'Storm' | 'Snow' | 'Blizzard'
  | 'Sandstorm' | 'HeavyRain' | 'Sun' | 'Fog';
interface WorldWeatherIntent {
  type: WorldWeatherId;
  strength: number;
  durationFrames: number;
}
interface WorldState {
  repelSteps: number;
  happinessSteps: number;
  encounterVersion: number;
  flashUsed: boolean;
  weather: WorldWeatherIntent;
  visitedMaps: number[];
  surfing: boolean;
  recentCenter: WorldLocation | null;
  healingSpot: WorldPoint | null;
  escapePoint: WorldLocation | null;
  companions: EventCompanionState[];
  pendingReturn: PendingBlackoutReturn | null;
}
// GameState.world: WorldState
// Inventory.registeredItems: string[]
```

| 字段 | 旧档默认/严格验证 | 所有者/消费者 |
|---|---|---|
| world.repelSteps | 0；非负安全整数；内建使用100/200/250，不擅设250存档上限 | Application；B道具，D步后及C允许门 |
| world.happinessSteps | 0；非负安全整数；正常0..127，但合法人工128由下一步129再清0，不能无证把存档上限钳127 | Application；D独立128周期。绝不从 game.steps%128 推导 |
| world.encounterVersion | 0；安全有符号整数，含负；同值比较前仍验证整数 | Application；C精确查询/回退，D装表 |
| world.flashUsed | false；必须严格布尔 | Application；B恢复，E2使用 |
| world.weather | None/0/0；已知9种ID；strength为有限0..60；None强度规范0；durationFrames非负安全整数 | Application保存意图，MZ单向表现；不以显示倒推业务 |
| world.visitedMaps | []；正安全地图ID、无重复；只通过成功进入/恢复补当前图 | Application；E3派生Fly |
| world.surfing | false；严格布尔；宿主姿态/通行是单向投影 | E2业务消费者；B只校验/迁移/提供事实 |
| world.recentCenter | null；合法四元点 | 中心公开记录入口写，F blackout优先；不与healingSpot合并 |
| world.healingSpot | null；合法三元点 | 进入带回程元数据地图时覆盖，无字段保留旧值；Teleport使用后不清 |
| world.escapePoint | null；合法四元点 | 洞穴进入生产/退出清；Dig/绳使用，Teleport/Fly正常尾部清；F按分支清 |
| world.companions | []；有序且originMapId/originEventId组合唯一；严格完整记录 | E3注册/移动/恢复；无源保留记录并诊断，可显式解除 |
| world.pendingReturn | null；严格可辨联合，不允许任意布尔组合阶段 | F持久检查点；与活动锁分离 |
| inventory.registeredItems | []；有序唯一的合法已知item ID；无需当前持有或野外处理器 | InventorySession唯一安装；E1快捷。丢弃/用尽/clear不自动删登记 |

地点的 mapId 使用 MZ 支持的正安全整数；x/y 为安全整数，几何范围需运行加载目标后核验。不能因目标资源暂不可读就改成 null、改选另一个家或悄悄取消 Surf。参考中心旧 -1 哨兵属于来源语义；本基线 schema9 没有该字段，新迁移默认 null。未来识别显式旧来源时须单列规则，不能把任意坏负值都当无记录。

伙伴最小公共记录冻结稳定身份/位置及可见性，E3已按当前MZ公开getter/setter核对外观scalar：

```ts
interface EventCompanionState {
  originMapId: number;
  originEventId: number;
  name: string;
  location: WorldLocation;
  visible: boolean;
  commonEventId?: number;
  appearance: EventCompanionAppearance;
}
interface EventCompanionAppearance {
  characterName: string;
  characterIndex: number;
  tileId: number;
  pattern: number;
  opacity: number;
  blendMode: 0 | 1 | 2 | 3;
  walkAnime: boolean;
  stepAnime: boolean;
}
```

characterName允许合法空串；characterIndex整数0..7；tileId和pattern为非负安全整数，opacity为0..255整数，blendMode严格枚举，两个动画位严格布尔。tileId>0时name必须空、index=0（MZ的setTileImage语义）。不能把pattern钳0..2：当前Reactor支持rrMultiFrames/[fN]。宿主重建后验证pattern<maxPattern()，资源/tileset合法性仍需宿主检查，schema不声称证明素材。外观这八字段是适配当前宿主的实现选择，WP13只给外观克隆合同，不能称参考逐字段等价。运行实例、函数、transferHidden、强制路线执行器、操作令牌不存。

F 推荐最小检查点：结算已完成后才允许进入持久checkpoint，因此不再复制 money/heal/count 布尔；无转移分支同步完成即清，不长期保存target:null的假待转移。

```ts
type BlackoutOrigin =
  | { kind: 'battle'; battleId: string; rawHash: string }
  | { kind: 'field'; sourceId: string };
interface PendingBlackoutReturn {
  id: string;
  origin: BlackoutOrigin;
  branch: 'center' | 'home';
  target: WorldLocation;
  stage: 'ready' | 'awaiting-arrival';
}
```

battle origin引用既有appliedBattles原结果身份，不把required-settlement pairHash误当回程凭证；不能再次扣钱、治疗或加blacked_out_count。field结算、统计和checkpoint同次state replace，不执行战败扣钱。F如需在消息/清理失败后重试更细阶段，必须在其实现前冻结更精确phase，不能靠增加finished布尔拼装。活动令牌/代次/执行中锁在运行态；稳定失败释放本操作锁、保留checkpoint并允许保存。

## 3. 迁移及正式 load 的失败边界（T15）

现有 migrateGame 先按来源schema验证，再复制逐级迁移、最后内容验证；新增必需字段不能倒灌到schema1..9的来源验证，Inventory新增字段同样须schema-aware。结构错误、未知版本、无法映射、关键内容不可用时整次拒绝，原对象/文件保持。成员、库存顺序/数量、金钱、dex布局/历史、徽章、claims、统计、战斗台账等既有数据逐字段保持。

旧宿主天气迁移输入由适配器采集own-data snapshot，经unknown严格验证后作为MigrateOptions的窄可选legacyWeather输入；领域不得读MZ全局。已是schema10时绝不再次从旧宿主天气覆盖框架world.weather。

| 旧天气输入 | 迁移结果 |
|---|---|
| type none | None/0；保留受支持duration意图规则 |
| 已知非none type，targetPower>0且在0..9 | 映射到对应世界ID；strength=6*(targetPower+1) |
| 目标强度0，旧显示type仍rain/storm/snow | None/0；旧淡出不可反推旧类型仍有效 |
| 未知type、缺失/不可用旧快照 | 诊断＋None；不猜新的天气类型 |
| 非法数字/对象/访问器 | 不执行访问器；按冻结输入表诊断None或关键失败拒绝，不能隐式数值强转 |

信息损失：旧MZ非none power0与none淡出可具有相同type/targetPower组合。迁移统一targetPower0→None，并记录这条有限恢复政策；不能声称完整找回旧业务意图。新的236直接读原命令参数，非none power0明确产生强度6，不受旧档歧义影响。

恢复顺序：验证内容及原框架文档→采集/验证候选旧宿主天气→复制迁移→完整候选验证→正式安装→更新Application代次并清旧运行态→地图已实际可用且宿主读档转移已完成→一次合成load进入→访问/回程点/Flash规则及必要姿态投影。黑暗事实不可用时保留flashUsed并诊断，不清、不建遮罩。

T15要求正式 DataManager.loadGame 必须 reject，并走原onLoadFailure，不能仅设置_psSaveError然后返回成功进入地图。当前宿主load会先createGameObjects，extractSaveContents又先baseExtract；实现需在安装前预检候选，并对既有baseLoad在预检前替换的宿主引用采用受控恢复，或用等价可证明阻止半恢复继续的方式。必须测：坏档/未知版本/内容失败时不goto地图、不推进模拟、不保存或覆盖原槽；再次载入好档/新游戏能恢复。单独验证beforeSave禁存不足以通过。

## 4. 世界事实、时间与236

重用现有EvolutionFact的四态，不建立第二种随意fallback语义。拟在world-data导出type alias WorldFact<T>（与EvolutionFact完全相同），具体窄快照：

```ts
interface WorldBusinessFacts {
  mapId: WorldFact<number>;
  hour: WorldFact<number>;
  weather: WorldFact<{ type: WorldWeatherId; category: WorldWeatherCategory }>;
  mapMetadata: WorldFact<Readonly<WorldMapMetadata>>;
  cycling: WorldFact<boolean>;
  surfing: WorldFact<boolean>;
  diving: WorldFact<boolean>;
}
interface HostWorldFacts {
  mapId: WorldFact<number>;
  hour: WorldFact<number>;
  cycling: WorldFact<boolean>;
  diving: WorldFact<boolean>;
}
// GameApplicationPorts.worldHost?: { read(): HostWorldFacts }
```

WorldFact<T>直接type alias现有EvolutionFact<T>，tag为status。host仅供mapId/hour/cycling/diving；app.worldFacts由它与框架weather/唯一surfing/当前内容metadata合成，宿主不能覆盖框架weather/surfing。WorldMapMetadata为既有{region?,flags?,darkMap?}与WorldMapFields的严格组合。天气None必须是value，不是absent。可用元数据缺当前地图条目可给absent；内容/元数据provider失效是unavailable/invalid，不能给false/空对象。cycling/diving只有宿主可信观察证明未处于相应模式才false；没有provider保持unavailable。时间为当前注入现实日历hour，0..23；不存游戏内时钟，不从battleTime/视觉tone推导。day/morning/afternoon/evening/night按WP59 5/10/14/17/20边界，非互斥分区。捕获和战斗锁存由C负责，B供业务事实。

236保持完整MZ合同：战斗中不写业务/显示且不wait；非战斗调用原changeWeather(type,power,duration)，wait=true则原duration帧等待，返回true。业务None立即生效，显示可继续淡出。不能拦Game_Screen.changeWeather造成自身投影回环。非法新框架输入明确拒绝，不按空白处理。5.4旧战斗命令天气空白仍none；显式none覆盖世界；只有新遭遇入口/显式inherit使用锁存世界；weather/terrain/environment逐字段处理，C接线。

## 5. 地图进入和运行态契约（B/D/E共用）

```ts
interface WorldMapEntry {
  id: string; // 本代次内唯一通知身份
  cause: 'new-game' | 'load' | 'transfer' | 'connection';
  previousMapId: number | null;
  mapId: number;
  rebuilt: boolean;
}
interface WorldLocalState {
  strengthUsed: boolean;
  lowerEncounterRate: boolean;
  higherEncounterRate: boolean;
  lowerWildLevel: boolean;
  higherWildLevel: boolean;
}
interface EncounterRuntime {
  graceSteps: number;
  accumulator: number;
  currentMapId: number | null;
  loadedVersion: number | null;
}
```

PS_World是唯一地图进入通知生产者；Application按代次＋id幂等接受。成功恢复后仅登记pending load通知，等onMapLoaded必要performTransfer完成后发送一次；普通无转移Continue同样发送。reloadMapIfUpdated归load，而非显式transfer。菜单/背包返回不发进入；同图显式传送不发进入、保留局部状态；真正跨图及连接才transfer/connection。玩家实际坐标只读宿主当次快照，不另存。

| 事件 | 四笛/Strength | 宽限grace | accumulator | 天气R08 |
|---|---|---|---|---|
| 新游戏 | false | 0 | 0 | 旧图不存在不抽 |
| 读档（含同图reload） | false | 0 | 0 | 同图不抽 |
| 真跨图/连接 | false | 0，装目标表 | 保留 | 旧图存在且ID不同按地图元数据 |
| 同图显式传送 | 保留 | 保留 | 保留 | 不抽 |
| 版本同值 | 保留 | 保留 | 保留 | 无关 |
| 版本异值且上下文可用 | 保留 | 0，装表 | 保留 | 无关 |
| 版本异值但无上下文 | 保留 | 不虚构装载 | 保留 | 无关 |
| 战斗前置、Surf起止 | 保留 | 0 | 0 | 无关 |
| 驱虫允许门拒绝 | 保留 | 按既有前缀 | 0 | 无关 |
| 常规掷失败且本步起始repel有效 | 保留 | 按既有前缀 | 0 | 无关 |

新游戏/读档将运行态重建0/0是本实现政策，明确登记，不冒称WP36单句明文。accumulator可能由负基础概率产生负值，不能擅钳零。宽限首掷拒绝不执行常规失败累加/驱虫清零。D完成步／136／7个makeEncounterCount调用的模式分派留D；B不得提前抢写。

## 6. 内容最小接口与并行边界

复用MapMetadata；新增WorldMapMetadata附加outdoor/alwaysBicycle/weather/environment/mapPosition/mapSize/healingSpot等已批准消费者所需字段。旧region仍为进化/物种dex区域索引；mapPosition.regionId是城镇图ID，不能强等同两个域或改旧进化语义。

```ts
interface WorldMapFields {
  outdoor?: boolean;
  alwaysBicycle?: boolean;
  weather?: { type: WorldWeatherId; chance: number };
  environment?: keyof typeof ENVIRONMENT;
  mapPosition?: { regionId: number; x: number; y: number };
  mapSize?: { width: number; shape: string };
  healingSpot?: WorldPoint;
}
interface RegionMapPoint {
  x: number; y: number; nameKey?: string; descriptionKey?: string;
  healingSpot?: WorldPoint;
  switchId?: number;
}
interface RegionMapRecord { id: number; nameKey: string; points: RegionMapPoint[] }
interface ConnectionEndpoint {
  mapId: number;
  anchor: 'N' | 'S' | 'E' | 'W' | { x: number; y: number };
  offset: number;
}
interface MapConnectionRecord { a: ConnectionEndpoint; b: ConnectionEndpoint }
interface WorldEncounterSlot {
  species: string; weight: number; minLevel: number; maxLevel: number;
}
interface WorldEncounterRecord {
  mapId: number;
  version: number; // 安全有符号整数
  types: Partial<Record<EncounterTypeId, { stepChance: number; slots: WorldEncounterSlot[] }>>;
}
interface WorldContent {
  encounters?: EncounterSource;
  regionMaps?: RegionMapSource;
  mapConnections?: MapConnectionSource;
}
interface EncounterSource { source: string; tables: WorldEncounterRecord[] }
interface RegionMapSource { source: string; regions: RegionMapRecord[] }
interface MapConnectionSource { source: string; connections: MapConnectionRecord[] }
```

内容文件固定为encounters.json / region-maps.json / map-connections.json，对应上述source envelope；全部可选、缺文件则该属性缺省，消费者投影为空。author和compiled保留同shape的source envelope，不能校验后丢来源。每个source走现有source registry/usageCheck同一门；compiled保留确定性和真实inputsHash/contentIdentity。MapMetadata附加字段继续在map-metadata.json，不新建第二份地图元数据。WorldEncounterSlot另名避免legacy EncounterSlot导出冲突。

Fly points保作者顺序，缺switchId不同于0；首条隐藏/不完整不回退；执行/当前区域投影留E3。图鉴地区点是全部可见点并集，不能复用Fly首条过滤。connection保作者顺序，双向索引，运行真实尺寸/落点通行/异步加载留E3。遭遇编译同物种/同等级段合并，再weight desc+species名asc；精确查找含v0回退、existsExact及enumerateVersion分开，不破坏legacy-note既有稳定输入顺序。

SpeciesData三有序野生持物池、JSON/PBS/overlay/runtime与六配置的接线由整合者集中处理，B1仅交独立校验帮助与类型；具体名单见C最终报告§3。字段不得污染赠送/NPC普通创建，野生修正在C消费。

B1独立模块接口：

```ts
type WorldContentFile = 'encounters.json' | 'region-maps.json' | 'map-connections.json';
interface WorldContentProblem { file: WorldContentFile; path: string; message: string }
interface WorldContentValidationContext {
  speciesKeys: readonly SpeciesKey[];
  usableSource(id: unknown): string | null;
}
function checkWorldInputs(
  raw: { encounters?: unknown; regionMaps?: unknown; mapConnections?: unknown },
  context: WorldContentValidationContext,
): { value: WorldContent; problems: WorldContentProblem[] };
function checkWorldMapFields(raw: unknown, path: string): {
  value: WorldMapFields | null;
  problems: { path: string; message: string }[];
};
```

接口输出普通已验证数据；unknown必须验证收窄，不双断言冒充。checkWorldMapFields只处理增量字段；旧region/flags/darkMap和严格总known-keys由整合者现有checkMapMetadata负责。checkWorldInputs的problems非空时value仅供诊断不可安装；整合者扩ContentError精确文件名union。Environment复用rules/initial-field.ts的ENVIRONMENT合法域，weather/category使用WP59九类的固定映射。

## 7. 无目标道具分类与handoff（B/E1/E2）

```ts
type NoTargetFieldItemAction =
  | { kind: 'repel'; steps: 100 | 200 | 250 }
  | { kind: 'flute'; color: 'black' | 'white' }
  | { kind: 'sweet-scent' }
  | { kind: 'escape-rope' }
  | { kind: 'fishing'; rod: 1 | 2 | 3 }
  | { kind: 'sacred-ash' };
interface FieldItemHandoff {
  token: string;
  generation: number;
  requestId: string;
  itemId: string;
  entry: 'bag' | 'shortcut';
  action: NoTargetFieldItemAction;
}
```

规则分类由真实catalog effect/identity确定，不按显示名猜；未知类型保持not-ready。inventory票据/代次/内容/库存校验复用InventorySession。Application创建并拥有一次handoff，背包关闭时把所有权交给同一应用的地图操作；不能把UI返回对象当可自行构造的执行授权。地图就绪后再重新核当前地图/资格/库存；重复/旧代次/读档/新游戏/场景失效均不重做。不在UI关闭时预扣地图动作；成功后的消费由Application统一完成一次。正常成功后宿主消息失败不再重扣。

现有圣灰保留原正式路径；驱虫B可纯规则提交repelSteps+库存+统计，活动驱虫拒绝叠加。鱼竿留E1执行，绳/甜蜜留E2；B只有明确handoff/未具备handler的refused或deferred，不返回伪成功、不先扣。HONEY最终由消费者报告效果成功，即使天气阻挡或无遭遇也按WP28消费，不能以是否开战判成功。

正式缺口FLUTE-MAP：WP36明确旧率黑降/白升；WP02/28/36未明确黑白身份在等级模式对应升降，以及用另一笛是否清除哪些局部标志。B先保留black/white typed分类和四语义局部flag，不凭记忆补映射；完整笛效果和T22需净化补充或明确授权的框架约定，作为未覆盖记录。此缺口不阻塞其他B内容/迁移/事实/底座。

冻结给MZ层的最小Application方法和具名handler端口，不让插件直接replace状态：

```ts
worldFacts(): Readonly<WorldBusinessFacts>;
enterWorldMap(entry: WorldMapEntry): WorldOperationOutcome;
setWorldWeather(intent: WorldWeatherIntent): WorldOperationOutcome;
prepareFieldItemHandoff(inventoryToken: string, requestId: string,
  ticket: InventoryTicket, entry?: 'bag' | 'shortcut'): FieldItemHandoffOutcome;
runFieldItemHandoff(token: string): Promise<FieldItemRunOutcome>;
cancelFieldItemHandoff(token: string): WorldOperationOutcome;

type WorldOperationOutcome =
  | { status: 'committed' | 'unchanged' | 'duplicate' }
  | { status: 'refused'; reason: string };
type FieldItemHandoffOutcome =
  | { status: 'handoff'; handoff: Readonly<FieldItemHandoff> }
  | { status: 'refused'; reason: string }
  | { status: 'cancelled' };
type FieldItemRunOutcome =
  | { status: 'completed' | 'duplicate'; itemId: string; consumed: boolean }
  | { status: 'cancelled' }
  | { status: 'refused' | 'failed'; reason: string };
interface FieldItemExecutionRequest {
  readonly owner: Readonly<{ token: string; generation: number }>;
  readonly itemId: string;
  readonly action: NoTargetFieldItemAction;
  readonly entry: 'bag' | 'shortcut';
  readonly initialMapId: number;
  assertCurrent(): void;
}
type FieldItemExecutionResult =
  | { status: 'completed' }
  | { status: 'cancelled' }
  | { status: 'refused' | 'failed'; reason: string };
interface FieldItemExecutionPort {
  execute(request: FieldItemExecutionRequest): Promise<FieldItemExecutionResult>;
}
// GameApplicationPorts.fieldItems?: FieldItemExecutionPort
```

entry缺省bag；B背包用bag，shortcut仅后续E1调用。prepare捕获合法mapId和inventory/content票据，创建队列锁；UI按现有endInventory关闭，地图ready再run。run在执行前重验map/代次/内容/库存；assertCurrent约束操作token及代次，每个宿主异步边界应调用。执行端口completed仅表示该具名效果正常完成；消费由App按catalog和动作语义决定，不接受宿主传入consume/qty。缺handler返回refused(field-handler-unavailable)，不消费。重复run不得再次调用端口或扣货；取消、失败、场景关闭仅释放自己的锁。读档/新游戏使旧token及迟到completed无效；已提交的领域前缀保留，不承诺回滚宿主效果。B需用fake execution port证明这些完整生命周期，不因真实鱼竿/能力留E就略掉底座测试。

B内建repel使用纯规则，sacred-ash复用当前成员无目标计划；flute在正式映射缺口关闭前refused(flute-mapping-unresolved)；其余动作只调用fieldItems具名端口。E1/E2未来需要自己的子操作时使用同owner作明确父子接缝，不能临时关闭锁或回调直接写GameState。D续驱虫需要同父步骤token/generation的专用过滤选择能力，不能伪造InventoryParent.memberId；该接口在D实现前集中补齐。

快捷游标本期采用运行期记忆；持久只保存A明确要求的registeredItems。WP27的[0,0,1]三个坐标完整域没有净化定义，不能为似真兼容猜造存档字段；如后续要精确参考游标持久，先补净化合同并登记迁移，不让E1擅升schema。

## 8. 精确文件所有权（至少三名安全并行）

| 负责人 | 独占可写文件 | 不触碰 |
|---|---|---|
| B整合者（本agent） | src/framework/rules/state.ts、save-schema.ts、types.ts、config.ts、inventory.ts、item-catalog.ts、item-families.ts、item-effects.ts、rules/index.ts；content/schema.ts、compile.ts、progression-input.ts、pbs-import.ts；flow/content-runtime.ts；tools/content-cli.ts；app/index.ts、game-application.ts、ports.ts、inventory-session.ts；framework/index.ts、production.ts、composition.ts中确需整合处；新rules/world-state.ts、rules/field-items.ts、app/world-operation.ts；B schema/app/迁移测试 | B1/B2新模块、已有归档/证据；不修改别人的产品文件 |
| B1内容作者Sol（E23预检agent） | 新src/framework/rules/world-data.ts、新src/framework/content/world-input.ts、新experiments/step5/5/test-world-content.cjs；自己的独立fixture目录 | 所有现有共享文件、schema版本、CLI/compile/runtime/export、主sample |
| B2宿主作者Sol（E1预检agent） | 新src/plugins/PS_World.ts、PS_World.meta.txt、plugins/world/world-host.ts、world-facts-mz.ts、world-weather-mz.ts、world-entry-mz.ts、field-item-host.ts；在父给接线窗口后独占PS_Inventory.ts、PS_SaveState.ts、PS_BattleFlow.ts、plugins/application-host.ts；独立fake-host测试文件 | framework共享文件、D完成步/136、E复杂能力、源Reactor runtime |
| 父协调/整合者串行 | scripts/test-headless.sh、src/package.json、js/plugins.js、sample/manifest/source、交接与execution文档、构建和完整测试 | 历史归档原字节/证据源 |

B1先交world-data类型/函数签名；整合者只import不抢写。B2先写独立适配模块和fake-host夹具，等Application窄API到位再一次接现有入口；共享入口只能一个作者持写窗口，接线完成再交回。B整合者如要改B2列出的文件，先交接窗口，不能同写。各作者只做自己定向测试，不并发重建相同js/engine/build或distribution；需要产品构建由父安排串行。NW只能父协调独占。

文件名是已知必要范围，不授权顺手重构全部既有文件；若运行检查发现新增必要调用者，应先告知负责人后纳入同一整合窗口。新代码无显/隐式any；unknown边界必须验证，纯core无MZ/Node/DOM/真实时钟访问。

## 9. B登记测试、RNG与P-5唯一方案

B定向验收：T07之236、T09三态兼容、T10世界时间/洞穴/进化不可用边界、T11无目标分类/移交、T15来源版本/坏档/正式load失败、T18恢复及Flash生命周期底座、T22无目标笛/局部生命周期（映射缺口保留）、T26读档进入；同时覆盖T05旧代次/正式保存门。T16/G正式链及NW不因B通过而签收；T01–07的完成步/136、T19/T23属D，复杂能力/连接/伙伴执行属E。

最少反例：新字段严格布尔/数值/有符号版本、非own数据/访问器、重复登记及未持有合法登记、迁移无源变更、所有旧成员库存金钱台账不变、未知新版本、好档/坏档交替、无框架旧档正式空状态、直接load失败而不是只禁存、普通Continue和reload均一次通知、同图传送/菜单返回零通知、失效回调不写新代次。

R08：真实跨图有Weather字段才一次random(100)；p0/p100/p>100都抽；缺字段/旧图0/同图/同图读档重建不抽；抽后同最终类型才跳写入，不能省抽。缺字段的新地图清旧天气None。依据WP59§4.2–4.3、WT07–09。

R12：视觉独立状态与业务注入分离，插入0/1/100次视觉更新不改变业务trace及结果；Storm稳定/渐变/HeavyRain对照；Snow random(4)→2,1,0,-1，Storm duration random(3)→40,60,80、interval random(12)→0.5..6，水花random(20)→0.30..0.49。规格未定同帧视觉抽取先后，本实现自选次序须标明，不能称原版逐次已核实。B若只交事实/天气意图而未实现粒子，R12在B验证“零视觉消费”和业务接口隔离，粒子向量仍留D/E/G，不标通过。

P-5唯一版本采用C最终报告：[P-5 统计冻结](P5-statistics.zh.md)。N=100000，20个P01–P20边际，alpha=.01；L=ln4000，d=sqrt(2*N*p*(1-p)*L)+2*L/3，整数区间ceil(Np-d)..floor(Np+d)。唯一根ASCII为PF55-P5/v1/20cells-100000/20261115，SHA256 ec8ca372e4176c01ffd809e2e11579a70867ace6ff4537d91faa5238c7276d6b。详细20格条件/区间、SHA256 counter/大端uint32/拒绝采样、连续步链oracle及失败解释只引用该文，不混入其它候选容差，不扩m而保留旧区间。参数固定后失败保留，不能换seed或扩大容差重跑求通过。

## 10. 验证与剩余门槛

产品写入前：父确认Node22.21.1完整baseline、当前活动目录/构建写入者已核对；按本稿已冻结外观scalar和NoTarget最小API分工。现有298套是否通过仅引用父的真实新结果，不能用历史通过替代。父新execution/B合同记录用户授权已覆盖归档旧“暂停”条款，并把R02改读“均须有向量”、R04补威吓/锐利目光50%门及本稿P5唯一链接；原A/README/sources保持原字节。

B签收前：类型/边界/构建、B定向测试、来源schema1..9→10/坏档/unknown-version和正式load失败、完整regular按受测候选跑完；记录新增套数而非继续声称固定298。B2的fake-host不是正式NW。最终独审用用户指定Astra ultra，fast无法由工具参数确认时如实写；不推送/合并main。

参考准备报告：/tmp/pf55-d-host-preflight-20261115.zh.md、/tmp/e23-preflight-20261115.zh.md、/tmp/pf-5.5-f-return-preflight-20261115.md、C上述唯一最终报告。它们均为只读净化规格推导，不是新动态通过或原版对照证据。

剩余：正式FLUTE-MAP净化缺口；快捷游标完整域净化缺口按运行期政策登记；F如果要更细失败恢复phase，须在F实施前修订合同；真实Surf位置/姿态、伙伴失源、转移完成/自动保存、统计与NW/冷Continue仍待相应批次。当前无阻止编写本准备稿的权限阻塞。
