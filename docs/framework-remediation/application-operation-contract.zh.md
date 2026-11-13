# GameApplication 操作、parent 与代次合同

本合同整理现有公开行为和检查位置，保持当前用例类及 ownership 结构。App 自己拥有活动操作与代次；宿主提供状态、内容和呈现端口，公开 token、revision、requestId 用于定位已有操作，不能建立新的 owner。拒绝可能是结果对象或抛错，调用者应遵守各入口返回类型。

## 入口 × 活动操作 × 合法 parent × 保存 × 代次

表中“空闲”要求没有不兼容根操作。`encounterBlocked` 和 `saveBlocked` 是不同查询：只浏览背包、商店或没有 held／child 的管理根，阻止新遭遇但可以保存；具体持续写入或子操作持有保存屏障。

| 入口／操作 | 活动操作和互斥 | 合法 parent／延续 | 保存屏障 | generation／完成 |
|---|---|---|---|---|
| `startBattle`／`startTrainerBattle` | 状态／内容回调前预留 battle op；拒绝第二战斗、管理、库存、接收以及学习／进化／交换／图鉴等根操作 | App 创建 foes、setup、evidence；formal factory 接收 App 当前性闭包 | 准备中、开战后及尚未结束的受控提交均阻止 | session 绑定本 App、operation、generation；迟到 create 不可抢占后继 |
| `finishBattle`／`resolveReceiving` | 只延续原 battle/receiving context；未知结果不能建立 required 来源 | 原 handle + context；接收决定只填原模板 | pending、零写失败或不确定安装时保留 | 旧代次 handle 在读取 producer 前拒绝；精确已安装结果可查询为 already-applied；冲突拒绝 |
| 战后进化／图鉴 continuation | 主提交已安装后仍可有呈现／后续阶段；不回滚已安装主体 | 原 battle context token；进化可保留后续学习／图鉴阶段 | continuation 存活时阻止 | 只有当前 token/revision 能推进；重复完成不重复主体写入 |
| `beginManagement`／`manage` | 一个管理根；与 battleBusy、接收、inventory 根互斥 | 根可授予一个 child；持起的成员是意图，不是旧状态快照 | 仅 held movement 或 child 时阻止；普通管理根允许保存 | `stateReplacedByHost` 清空 token/held/child；旧 token 不可终止新根 |
| `beginInventoryOperation('bag'/'shop')` | 一个库存根；与 battleBusy、接收、无 parent 的管理根互斥 | 根；商店限定 shop 请求 | 普通浏览允许保存；pending use/toss 或 learning child 时阻止 | token 携带 generation；资源、content revision 与 ticket 单独复核 |
| `beginInventoryOperation('item', parent)` | 管理根预留 child 后，父管理修改／结束被拒绝 | 精确管理 token + 当前真实 party memberId，不能沿旧槽位追踪其他成员 | item context 全程阻止 | 结束只释放自己的 parent lease；过期 token 不释放后继 |
| `beginLearning`／`resolveLearning` | 与 battle、其他学习、进化、交换、接收、图鉴等互斥；在首次端口回调前预留 | standalone；management child；machine 必须 inventory child，且 intent 为 teach/machine | 活动学习全程阻止 | token/revision/generation；content/world/资源变化永久退休旧选择；未知安装需恢复屏障 |
| `beginEvolutionItem`／`beginEventEvolution` | 与 battle、学习、交换、接收、图鉴等互斥 | item 只接受当前 inventory token/member；event 是空闲根 | 活动与不确定安装全程阻止 | 仍绑定原 parent、generation 与选择，technical exit 只丢弃证明未安装部分 |
| `beginTrade`／`resolveTrade` | 独立根，拒绝其他根及 child | 无外部 parent；进化／学习属于 draft continuation | 从 offer 到最终确认全程阻止 | incoming/outgoing 的 draft、ordinal、owner 同一次最终安装；旧代次回应不提交 |
| `claimGrant`／`receiveGift` | acquisition 在首次端口回调前预留；battleBusy、管理、库存或接收冲突时拒绝 | receiving + 后续图鉴仍属于同一 acquisition context | 接收／continuation／未确认安装时阻止 | 先安装主体再呈现时，技术关闭不撤销已提交领取；同一 grant 有明确 pending/已领语义 |
| `updatePokedex`／`beginSummaryPokedex` | 图鉴根与其他根互斥；summary 是受控管理 child | summary 需精确管理 token/member；capture/evolution/acquisition 使用内部 parent | 活动图鉴及错误恢复阶段阻止 | token、revision、generation 与 fingerprint；旧呈现答复不操作新 owner |
| `healParty`／`recoverAll`／`recordSteps`、普通 grant/gift、直接 `commitResult` | 普通写入口检查所有相关根／child；`battleBusy` 是聚合状态，错误名 battle-active 不只表示引擎正在行动 | 无法凭 JSON 添加 parent；直接 result 需要预先选定来源 | 本身为同步安装；尊重现有屏障 | App 端口包装验证候选并更新 friendship revision；不得用等值写入绕过迁移计划过期检查 |
| `previewFriendshipMigration`／`confirmFriendshipMigration` | 空闲时开始；await 期间 owner 阻止其他写入口及宿主替换准入 | opaque preview handle 绑定原 persistence/target/rawHash/content/代次/写 revision | await 中阻止；preview 返回 ready 后释放；unknown 持久化或提交后安装未验证则保留 | 等值状态也不能清除“期间发生写入”的事实；未知状态不伪装取消成功 |
| `startNewGame`、宿主 `assertHostStateReplacementAllowed` + `stateReplacedByHost` | new game 是显式时间线替换，允许结束普通在途操作；friendship owner 仍拒绝这些写入／替换 | 宿主先检查替换准入，再安装宿主对象并通知 App | 成功替换退休旧操作；不能靠此方法绕过不确定 friendship 持久化屏障 | generation +1，清空各 operation、receipts、notifications 并退休会话；不撤销此前已安装状态 |

