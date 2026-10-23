# 第五步命令与作者入口（5.0 起）

第四步的命令表（[../step4/commands.md](../step4/commands.md)）继续有效。下面列5.0起新增或改变的部分；5.1的M中途复核已通过，正式管理UI已进入作者候选，最终固定SHA验收与J独立复核结果见候选记录。

## 内容

| 入口 | 用法 | 说明 |
|---|---|---|
| 形态记录 | `species.json` 的记录加 `"form": <1–999>` | 形态 0 是基础形态，每个 ID 必须有；（ID, 形态）唯一；overlay 用 `"target": "species/<id>/<form>"` |
| 来源使用前核对 | `sources.json` 条目加 `"usageCheck": {"checkedOn": "YYYY-MM-DD", "checkedBy": "...", "conditions": "...", "decision": "use-allowed" \| "internal-use" \| "not-allowed"}` | 物种或领取引用一个来源前必须先有核对记录；明确的作者占位（`kind: author-placeholder` + `status: placeholder`）未附核对记录时可使用；显式 `not-allowed` 仍拒绝，Showdown 依赖须唯一登记并通过核对。来源种类新增 `author-data`（作者自己提供的数据） |
| 规则配置 | 可选 `settings.json`，例如 `{"NUM_STORAGE_BOXES": 40, "MAX_PARTY_SIZE": 6}` | 本版读 `MECHANICS_GENERATION`（只能 8）、`MAX_MONEY`、`MAX_PARTY_SIZE`（1–6）、`NUM_STORAGE_BOXES`、`BAG_MAX_PER_SLOT`；未知键或越界在编译时定位报错 |
| PBS 导入 | `node js/engine/build/content-cli.cjs import-pbs --file=<pokemon.txt> --source=<来源ID> [--src=content/sample] [--report=build/pbs-import.json]` | 来源必须已在 `sources.json` 并有允许使用的核对记录，否则什么都不写。只写报告文件（物种记录＋逐条记录的“未导入/后续批次/忽略/覆盖/缺省”），由作者把记录并进 `species.json` |

空物种、无持物来源的内容可以正常编译、组装和用于配置／纯道具领取，不消费 Showdown；`inventory` 的 `showdownSha: null` 表示没有读取引擎来源。仍校验整个来源登记结构及实际引用的领取来源，畸形记录不会回退为空内容。非空物种在第一次 Dex 查询前检查 Showdown 来源；旧存档成员不在当前内容时，先报告物种缺失，不再查询该成员的外来招式数据。

## 存档

- **当前候选 schema**：schema 5。保留 `form`、图鉴内容 ID、`stats`（74 个字段）和 `steps`；增加个体元数据、`player`、`nextMemberOrdinal`，扁平 `boxes` 改为 `storage` 固定 40×30 槽。
- **旧存档迁移**：schema 1–4 在读档时迁移，需要当前内容；schema 1–3 另需物种映射。
  - **内容读不了**：`_psSaveError.code` = `needs-content`。
  - **有物种映射不到**：`unmapped-species`，`problems` 列出每个位置。
  - **原始状态保留**：两种情况都原样保留原始框架状态，并拒绝之后的任何存档（`state-unusable`，写明槽号），原存档文件不被覆盖。新游戏或读入可用的存档后解除。

## 插件

- **计步**：玩家每走一步，框架步数加 1；强制移动路线或事件运行中不加。当前值在 `PSFlow.game().steps`，最近一次结果在 `PSFlow.lastSteps`。
- **统计**：`PSFlow.game().stats` 记录战斗统计（野生/训练家胜负、战败扣款累计、全灭次数），`StartBattle` 的 `canLose = true` 时不算全灭。
- **容量**：来自内容的规则配置，没有时用 Gen 8 默认（队伍 6、盒子 40×30、每种 999、金钱 999999）。

## 测量与测试

`test-cold-source5.cjs` 保留原17项并增加空/非空 × 5种来源状态 × 组装/正式插件/CLI边界，全部在独立冷进程运行；可用 `PF_COLD_SOURCE_ROOT=<新包的 app.nw 目录>` 验证包内实际产物。开发树和包内套件新增 `empty-source` 模式：真实宿主冷加载、旧存档成员诊断零外来数据/零保存，最后合法非空正例确实加载数据。

