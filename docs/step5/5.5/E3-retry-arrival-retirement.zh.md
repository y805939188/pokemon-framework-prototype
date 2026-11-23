# E3 after-arrival Retry 退休接线

> 前半保留 `4c0c435c` 历史实现与验证；RR-R1 后继见文末，不将历史 105 项作为后继最终数量。

基线 `5360697e0900c222e8d85b5a51e53882cb2c8b8a`。这是 RETRY-RETIRE-R1/P2 的产品修复及 RETRY-OBS-1 的被动诊断支持。

原生转移已真实到达、Fly 尾部失败后，Retry 保留原物理 owner/receipt/lease/serial，并获得新的 App 执行 owner。成功续尾现在经 App 自有窄端口退休那份原到达证明。App 在成功 continuation 中重新核对当前请求注册、原 issued receipt、原 Content 对象及语义、游戏指纹、generation、目标 birth/queue/native frame；MZ 将 atomic adapter 的 materialized birth 核对到同一生产者的 canonical record，原生生产者再核对私有 publication、serial、player、scene、坐标、方向和 idle native slots 后退休。

原完成、通知和 deferred-save 顺序保持：合法尾部提交后只恢复原请求一次，再在成功 continuation 精确退休。没有新增保存轮询、保存请求、转移、Scene 构造或同步 restore。协调者先前关于“save-after-restore 既有屏障”的未证实推断已明确撤回，未据此增加机制。退休只让正常 companion ingress/frame 调度有机会处理当前目标 birth；本轮的调度控使用受控 restore 端口，不宣称生产伙伴恢复、原生存档或实际渲染通过。

失败尾部保留原 arrived proof；取消、读档/新游戏共用的 `stateReplacedByHost` 失效入口、Content 等值替换、错误 owner/receipt/lease/serial/birth、宿主异常和 successor 均有普通反控。退休端口缺失、拒绝或未真正退休时返回显式失败，保留终端 cursor 供后续显式恢复，不回滚已提交尾部，不重复原前缀。普通首轮成功 release、connection、before-arrival 和 F 分支保持原路径。

诊断记录真实 Retry Promise 的 fulfilled/rejected 和有限 status/reason；包装器返回原 Promise，保留原值及 Error 身份。generic pump 的阶段摘要使用最后一次生产 consumer 的缓存，明确标注没有直接查询当前 registry；predicate 为 false 时，未执行的 stable/companions/author gate 显示为 null。成功 `ready()` 的原条件与失败到达 oracle 保持。

## 实际验证

使用 Node `22.21.1`，独占依赖 CoW 副本和私有普通 CJS emit。以下五个显式入口合计 **105/105**，fail/cancel/skip 均 0：

| 入口 | 项数 | 范围 |
| --- | ---: | --- |
| `test-e3-application-parent.cjs` | 63 | 原 37 项及新增 26 项真实 App、窄 MZ leaf、原生 registry/退休和受控 ingress 调度 |
| `test-e3-native-retirement.cjs` | 10 | 原 pending 退休及 successor 保护 |
| `test-e3-native-lease-registry.cjs` | 3 | 原不透明 registry 身份 |
| `test-e3-native-failure-successor.cjs` | 5 | 原失败及 successor 路径 |
| `e3-production/test-phase-observer-support.cjs` | 24 | 原 21 项及 3 项被动 Retry/cache 诊断 |

私有 emit、App/core/framework/plugin 四项类型检查、模块边界检查和 8 个 CJS 语法检查通过，最终源码前后指纹相同。首轮新控 **16P/6F** 保留，原因是新 adapter 错把 materialized birth 包装对象当成 canonical record；修正后的 22/22 是最终 26 项的子集，不重复累加。静态登记检查首次误要求 source-only 工作树存在所有原生文件，该记录保留；九个外部 native 输入未在此工作树准备。

## 登记及未执行

正规 `SUITES` 保持原 406 项顺序及 exclusions；controlled inputs 原 240 项顺序保留，新增 nested 普通测试文件后为 241（232 源文件＋9 原生输入）。APP 登记数由 37 改为 63，所有 family/case 顺序保持。parent composition 导出实际窄 leaf 和 ingress；其官方 emitter 仅补 ingress 入口以闭合新测试依赖，strict entries 16→17。**登记不是执行**。对应未来有限计划的 35 tuple 内层声明将由 173 改为 199（原 31 部分 169→195，formal 4 项仍为 4）；旧计划、旧实际剩余 117 和 F5360 的 14 项 scope 均不改。