实现的聚合判断在 [game-application.ts](../../src/framework/app/game-application.ts) 的 `battleBusy`、构造时 enter/leave 端口、`saveBlocked`、`encounterBlocked` 和 `stateReplacedByHost`；细节由 [management](../../src/framework/app/management.ts)、[inventory](../../src/framework/app/inventory-session.ts)、[learning](../../src/framework/app/learning-operation.ts)、[triggered evolution](../../src/framework/app/triggered-evolution.ts)、[trade](../../src/framework/app/trade-operation.ts)、[acquisition](../../src/framework/app/acquisition-operation.ts)、[pokedex](../../src/framework/app/pokedex-operation.ts) 保有。只读 projection 允许读取不表示获得提交资格。

## 已有证据与本轮差异

| 覆盖 | 已有测试，不计本轮新增 |
|---|---|
| 开战准备前预留、回调重入、late resolve/reject、同 id 后继 | [test-app-battle4.cjs](../../experiments/step4/test-app-battle4.cjs)、[test-battle-entry-ownership.cjs](../../experiments/step5/3/test-battle-entry-ownership.cjs) |
| 管理 held/child、库存根保存差异、过期 ticket／token | [test-management.cjs](../../experiments/step5/1/test-management.cjs)、[test-transactions6.cjs](../../experiments/step5/2/test-transactions6.cjs)、[test-item-workflows6.cjs](../../experiments/step5/2/test-item-workflows6.cjs) |
| 机器 parent、学习回滚、写后异常／未知 readback | [test-learning-operation.cjs](../../experiments/step5/3/test-learning-operation.cjs) |
| 接收／战后分阶段提交、未知安装屏障 | [test-battle-transactions7.cjs](../../experiments/step5/3/test-battle-transactions7.cjs)、[test-triggered-evolution.cjs](../../experiments/step5/3/test-triggered-evolution.cjs)、[test-trade-operation.cjs](../../experiments/step5/3/test-trade-operation.cjs) |
| 图鉴 parent／generation、主提交后图鉴继续 | [test-dex-viewing.cjs](../../experiments/step5/3/test-dex-viewing.cjs)、[test-pokedex-summary.cjs](../../experiments/step5/3/test-pokedex-summary.cjs) |
| friendship async 互斥、opaque preview、等值写失效、durable replay | [test-app-integration.cjs](../../experiments/friendship-standard-domain/test-app-integration.cjs) |

本轮新增 [test-application-operation-contract.cjs](../../experiments/framework-remediation/test-application-operation-contract.cjs)：AC01 真实旧 battle completion 在新代次管理／库存 child 活动时，零 producer 读取、零投影、零写入且不释放 child；AC02 旧库存 cleanup 与非法旧 parent 的学习请求均不影响新代次管理／学习 lease；AC03 显式 new game 退休学习 child，随后旧答复不能干扰新管理根。这些是跨操作组合补充；既有的单操作 token／generation 测试仍属于既有覆盖。

[共享场外 Potion 向量](../../experiments/framework-remediation/contracts/field-potion-vectors.json) 由 [test-field-potion-vectors.cjs](../../experiments/framework-remediation/test-field-potion-vectors.cjs) 同时用于纯规划和 App 库存入口，比较同一输入下的 HP／消耗／候选状态／重复请求。它统一测试输入，未另造一个物品校验器；20 HP、封顶、无效／濒死、取消和数量限制本身已有领域测试，本轮新增的是两条公开路径共用向量和安装结果一致性。

2026-11-13 实跑本轮 App 3 项与共享 Potion 6 项均通过；同批正式能力 5 项也通过，总 14／14，失败／取消／跳过均 0，命令见[正式能力合同的实际验证](formal-battle-capabilities.zh.md#本轮实际验证)。本批测试首轮即通过，补充现有合同的跨路径覆盖，没有产品整改红测。

本合同不是所有入口笛卡尔积的全覆盖声明；已有测试只列映射，不据此声称本轮重跑。真实宿主存档、输入、NW、原版回放和私有资料不在本轮验证范围。
