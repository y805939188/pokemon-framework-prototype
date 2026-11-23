# E3 MZ 生产接线检查点

本检查点把真实 GameApplication E3 parent、原生 reserve/perform、Map Scene 私有构造凭据、原 D completed-step gateway 和原 C1 驱虫界面接在一起。固定身份、作者日志和独审结论见工作区 `build/step5-5-development-20261115/e3-native-transfer-author/r6-iife-joint/`；当前不是完整 E3、F、G 或 5.5 签收。

## 作者入口

- `PSFlow.worldFlyDestinations()` 从当前区域、访问记录、首条合格地区点和开关派生目的地，没有单独解锁表。
- `PSFlow.runWorldTravel(requestId, request)` 接受正式 App 的 Fly／Dig／Teleport／显式 transfer／connection 意图。Fly selection 使用上项返回的完整目的地。Dig／Teleport 必须提供当前非蛋、掌握该招式的 party memberId，只有这两族询问确认。
- `PSFlow.retryWorldTravel(requestId)` 显式恢复未完成阶段；`cancelWorldTravel` 只退役自己的操作、请求与原生 serial。
- 普通输入通过原生 `executeMove` 的越边失败进入连接；普通墙、仅转向、普通成功步与强制路线不另发连接步。
- 普通 MZ 201 继续原生流程并保留业务 Surf；显式框架 transfer 的 `preserveSurfing` 明确选择是否保留。

`PS_World` 的 `CharacterHome` 与 `GlobalHome` 分别配置 Teleport 的两个家回退点；最近治疗点优先。缺省值不造家。`TravelDebug` 默认 false。Surf 的目标通行复用既有显式 TerrainTags／SurfPassage。

## 可选演出

`PSFlow.configureWorldTravelPresentation({ animate?, flyCallback?, cleanupFlight? })` 提供项目演出。对象和函数必须是普通 own-data 值；Proxy、存取器与未知字段拒绝，配置阶段不执行回调。`animate(kind, owner, guard)`、`flyCallback(owner, guard)`、`cleanupFlight(owner, guard)` 可异步，项目代码可在自己的 await 前后调用 guard。

新 owner 捕获配置快照；进行中 owner 保留快照，真正 retained-arrival retry 复用原 physical owner 的快照。配置不授予 owner／receipt 权限，函数在业务原子区间之外执行，App 仍在回执后核验 game、Content、代次与真实来源。未配置时无 Fly callback，Fly／Teleport 使用短消息回退；完整共同宝可梦媒体演出未由本检查点实现或验证。

Fly 的真实顺序是：原生抵达／B 进入原子安装 → display → 原生 `onTransferEnd` 的单次 BGM → refresh → 可选 callback → 以真实 Map 更新和单调时钟等待名义 250ms → cleanup → App 清逃脱点／选择并退休父操作。callback 或 cleanup 异常保留已提交前缀，显式 retry 不重 reserve、不重复统计或 B 进入。

## 连接目标步与保存

B 进入在原生 perform 返回前确认。连接目标先同步采用原 FieldStepHost.active 与 completed.running，未启动 App D；因此首 Scene.start／update／autorun 的解释器和移动门已占住。等真实 Map started/active 后再给 App 目标事实，由 App 唯一发 D 前缀。真实 outcome 交回原 D done／native arrival／encounter retirement，原普通 D/C1 路径保留。

C1 的四参 PSInventory push/pop 保留真实技术凭据。只有原 App `returned(handle)` 认可后的 actual 新 Map 可被该 exact D context 捕获；完成时只迁移本次延期请求的显示宿主，不修改或重签原生 physical proof。SOURCE／once Scene 守卫保持。

只有真实 Map `requestAutosave` 才登记延期；完成后调用一次原生保存入口，仍尊重作者保存开关，不自动重试拒绝。没有请求就不造保存。headless 证据只覆盖原生调用次数／顺序与隔离 DataManager 替身，未证明磁盘落盘、冷 Continue 或 NW。

## 验证边界

最终候选须另做精确独审与整合回归。这里的原生方法来自实际安装 MZ／Reactor；XHR、PIXI Container、渲染窗口与存盘为 headless 替身。完整媒体、伙伴自动接线、distance_* 移动开始义务、F/G、真实键盘／声音／失焦、NW／冷 Continue 未由本检查点代签。所有历史失败、未执行项和清理回执保持；清理新增只写新 scope／总账。


## post-R6 载具与可选 UI 门后继

`cancel-vehicles` 的 Dig／逃脱绳前置效果在原生 boat／ship／airship 上执行传送专用就地取消：调用当前真实 vehicle.getOff 释放车辆／恢复步行 BGM，再经私 native reserve epoch、当前 owner／player／map／vehicle 与 own-data 槽复核，恢复玩家 walk、透明／through、速度及上下车运行旗。没有调用受落岸条件约束、会前移及消费遇敌计数的普通 getOffVehicle。车辆本体留在源地图；provider 异常保留已发生前缀，后续显式恢复继续，旧操作不清 later raw201／successor。epoch 在 clearTransferInfo 后仍保留，reserve→clear ABA 不能回到旧权限。

framework Surf 是 App 独立业务状态，在真正 transfer 提交时按 plan 清除；不是原 MZ boat flag。可选项目自行车插件的 isOnBicycle／getOffBicycle 接缝单独处理，不能宣称内建完整自行车业务。后继有限原生三族证据仅从真实 Dig 入口取得；Inventory→逃脱绳、其它旅行族在载具状态下的实际组合仍须各自验收。

可选 PSManagement.fieldPresentationPending 只读 own-data function 并要求返回 true；缺 plugin／method／访问器视为 false，不执行 getter。仅 OR 现有所有 native pending 门，保留 App.saveBlocked。等待事件结束的 UI 队列不应返回 true，以免暂停其所属事件。该窄门通过不代签尚未集成的完整快捷 UI。