本轮没有正式 runtime/binding、冷构建、IIFE、JOINT、F14、H、406 全量、NW/T20 或人工验证。旧 `2dda` 单轮仍是 54P/2F、33 tuple/117 未调用；其 AUTH 已消耗，不复用。a91/b514/2dda 各自失败账、F 首轮 bootstrap 失败和全部旧证据保持。本修复对应静态成功路径缺口，尚未证明它是旧 JOINT 两红的唯一动态根因；须独审、重新绑定及新的有限业务授权后再验。


## RR-R1 后继：已完成尾部的退休进展

基线 `4c0c435cec714cdaecde4dcec5c7afe5dc45b879` 的独审原 105 项绿保持，但 IR01 为 0P1F：真实原保存 hook 启动新 App travel 后同步取消，尚无新原生转移，原请求失去 current entry，旧 arrived proof 无可达退休路径。原报告、输入、raw 和源码/emit 均保留。

后继在真正 atomic 安装返回后、complete 回调之前建立**单一模块私有**的原到达退休义务；只有原实际执行返回 completed 后才可消费。它固定原 entry/issued origin/owner/generation/Content/physical/birth，不是新请求或新的业务状态机。真实 admission 可继承该义务的私有前驱引用；活动后继始终阻止旧清理。已取消或失败的精确后继还须没有 bound/recovery arrival 或待交接 step，并用自身的 expectedGame 验证当前状态；原 canonical proof、native serial、Content 和目标 birth 全部保持强验证。

凭据槽、lineage WeakMap 和新增方法均为 ECMAScript `#private`，不把凭据挂在可枚举 Entry 属性上。每个终态后继只触发一次尝试。宿主退休失败后，原请求的现有 Retry 入口可再次完成**仅退休**的剩余义务，不再运行原操作、complete、保存或前缀。私有 World 消费者收到同一个已签发完成执行的 owner，继续通过既有 `isRetryExecutionCurrent` 认证，不重签 owner/receipt。成功消费或明确失效清除单一槽；真实新 native publication 在原 lease 观察点撤销旧槽并清除过期前驱，generation invalidate 也清槽。请求表仍上限 256，只保护未消费义务的原 entry 不被提前淘汰；终态尝试集合为弱集合，没有无界强保留链。

正常 complete→原保存请求一次→认证成功退休顺序保持。未增加 manager 轮询、新 save proof、同步 restore 或 Scene/onTransferEnd 调用，也没有把旧 checkpoint 装入后继。精确 IR01 现可退休并由正常 ingress 调度当前 birth；仍在活动的无原生后继会等待其真实 cancel/failed 事件后处理；真正新的 App/native 或 raw201、generation/load、Content（含等值替换）、位置和场景变化受到保护。宿主退休异常、重复取消/发布和显式恢复均有反控。

最终五个普通入口 **128/128**，fail/cancel/skip 为 0：APP82（4c0c 的63＋进展14＋真实Rope消费者5）、原 native retirement10、registry3、failure5、observer28（原24＋新4）。先行40＋28、两次暂态123绿及选名Rope5绿，均为相应源码阶段的子集或旧暂态，不累计为更多用例。最终私有emit、App/core/framework/plugin四类型检查、boundary及3个变更CJS语法检查通过；最终源码前后相同。本后继没有新失败，原 IR01 首红不删除、不改成原候选通过。

真实 Escape Rope admission 生成 fieldTravels 与回执后，已完成尾部的 toolCompleted 会先保留 completed 物品回执。World 增加最窄内部纯观察 `hasPendingArrivalRetirement(id)`，仅让该精确 request/generation 自有 ready 未消费义务通过原 terminal 委派门；未新增 GameApplication/host 能力。实际 `retryFieldItemTravel → WorldOperation.retryFieldTravel → travel.retry → 私有 onAdmitted → isRetryExecutionCurrent → finish` 已跑普通正控，finish 的 terminal 保护保持原样，不覆盖已有 completed/cancelled/duplicate，也不重跑物品或再消费。错误 callback owner 在真实 validator 返回 false，既有完成回执保持；这项反控不把真实已成功 cleanup 的返回结果伪称失败。另覆盖错误 request、新原生 successor、generation 失效、无义务及重复使用。普通 World 重试与 cleanup-only 继续分列，均使用受控保存/呈现端口，不代签正式背包UI。

