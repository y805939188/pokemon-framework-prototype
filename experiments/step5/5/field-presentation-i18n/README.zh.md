# E2/E3 提示本地化定向验证

范围为生产场外招式和旅行的 Game_Message 文字、目标名和选择标签。Content 的 MoveData 正式合同是 id/name/pp；没有 nameKey 字段，招式名遵守现有 i18n 约定，保留当前受控 Content 的显示名（标准 Showdown 名仍为英文，作者显示名原样保留）。目标名来自该目标地图的 MZ MapInfos.name，绝不以当前地图名代替。缺失、空白、内部 id 或 missing 标记使用本地化通称；不新增业务 schema 或猜测 Skills 表。

使用 PSFlow.translator()/defaultTranslator 的当前语言→英语回退，新增 world.fieldMove/world.travel 键。inventory.yes/no 保持 Yes0/No1、默认1、取消1。翻译及原始名字读取前后保留原 owner/generation 守卫，另核对同一 Flow/Content/Scene/Message 与已读取名字来源。原始数据仅读 own data，非法值不强转文本；合法原生方法调用单独保留。

运行前先固定 clean SHA，使用官方 headless-regression-binding begin→types prepare→distribution→10 IIFE→finish --with-c-generation-support→verify。bootstrap.mjs 在生产 import 前 H.capture/boundFiles，验证正式 cSupport.parent，再给 world-scene 提供完整显式 PF_* 组并断言 explicit。消费者不调用默认 builder，不冒用 C 测试身份。新增本目录测试文件另作前后 hash；三份共享正规登记待唯一整合者接续，本目录不是自动注册的 regular 套件。

显式运行 bootstrap.mjs 时必须提供 PF_HEADLESS_REGRESSION_BINDING、PF_PRESENTATION_OUTPUT（新独占目录）、PF_PRESENTATION_CASE（test-presentation.cjs 中的准确名字）。每个 selector 一个新 Node 进程；任一 unexpected 失败后停止后继。原生 Message.add/setChoices/onChoice 和实际 App/生产 adapter 保持，UI 的 Canvas/WebGL/Effekseer 为无头后端。Party/357 测试在真实 handoff 时切换语言，避免复用旧辅助函数中只识英文的 overlay 标题判断。

旅行本轮只签显示与取消阶段，不替其它作者签当前 native arrival/transfer/save/Continue 的完整生产族。没有 NW、系统焦点、真实音频、人工键盘/听感/真实失焦、全量 regular、P5、MC 或整个 5.5 验收。
