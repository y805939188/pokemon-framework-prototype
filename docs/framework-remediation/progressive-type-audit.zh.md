# 渐进整改：全框架类型质量基线

固定基线：`02cff041078e9e98af7b6bb29df680a44ebf5839`（2026-11-13）。这是整改前清单；后继修改的数量不能回填进此基线。它记录类型风险，不代表功能缺陷数量。

## 方法与可复现结果

```sh
node scripts/type-quality-audit.cjs 02cff041078e9e98af7b6bb29df680a44ebf5839 baseline.json
```

脚本通过 `git ls-tree` 和 `git show <固定SHA>:<文件>` 读取提交树内全部自有 `.ts/.tsx/.mts/.cts`，包含声明和 TS 消费者测试，不读取工作树中的并发编辑，也不读取第三方源码或私有参考材料。使用项目已安装 Vite 8.3.1 / Rolldown 1.2.11 的 TypeScript ESTree parser（现有边界检查器使用同一工具）；不把注释、字符串中的 `any` 当语法。共 259 文件，解析失败 0。

[机器清单](../../experiments/framework-remediation/evidence/progressive-type-audit-baseline.json) 包含逐文件计数和每个候选的文件、行、列与短片段。分类以脚本中的 `classify` 为准：框架 tools 中的 fakes/harness/matrix/scripted-driver/held-diagnostics/fixtures、flowtest 与 Smoke/FlowTest 插件计入测试；`*-mz`、`*-host` 与顶层宿主插件计入 MZ/宿主；其余 UI 模型和框架呈现模块计入 UI。通用 Session 流程单列，避免把全部 flow 混入战斗适配。

| 领域 | 文件 | 显式 any | 所有类型断言 | 双重断言 | 非空断言 | 动态下标访问 |
|---|---:|---:|---:|---:|---:|---:|
| 领域/规则 | 63 | 0 | 272 | 13 | 185 | 250 |
| Application | 18 | 0 | 32 | 0 | 163 | 48 |
| 战斗适配 | 16 | 20 | 65 | 0 | 26 | 100 |
| Session 流程 | 6 | 1 | 22 | 2 | 43 | 54 |
| MZ/宿主 | 28 | 610 | 114 | 0 | 104 | 209 |
| UI/呈现/本地化 | 48 | 39 | 53 | 0 | 93 | 102 |
| 内容管线（含 content-runtime） | 13 | 0 | 105 | 19 | 63 | 69 |
| 工具/构建 | 7 | 0 | 24 | 0 | 5 | 8 |
| 入口装配 | 3 | 0 | 0 | 0 | 0 | 0 |
| 测试及测试辅助 | 57 | 1361 | 83 | 1 | 50 | 318 |
| 合计 | 259 | 2031 | 770 | 35 | 732 | 1158 |

生产及工具共 670 个显式 `any`，测试/辅助 1361 个，不能相互抵消。另有 `as any` 80 处（生产 54、测试 26）、确定赋值断言 25 处、索引签名 8 处、`JSON.parse` 调用 135 处。全部 35 个双重断言在此基线均经过 `unknown`；`unknown as T` 只是断言，不能作为运行时验证证据。两条类型抑制都是 `src/typecheck-runtime.ts:23,25` 中有意验证 nullable 数据库和参数类型的 `@ts-expect-error`；未发现 `@ts-ignore` 或 `@ts-nocheck` 的注释行候选。

所有断言包含 `as const`、已验证的字典读取和状态分支断言；动态下标包含正常数组索引；这些列是审查入口，不是违规计分。非空 `!` 与确定赋值 `!` 分开统计。

## 当前最关键的传播链

`battle/driver.ts:42` 的 `GatewayMessage.request`、`battle/protocol.ts:9` 的 `RequestMessage.request` 均为 `Record<string, any>`；`flow/session.ts:49` 的 Request 别名承接同形态。于是 `request.active[0].moves`、替换/等待/预览字段在消费时失去编译约束。`plugins/battleflow/controller.ts` 本身没有显式 `any`，但 `PS_BattleFlow.ts` 把它实例化成 `BattleSceneController<any>`，再经 `PSFlow.begin()`、场景 `_session`、动态属性代理和 `pushMessages(any[])` 传播。显式计数 0 不代表控制器真实访问点已经受保护。本轮 A1/A2 针对此链设置真实消费点的负例编译探针；请求形态必须保留等待、空请求、强制替换和锁招等正常可选性。

此外，TypeScript 标准声明中的 `JSON.parse`、`Object.create` 和属性描述符的 `value` 可引入隐式 `any`，不一定在本文件出现显式关键字。135 个 `JSON.parse` 调用中，大量是已知 DTO 的内部拷贝；不应机械地对每次拷贝追加输入校验。外部内容与保存入口需要按实际校验顺序判断。此 AST 工具不进行完整类型流求解，关键公开链的防护依赖单独的编译探针与实际导出签名。

## 其余生产 any 的全部文件位置与分批建议

每个 `any` 的精确行列在机器清单 `locations[kind=explicitAny]`。以下文件表排除测试辅助；数量少的宿主文件也保留，便于后续逐批定位。