OBS-G1 只收敛本次 Retry 被动结算诊断：未知 object/function 连 descriptor 也不反射，只记录 fulfilled/rejected、typeof/null 和拒绝值本来就是字符串时的有限文本；因此未知对象的 status/reason 明确为 null。独立 getter、Proxy trap、coercion 计数均断言 0，原 Promise/value/rejection 身份保留。`Promise.resolve(proxy)` 在安装观察器之前读取 `then` 是既有 Promise API 边界，测试单列该一次并归零后检验新增诊断；既有 run/finish/restore 观察器的其他输入契约没有被扩大为任意对象 hook=0。

正规406及其顺序/exclusions不变，controlled241（232源码＋native9未准备）、Cparent17和测试composition不变，仅 APP 声明63→82。未来新候选35 tuple 内层计划为218（原31部分214、formal4仍4），只是登记，未执行。旧 a91/b514/2dda 计划和各自剩余账、4c0c 的35/199历史计划、F5360 的14范围均不改。

全部编译/运行只是新源码的私有 ordinary 验证；正式 runtime/binding、IIFE/JOINT/F业务/H/cold/full406/NW/T20/人工未执行，生产伙伴 restore、DataManager 物理保存与旧两红唯一动态根因仍未签收。


## RR-R2：公开快捷恢复的调用内终态（本后继）

旧 `88ac78d0` 的独审 IR02 在过强的清理次数断言提前停止。经明确有限授权，新独占证据目录只复制并校准两处 `releases` 预期为 2、3；旧输入与所有末端断言保留。单次运行实际到达末端，公共恢复返回 `refused` 而期望 `completed`；物理占用已空、道具只消费一次、原保存一次、native 请求一次、RNG 与效果不重放。这是本后继的预期红复现，不修改原独审封印。

修复只在当前真实公开恢复调用内传递一次只读证明：原 `#finishRecovery` 经过实际 release 与原强后检后，内部回调获得绑定原 request/issued owner 的单次检查函数。World 继续核本次 retry、真实 Inventory 关联和 generation；selection 先读新 snapshot，仅其为 `unavailable` 且本次成功证明重新通过时回 `completed`。证明不进入公开 DTO、GameApplication 或 host 参数，不保存历史 terminal registry，不使后续旧请求普遍可恢复。`await` 后的检查会重新读取真实 atomic/provider，并核原 Content、source/birth/queue/frame、physical=null 与精确合法 actor；它不是无 provider 查询。原 `hasPendingArrivalRetirement` 的纯查询语义保持。

新增 ST01–ST10 共 20 个普通源级用例，覆盖真实公开 Rope 两次恢复、单次消费/保存、错 request/owner、代次与 Content 变化、原生或 App 后继、重复调用、迟到回执、跨 request 的旧证明、伪造 DTO 与末端 atomic 重入。预定最终普通五入口为 APP102＋native10＋registry3＋failure5＋observer28＝148，最终结果由新证据 `READY.json` 为准，登记不等于执行。正规406、controlled241、Cparent17保持，APP82→102。未来本后继计划35 tuple/238（原31部分234＋formal4）尚未执行。

历史计数纠正（DOC-HIST-COUNT）：a91 的原计划是31 tuple/169，54P/2F后剩余29/113；b514、2dda才是35/173，剩余33/117。4c0c的35/199、88ac的35/218是各自后继登记计划，未执行。上文旧段落将a91与后两者并列为同一计划口径不精确；保留旧证据原文，以本段区分。

本后继仍需新的独立源码审查与自己的正式 binding。没有执行完整 fixture/IIFE/JOINT/H/verifyInputs/prepare/qualification/cold/full/F业务/NW/T20、物理保存或正式伙伴恢复，不能代签 E3/F/G 或整体5.5。

本后继实际验证：新公开快捷定向20/20，随后同源五入口148/148（包含这20项，不累计为168）；私有emit、App/core/framework/plugin四类型、boundary、变更CJS语法全部通过。定向验证保留了预期失败样本。作者通过仍待新候选独审，不构成正式运行授权。
