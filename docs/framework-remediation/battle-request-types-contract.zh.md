# 渐进整改：战斗请求到宿主 UI 的类型合同

固定基线为 `02cff041078e9e98af7b6bb29df680a44ebf5839`。本批保护现有单打功能、协议 v1 和应用所有权；未修改存档 schema、迁移、结果 JSON 或已支持的战斗物品集合。最终提交、整合 regular、最新 bundle 定向测试和独立复审以本轮总回执为准。

## 实际保护链

`battle/request.ts` 定义无 Node/MZ 依赖的值合同；`GatewayMessage.request`、`RequestMessage.request`、Session 请求表、`currentRequest()`、driver/gateway 的 `awaitingChoice()` 和恢复后的待选请求均使用该合同。Showdown 是固定 `7244fe8e28fa8bc4d0809ae30d183c608b62bb2b`；依据其 `sim/side` 和 `Battle.getRequests` 的真实形态建立本地 DTO，不把上游对象或类型依赖泄漏给宿主。

`flow/session-view.ts` 是宿主需要的控制端口，`BattleSession implements BattleSessionView` 防止实现与端口漂移。插件 `HostApplication`、生产会话工厂返回值、`PSFlow.begin()` 和 `BattleSceneController<BattleSessionView>` 实际接线使用该端口。场景兼容属性代理按泛型键读写 controller 字段；实际选招读取、消息流、动作返回和菜单→Session 调用均有编译保护。核心应用仍保留原来的泛型 `BattleHandle` 默认值，不要求不使用战斗的应用具备 UI 或 MZ 能力。

新增编译探针同时检查类型本身和真实 `PS_BattleFlow.ts` 源码消费点：错误字段、PP/disabled/condition 类型、`FoeAi` 返回值、`begin()` 返回的 Session、controller Session、消息、动作结果及实际菜单动作参数不能编译。真实插件另以 `types: []` 编译；没有为通过探针把 Node 声明加入插件或核心。

本批未清除全部宿主动态 `any`。MZ 窗口、媒体、操作呈现元数据和第三方模拟器内部边缘仍按原边界存在；不能把关键链已受保护解释成整个插件或适配器已无动态类型。

## 可选性与动态输入

请求区分正常选招、`forceSwitch: boolean[]`、等待和队伍预览；`{}` 与 `null` 原样保留。PP、最大 PP、target 等确实可选，Struggle、Recharge 和锁招不补虚构 PP。双打空活动席位按真实 JSON 的 `null` 表达。空请求没有虚构的 `side` 或 `active`；消费者必须按相应分支读取。

动态模拟器 JSON 在 Gateway 输出请求、复制待选请求及读取恢复请求时经 `unknown` 检查。检查所有 DTO 声明中可访问的可选字段类型，包括成员 stats/moves/ability/item/flags 和招式 disabledSource。未知扩展字段保留原对象/JSON，不用宽泛索引签名公开它们，不添加、删除或规范化字段。该门服务于固定模拟器输出；不把它扩展为通用请求 schema 平台，也不在每次内部 DTO 复制处重复校验。

## 测试与失败记录

新增 `scripts/tests/battle-request-types.test.cjs` 最终 15 项；`scripts/tests/battle-requests.test.cjs` 30 项。前者覆盖真实消费者及正常/强制/等待/预览/空/PP 省略/恢复的编译正反例；后者覆盖这些运行时形态、空双打席位、扩展字段不丢，以及错误 PP、side、成员字段、状态标记和冲突分支的拒绝。

初始编译探针为 13 项、4 通过/9 失败，原日志 `build/progressive-remediation/types/baseline-red.tap` 保留。A1 中间为 9 通过/4 失败。后续补两个正例/真实菜单负控后，最终新增两套 45/45 通过，不以新增项回填初始红测。

首次组合目标测试（旧 scene-controller、host-application-types 和当时新增两套）为 152 项、149 通过/3 失败，保留 `targeted-host.tap`。旧编译场景测试发现 `afterMessages` 在开场失败分支前读取必需 Session，破坏拒绝开场与相邻外部中止的结束菜单。修复把 Session 读取放在失败分支之后，保留原 retry 清理顺序；未改旧断言或 fixture。同 152 项重跑全过。最终追加实际菜单负控后的 `targeted-final.tap` 为 153/153，失败/取消/跳过均 0；完整 `pnpm --dir src typecheck` 通过（`full-final.log`）。这些是作者定向结果，独立复审另计。

## 兼容影响与保留边界

- **公开编译合同收紧**：`FoeAi`、driver/protocol 请求、Session 读取不再传播 `any`。以前不检查分支、假定 PP 必有、访问未声明扩展字段或返回错误值的 TS 调用方会得到编译错误。自定义 driver 需提供相应值形态；不改变合法选择字符串或引擎接受规则。
- **新增运行时错误时机**：畸形模拟器请求在 Gateway 边界抛出 `invalid battle request payload`，早于其进入 Session/UI。默认 AI 收到没有活动招式的请求时给出明确错误；空请求不能选择换人时返回已有 `choice-rejected`；无活动请求的选招菜单返回。合法正常请求和额外 JSON 字段保留原行为。
- **内部菜单元数据**：`onMenuOk` 先把动态 `ext` 视为 `unknown`；自产招式菜单使用 number，背包/成员使用 string。相应局部守卫不再把其他形态隐式透传给 Session。查阅当前协议和默认选招呈现文档未发现将该场景私有菜单元数据声明为作者插件合同；这里明确是内部 UI 边界的收窄，不把它描述为纯类型变化，也未更改公开旧参数解析或 legacy AI 降级规则。
- controller 的 `run` 保留所有权、代次、失败和关闭门，并把动作结果传给泛型回调；旧 controller/编译场景测试已覆盖本批改动。不因此声称异步时序、宿主性能或原生输入已全面验收。

本批未启动 NW、运行原版/OA、读取真实玩家档或进行跨引擎实际迁移。最新统一 bundle 的引擎/Session 恢复定向回归、完整构建/regular、最终固定提交及独立复审由总回执登记；此处不拿先前结果冒充本轮验收。
