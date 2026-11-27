# 战斗请求与输入校验

## 实际保护链

`battle/request.ts` 定义无 Node/MZ 依赖的值合同；`GatewayMessage.request`、`RequestMessage.request`、Session 请求表、`currentRequest()`、driver/gateway 的 `awaitingChoice()` 和恢复后的待选请求均使用该合同。Showdown 是固定 `7244fe8e28fa8bc4d0809ae30d183c608b62bb2b`；依据其 `sim/side` 和 `Battle.getRequests` 的真实形态建立本地 DTO，不把上游对象或类型依赖泄漏给宿主。

`flow/session-view.ts` 是宿主需要的控制端口，`BattleSession implements BattleSessionView` 防止实现与端口漂移。插件 `HostApplication`、生产会话工厂返回值、`PSFlow.begin()` 和 `BattleSceneController<BattleSessionView>` 实际接线使用该端口。场景兼容属性代理按泛型键读写 controller 字段；实际选招读取、消息流、动作返回和菜单→Session 调用均有编译保护。核心应用仍保留原来的泛型 `BattleHandle` 默认值，不要求不使用战斗的应用具备 UI 或 MZ 能力。

新增编译探针同时检查类型本身和真实 `PS_BattleFlow.ts` 源码消费点：错误字段、PP/disabled/condition 类型、`FoeAi` 返回值、`begin()` 返回的 Session、controller Session、消息、动作结果及实际菜单动作参数不能编译。真实插件另以 `types: []` 编译；没有为通过探针把 Node 声明加入插件或核心。

该功能未清除全部宿主动态 `any`。MZ 窗口、媒体、操作呈现元数据和第三方模拟器内部边缘仍按原边界存在；不能把关键链已受保护解释成整个插件或适配器已无动态类型。

## 可选性与动态输入

请求区分正常选招、`forceSwitch: boolean[]`、等待和队伍预览；`{}` 与 `null` 原样保留。PP、最大 PP、target 等确实可选，Struggle、Recharge 和锁招不补虚构 PP。协议层允许空值；不可假设引擎以 null 表示已倒下的活动席位，须区分请求形状和成员状态。空请求没有虚构的 `side` 或 `active`；消费者必须按相应分支读取。

动态模拟器 JSON 在 Gateway 输出请求、复制待选请求及读取恢复请求时经 `unknown` 检查。检查所有 DTO 声明中可访问的可选字段类型，包括成员 stats/moves/ability/item/flags 和招式 disabledSource。未知扩展字段保留原对象/JSON，不用宽泛索引签名公开它们，不添加、删除或规范化字段。该门服务于固定模拟器输出；不把它扩展为通用请求 schema 平台，也不在每次内部 DTO 复制处重复校验。