| 文件（省略 src/ 前缀） | any | 风险/建议保护 |
|---|---:|---|
| framework/battle/driver.ts、protocol.ts | 各 1 | 本轮 A1；真实消息类型和错误字段负控 |
| framework/flow/session.ts | 1 | 本轮 A1/A2；awaitingChoice、恢复和消费者负控 |
| framework/battle/gateway.ts | 7 | 后续：适配器内部动作/状态；引擎合同和恢复回归 |
| framework/battle/request-source.ts | 1 | 后续：私有观察来源；强制替换绑定/旧代次拒绝 |
| framework/battle/showdown-types.ts | 4 | 动态第三方桥；允许局部有理由例外，避免跨层导出 |
| framework/battle/trainer-ai-source.ts | 6 | 后续：引擎观察收窄；公开 AI DTO、策略异常和恢复测试 |
| plugins/PS_BattleFlow.ts | 258 | 本轮先保护会话/请求/消息/控制器；其余宿主动态对象另批 |
| plugins/PS_SaveState.ts | 48 | 高优先后续：MZ IO边界；保留现有保存/迁移/编码回归 |
| plugins/PS_Inventory.ts | 57 | 后续：选择回调/窗口；事务、取消回退和旧回调测试 |
| plugins/PS_Management.ts | 49 | 后续：场景/动态代理；所有权、持起取消及替换测试 |
| plugins/PS_Evolution.ts | 42 | 后续：学习/交换/进化 UI 回调；唯一提交和中断测试 |
| plugins/PS_Pokedex.ts | 25 | 后续：页面/宿主对象；布局迁移和旧代次测试 |
| plugins/PS_Progression.ts | 14 | 后续：窗口/宿主接线；真实学招取消、回读失败测试 |
| plugins/PS_RuntimeFixes.ts | 8 | 局部宿主/Pixi 内部补丁；保留现有边界，改动另做真实宿主验证 |
| plugins/PS_SaveLocation.ts | 2 | NW/文件路径入口；独立路径合同，避免 Node 侵入核心 |
| plugins/battleflow/prebattle-host.ts、prebattle-mz.ts、prebattle.ts | 25 / 5 / 2 | 后续：过渡宿主能力；普通进入/取消/替换回归 |
| plugins/battleflow/battle-effects-settings.ts、battle-style-settings.ts | 13 / 12 | 后续：配置端口；正反输入与默认值保护 |
| plugins/battleflow/battle-music-mz.ts、capture-me-mz.ts | 20 / 11 | 动态音频对象；音频租约/迟到回调测试 |
| plugins/battleflow/ordinary-message-mz.ts、faint-mz.ts | 各 10 | 动态窗口/音频；消息播放和中断恢复 |
| plugins/battleflow/battleback-mz.ts、picture-mz.ts | 9 / 6 | 图像宿主生命周期；资源失败和取消 |
| plugins/battleflow/ball-mz.ts、level-stats-mz.ts、bag-fade-mz.ts | 4 / 4 / 3 | 局部宿主显示边缘；复用相应 scene 合同 |
| plugins/pokedex/screen.ts、search.ts | 2 / 1 | 小范围显示/检索输入，后续处理 |
| plugins/progression/learning-draw.ts、move-selection-window.ts | 2 / 7 | 宿主绘制/选择；原生窗口消费签名与取消保护 |

公开类型变窄可能使以前依赖 `any` 的调用方编译失败；这是编译兼容影响，应逐批说明。宿主例外应限定在真正动态对象的适配函数内并有相应合同测试，不通过新宽泛索引签名把未知属性重新放回核心。

## 断言热点与未来批次

- 内容入口：`content/compile.ts` 的 Source/Species/Grant、`item-input.ts` 的 effect/shop、`trainer-input.ts` 的 trainer、`flow/content-runtime.ts` 的 compiled content，合计 19 个双重断言。先复核已有结构/语义校验，再把确实缺的验证结果表达为窄返回类型；优先外部输入，不为去掉断言重写整个编译器。
- 存档：`rules/save-schema.ts:350,351,353,454,543,556` 六处双重断言位于分版本验证、迁移或最终内容检查之后。建议未来单独梳理“已验证的版本视图”与单点收窄；保持旧档字段可选性、范围和迁移语义。不能把双重断言自身当校验，也不能据此断言现有门没有保护。
- 已知纯值：`rules/config.ts` 的冻结默认数组、`initial-field.ts` 的冻结结果属于 readonly/mutable 表达不合；可以后续局部改 readonly 合同，需检查公开消费者编译影响。收益低于本轮真实治疗问题。
- Application 的显式 `any` 已为 0，但非空断言 163；`trade-operation.ts` 单文件 49。它们多依赖私有阶段状态，先用已有失败/回读/代次测试保护，再挑具体可收窄状态，不展开大规模状态机重写。
- 测试辅助的 `any` 1361 主要来自 flowtest 宿主和场景探针。未来优先给可复用 fake/host 端口建局部类型；不让测试数量治理阻塞生产公共链，也不把 JS 测试改成宽松 TS 来降低指标。

现有 `strict: true`、核心/app `types: []` 与 `check-boundaries.cjs` 的规则/app 禁显式 any 已存在。先复用它们和本轮局部负例编译测试；不新增会引起大量无关改动的全局 lint 或预算门。

## 已执行与盲点

本盘点执行两次固定树读取，结果计数一致；另以含注释、字符串、真实 any/双断言/非空断言的解析探针验证 AST 不误计文本，并重算逐文件与位置总数。该验证是只读审计工具验证，不是产品运行验收。

不覆盖第三方声明、生成物、git 忽略/未跟踪文件、运行时值验证、CJS/JS 的隐式动态性、模板字符串内嵌 TS 消费者、所有类型别名/条件类型传播或跨函数污点。脚本中的类型抑制识别是注释行候选扫描，不是 TS 指令语义解释；当前两处已人工复核。普通 `.cjs` 行为套件受运行测试保护，但没有因此获得静态类型保护。本报告不宣称 NW、性能或跨引擎迁移已验收。