| 目的 | 命令 |
|---|---|
| 核心计时（满盒子、大背包，无窗口） | `node experiments/step5/perf-core5.cjs [次数]` |
| 反向验证 | `node experiments/step5/probes/unfix5.cjs [id...] > out.json` |
| 无头 SaveStore（工具/测试） | `new SaveStore(file, hooks, speciesKeyResolver(content), content)`；夹具世界显式传 `identityKeys`。不给映射时旧档和带物种名的结果都被拒绝 |
| 重新生成第四步迁移样本 | `node experiments/step5/fixtures/gen-step4-saves.cjs --root <c789620 检出，已构建引擎和 Showdown>` |
| 包内性能（含 5.0 的满盒子/大背包/打开队伍界面） | `scripts/run-package-perf-mac.sh 3 <证据目录>`（弹窗口） |
| 100 场内存 | `PF_PERF_ARGS="--ps-perf-rounds=25 --js-flags=--expose-gc" scripts/run-package-perf-mac.sh 1 <证据目录>`（弹窗口） |
| 对照性能预算（只报警） | `node scripts/perf-budget.cjs <perf-summary.json> [--memory100=<100 场的汇总>] [--out=<报告>]` |
| 无头测试且不允许跳过（CI 用） | `PF_NO_SKIP=1 scripts/test-headless.sh` |

## 5.1 M 阶段 API 与兼容变化

这些是模型/应用接口，正式 UI 和作者事件示例在 M 通过后的 F/H 交付。不要用它们把本候选标为完整 5.1。

- `GameApplication.commitResult(result, options)` / `PSFlow.commit(result, options)`：含 `captured` 时必须给 `options.templates[id]` 完整个体模板，缺失返回 `no-template`，包括重放已应用结果。`finishBattle` 使用应用创建战斗时保留的同代次模板。模板不扩充冻结 v1；原始结果的 hash 不变。
- 缺少昵称/放置决定返回 `pending`；`pendingReceiving` 提供只读模板和 token，用 `resolveReceiving(token, decisions, signal?)` 恢复。决定形如 `{[id]:{nickname:{kind:'keep'},placement:{kind:'box'}}}`；替换必须给 `{kind:'replace',target:{id,position:{kind:'party',index}}}`。正常设置默认 `{mode:0,naming:0}`；无交互的受控调用者须显式传 `profile:{mode:1,naming:1}`。`StartBattle` 的显式 `forceParty` 优先，不能借自动档把新成员送盒。
- pending 保留模板、原始结果、保存锁和代次。仅明确的 `scene-aborted` / `rebuild-failed` 允许同代次故障兜底；失焦/超时不触发。提交后的 `receivingNotifications` 保留具体去向，呈现成功才 `acknowledgeReceivingNotification(token)`。换档/新游戏通过 `stateReplacedByHost()` 使旧 token、会话和回程回调失效；读档数据恢复与上层场景切换职责分开，正常菜单整合由 F 验证。
- `claimGrant(id, options?)` 和 `receiveGift(request, options?)` 也采用 pending/决策合同。普通、静默、仅队伍和外来新赠送缺等级默认为 1；`party-silent` 缺显式等级返回 `level-required`。已有个体不重抽；含蛋或邮件的新赠送暂拒绝，不扩入培育/邮件流程。多成员领取的成员/物品/金钱/凭证/图鉴一次提交。
- `beginManagement()` → `manage(token, requestId, request)` → `endManagement(token)`：操作用成员 ID+权威位置及预期目标；requestId 回执仅在内存、有界 256 项，重入不得改请求内容。暂持链只保存意图；切盒、盒名/墙纸、标记、持物、招式/缎带排序立即提交；`cancel-held` 只撤移动，达到回执上限仍允许取消。暂持未解决时禁止结束和保存。换档使管理 token 失效。
- `healParty()` 仍只治疗队伍；`recoverAll()` 在存入治疗关闭时治疗队伍和盒内，开启时仅队伍。存入治疗只在成功提交后生效，并保留 `readyToEvolve`；蛋不治疗。
- 实验能力 `allowHeldItemSources` / `allowExperimentalHeldItemBattle` 独立默认 false，仅构造或 `PSFlow.developerCapabilities` 开发者注入；初始化前注入，不能写 settings、玩家参数或存档。来源开不等于允许入战，入战开不等于允许新来源。旧持物保留且可取下。实验开战和结果含“战后持物写回未完成”，正常玩家带物战斗仍未开放。带物来源即使物种表为空，也要先通过 Showdown 来源门再查询物品。

### 迁移与作者配置

`NUM_STORAGE_BOXES` 现在只接受 40；5.0 的 1–1000 作者配置是兼容收窄。内容编译和加载都定位实际值并整份拒绝，CLI 失败退出，不警告后改用 40。`MAX_PARTY_SIZE=1..6` 保持，已有队伍超过较小配置时不截断。

旧盒成员超过 1200 时返回 `capacity-exceeded`，含来源版本、partyCount、boxMemberCount、limit=1200 和首个超额路径；原档及内存原文保留，宿主阻断所有槽覆盖保存。该档本期不能继续游玩，没有恢复工具；5.0 也没有整理/导出能力，不能建议回旧版取出。恢复/导出工具仅是未来候选。不要自动扩容、截断或写溢出区；建议用户自行保留原文件，不新增自动备份写入路径。

缺少旧资料按兼容默认补齐，可信性格/性别/特性不重抽、缺异色 false、PID 确定且稳定。未知历史来源显示未知；旧 Owner 显示旧 ot 名（缺失才 player）+00000，并标注兼容默认，不能当历史事实。新的实体 ID 为 M+base36 序号；PID 可碰撞，不能代替实体 ID。冻结夹具/协议仍保持原字节，真实流程断言使用实际返回的 ID。


### M 复核后的消费边界补充

捕获来源检查覆盖公开commit、finish、pending恢复与纯`applyBattleResult`；默认关闭时，在读取content或Dex之前拒绝新持物。公共commit options不能覆写应用构造时的能力。纯核心受控调用须显式提供`heldItemSource:{allowed:true,describe}`，describe是先核对来源许可、再返回holdable/mail描述的端口，不是任意物品都允许的兜底。应用默认Dex适配器仅消费由组装器标注`meta.showdownSourceChecked`的运行时内容；该标注是本次来源核对事实，不是实验开关，不写GameState或compiled文档。自定义`describeHeldItem`同样承担其来源使用前检查。来源开启仍不隐式打开入战能力。

强制接收预演无合法换出目标时，setup为`noBall=true`并给`forced-party-no-target`；战斗可以正常进行，但投球拒绝且不扣球。无目标的已知前置条件不会推迟到成功捕获后再要求UI解决。若外部代码在战斗开始后破坏权威数据，按原恢复合同保持pending和模板，不偷偷丢弃/送盒。

旧档新增白名单元数据只在缺失时默认；显式null坏类型、firstMoves/ribbons字符串等会返回invalid并保持原档。`SaveStore.load/commit`是正常受保护读取/战果入口；低层`save(state)`不执行读取原档保护，外部调用者须自行验证目标及状态，不能把MZ全槽保存门泛化为任意外部写文件保证。

## 5.1 F/H 作者入口（候选；最终验收未完成）

在 `PS_BattleFlow` 后启用 `PS_Management`。标准菜单的队伍入口和旧 `ShowParty` 命令进入可管理界面。地图5新增电脑示例；队伍为空时菜单入口禁用。界面使用本项目绘制的文字卡片/色块和MZ窗口皮肤作为占位，未声称有宝可梦正式美术。

| 入口 | 参数/结果 | 责任 |
|---|---|---|
| `PS_Management:ShowStorage` | 无；PC选择整理/取出/寄放 | 40×30固定，满队禁取出、最后可用禁寄放 |
| `PS_Management:ShowSummary` | `id`稳定成员ID | 摘要5页、蛋1页，读取副本，命令返回到调用场景 |
| `PS_Management:ReceiveGift` | `request`为JSON，例 `{"kind":"normal","member":{"species":"PIDGEY","level":5}}` | 正常接收询问命名，pending时事件等待；仅队/静默/外来模式见应用合同 |
| `PS_Management:RecoverAll` | 无 | 按depositHeal配置恢复，不偷改HealParty职责 |
| `PSManagement.selectMember(qualifier, callback)` | qualifier在打开时按成员副本缓存；callback收到`{id,index}`或null | 选择确认前仍按当前身份/位置复核；自定义事件负责消费结果 |
| `PSManagement.hasBoxLink = () => …` | 开发者只读判据，默认false | AND：持有Box Link、开关35关、当前地图未DisableBoxLink；缺上下文关，快速调序期间关。正式取得来源到5.2 |
| `PSManagement.retryReceiving()` | 成功打开true，无pending/已有根场景false | UI异常后重建；不通过失焦/超时猜测“用户取消” |

输入：方向键、Enter/Z确认、Esc/X返回、Shift在队伍快捷调序、在整理盒子仅切换快捷模式（USE再拿起/放下/交换）、A/PageUp与S/PageDown切盒、Ctrl在队伍打开合规Box Link、在盒子回到盒名位置；检索保留在盒名命令菜单。摘要Shift标记，招式/缎带页确认进入详情后选择交换。标记有独立确定/取消，ACTION对缺槽只清除不补槽。昵称10个Unicode码点，盒名12；IME组合输入不提交半成品。昵称询问否保留旧名；输入接受空值/Esc清空昵称；盒名空值/Esc保留旧盒名。

暂持成员只存在管理会话的移动意图中；当前权威存档仍保有原位置。切盒/改名/墙纸/标记/持物立即各自保存，取消只撤销本次移动。正常退出前必须放下；明确确认取消移动可恢复。宿主换档会废弃旧UI、输入和代次，旧回调不允许弹出/解锁新操作。

`app.previewReceiving(token,decisions,completedCount)`只预演已完成接收选择，供多成员奖励依序呈现正确队伍和目标引用；不写状态/领取凭证。完整决定提交后一次原子安装。捕获结果缺完整个体模板直接`no-template`，旧无交互公开调用缺接收决定返回`pending`；这两个是已评审的兼容收窄，不能返回成功或在测试里跳过。正常捕获结束从战斗场景直接交接接收，保持同一操作/保存锁，不重建第二场战斗。

加载分层：`DataManager.loadGame`/SaveStore恢复数据和迁移，**不负责**选择UI场景。标准MZ Scene_Load执行完整场景切换。自定义事件直接调用loadGame成功后，必须按自己的流程清理旧场景并goto Scene_Map、onAfterLoad；不应对旧UI继续发送输入。此分层是设计边界，不能把直接数据恢复无自动切换当作缺陷。

只有真实场景中断`scene-aborted`，或真实构建异常、一次重建仍失败`rebuild-failed`，才请求应用兜底；失焦、测试超时不触发。下一健康地图展示实际接收目标盒名后才ack通知。若仍无合法强制入队计划，保持pending/保存锁，不丢成员。实验来源及实验带物战斗仍为两个默认关的非持久开发者开关，界面显著提示战后写回未完成。提案见 [持物契约](5.1-held-item-contract.md)。

示例工程在System配置中保留开关35 `PS: Disable Box Link`，默认关。自定义工程若未定义该开关，Box Link上下文视为缺失，入口关闭；不能把MZ对越界开关返回false当成有效的“关闭”配置。该预留不改其他开关，也不提供Box Link物品来源。

接收成功后的通知使用提交后的ID/位置查询，显示实际队伍或盒名；不会在未决结束页预告送盒。捕获、接收UI的重复回调按操作+成员ID去重，通知历史最多32个操作，换档/新游戏清除；故障恢复的应用通知仍由下一健康地图呈现后ack，避免重复显示。静默赠送不因此变成普通交互。

原生文字输入会消费最初的Enter/Esc，而MZ看不到该keydown；适配层显式屏蔽这个物理键直到keyup，覆盖输入节点或整个场景已移除的情况，防止浏览器repeat误选下一项。每场景输入监听器清理；插件有且仅有一个常驻keyup监听器和一个blur监听器，不保留旧场景。blur只清输入缓冲，不提交、取消或兜底接收。

J 整改兼容收窄：`commitResult` 在会话创建中或战斗运行中均拒绝（`battle-active`），本战只由 `finishBattle`/接收流程提交。无活动战斗的显式手工提交仍支持。旧档性格接受登记的25种名称及既有大小写拼写（保持原值），性别仅M/F/N；明确未知/空字符串拒绝，缺失默认只适用于旧schema。只读检索的显示名回调接收隔离副本。管理初始化失败完整重试一次，仍失败显示可退出诊断，释放自身管理令牌；T1仍保留原档和全槽保存阻断。
